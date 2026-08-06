import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase/server";

const CORRECTABLE_FIELDS = ["full_name", "email", "phone", "city"] as const;

export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;

  let body: { changes?: Record<string, unknown> };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const changes = body.changes;
  if (!changes || typeof changes !== "object" || Object.keys(changes).length === 0) {
    return NextResponse.json({ error: "changes is required" }, { status: 400 });
  }
  const invalidKeys = Object.keys(changes).filter(
    (k) => !CORRECTABLE_FIELDS.includes(k as (typeof CORRECTABLE_FIELDS)[number])
  );
  if (invalidKeys.length > 0) {
    return NextResponse.json({ error: `Invalid field(s): ${invalidKeys.join(", ")}` }, { status: 400 });
  }

  const supabase = getServiceClient();
  const { data: request, error: fetchError } = await supabase
    .from("data_requests")
    .select("request_type, status, matched_contact_id")
    .eq("id", id)
    .single();

  if (fetchError || !request) {
    return NextResponse.json({ error: "Request not found" }, { status: 404 });
  }
  if (request.request_type !== "correction") {
    return NextResponse.json({ error: "Not a correction request" }, { status: 400 });
  }
  if (request.status !== "verifying" || !request.matched_contact_id) {
    return NextResponse.json(
      { error: "Identity must be verified before submitting field changes" },
      { status: 409 }
    );
  }

  const { error: updateError } = await supabase
    .from("data_requests")
    .update({ requested_field_changes: changes })
    .eq("id", id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
