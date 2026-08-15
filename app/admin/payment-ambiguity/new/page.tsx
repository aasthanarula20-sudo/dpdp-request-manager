"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { DebitSignals, DeliveryStatus, Industry, PaymentMethod } from "@/lib/payment-ambiguity/types";

const DELIVERY_STATUSES: DeliveryStatus[] = ["not_delivered", "delivered"];
const PAYMENT_METHODS: PaymentMethod[] = ["upi", "wallet", "card", "netbanking"];
const INDUSTRIES: Industry[] = ["travel", "food_delivery", "retail", "digital_goods"];
const SIGNAL_STATUSES: DebitSignals["bankStatusApi"][] = ["not_reported", "debited", "not_debited", "pending"];

export default function NewTransactionPage() {
  const router = useRouter();
  const [orderValue, setOrderValue] = useState("500");
  const [deliveryStatus, setDeliveryStatus] = useState<DeliveryStatus>("not_delivered");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("upi");
  const [industry, setIndustry] = useState<Industry>("retail");
  const [bankStatusApi, setBankStatusApi] = useState<DebitSignals["bankStatusApi"]>("not_reported");
  const [minutesAgo, setMinutesAgo] = useState("0");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/payment-ambiguity/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderValue: Number(orderValue),
          deliveryStatus,
          paymentMethod,
          industry,
          signals: { bankStatusApi },
          minutesAgo: Number(minutesAgo) || 0,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Failed to create transaction");
      }
      router.push("/admin/payment-ambiguity");
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="flex-1 bg-slate-50 px-6 py-10">
      <div className="max-w-lg mx-auto">
        <h1 className="text-2xl font-semibold text-slate-900 mb-1">New ambiguous transaction</h1>
        <p className="text-sm text-slate-500 mb-6">
          There&apos;s no live payment gateway wired in — use this to seed a transaction and see how the
          decision layer scores it. Set &quot;minutes ago&quot; to backdate the ambiguity-detected
          timestamp and test the escalation ladder without waiting in real time.
        </p>

        <form onSubmit={handleSubmit} className="bg-white border border-slate-200 rounded-lg shadow-sm p-6 space-y-4">
          <Field label="Order value (₹)">
            <input
              type="number"
              min={0}
              value={orderValue}
              onChange={(e) => setOrderValue(e.target.value)}
              className="w-full border border-slate-300 rounded-md px-2 py-1.5 text-sm"
              required
            />
          </Field>

          <Field label="Delivery status">
            <select
              value={deliveryStatus}
              onChange={(e) => setDeliveryStatus(e.target.value as DeliveryStatus)}
              className="w-full border border-slate-300 rounded-md px-2 py-1.5 text-sm"
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
              className="w-full border border-slate-300 rounded-md px-2 py-1.5 text-sm"
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
              className="w-full border border-slate-300 rounded-md px-2 py-1.5 text-sm"
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
              className="w-full border border-slate-300 rounded-md px-2 py-1.5 text-sm"
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
              className="w-full border border-slate-300 rounded-md px-2 py-1.5 text-sm"
            />
          </Field>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-md bg-slate-900 text-white text-sm font-medium px-3 py-2 hover:bg-slate-800 disabled:opacity-50"
          >
            {submitting ? "Creating…" : "Create transaction"}
          </button>
        </form>
      </div>
    </main>
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
