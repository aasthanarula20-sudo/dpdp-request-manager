import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase/server";
import { matchContact } from "@/lib/identity-matching";
import { classifyPii } from "@/lib/ai/pii-classifier";
import { triageGrievance } from "@/lib/ai/grievance-triage";
import { issueOtp } from "@/lib/otp";
import { suggestContactMatch } from "@/lib/ai/contact-match-suggester";
import { REQUEST_TYPE_CONFIG } from "@/lib/request-type-config";
import type { RequestStatus, RequestType, SubmissionChannel } from "@/lib/types";

interface CreateRequestBody {
  requestType: RequestType;
  name?: string;
  email: string;
  phone?: string;
  details?: string;
  requestedFieldChanges?: Record<string, unknown>;
  submittedVia: SubmissionChannel;
}

const VALID_REQUEST_TYPES: RequestType[] = [
  "access",
  "correction",
  "erasure",
  "consent_withdrawal",
  "grievance",
  "nomination",
];

export async function POST(req: NextRequest) {
  let body: CreateRequestBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { requestType, name, email, phone, details, requestedFieldChanges, submittedVia } = body;

  if (!requestType || !VALID_REQUEST_TYPES.includes(requestType)) {
    return NextResponse.json({ error: "Invalid or missing requestType" }, { status: 400 });
  }
  if (!email || typeof email !== "string") {
    return NextResponse.json({ error: "email is required" }, { status: 400 });
  }
  if (submittedVia !== "self_service" && submittedVia !== "admin_manual") {
    return NextResponse.json({ error: "Invalid or missing submittedVia" }, { status: 400 });
  }

  let supabase;
  let matchedContact;
  try {
    supabase = getServiceClient();
    matchedContact = await matchContact(email, phone);
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to match contact", detail: (err as Error).message },
      { status: 500 }
    );
  }

  const matchedContactId = matchedContact?.id ?? null;
  const matched = matchedContactId !== null;
  const config = REQUEST_TYPE_CONFIG[requestType];

  // Advisory only — never affects matchedContactId or the outcome below.
  // An admin has to explicitly confirm it via /confirm-match.
  const matchSuggestion = matched
    ? { contactId: null, reason: null }
    : await suggestContactMatch(email, phone, name);

  let initialStatus: RequestStatus = "received";
  let resolvedAt: string | null = null;
  let noMatchReason: string | null = null;

  if (!matched) {
    if (config.noMatchOutcome === "resolved") {
      initialStatus = "resolved";
      resolvedAt = new Date().toISOString();
      noMatchReason = `No data found for this ${requestType.replace("_", " ")} request.`;
    } else if (config.noMatchOutcome === "blocked") {
      initialStatus = "rejected";
      resolvedAt = new Date().toISOString();
      noMatchReason = `No matching contact record found for this ${requestType.replace("_", " ")} request.`;
    }
    // "proceeds" (grievance): falls through, handled below like a match.
  }

  const otpRequired = (matched || config.noMatchOutcome === "proceeds") && config.requiresOtp;
  if (!otpRequired && initialStatus === "received" && (matched || config.noMatchOutcome === "proceeds")) {
    // No verification gate applies (e.g. grievance) — go straight into the queue.
    initialStatus = "verifying";
  }

  const { data: inserted, error: insertError } = await supabase
    .from("data_requests")
    .insert({
      request_type: requestType,
      requester_name: name ?? null,
      requester_email: email,
      requester_phone: phone ?? null,
      details: details ?? null,
      matched_contact_id: matchedContactId,
      status: initialStatus,
      submitted_via: submittedVia,
      requested_field_changes: requestedFieldChanges ?? null,
      resolved_at: resolvedAt,
      suggested_contact_id: matchSuggestion.contactId,
      suggested_match_reason: matchSuggestion.reason,
    })
    .select("id, sla_deadline")
    .single();

  if (insertError || !inserted) {
    return NextResponse.json(
      { error: "Failed to create request", detail: insertError?.message },
      { status: 500 }
    );
  }

  if (noMatchReason) {
    await supabase.from("anonymization_log").insert({
      contact_id: null,
      request_id: inserted.id,
      action_type: "reject_with_reason",
      fields_affected: { reason: noMatchReason },
      performed_by: "system",
    });
  }

  if (otpRequired && matchedContact) {
    try {
      await issueOtp(inserted.id, { email: matchedContact.email, phone: matchedContact.phone });
    } catch (err) {
      return NextResponse.json(
        { error: "Failed to send verification code", detail: (err as Error).message },
        { status: 500 }
      );
    }
  }

  // Advisory AI enrichment — never blocks or fails the request creation.
  // Skipped here when a code is still pending: it's wasted work if the
  // requester never completes verification, so it runs after verify-otp
  // succeeds instead (see the verify-otp route).
  if (!otpRequired) {
    const updates: Record<string, unknown> = {};

    if (details && details.trim().length > 0) {
      const piiResult = await classifyPii(details);
      updates.detected_pii = piiResult;
    }

    if (requestType === "grievance") {
      const triage = await triageGrievance(details);
      updates.category = triage.category;
      updates.severity = triage.severity;
    }

    if (Object.keys(updates).length > 0) {
      await supabase.from("data_requests").update(updates).eq("id", inserted.id);
    }
  }

  return NextResponse.json({
    requestId: inserted.id,
    matchedContactId,
    slaDeadline: inserted.sla_deadline,
    status: initialStatus,
    otpRequired,
    reason: noMatchReason,
  });
}
