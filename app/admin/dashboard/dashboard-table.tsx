"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { DataRequestRow, RequestStatus, RequestType } from "@/lib/types";

type Row = Partial<DataRequestRow> & { id: string };

type SortKey = "submitted_at" | "sla_deadline" | "status" | "request_type" | "severity";

const STATUS_STYLES: Record<RequestStatus, string> = {
  received: "bg-slate-100 text-slate-700",
  verifying: "bg-amber-100 text-amber-800",
  in_progress: "bg-blue-100 text-blue-800",
  resolved: "bg-emerald-100 text-emerald-800",
  rejected: "bg-red-100 text-red-800",
};

export default function DashboardTable({ requests }: { requests: Row[] }) {
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [sortKey, setSortKey] = useState<SortKey>("submitted_at");
  const [sortAsc, setSortAsc] = useState(false);

  const filtered = useMemo(() => {
    let rows = requests;
    if (statusFilter !== "all") rows = rows.filter((r) => r.status === statusFilter);
    if (typeFilter !== "all") rows = rows.filter((r) => r.request_type === typeFilter);

    rows = [...rows].sort((a, b) => {
      const av = a[sortKey] ?? "";
      const bv = b[sortKey] ?? "";
      const cmp = String(av).localeCompare(String(bv));
      return sortAsc ? cmp : -cmp;
    });

    return rows;
  }, [requests, statusFilter, typeFilter, sortKey, sortAsc]);

  function toggleSort(key: SortKey) {
    if (key === sortKey) {
      setSortAsc((a) => !a);
    } else {
      setSortKey(key);
      setSortAsc(true);
    }
  }

  const statuses = Array.from(new Set(requests.map((r) => r.status).filter(Boolean))) as RequestStatus[];
  const types = Array.from(new Set(requests.map((r) => r.request_type).filter(Boolean))) as RequestType[];

  return (
    <div className="bg-white border border-slate-200 rounded-lg shadow-sm overflow-hidden">
      <div className="flex flex-wrap gap-3 items-center p-4 border-b border-slate-100">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="text-sm border border-slate-300 rounded-md px-2 py-1.5"
        >
          <option value="all">All statuses</option>
          {statuses.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="text-sm border border-slate-300 rounded-md px-2 py-1.5"
        >
          <option value="all">All types</option>
          {types.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <span className="text-sm text-slate-400 ml-auto">{filtered.length} requests</span>
      </div>

      {/* Mobile: card list, each fully tappable with an explicit "View" CTA
          — the table below is unusable on a phone since the action link
          (the Type cell) sits past several columns that don't fit the
          viewport. */}
      <div className="sm:hidden divide-y divide-slate-100">
        {filtered.map((r) => (
          <Link
            key={r.id}
            href={`/admin/requests/${r.id}`}
            className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-slate-50 active:bg-slate-100"
          >
            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="font-medium text-slate-900">{r.request_type}</span>
                <span
                  className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                    STATUS_STYLES[r.status as RequestStatus] ?? "bg-slate-100 text-slate-700"
                  }`}
                >
                  {r.status}
                </span>
              </div>
              <div className="text-sm text-slate-600 truncate">{r.requester_name || "—"}</div>
              <div className="text-xs text-slate-400 truncate">{r.requester_email}</div>
              <div className="text-xs text-slate-500 mt-1">
                <SlaCountdown deadline={r.sla_deadline} />
              </div>
            </div>
            <ChevronRight className="w-5 h-5 text-slate-400 shrink-0" />
          </Link>
        ))}
        {filtered.length === 0 && (
          <p className="px-4 py-8 text-center text-slate-400 text-sm">No requests match these filters.</p>
        )}
      </div>

      <div className="hidden sm:block overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-slate-500 border-b border-slate-100">
              <Th label="Type" active={sortKey === "request_type"} asc={sortAsc} onClick={() => toggleSort("request_type")} />
              <th className="px-4 py-2.5 font-medium">Requester</th>
              <Th label="Status" active={sortKey === "status"} asc={sortAsc} onClick={() => toggleSort("status")} />
              <Th label="Severity" active={sortKey === "severity"} asc={sortAsc} onClick={() => toggleSort("severity")} />
              <th className="px-4 py-2.5 font-medium">Channel</th>
              <Th label="SLA deadline" active={sortKey === "sla_deadline"} asc={sortAsc} onClick={() => toggleSort("sla_deadline")} />
              <th className="px-4 py-2.5 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.id} className="border-b border-slate-50 hover:bg-slate-50">
                <td className="px-4 py-3">
                  <Link href={`/admin/requests/${r.id}`} className="text-slate-900 font-medium hover:underline">
                    {r.request_type}
                  </Link>
                </td>
                <td className="px-4 py-3 text-slate-600">
                  {r.requester_name || "—"}
                  <div className="text-xs text-slate-400">{r.requester_email}</div>
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                      STATUS_STYLES[r.status as RequestStatus] ?? "bg-slate-100 text-slate-700"
                    }`}
                  >
                    {r.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-slate-600">{r.severity ?? "—"}</td>
                <td className="px-4 py-3 text-slate-600">{r.submitted_via}</td>
                <td className="px-4 py-3 text-slate-600">
                  <SlaCountdown deadline={r.sla_deadline} />
                </td>
                <td className="px-4 py-3 text-right">
                  <Link
                    href={`/admin/requests/${r.id}`}
                    className="inline-block rounded-md border border-slate-300 px-3 py-1 text-slate-700 text-xs font-medium hover:bg-slate-100"
                  >
                    View
                  </Link>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-slate-400">
                  No requests match these filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Th({
  label,
  active,
  asc,
  onClick,
}: {
  label: string;
  active: boolean;
  asc: boolean;
  onClick: () => void;
}) {
  return (
    <th className="px-4 py-2.5 font-medium">
      <button type="button" onClick={onClick} className="flex items-center gap-1 hover:text-slate-900">
        {label}
        {active && <span className="text-xs">{asc ? "↑" : "↓"}</span>}
      </button>
    </th>
  );
}

function SlaCountdown({ deadline }: { deadline?: string }) {
  // Lazy initializer: the one sanctioned place to call an impure function
  // like Date.now() — it runs once on mount, not during every render.
  const [now] = useState<number>(() => Date.now());

  if (!deadline) return <>—</>;

  const daysLeft = Math.ceil((new Date(deadline).getTime() - now) / (1000 * 60 * 60 * 24));
  const overdue = daysLeft < 0;
  return (
    <span className={overdue ? "text-red-600 font-medium" : daysLeft <= 5 ? "text-amber-600" : ""}>
      {overdue ? `${Math.abs(daysLeft)}d overdue` : `${daysLeft}d left`}
    </span>
  );
}
