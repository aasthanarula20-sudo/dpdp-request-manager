import { getServiceClient } from "./supabase/server";

export type RequestType =
  | "access"
  | "correction"
  | "erasure"
  | "consent_withdrawal"
  | "grievance"
  | "nomination";

export type ActionType =
  | "compile_export"
  | "update_fields"
  | "hard_delete"
  | "anonymize_fields"
  | "update_consent_flag"
  | "create_escalation_ticket"
  | "store_nomination"
  | "reject_with_reason";

export interface ResolvedAction {
  action: ActionType;
  reason?: string;
}

/**
 * Deterministic rules engine. Reads the `rules` table for the request type,
 * with a hard-coded override for erasure based on legal_basis — this
 * override always wins over whatever the rules table says.
 */
export async function resolveAction(
  requestType: RequestType,
  matchedContactId: string | null
): Promise<ResolvedAction> {
  const supabase = getServiceClient();

  if (requestType === "erasure") {
    if (!matchedContactId) {
      return {
        action: "reject_with_reason",
        reason: "No matching contact record found for this erasure request.",
      };
    }

    const { data: contact, error } = await supabase
      .from("crm_contacts")
      .select("legal_basis")
      .eq("id", matchedContactId)
      .single();

    if (error) throw error;

    if (contact.legal_basis === "legal_obligation" || contact.legal_basis === "contract") {
      return {
        action: "reject_with_reason",
        reason: `Erasure cannot be honored: data is retained under a ${contact.legal_basis.replace(
          "_",
          " "
        )} basis, which overrides the erasure right under the DPDP Act, 2023.`,
      };
    }

    return { action: "hard_delete" };
  }

  const { data: rule, error } = await supabase
    .from("rules")
    .select("action, active")
    .eq("request_type", requestType)
    .single();

  if (error) throw error;

  if (!rule.active) {
    return {
      action: "reject_with_reason",
      reason: `No active rule configured for request type "${requestType}".`,
    };
  }

  const action = rule.action as ActionType;
  const actionsRequiringContact: ActionType[] = [
    "update_fields",
    "update_consent_flag",
    "store_nomination",
  ];

  if (actionsRequiringContact.includes(action) && !matchedContactId) {
    return {
      action: "reject_with_reason",
      reason: `No matching contact record found for this ${requestType.replace(
        "_",
        " "
      )} request.`,
    };
  }

  return { action };
}

export interface ApplyActionParams {
  requestId: string;
  contactId: string | null;
  action: ActionType;
  performedBy: string;
  fieldsAffected?: Record<string, unknown>;
  reason?: string;
}

export interface ApplyActionResult {
  action: ActionType;
  wroteToContact: boolean;
}

/**
 * Executes the write for a resolved action. Every call — including no-op
 * actions — inserts into anonymization_log; that table is the audit trail
 * for every data-modifying decision, approved or rejected.
 */
export async function applyAction(params: ApplyActionParams): Promise<ApplyActionResult> {
  const { requestId, contactId, action, performedBy, fieldsAffected, reason } = params;
  const supabase = getServiceClient();

  let wroteToContact = false;
  let loggedFieldsAffected: Record<string, unknown> | undefined = fieldsAffected;

  switch (action) {
    case "hard_delete": {
      if (!contactId) throw new Error("hard_delete requires a matched contactId");
      const { error } = await supabase.from("crm_contacts").delete().eq("id", contactId);
      if (error) throw error;
      wroteToContact = true;
      break;
    }

    case "anonymize_fields": {
      if (!contactId) throw new Error("anonymize_fields requires a matched contactId");
      const scrubbed = {
        full_name: "REDACTED",
        email: `redacted-${contactId}@anonymized.invalid`,
        phone: null,
        is_anonymized: true,
      };
      const { error } = await supabase.from("crm_contacts").update(scrubbed).eq("id", contactId);
      if (error) throw error;
      wroteToContact = true;
      loggedFieldsAffected = { fields: ["full_name", "email", "phone", "is_anonymized"] };
      break;
    }

    case "update_consent_flag": {
      if (!contactId) throw new Error("update_consent_flag requires a matched contactId");
      const { error } = await supabase
        .from("crm_contacts")
        .update({ consent_marketing: false })
        .eq("id", contactId);
      if (error) throw error;
      wroteToContact = true;
      loggedFieldsAffected = { fields: ["consent_marketing"], value: false };
      break;
    }

    case "update_fields": {
      if (!contactId) throw new Error("update_fields requires a matched contactId");
      if (!fieldsAffected || Object.keys(fieldsAffected).length === 0) {
        throw new Error("update_fields requires fieldsAffected");
      }
      const { error } = await supabase.from("crm_contacts").update(fieldsAffected).eq("id", contactId);
      if (error) throw error;
      wroteToContact = true;
      break;
    }

    case "store_nomination": {
      // Does not write to crm_contacts, but does write to the separate
      // nominations table — dormant until an activation trigger, which is
      // explicitly out of scope for this MVP.
      if (!contactId) throw new Error("store_nomination requires a matched contactId");
      const nomineeName = fieldsAffected?.nomineeName;
      const nomineeContactInfo = fieldsAffected?.nomineeContactInfo;
      if (typeof nomineeName !== "string" || typeof nomineeContactInfo !== "string") {
        throw new Error("store_nomination requires nomineeName and nomineeContactInfo");
      }
      const { error } = await supabase.from("nominations").insert({
        contact_id: contactId,
        request_id: requestId,
        nominee_name: nomineeName,
        nominee_contact_info: nomineeContactInfo,
      });
      if (error) throw error;
      wroteToContact = false;
      break;
    }

    // These three never write to crm_contacts (or any other table).
    case "compile_export":
    case "create_escalation_ticket":
    case "reject_with_reason":
      wroteToContact = false;
      break;

    default: {
      const exhaustive: never = action;
      throw new Error(`Unhandled action type: ${exhaustive}`);
    }
  }

  // anonymization_log is append-only at the application layer — every call
  // inserts a fresh row, never updates one (e.g. QA results below get their
  // own row rather than being patched onto this one).
  //
  // hard_delete already removed the crm_contacts row above, so contact_id
  // can't be set here — the FK requires the referenced row to exist at
  // insert time (ON DELETE SET NULL only governs rows that already existed
  // when the delete happened, not new inserts). The deleted id is kept in
  // fields_affected instead, so the audit trail doesn't lose it.
  const logContactId = action === "hard_delete" ? null : contactId;
  const logFieldsAffected =
    action === "hard_delete"
      ? { ...(loggedFieldsAffected ?? {}), deletedContactId: contactId }
      : loggedFieldsAffected ?? (reason ? { reason } : null);

  const { error: logError } = await supabase.from("anonymization_log").insert({
    contact_id: logContactId,
    request_id: requestId,
    action_type: action,
    fields_affected: logFieldsAffected,
    performed_by: performedBy,
  });
  if (logError) throw logError;

  return { action, wroteToContact };
}
