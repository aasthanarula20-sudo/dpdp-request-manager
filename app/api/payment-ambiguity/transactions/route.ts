import { NextRequest, NextResponse } from "next/server";
import { createTransaction, listTransactions } from "@/lib/payment-ambiguity/store";
import type { DebitSignals, Industry, PaymentMethod, TrustTier } from "@/lib/payment-ambiguity/types";

const TRUST_TIERS: TrustTier[] = ["new", "returning", "high_trust"];
const PAYMENT_METHODS: PaymentMethod[] = ["upi", "wallet", "card", "netbanking"];
const INDUSTRIES: Industry[] = ["travel", "food_delivery", "retail", "digital_goods"];
const SIGNAL_STATUSES = ["debited", "not_debited", "pending", "not_reported"];

interface CreateBody {
  orderValue?: number;
  customerTrust?: TrustTier;
  paymentMethod?: PaymentMethod;
  industry?: Industry;
  signals?: Partial<DebitSignals>;
  minutesAgo?: number;
}

export async function GET() {
  try {
    const transactions = await listTransactions();
    return NextResponse.json({ transactions });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  let body: CreateBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { orderValue, customerTrust, paymentMethod, industry, signals, minutesAgo } = body;

  if (typeof orderValue !== "number" || orderValue < 0) {
    return NextResponse.json({ error: "orderValue must be a non-negative number" }, { status: 400 });
  }
  if (!customerTrust || !TRUST_TIERS.includes(customerTrust)) {
    return NextResponse.json({ error: `customerTrust must be one of ${TRUST_TIERS.join(", ")}` }, { status: 400 });
  }
  if (!paymentMethod || !PAYMENT_METHODS.includes(paymentMethod)) {
    return NextResponse.json({ error: `paymentMethod must be one of ${PAYMENT_METHODS.join(", ")}` }, { status: 400 });
  }
  if (!industry || !INDUSTRIES.includes(industry)) {
    return NextResponse.json({ error: `industry must be one of ${INDUSTRIES.join(", ")}` }, { status: 400 });
  }
  if (signals) {
    for (const [key, value] of Object.entries(signals)) {
      if (value !== undefined && !SIGNAL_STATUSES.includes(value)) {
        return NextResponse.json({ error: `signals.${key} must be one of ${SIGNAL_STATUSES.join(", ")}` }, { status: 400 });
      }
    }
  }

  const ambiguityDetectedAt =
    typeof minutesAgo === "number" && minutesAgo > 0
      ? new Date(Date.now() - minutesAgo * 60_000).toISOString()
      : undefined;

  try {
    const record = await createTransaction({
      transaction: { orderValue, customerTrust, paymentMethod, industry },
      signals,
      ambiguityDetectedAt,
    });
    return NextResponse.json({ transaction: record }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
