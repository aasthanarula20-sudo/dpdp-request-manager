import { getServiceClient } from "@/lib/supabase/server";
import type { DataRequestRow } from "@/lib/types";
import DashboardTable from "./dashboard-table";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from("data_requests")
    .select(
      "id, request_type, requester_name, requester_email, status, submitted_via, submitted_at, sla_deadline, severity"
    )
    .order("submitted_at", { ascending: false });

  if (error) {
    return (
      <main className="flex-1 bg-slate-50 px-6 py-10">
        <div className="max-w-6xl mx-auto">
          <p className="text-red-600 text-sm">Failed to load requests: {error.message}</p>
        </div>
      </main>
    );
  }

  return (
    <main className="flex-1 bg-slate-50 px-6 py-10">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-2xl font-semibold text-slate-900 mb-6">Requests dashboard</h1>
        <DashboardTable requests={(data ?? []) as (Partial<DataRequestRow> & { id: string })[]} />
      </div>
    </main>
  );
}
