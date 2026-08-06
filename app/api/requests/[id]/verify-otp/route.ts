import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase/server";
import { verifyOtp } from "@/lib/otp";
import { classifyPii } from "@/lib/ai/pii-classifier";
import type { RequestType } from "@/lib/types";

const STATUS_BY_REASON: Record<string, number> = {
  not_pending: 409,
  expired: 410,
  locked: 423,
  incorrect: 401,
};

interface CurrentFields {
  full_name: string;
  email: string;
  phone: string | null;
  city: string | null;
}

export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;

  let body: { code?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.code || typeof body.code !== "string") {
    return NextResponse.json({ error: "code is required" }, { status: 400 });
  }

  let result;
  try {
    result = await verifyOtp(id, body.code);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 404 });
  }

  if (!result.ok) {
    return NextResponse.json(
      { error: result.reason, attemptsRemaining: result.attemptsRemaining },
      { status: STATUS_BY_REASON[result.reason] }
    );
  }

  const supabase = getServiceClient();
  const { data: request } = await supabase
    .from("data_requests")
    .select("request_type, details, matched_contact_id")
    .eq("id", id)
    .single();

  // Deferred from intake (see app/api/requests/route.ts) — runs now that
  // identity is confirmed, so it's never spent on a code the requester
  // never entered.
  if (request?.details && request.details.trim().length > 0) {
    const piiResult = await classifyPii(request.details);
    await supabase.from("data_requests").update({ detected_pii: piiResult }).eq("id", id);
  }

  let currentFields: CurrentFields | null = null;
  if (request?.request_type === ("correction" as RequestType) && request.matched_contact_id) {
    const { data: contact } = await supabase
      .from("crm_contacts")
      .select("full_name, email, phone, city")
      .eq("id", request.matched_contact_id)
      .maybeSingle();
    currentFields = contact ?? null;
  }

  return NextResponse.json({ ok: true, status: "verifying", currentFields });
}
