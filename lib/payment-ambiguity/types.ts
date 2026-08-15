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
}
