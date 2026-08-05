import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase/server";
import { matchContact } from "@/lib/identity-matching";
import { classifyPii } from "@/lib/ai/pii-classifier";
import { triageGrievance } from "@/lib/ai/grievance-triage";
import type { RequestType, SubmissionChannel } from "@/lib/types";

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
  let matchedContactId: string | null = null;
  try {
    supabase = getServiceClient();
    const matched = await matchContact(email, phone);
    matchedContactId = matched?.id ?? null;
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to match contact", detail: (err as Error).message },
      { status: 500 }
    );
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
      status: "verifying",
      submitted_via: submittedVia,
      requested_field_changes: requestedFieldChanges ?? null,
    })
    .select("id, sla_deadline")
    .single();

  if (insertError || !inserted) {
    return NextResponse.json(
      { error: "Failed to create request", detail: insertError?.message },
      { status: 500 }
    );
  }

  // Advisory AI enrichment — never blocks or fails the request creation.
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

  return NextResponse.json({
    requestId: inserted.id,
    matchedContactId,
    slaDeadline: inserted.sla_deadline,
  });
}
