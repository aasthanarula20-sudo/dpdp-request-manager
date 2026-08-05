import { notFound } from "next/navigation";
import { getServiceClient } from "@/lib/supabase/server";
import RequestDetail from "./request-detail";

export const dynamic = "force-dynamic";

export default async function RequestDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = getServiceClient();

  const { data: request, error } = await supabase
    .from("data_requests")
    .select("*")
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

  return <RequestDetail request={request} contact={contact} />;
}
