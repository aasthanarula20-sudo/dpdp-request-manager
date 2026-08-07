import { notFound } from "next/navigation";
import { getServiceClient } from "@/lib/supabase/server";
import RequestDetail from "./request-detail";

export const dynamic = "force-dynamic";

export default async function RequestDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = getServiceClient();

  const { data: request, error } = await supabase
    .from("data_requests")
    .select(
      "id, request_type, requester_name, requester_email, requester_phone, details, matched_contact_id, status, submitted_via, submitted_at, sla_deadline, resolved_at, detected_pii, category, severity, draft_response, requested_field_changes, identity_verified_at, suggested_contact_id, suggested_match_reason"
    )
    .eq("id", id)
    .single();

  if (error || !request) {
    notFound();
  }

  let contact = null;
  if (request.matched_contact_id) {
    const { data } = await supabase
      .from("crm_contacts")
      .select("*")
      .eq("id", request.matched_contact_id)
      .maybeSingle();
    contact = data;
  }

  let suggestedContact = null;
  if (request.suggested_contact_id) {
    const { data } = await supabase
      .from("crm_contacts")
      .select("id, full_name, email, phone")
      .eq("id", request.suggested_contact_id)
      .maybeSingle();
    suggestedContact = data;
  }

  const { data: qaLogs } = await supabase
    .from("anonymization_log")
    .select("action_type, qa_status, residual_pii_found, performed_at")
    .eq("request_id", id)
    .not("qa_status", "is", null)
    .order("performed_at", { ascending: false });

  return (
    <RequestDetail
      request={request}
      contact={contact}
      suggestedContact={suggestedContact}
      qaLogs={qaLogs ?? []}
    />
  );
}
