import { Fragment } from "react";
import { listTransactions, type TransactionRecord } from "@/lib/payment-ambiguity/store";
import type { Action } from "@/lib/payment-ambiguity/types";
import TryIt from "./try-it";

export const dynamic = "force-dynamic";

const ACTION_STYLES: Record<Action, string> = {
  continue_polling: "bg-slate-100 text-slate-700",
  proceed_order_confirmed: "bg-emerald-100 text-emerald-800",
  refund_confirmed_debit: "bg-blue-100 text-blue-800",
  release_hold_no_action: "bg-slate-100 text-slate-700",
  refund_precautionary: "bg-amber-100 text-amber-800",
  provisional_access: "bg-emerald-100 text-emerald-800",
  provisional_access_stepup_required: "bg-amber-100 text-amber-800",
  hold_manual_review: "bg-red-100 text-red-800",
};

const ACTION_LABELS: Record<Action, string> = {
  continue_polling: "Continue polling",
  proceed_order_confirmed: "Order confirmed",
  refund_confirmed_debit: "Refund (confirmed debit)",
  release_hold_no_action: "Release hold",
  refund_precautionary: "Refund (precautionary)",
  provisional_access: "Provisional access",
  provisional_access_stepup_required: "Step-up required",
  hold_manual_review: "Manual review",
};

function elapsedLabel(ambiguityDetectedAt: string): string {
  const minutes = Math.floor((Date.now() - new Date(ambiguityDetectedAt).getTime()) / 60_000);
  if (minutes < 1) return "<1 min ago";
  if (minutes < 60) return `${minutes} min ago`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m ago`;
}

export default async function DemoPage() {
  let transactions: TransactionRecord[];
  let loadError: string | null = null;
  try {
    transactions = (await listTransactions()).slice(0, 20);
  } catch (err) {
    loadError = (err as Error).message;
    transactions = [];
  }

  return (
    <main className="flex-1 bg-slate-50 px-6 py-10">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-2xl font-semibold text-slate-900 mb-2">Payment Ambiguity Decision Layer — live demo</h1>
        <p className="text-sm text-slate-600 mb-8 max-w-2xl">
          A read-only view of the decision engine described in the{" "}
          <a
            href="https://claude.ai/code/artifact/6ff98108-b3e3-4c00-b0a0-2b98fa935345"
            target="_blank"
            rel="noopener noreferrer"
            className="text-slate-900 underline"
          >
            PRD
          </a>
          . Each row below is a mocked ambiguous transaction, resolved by the same four-stage engine — escalation
          ladder, signal arbitration, risk scoring, and action mapping — with its full reasoning trace shown
          underneath.
        </p>

        <TryIt />

        <h2 className="text-lg font-semibold text-slate-900 mb-3">Recorded transactions</h2>

        {loadError && <p className="text-red-600 text-sm mb-4">Failed to load transactions: {loadError}</p>}

        <div className="bg-white border border-slate-200 rounded-lg shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-500 border-b border-slate-100">
                  <th className="px-4 py-2.5 font-medium">Transaction</th>
                  <th className="px-4 py-2.5 font-medium">Detected</th>
                  <th className="px-4 py-2.5 font-medium">Debit status</th>
                  <th className="px-4 py-2.5 font-medium">Risk score</th>
                  <th className="px-4 py-2.5 font-medium">Action</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((t) => (
                  <Fragment key={t.id}>
                    <tr className="hover:bg-slate-50">
                      <td className="px-4 py-3">
                        <div className="text-slate-900 font-medium">
                          ₹{t.transaction.orderValue.toLocaleString("en-IN")} · {t.transaction.paymentMethod}
                        </div>
                        <div className="text-xs text-slate-400">
                          {t.transaction.deliveryStatus} · {t.transaction.industry}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-600">{elapsedLabel(t.ambiguityDetectedAt)}</td>
                      <td className="px-4 py-3 text-slate-600">{t.decision.debitStatus ?? "—"}</td>
                      <td className="px-4 py-3 text-slate-600">
                        {t.decision.riskScore ?? "—"}
                        {t.decision.borderline && <span className="ml-1 text-xs text-amber-600">borderline</span>}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${ACTION_STYLES[t.decision.action]}`}
                        >
                          {ACTION_LABELS[t.decision.action]}
                        </span>
                      </td>
                    </tr>
                    <tr className="border-b border-slate-50">
                      <td colSpan={5} className="px-4 pb-3 -mt-2 text-xs text-slate-400 italic">
                        {t.decision.reasoning}
                      </td>
                    </tr>
                  </Fragment>
                ))}
                {transactions.length === 0 && !loadError && (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                      No transactions yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </main>
  );
}
