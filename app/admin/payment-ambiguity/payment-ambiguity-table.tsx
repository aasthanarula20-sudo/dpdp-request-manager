"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { TransactionRecord } from "@/lib/payment-ambiguity/store";
import type { Action } from "@/lib/payment-ambiguity/types";

const ACTION_STYLES: Record<Action, string> = {
  continue_polling: "bg-slate-100 text-slate-700",
  refund_confirmed_debit: "bg-blue-100 text-blue-800",
  release_hold_no_action: "bg-slate-100 text-slate-700",
  refund_precautionary: "bg-amber-100 text-amber-800",
  provisional_access: "bg-emerald-100 text-emerald-800",
  provisional_access_stepup_required: "bg-amber-100 text-amber-800",
  hold_manual_review: "bg-red-100 text-red-800",
};

const ACTION_LABELS: Record<Action, string> = {
  continue_polling: "Continue polling",
  refund_confirmed_debit: "Refund (confirmed debit)",
  release_hold_no_action: "Release hold",
  refund_precautionary: "Refund (precautionary)",
  provisional_access: "Provisional access",
  provisional_access_stepup_required: "Step-up required",
  hold_manual_review: "Manual review",
};

function ElapsedLabel({ ambiguityDetectedAt }: { ambiguityDetectedAt: string }) {
  // Lazy initializer: the one sanctioned place to call an impure function
  // like Date.now() — it runs once on mount, not during every render.
  const [now] = useState<number>(() => Date.now());
  const minutes = Math.floor((now - new Date(ambiguityDetectedAt).getTime()) / 60_000);
  if (minutes < 1) return <>&lt;1 min ago</>;
  if (minutes < 60) return <>{minutes} min ago</>;
  return (
    <>
      {Math.floor(minutes / 60)}h {minutes % 60}m ago
    </>
  );
}

export default function PaymentAmbiguityTable({ transactions }: { transactions: TransactionRecord[] }) {
  const router = useRouter();
  const [actionFilter, setActionFilter] = useState<string>("all");
  const [reevaluating, setReevaluating] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const filtered = useMemo(() => {
    if (actionFilter === "all") return transactions;
    return transactions.filter((t) => t.decision.action === actionFilter);
  }, [transactions, actionFilter]);

  const actions = Array.from(new Set(transactions.map((t) => t.decision.action))) as Action[];

  async function handleReevaluate(id: string) {
    setReevaluating(id);
    setError(null);
    try {
      const res = await fetch(`/api/payment-ambiguity/transactions/${id}/evaluate`, { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Re-evaluation failed");
      }
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setReevaluating(null);
    }
  }

  return (
    <div className="bg-white border border-slate-200 rounded-lg shadow-sm overflow-hidden">
      <div className="flex flex-wrap gap-3 items-center p-4 border-b border-slate-100">
        <select
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value)}
          className="text-sm border border-slate-300 rounded-md px-2 py-1.5"
        >
          <option value="all">All actions</option>
          {actions.map((a) => (
            <option key={a} value={a}>
              {ACTION_LABELS[a]}
            </option>
          ))}
        </select>
        {error && <span className="text-sm text-red-600">{error}</span>}
        <span className="text-sm text-slate-400 ml-auto">{filtered.length} transactions</span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-slate-500 border-b border-slate-100">
              <th className="px-4 py-2.5 font-medium">Transaction</th>
              <th className="px-4 py-2.5 font-medium">Detected</th>
              <th className="px-4 py-2.5 font-medium">Ladder</th>
              <th className="px-4 py-2.5 font-medium">Debit status</th>
              <th className="px-4 py-2.5 font-medium">Risk score</th>
              <th className="px-4 py-2.5 font-medium">Action</th>
              <th className="px-4 py-2.5 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((t) => (
              <tr key={t.id} className="border-b border-slate-50 hover:bg-slate-50">
                <td className="px-4 py-3">
                  <div className="text-slate-900 font-medium">
                    ₹{t.transaction.orderValue.toLocaleString("en-IN")} · {t.transaction.paymentMethod}
                  </div>
                  <div className="text-xs text-slate-400">
                    {t.transaction.deliveryStatus} · {t.transaction.industry}
                  </div>
                </td>
                <td className="px-4 py-3 text-slate-600">
                  <ElapsedLabel ambiguityDetectedAt={t.ambiguityDetectedAt} />
                </td>
                <td className="px-4 py-3 text-slate-600">
                  {t.decision.ladderStage}
                  {t.decision.ladderStage === "forced_resolution" && (
                    <span className="ml-1 text-xs text-amber-600">(forced)</span>
                  )}
                </td>
                <td className="px-4 py-3 text-slate-600">{t.decision.debitStatus ?? "—"}</td>
                <td className="px-4 py-3 text-slate-600">
                  {t.decision.riskScore ?? "—"}
                  {t.decision.borderline && <span className="ml-1 text-xs text-amber-600">borderline</span>}
                </td>
                <td className="px-4 py-3">
                  <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${ACTION_STYLES[t.decision.action]}`}>
                    {ACTION_LABELS[t.decision.action]}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <button
                    type="button"
                    onClick={() => handleReevaluate(t.id)}
                    disabled={reevaluating === t.id}
                    className="rounded-md border border-slate-300 px-3 py-1 text-slate-700 text-xs font-medium hover:bg-slate-100 disabled:opacity-50"
                  >
                    {reevaluating === t.id ? "Evaluating…" : "Re-evaluate"}
                  </button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-slate-400">
                  No transactions match these filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
