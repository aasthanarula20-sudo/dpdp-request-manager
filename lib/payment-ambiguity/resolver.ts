import { arbitrateDebitStatus } from "./arbitration";
import { computeRiskScore } from "./scoring";
import type { Action, DebitSignals, Decision, LadderStage, Transaction } from "./types";

/** Stage 1 — Escalation Ladder gates, in minutes since ambiguity was first detected. */
export const LADDER = {
  fastPathMinutes: 5,
  forcedResolutionMinutes: 30,
};

/** Stage 4 — Threshold → Action Mapping cutoffs, plus the borderline margin. */
export const RISK_THRESHOLDS = {
  low: 0.3,
  medium: 0.45,
  high: 0.6,
  borderlineMargin: 0.03,
};

/** Stage 1 — Escalation Ladder. */
export function evaluateLadder(elapsedMinutes: number): LadderStage {
  if (elapsedMinutes < LADDER.fastPathMinutes) return "continue_polling";
  if (elapsedMinutes >= LADDER.forcedResolutionMinutes) return "forced_resolution";
  return "proceed";
}

function isBorderline(score: number): boolean {
  const { low, medium, high, borderlineMargin } = RISK_THRESHOLDS;
  return (
    Math.abs(score - low) <= borderlineMargin ||
    Math.abs(score - medium) <= borderlineMargin ||
    Math.abs(score - high) <= borderlineMargin
  );
}

/**
 * Stage 4 — Threshold → Action Mapping. Only the lowest band branches on
 * debit_status; above that, the caution level does the deciding regardless
 * of whether money actually moved.
 */
function mapScoreToAction(score: number, debitStatus: ReturnType<typeof arbitrateDebitStatus>): Action {
  if (score < RISK_THRESHOLDS.low) {
    if (debitStatus === "confirmed_debited") return "refund_confirmed_debit";
    if (debitStatus === "confirmed_not_debited") return "release_hold_no_action";
    return "refund_precautionary";
  }
  if (score < RISK_THRESHOLDS.medium) return "provisional_access";
  if (score < RISK_THRESHOLDS.high) return "provisional_access_stepup_required";
  return "hold_manual_review";
}

/**
 * Runs a transaction through all four stages and returns the final action.
 * `elapsedMinutes` is caller-supplied — this module has no clock of its own.
 */
export function decide(
  transaction: Transaction,
  signals: DebitSignals,
  elapsedMinutes: number
): Decision {
  const ladderStage = evaluateLadder(elapsedMinutes);

  if (ladderStage === "continue_polling") {
    return {
      action: "continue_polling",
      ladderStage,
      debitStatus: null,
      riskScore: null,
      riskBreakdown: null,
      borderline: false,
    };
  }

  const debitStatus = arbitrateDebitStatus(signals);
  const riskBreakdown = computeRiskScore(transaction);
  const action = mapScoreToAction(riskBreakdown.score, debitStatus);

  return {
    action,
    ladderStage,
    debitStatus,
    riskScore: riskBreakdown.score,
    riskBreakdown,
    borderline: isBorderline(riskBreakdown.score),
  };
}
