/**
 * Encodes the ten worked scenarios from the "Payment Ambiguity Decision
 * Layer — Stage-by-Stage Technical Walkthrough" as executable assertions.
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

// S1 — Fast path
{
  const tx: Transaction = { orderValue: 200, customerTrust: "high_trust", paymentMethod: "upi", industry: "retail" };
  const signals: DebitSignals = { ...noSignals, bankStatusApi: "debited" };
  const result = decide(tx, signals, 2);
  assertEqual("S1 action", result.action, "continue_polling");
  assertEqual("S1 ladderStage", result.ladderStage, "continue_polling");
  assertEqual("S1 debitStatus", result.debitStatus, null);
}

// S2 — Past fast-path, debit confirmed
{
  const tx: Transaction = { orderValue: 200, customerTrust: "high_trust", paymentMethod: "upi", industry: "retail" };
  const signals: DebitSignals = { ...noSignals, bankStatusApi: "debited" };
  const result = decide(tx, signals, 6);
  assertEqual("S2 score", result.riskScore, 0.175);
  assertEqual("S2 action", result.action, "refund_confirmed_debit");
  assertEqual("S2 borderline", result.borderline, false);
}

// S3 — Identical risk profile, debit confirmed NOT taken
{
  const tx: Transaction = { orderValue: 200, customerTrust: "high_trust", paymentMethod: "upi", industry: "retail" };
  const signals: DebitSignals = { ...noSignals, bankStatusApi: "not_debited" };
  const result = decide(tx, signals, 6);
  assertEqual("S3 score", result.riskScore, 0.175);
  assertEqual("S3 action", result.action, "release_hold_no_action");
}

// S4 — Identical risk profile, nothing confirmed
{
  const tx: Transaction = { orderValue: 200, customerTrust: "high_trust", paymentMethod: "upi", industry: "retail" };
  const result = decide(tx, noSignals, 6);
  assertEqual("S4 score", result.riskScore, 0.175);
  assertEqual("S4 debitStatus", result.debitStatus, "unknown");
  assertEqual("S4 action", result.action, "refund_precautionary");
}

// S5 — Card-testing profile
{
  const tx: Transaction = { orderValue: 500, customerTrust: "new", paymentMethod: "card", industry: "digital_goods" };
  const signals: DebitSignals = { ...noSignals, bankStatusApi: "debited" };
  const result = decide(tx, signals, 6);
  assertEqual("S5 score", result.riskScore, 0.425);
  assertEqual("S5 action", result.action, "provisional_access");
  assertEqual("S5 borderline", result.borderline, true);
}

// S6 — Medium-high, returning/travel
{
  const tx: Transaction = { orderValue: 8000, customerTrust: "returning", paymentMethod: "upi", industry: "travel" };
  const signals: DebitSignals = { ...noSignals, bankStatusApi: "debited" };
  const result = decide(tx, signals, 6);
  assertEqual("S6 score", result.riskScore, 0.475);
  assertEqual("S6 action", result.action, "provisional_access_stepup_required");
  assertEqual("S6 borderline", result.borderline, true);
}

// S7 — Just above the 0.30 line
{
  const tx: Transaction = { orderValue: 4000, customerTrust: "returning", paymentMethod: "card", industry: "digital_goods" };
  const signals: DebitSignals = { ...noSignals, bankStatusApi: "debited" };
  const result = decide(tx, signals, 6);
  assertEqual("S7 score", result.riskScore, 0.31);
  assertEqual("S7 action", result.action, "provisional_access");
  assertEqual("S7 borderline", result.borderline, true);
}

// S8 — High risk, source conflict (bank wins over gateway per trust order)
{
  const tx: Transaction = { orderValue: 40000, customerTrust: "new", paymentMethod: "netbanking", industry: "retail" };
  const signals: DebitSignals = { ...noSignals, gatewayWebhook: "not_debited", bankStatusApi: "debited" };
  const result = decide(tx, signals, 6);
  assertEqual("S8 debitStatus (bank wins)", result.debitStatus, "confirmed_debited");
  assertEqual("S8 score", result.riskScore, 0.735);
  assertEqual("S8 action", result.action, "hold_manual_review");
  assertEqual("S8 borderline", result.borderline, false);
}

// S9 — Weak signal only (client state alone cannot confirm)
{
  const tx: Transaction = { orderValue: 300, customerTrust: "high_trust", paymentMethod: "upi", industry: "retail" };
  const signals: DebitSignals = { ...noSignals, clientAppState: "debited" };
  const result = decide(tx, signals, 6);
  assertEqual("S9 debitStatus (weak-signal gate)", result.debitStatus, "unknown");
  assertEqual("S9 score", result.riskScore, 0.175);
  assertEqual("S9 action", result.action, "refund_precautionary");
}

// S10 — Forced resolution at the 30-minute deadline
{
  const tx: Transaction = { orderValue: 600, customerTrust: "returning", paymentMethod: "wallet", industry: "food_delivery" };
  const result = decide(tx, noSignals, 30);
  assertEqual("S10 ladderStage", result.ladderStage, "forced_resolution");
  assertEqual("S10 score", result.riskScore, 0.32);
  assertEqual("S10 action", result.action, "provisional_access");
  assertEqual("S10 borderline", result.borderline, true);
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
