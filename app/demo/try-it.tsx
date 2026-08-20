"use client";

import { useMemo, useState } from "react";
import { decide } from "@/lib/payment-ambiguity/resolver";
import type { DebitSignals, DeliveryStatus, Industry, PaymentMethod } from "@/lib/payment-ambiguity/types";

const DELIVERY_STATUSES: DeliveryStatus[] = ["not_delivered", "delivered"];
const PAYMENT_METHODS: PaymentMethod[] = ["upi", "wallet", "card", "netbanking"];
const INDUSTRIES: Industry[] = ["travel", "food_delivery", "retail", "digital_goods"];
const SIGNAL_STATUSES: DebitSignals["bankStatusApi"][] = ["not_reported", "debited", "not_debited", "pending"];

const NO_SIGNALS: DebitSignals = {
  settlementFile: "not_reported",
  bankStatusApi: "not_reported",
  gatewayWebhook: "not_reported",
  clientAppState: "not_reported",
};

const ACTION_STYLES: Record<string, string> = {
  continue_polling: "bg-slate-100 text-slate-700",
  proceed_order_confirmed: "bg-emerald-100 text-emerald-800",
  refund_confirmed_debit: "bg-blue-100 text-blue-800",
  release_hold_no_action: "bg-slate-100 text-slate-700",
  refund_precautionary: "bg-amber-100 text-amber-800",
  provisional_access: "bg-emerald-100 text-emerald-800",
  provisional_access_stepup_required: "bg-amber-100 text-amber-800",
  hold_manual_review: "bg-red-100 text-red-800",
};

const ACTION_LABELS: Record<string, string> = {
  continue_polling: "Continue polling",
  proceed_order_confirmed: "Order confirmed",
  refund_confirmed_debit: "Refund (confirmed debit)",
  release_hold_no_action: "Release hold",
  refund_precautionary: "Refund (precautionary)",
  provisional_access: "Provisional access",
  provisional_access_stepup_required: "Step-up required",
  hold_manual_review: "Manual review",
};

export default function TryIt() {
  const [orderValue, setOrderValue] = useState("");
  const [deliveryStatus, setDeliveryStatus] = useState<DeliveryStatus>("not_delivered");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("upi");
  const [industry, setIndustry] = useState<Industry>("retail");
  const [bankStatusApi, setBankStatusApi] = useState<DebitSignals["bankStatusApi"]>("not_reported");
  const [minutesAgo, setMinutesAgo] = useState("6");

  const result = useMemo(() => {
    const value = Number(orderValue);
    if (!orderValue || Number.isNaN(value) || value < 0) return null;
    return decide(
      { orderValue: value, deliveryStatus, paymentMethod, industry },
      { ...NO_SIGNALS, bankStatusApi },
      Number(minutesAgo) || 0
    );
  }, [orderValue, deliveryStatus, paymentMethod, industry, bankStatusApi, minutesAgo]);

  return (
    <div className="bg-white border border-slate-200 rounded-lg shadow-sm p-6 mb-10">
      <h2 className="text-lg font-semibold text-slate-900 mb-1">Try it yourself</h2>
      <p className="text-sm text-slate-500 mb-5">
        Runs entirely in your browser — nothing here is saved or sent to the server. Change any value and the
        decision updates instantly.
      </p>

      <div className="grid sm:grid-cols-2 gap-4 mb-5">
        <Field label="Order value (₹)">
          <input
            type="number"
            min={0}
            value={orderValue}
            onChange={(e) => setOrderValue(e.target.value)}
            placeholder="e.g. 500"
            className="w-full border border-slate-300 rounded-md px-2 py-1.5 text-sm bg-white text-slate-900"
          />
        </Field>

        <Field label="Delivery status">
          <select
            value={deliveryStatus}
            onChange={(e) => setDeliveryStatus(e.target.value as DeliveryStatus)}
            className="w-full border border-slate-300 rounded-md px-2 py-1.5 text-sm bg-white text-slate-900"
          >
            {DELIVERY_STATUSES.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Payment method">
          <select
            value={paymentMethod}
            onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
            className="w-full border border-slate-300 rounded-md px-2 py-1.5 text-sm bg-white text-slate-900"
          >
            {PAYMENT_METHODS.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Industry">
          <select
            value={industry}
            onChange={(e) => setIndustry(e.target.value as Industry)}
            className="w-full border border-slate-300 rounded-md px-2 py-1.5 text-sm bg-white text-slate-900"
          >
            {INDUSTRIES.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Bank status API signal">
          <select
            value={bankStatusApi}
            onChange={(e) => setBankStatusApi(e.target.value as DebitSignals["bankStatusApi"])}
            className="w-full border border-slate-300 rounded-md px-2 py-1.5 text-sm bg-white text-slate-900"
          >
            {SIGNAL_STATUSES.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Minutes since ambiguity detected">
          <input
            type="number"
            min={0}
            value={minutesAgo}
            onChange={(e) => setMinutesAgo(e.target.value)}
            className="w-full border border-slate-300 rounded-md px-2 py-1.5 text-sm bg-white text-slate-900"
          />
        </Field>
      </div>

      {!result && <p className="text-sm text-slate-400">Enter an order value to see the decision.</p>}

      {result && (
        <div className="border-t border-slate-100 pt-4">
          <div className="flex flex-wrap items-center gap-3 mb-2">
            <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${ACTION_STYLES[result.action]}`}>
              {ACTION_LABELS[result.action]}
            </span>
            {result.riskScore !== null && (
              <span className="text-sm text-slate-600">
                Risk score {result.riskScore}
                {result.borderline && <span className="ml-1 text-xs text-amber-600">borderline</span>}
              </span>
            )}
            {result.debitStatus && <span className="text-sm text-slate-600">Debit status: {result.debitStatus}</span>}
          </div>
          <p className="text-xs text-slate-500 italic">{result.reasoning}</p>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-sm font-medium text-slate-700 mb-1">{label}</span>
      {children}
    </label>
  );
}
