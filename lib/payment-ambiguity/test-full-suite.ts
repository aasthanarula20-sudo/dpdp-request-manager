/**
 * Encodes representative scenarios for the Payment Ambiguity Decision
 * Layer as executable assertions. Numbers are taken from actually running
 * computeRiskScore/decide, not hand-calculated.
 *
 * Usage: npx tsx lib/payment-ambiguity/test-full-suite.ts
 */
import { decide } from "./resolver";
import type { DebitSignals, Transaction } from "./types";

let passed = 0;
let failed = 0;

function assertEqual(label: string, actual: unknown, expected: unknown) {
  const ok = actual === expected;
  if (ok) {
    passed++;
  } else {
    failed++;
    console.error(`FAIL ${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

const noSignals: DebitSignals = {
  settlementFile: "not_reported",
  bankStatusApi: "not_reported",
  gatewayWebhook: "not_reported",
  clientAppState: "not_reported",
};

// T1 — Fast path, genuinely no signal yet
{
  const tx: Transaction = { orderValue: 200, deliveryStatus: "not_delivered", paymentMethod: "upi", industry: "retail" };
  const result = decide(tx, noSignals, 2);
  assertEqual("T1 action", result.action, "continue_polling");
  assertEqual("T1 ladderStage", result.ladderStage, "continue_polling");
  assertEqual("T1 debitStatus", result.debitStatus, null);
}

// T1b — Fast-path window, but a confirmed signal already arrived: act immediately
{
  const tx: Transaction = { orderValue: 200, deliveryStatus: "not_delivered", paymentMethod: "upi", industry: "retail" };
  const signals: DebitSignals = { ...noSignals, bankStatusApi: "debited" };
  const result = decide(tx, signals, 2);
  assertEqual("T1b action", result.action, "refund_confirmed_debit");
  assertEqual("T1b ladderStage", result.ladderStage, "proceed");
  assertEqual("T1b debitStatus", result.debitStatus, "confirmed_debited");
  assertEqual("T1b score", result.riskScore, 0.215);
}

// T2 — Past fast-path, debit confirmed
{
  const tx: Transaction = { orderValue: 200, deliveryStatus: "not_delivered", paymentMethod: "upi", industry: "retail" };
  const signals: DebitSignals = { ...noSignals, bankStatusApi: "debited" };
  const result = decide(tx, signals, 6);
  assertEqual("T2 score", result.riskScore, 0.215);
  assertEqual("T2 action", result.action, "refund_confirmed_debit");
  assertEqual("T2 borderline", result.borderline, false);
}

// T3 — Same profile, confirmed NOT debited
{
  const tx: Transaction = { orderValue: 200, deliveryStatus: "not_delivered", paymentMethod: "upi", industry: "retail" };
  const signals: DebitSignals = { ...noSignals, bankStatusApi: "not_debited" };
  const result = decide(tx, signals, 6);
  assertEqual("T3 score", result.riskScore, 0.215);
  assertEqual("T3 action", result.action, "release_hold_no_action");
}

// T4 — Same profile, nothing confirmed
{
  const tx: Transaction = { orderValue: 200, deliveryStatus: "not_delivered", paymentMethod: "upi", industry: "retail" };
  const result = decide(tx, noSignals, 6);
  assertEqual("T4 score", result.riskScore, 0.215);
  assertEqual("T4 debitStatus", result.debitStatus, "unknown");
  assertEqual("T4 action", result.action, "refund_precautionary");
}

// T5 — Delivery status changes the band: delivered content pushes this above the low-risk cutoff
{
  const tx: Transaction = { orderValue: 500, deliveryStatus: "delivered", paymentMethod: "card", industry: "digital_goods" };
  const signals: DebitSignals = { ...noSignals, bankStatusApi: "debited" };
  const result = decide(tx, signals, 6);
  assertEqual("T5 score", result.riskScore, 0.36);
  assertEqual("T5 action", result.action, "provisional_access");
}

// T5b — Identical profile, but not yet delivered: drops back into the low-risk band
{
  const tx: Transaction = { orderValue: 500, deliveryStatus: "not_delivered", paymentMethod: "card", industry: "digital_goods" };
  const signals: DebitSignals = { ...noSignals, bankStatusApi: "debited" };
  const result = decide(tx, signals, 6);
  assertEqual("T5b score", result.riskScore, 0.21);
  assertEqual("T5b action", result.action, "refund_confirmed_debit");
}

// T6 — Medium-high, borderline
{
  const tx: Transaction = { orderValue: 8000, deliveryStatus: "not_delivered", paymentMethod: "upi", industry: "food_delivery" };
  const signals: DebitSignals = { ...noSignals, bankStatusApi: "debited" };
  const result = decide(tx, signals, 6);
  assertEqual("T6 score", result.riskScore, 0.465);
  assertEqual("T6 action", result.action, "provisional_access_stepup_required");
  assertEqual("T6 borderline", result.borderline, true);
}

// T7 — Borderline just under the 0.30 line
{
  const tx: Transaction = { orderValue: 4000, deliveryStatus: "not_delivered", paymentMethod: "card", industry: "digital_goods" };
  const signals: DebitSignals = { ...noSignals, bankStatusApi: "debited" };
  const result = decide(tx, signals, 6);
  assertEqual("T7 score", result.riskScore, 0.28);
  assertEqual("T7 action", result.action, "refund_confirmed_debit");
  assertEqual("T7 borderline", result.borderline, true);
}

// T8 — High risk, source conflict (bank wins over gateway per trust order)
{
  const tx: Transaction = { orderValue: 40000, deliveryStatus: "delivered", paymentMethod: "netbanking", industry: "retail" };
  const signals: DebitSignals = { ...noSignals, gatewayWebhook: "not_debited", bankStatusApi: "debited" };
  const result = decide(tx, signals, 6);
  assertEqual("T8 debitStatus (bank wins)", result.debitStatus, "confirmed_debited");
  assertEqual("T8 score", result.riskScore, 0.72);
  assertEqual("T8 action", result.action, "hold_manual_review");
  assertEqual("T8 borderline", result.borderline, false);
}

// T9 — Weak signal only (client state alone cannot confirm)
{
  const tx: Transaction = { orderValue: 300, deliveryStatus: "not_delivered", paymentMethod: "upi", industry: "retail" };
  const signals: DebitSignals = { ...noSignals, clientAppState: "debited" };
  const result = decide(tx, signals, 6);
  assertEqual("T9 debitStatus (weak-signal gate)", result.debitStatus, "unknown");
  assertEqual("T9 action", result.action, "refund_precautionary");
}

// T10 — Forced resolution at the 30-minute deadline
{
  const tx: Transaction = { orderValue: 600, deliveryStatus: "not_delivered", paymentMethod: "wallet", industry: "food_delivery" };
  const result = decide(tx, noSignals, 30);
  assertEqual("T10 ladderStage", result.ladderStage, "forced_resolution");
  assertEqual("T10 score", result.riskScore, 0.305);
  assertEqual("T10 action", result.action, "provisional_access");
  assertEqual("T10 borderline", result.borderline, true);
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
