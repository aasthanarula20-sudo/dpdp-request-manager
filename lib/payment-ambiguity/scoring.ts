import type { DeliveryStatus, Industry, PaymentMethod, RiskBreakdown, Transaction } from "./types";

/**
 * Every dimension here answers "how costly or urgent is it to get this
 * decision wrong while we're still uncertain" — deliberately excludes any
 * judgment of the customer (no fraud/trust proxy). Weights were
 * proportionally redistributed after removing a former customer-trust
 * dimension.
 */
const WEIGHTS = {
  orderValue: 0.35,
  deliveryStatus: 0.25,
  paymentMethod: 0.15,
  industryUrgency: 0.25,
};

/** Already-delivered digital content/services are much harder to claw back than an unshipped order. */
const DELIVERY_STATUS_RISK: Record<DeliveryStatus, number> = {
  not_delivered: 0.2,
  delivered: 0.8,
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
 * risk_score = 0.35 * order_value_risk + 0.25 * delivery_status_risk
 *            + 0.15 * payment_method_risk + 0.25 * industry_urgency_risk
 */
export function computeRiskScore(transaction: Transaction): RiskBreakdown {
  const orderValueComponent = orderValueRisk(transaction.orderValue);
  const deliveryStatusComponent = DELIVERY_STATUS_RISK[transaction.deliveryStatus];
  const paymentMethodComponent = PAYMENT_METHOD_RISK[transaction.paymentMethod];
  const industryUrgencyComponent = INDUSTRY_URGENCY_RISK[transaction.industry];

  const score =
    WEIGHTS.orderValue * orderValueComponent +
    WEIGHTS.deliveryStatus * deliveryStatusComponent +
    WEIGHTS.paymentMethod * paymentMethodComponent +
    WEIGHTS.industryUrgency * industryUrgencyComponent;

  return {
    orderValueRisk: orderValueComponent,
    deliveryStatusRisk: deliveryStatusComponent,
    paymentMethodRisk: paymentMethodComponent,
    industryUrgencyRisk: industryUrgencyComponent,
    // Guard against binary floating-point noise (e.g. 0.30000000000000004).
    score: Math.round(score * 1e6) / 1e6,
  };
}
