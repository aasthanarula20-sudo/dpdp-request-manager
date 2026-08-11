import type { Industry, PaymentMethod, RiskBreakdown, Transaction, TrustTier } from "./types";

const WEIGHTS = {
  orderValue: 0.3,
  trust: 0.35,
  paymentMethod: 0.15,
  industryUrgency: 0.2,
};

const TRUST_RISK: Record<TrustTier, number> = {
  new: 0.8,
  returning: 0.3,
  high_trust: 0.1,
};

const PAYMENT_METHOD_RISK: Record<PaymentMethod, number> = {
  upi: 0.2,
  wallet: 0.3,
  card: 0.5,
  netbanking: 0.7,
};

const INDUSTRY_URGENCY_RISK: Record<Industry, number> = {
  digital_goods: 0.2,
  retail: 0.4,
  food_delivery: 0.7,
  travel: 0.8,
};

function orderValueRisk(orderValue: number): number {
  if (orderValue < 1000) return 0.1;
  if (orderValue < 5000) return 0.3;
  if (orderValue < 20000) return 0.6;
  return 0.9;
}

/**
 * Stage 3 — Risk Scoring.
 * risk_score = 0.30 * order_value_risk + 0.35 * trust_risk
 *            + 0.15 * payment_method_risk + 0.20 * industry_urgency_risk
 */
export function computeRiskScore(transaction: Transaction): RiskBreakdown {
  const orderValueComponent = orderValueRisk(transaction.orderValue);
  const trustComponent = TRUST_RISK[transaction.customerTrust];
  const paymentMethodComponent = PAYMENT_METHOD_RISK[transaction.paymentMethod];
  const industryUrgencyComponent = INDUSTRY_URGENCY_RISK[transaction.industry];

  const score =
    WEIGHTS.orderValue * orderValueComponent +
    WEIGHTS.trust * trustComponent +
    WEIGHTS.paymentMethod * paymentMethodComponent +
    WEIGHTS.industryUrgency * industryUrgencyComponent;

  return {
    orderValueRisk: orderValueComponent,
    trustRisk: trustComponent,
    paymentMethodRisk: paymentMethodComponent,
    industryUrgencyRisk: industryUrgencyComponent,
    // Guard against binary floating-point noise (e.g. 0.30000000000000004)
    // so scores match the walkthrough's numbers exactly.
    score: Math.round(score * 1e6) / 1e6,
  };
}
