import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase/server";
import { issueOtp } from "@/lib/otp";
import { REQUEST_TYPE_CONFIG } from "@/lib/request-type-config";
import type { RequestType } from "@/lib/types";

/**
 * Admin confirms an AI-suggested fuzzy contact match (see
 * lib/ai/contact-match-suggester.ts). Re-opens the request against the
 * confirmed contact and, if the request type requires it, sends a real
 * OTP to that contact's actual email/phone — confirming the match doesn't
 * skip identity verification, it just makes verification possible against
 * the right record.
 */
export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;

  const supabase = getServiceClient();
  const { data: request, error: fetchError } = await supabase
    .from("data_requests")
    .select("request_type, suggested_contact_id")
    .eq("id", id)
    .single();

  if (fetchError || !request) {
    return NextResponse.json({ error: "Request not found" }, { status: 404 });
  }
  if (!request.suggested_contact_id) {
    return NextResponse.json({ error: "No suggested match to confirm" }, { status: 409 });
  }

  const { data: contact, error: contactError } = await supabase
    .from("crm_contacts")
    .select("id, email, phone")
    .eq("id", request.suggested_contact_id)
    .maybeSingle();

  if (contactError || !contact) {
    return NextResponse.json({ error: "Suggested contact no longer exists" }, { status: 404 });
  }

  const requestType = request.request_type as RequestType;
  const config = REQUEST_TYPE_CONFIG[requestType];
  const newStatus = config.requiresOtp ? "received" : "verifying";

  const { error: updateError } = await supabase
    .from("data_requests")
    .update({
      matched_contact_id: contact.id,
      suggested_contact_id: null,
      suggested_match_reason: null,
      status: newStatus,
      resolved_at: null,
    })
    .eq("id", id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  if (config.requiresOtp) {
    try {
      await issueOtp(id, { email: contact.email, phone: contact.phone });
    } catch (err) {
      return NextResponse.json(
        { error: "Match confirmed but failed to send verification code", detail: (err as Error).message },
        { status: 500 }
      );
    }
  }

  return NextResponse.json({ ok: true, status: newStatus, otpRequired: config.requiresOtp });
}
