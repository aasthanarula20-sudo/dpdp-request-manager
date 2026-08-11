import { NextRequest, NextResponse } from "next/server";
import { evaluateTransaction } from "@/lib/payment-ambiguity/store";
import type { DebitSignals } from "@/lib/payment-ambiguity/types";

const SIGNAL_STATUSES = ["debited", "not_debited", "pending", "not_reported"];

export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;

  let signals: Partial<DebitSignals> | undefined;
  try {
    const text = await req.text();
    signals = text ? (JSON.parse(text).signals as Partial<DebitSignals> | undefined) : undefined;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (signals) {
    for (const [key, value] of Object.entries(signals)) {
      if (value !== undefined && !SIGNAL_STATUSES.includes(value)) {
        return NextResponse.json({ error: `signals.${key} must be one of ${SIGNAL_STATUSES.join(", ")}` }, { status: 400 });
      }
    }
  }

  try {
    const record = await evaluateTransaction(id, signals);
    return NextResponse.json({ transaction: record });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
