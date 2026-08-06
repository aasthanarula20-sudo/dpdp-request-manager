import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;

  let body: { text?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const targetText = body.text;
  if (!targetText || typeof targetText !== "string") {
    return NextResponse.json({ error: "text is required" }, { status: 400 });
  }

  const supabase = getServiceClient();
  const { data: request, error: fetchError } = await supabase
    .from("data_requests")
    .select("details, matched_contact_id, detected_pii")
    .eq("id", id)
    .single();

  if (fetchError || !request) {
    return NextResponse.json({ error: "Request not found" }, { status: 404 });
  }
  if (!request.details || !request.details.includes(targetText)) {
    return NextResponse.json({ error: "Text not found in request details" }, { status: 409 });
  }

  const redactedDetails = request.details.replace(targetText, "[REDACTED]");
  const detectedPii = request.detected_pii as { entities: { type: string; text: string }[]; summary: string } | null;
  const remainingEntities = detectedPii?.entities.filter((e) => e.text !== targetText) ?? [];

  const { error: updateError } = await supabase
    .from("data_requests")
    .update({
      details: redactedDetails,
      detected_pii: detectedPii ? { ...detectedPii, entities: remainingEntities } : null,
    })
    .eq("id", id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  // Redacting stored text is a data-modifying decision like any other
  // action here — goes through the same audit trail.
  await supabase.from("anonymization_log").insert({
    contact_id: request.matched_contact_id,
    request_id: id,
    action_type: "redact_pii",
    fields_affected: { redactedText: targetText },
    performed_by: "admin",
  });

  return NextResponse.json({ ok: true, details: redactedDetails });
}
