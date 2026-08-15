/**
 * Edge-case / boundary coverage for the Payment Ambiguity Decision Layer,
 * complementing test-full-suite.ts (which encodes the ten worked
 * scenarios verbatim). This file targets the boundaries between stages
 * rather than named scenarios.
 *
 * Usage: npx tsx lib/payment-ambiguity/test-end-to-end.ts
 */
import { arbitrateDebitStatus } from "./arbitration";
import { evaluateLadder, RISK_THRESHOLDS } from "./resolver";
import { decide } from "./resolver";
import { computeRiskScore } from "./scoring";
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

// --- Stage 1: ladder boundaries ---
assertEqual("ladder just under 5min", evaluateLadder(4.99), "continue_polling");
assertEqual("ladder exactly 5min", evaluateLadder(5), "proceed");
assertEqual("ladder just under 30min", evaluateLadder(29.99), "proceed");
assertEqual("ladder exactly 30min", evaluateLadder(30), "forced_resolution");

// --- Stage 2: arbitration trust order + weak-signal gate ---
assertEqual(
  "settlement file outranks everything",
  arbitrateDebitStatus({
    settlementFile: "not_debited",
    bankStatusApi: "debited",
    gatewayWebhook: "debited",
    clientAppState: "debited",
  }),
  "confirmed_not_debited"
);
assertEqual(
  "gateway webhook wins when settlement/bank silent",
  arbitrateDebitStatus({ ...noSignals, gatewayWebhook: "debited" }),
  "confirmed_debited"
);
assertEqual(
  "pending is not a definite report",
  arbitrateDebitStatus({ ...noSignals, bankStatusApi: "pending" }),
  "unknown"
);
assertEqual(
  "client app state alone, even corroborated by a pending source, stays unknown",
  arbitrateDebitStatus({ ...noSignals, bankStatusApi: "pending", clientAppState: "debited" }),
  "unknown"
);
assertEqual("no signals at all", arbitrateDebitStatus(noSignals), "unknown");

// --- Stage 3: scoring extremes ---
{
  const allLowest: Transaction = { orderValue: 500, deliveryStatus: "not_delivered", paymentMethod: "upi", industry: "digital_goods" };
  const breakdown = computeRiskScore(allLowest);
  // 0.35*0.1 + 0.25*0.2 + 0.15*0.2 + 0.25*0.2 = 0.035+0.05+0.03+0.05
  assertEqual("lowest-risk combination", breakdown.score, 0.165);
}
{
  const allHighest: Transaction = { orderValue: 50000, deliveryStatus: "delivered", paymentMethod: "netbanking", industry: "travel" };
  const breakdown = computeRiskScore(allHighest);
  // 0.35*0.9 + 0.25*0.8 + 0.15*0.7 + 0.25*0.8 = 0.315+0.2+0.105+0.2
  assertEqual("highest-risk combination", breakdown.score, 0.82);
}

// --- Stage 4: threshold boundaries + debit_status irrelevance above 0.30 ---
assertEqual("borderline margin constant", RISK_THRESHOLDS.borderlineMargin, 0.03);

{
  // order_value_risk band edge: 999 vs 1000
  const under: Transaction = { orderValue: 999, deliveryStatus: "not_delivered", paymentMethod: "upi", industry: "digital_goods" };
  const at: Transaction = { orderValue: 1000, deliveryStatus: "not_delivered", paymentMethod: "upi", industry: "digital_goods" };
  const underScore = computeRiskScore(under).score;
  const atScore = computeRiskScore(at).score;
  assertEqual("order value band jumps at 1000", underScore < atScore, true);
}

{
  // Above the 0.30 band, debit_status must not change the action.
  const tx: Transaction = { orderValue: 8000, deliveryStatus: "not_delivered", paymentMethod: "upi", industry: "food_delivery" }; // score 0.465
  const debited = decide(tx, { ...noSignals, bankStatusApi: "debited" }, 6);
  const notDebited = decide(tx, { ...noSignals, bankStatusApi: "not_debited" }, 6);
  const unknown = decide(tx, noSignals, 6);
  assertEqual("debit_status irrelevant above 0.30 (debited)", debited.action, "provisional_access_stepup_required");
  assertEqual("debit_status irrelevant above 0.30 (not_debited)", notDebited.action, "provisional_access_stepup_required");
  assertEqual("debit_status irrelevant above 0.30 (unknown)", unknown.action, "provisional_access_stepup_required");
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
