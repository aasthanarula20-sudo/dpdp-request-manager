import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase/server";
import { resolveAction, applyAction } from "@/lib/rules-engine";
import { runAnonymizationQa } from "@/lib/ai/anonymization-qa";
import { draftResponse } from "@/lib/ai/response-drafter";
import type { RequestType } from "@/lib/types";

interface ActionBody {
  decision: "approve" | "reject";
  performedBy: string;
  fieldsAffected?: Record<string, unknown>;
  rejectReason?: string;
}

export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;

  let body: ActionBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { decision, performedBy, fieldsAffected, rejectReason } = body;

  if (decision !== "approve" && decision !== "reject") {
    return NextResponse.json({ error: "decision must be 'approve' or 'reject'" }, { status: 400 });
  }
  if (!performedBy || typeof performedBy !== "string") {
    return NextResponse.json({ error: "performedBy is required" }, { status: 400 });
  }

  let supabase;
  try {
    supabase = getServiceClient();
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }

  const { data: request, error: fetchError } = await supabase
    .from("data_requests")
    .select("id, request_type, matched_contact_id, requester_name, status, requested_field_changes")
    .eq("id", id)
    .single();

  if (fetchError || !request) {
    return NextResponse.json({ error: "Request not found" }, { status: 404 });
  }

  const requestType = request.request_type as RequestType;

  if (decision === "reject") {
    const reason = rejectReason ?? "Rejected by admin.";

    // Manual admin rejection still goes through the audit trail — a no-op
    // action, but every decision (approved or rejected) must be logged.
    await applyAction({
      requestId: id,
      contactId: request.matched_contact_id,
      action: "reject_with_reason",
      performedBy,
      reason,
    });

    await supabase.from("data_requests").update({ status: "rejected", resolved_at: new Date().toISOString() }).eq("id", id);

    const drafted = await draftResponse({
      requestType,
      decision: "reject",
      reason,
      requesterName: request.requester_name,
    });
    await supabase.from("data_requests").update({ draft_response: drafted.draft }).eq("id", id);

    return NextResponse.json({ status: "rejected", action: "reject_with_reason", draftResponse: drafted });
  }

  // decision === "approve"
  let resolved;
  try {
    resolved = await resolveAction(requestType, request.matched_contact_id);
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to resolve action", detail: (err as Error).message },
      { status: 500 }
    );
  }

  // Corrections are now collected as structured field:value JSON via the
  // post-OTP field-picker (not free text), so — like store_nomination — it's
  // safe to source from requested_field_changes if the admin doesn't override it.
  const effectiveFieldsAffected =
    fieldsAffected ??
    (resolved.action === "store_nomination" || resolved.action === "update_fields"
      ? (request.requested_field_changes as Record<string, unknown> | null) ?? undefined
      : undefined);

  let applied;
  try {
    applied = await applyAction({
      requestId: id,
      contactId: request.matched_contact_id,
      action: resolved.action,
      performedBy,
      fieldsAffected: effectiveFieldsAffected,
      reason: resolved.reason,
    });
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to apply action", detail: (err as Error).message },
      { status: 500 }
    );
  }

  const finalStatus = resolved.action === "reject_with_reason" ? "rejected" : "resolved";

  await supabase
    .from("data_requests")
    .update({ status: finalStatus, resolved_at: new Date().toISOString() })
    .eq("id", id);

  // QA runs after any real data-modifying write (hard_delete / anonymize_fields).
  if (applied.wroteToContact && (resolved.action === "hard_delete" || resolved.action === "anonymize_fields")) {
    let snapshot: Record<string, unknown> = {};
    if (resolved.action === "hard_delete") {
      snapshot = { contactId: request.matched_contact_id, expectedState: "deleted" };
    } else if (request.matched_contact_id) {
      const { data: contactAfter } = await supabase
        .from("crm_contacts")
        .select("full_name, email, phone, is_anonymized")
        .eq("id", request.matched_contact_id)
        .maybeSingle();
      snapshot = contactAfter ?? {};
    }

    const qa = await runAnonymizationQa(snapshot);
    // hard_delete already removed the crm_contacts row, so contact_id can't
    // be set here — same FK constraint as in applyAction's own log insert.
    await supabase.from("anonymization_log").insert({
      contact_id: resolved.action === "hard_delete" ? null : request.matched_contact_id,
      request_id: id,
      action_type: resolved.action,
      fields_affected: resolved.action === "hard_delete" ? { deletedContactId: request.matched_contact_id } : null,
      performed_by: `${performedBy} (QA)`,
      qa_status: qa.qaStatus,
      residual_pii_found: qa.residualPiiFound,
    });
  }

  const drafted = await draftResponse({
    requestType,
    decision: "approve",
    reason: resolved.reason,
    requesterName: request.requester_name,
  });
  await supabase.from("data_requests").update({ draft_response: drafted.draft }).eq("id", id);

  return NextResponse.json({
    status: finalStatus,
    action: resolved.action,
    reason: resolved.reason,
    draftResponse: drafted,
  });
}
