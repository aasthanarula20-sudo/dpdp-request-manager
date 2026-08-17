import type { CustomerIntent, CustomerIntentSignals } from "./types";

/**
 * Was cancellation intent confirmed? Mirrors the debit-status weak-signal
 * discipline: an explicit cancel action is the only signal that confirms
 * cancellation. A passive signal alone (tab closed, app backgrounded) is
 * too noisy to trust — the customer could have simply looked away, not
 * abandoned the purchase.
 */
export function arbitrateIntent(signals: CustomerIntentSignals): CustomerIntent {
  if (signals.explicitCancelAction === "reported") return "confirmed_cancel";
  return "no_cancel_signal";
}
