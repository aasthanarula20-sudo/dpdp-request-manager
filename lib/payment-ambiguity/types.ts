/**
 * Shared types for the Payment Ambiguity Decision Layer.
 * See docs companion: "Payment Ambiguity Decision Layer — Stage-by-Stage
 * Technical Walkthrough" (PRD v1.2).
 */

export type SignalStatus = "debited" | "not_debited" | "pending" | "not_reported";

export interface DebitSignals {
  settlementFile: SignalStatus;
  bankStatusApi: SignalStatus;
  gatewayWebhook: SignalStatus;
  clientAppState: SignalStatus;
}

export type DebitStatus = "confirmed_debited" | "confirmed_not_debited" | "unknown";

export type IntentSignalStatus = "reported" | "not_reported";

export interface CustomerIntentSignals {
  /** Customer explicitly cancelled (e.g. clicked "Cancel order") — the only signal that confirms cancellation. */
  explicitCancelAction: IntentSignalStatus;
  /** Passive signal only (tab closed, app backgrounded) — never sufficient alone to confirm cancellation. */
  passiveAbandonSignal: IntentSignalStatus;
}

export type CustomerIntent = "confirmed_cancel" | "no_cancel_signal";

/** Was the digital content/service already delivered to the customer when ambiguity was detected? */
export type DeliveryStatus = "not_delivered" | "delivered";
export type PaymentMethod = "upi" | "wallet" | "card" | "netbanking";
export type Industry = "travel" | "food_delivery" | "retail" | "digital_goods";

export interface Transaction {
  orderValue: number;
  deliveryStatus: DeliveryStatus;
  paymentMethod: PaymentMethod;
  industry: Industry;
}

export interface RiskBreakdown {
  orderValueRisk: number;
  deliveryStatusRisk: number;
  paymentMethodRisk: number;
  industryUrgencyRisk: number;
  score: number;
}

export type LadderStage = "continue_polling" | "proceed" | "forced_resolution";

export type Action =
  | "continue_polling"
  | "proceed_order_confirmed"
  | "refund_confirmed_debit"
  | "release_hold_no_action"
  | "refund_precautionary"
  | "provisional_access"
  | "provisional_access_stepup_required"
  | "hold_manual_review";

export interface Decision {
  action: Action;
  ladderStage: LadderStage;
  debitStatus: DebitStatus | null;
  riskScore: number | null;
  riskBreakdown: RiskBreakdown | null;
  borderline: boolean;
  /** Plain-language explanation of how this decision was reached, built from the same data above. */
  reasoning: string;
}
