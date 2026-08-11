import type { DebitSignals, DebitStatus, SignalStatus } from "./types";

/**
 * Trust order, highest first. Only settlement file, bank status API, and
 * gateway webhook count as "medium-or-higher trust" — client app state is
 * too easy to be wrong or spoofed to confirm anything on its own.
 */
const TRUST_ORDER: (keyof DebitSignals)[] = [
  "settlementFile",
  "bankStatusApi",
  "gatewayWebhook",
  "clientAppState",
];

const MEDIUM_OR_HIGHER_TRUST: (keyof DebitSignals)[] = [
  "settlementFile",
  "bankStatusApi",
  "gatewayWebhook",
];

function isDefinite(status: SignalStatus): status is "debited" | "not_debited" {
  return status === "debited" || status === "not_debited";
}

/**
 * Stage 2 — Debit Status Arbitration.
 * Highest-trust source with a definite report wins. A lone client-side
 * report with no medium-or-higher corroboration resolves to `unknown`,
 * not confirmed (the weak-signal gate).
 */
export function arbitrateDebitStatus(signals: DebitSignals): DebitStatus {
  for (const source of TRUST_ORDER) {
    const status = signals[source];
    if (!isDefinite(status)) continue;
    if (!MEDIUM_OR_HIGHER_TRUST.includes(source)) continue; // weak-signal gate
    return status === "debited" ? "confirmed_debited" : "confirmed_not_debited";
  }
  return "unknown";
}
