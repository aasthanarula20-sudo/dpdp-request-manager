import { arbitrateDebitStatus } from "./arbitration";
import { arbitrateIntent } from "./customer-intent";
import { computeRiskScore } from "./scoring";
import type {
  Action,
  CustomerIntent,
  CustomerIntentSignals,
  DebitSignals,
  DebitStatus,
  Decision,
  LadderStage,
  RiskBreakdown,
  Transaction,
} from "./types";

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

/** No cancellation signal reported — the default when the caller doesn't supply intent signals. */
const DEFAULT_INTENT_SIGNALS: CustomerIntentSignals = {
  explicitCancelAction: "not_reported",
  passiveAbandonSignal: "not_reported",
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

function bandName(score: number): string {
  if (score < RISK_THRESHOLDS.low) return "low band";
  if (score < RISK_THRESHOLDS.medium) return "medium band";
  if (score < RISK_THRESHOLDS.high) return "medium-high band";
  return "high band";
}

/**
 * Stage 4 — Threshold → Action Mapping.
 *
 * IMPORTANT — two different kinds of "trust" are at play in this module,
 * and only one of them lives here:
 *   - SOURCE trust (which signal to believe when they disagree) is
 *     arbitration.ts's job. By the time `debitStatus` reaches this
 *     function, that question is already settled — "confirmed_debited"
 *     here means a source arbitration already trusted enough to call
 *     definite, not a raw, unverified report.
 *   - RISK-based caution (how much blast radius this transaction carries)
 *     is this function's job, and it is NOT a comment on whether the
 *     debit_status is accurate. A `hold_manual_review` outcome with
 *     debit_status = confirmed_debited does not mean the system doubts
 *     the bank — it means even a confirmed, accurate debit isn't enough
 *     information on its own to safely auto-finalize a high-blast-radius
 *     transaction (see scoring.ts for what drives blast radius: order
 *     value and delivery status). Only the lowest risk band lets
 *     debit_status change the actual outcome; above it, the caution
 *     level decides regardless of whether money moved, because at that
 *     point the open question isn't "did money move" but "how much
 *     should we risk finalizing automatically."
 *
 * Within the lowest band, a confirmed debit defaults to the order
 * proceeding normally — refund is the exception, triggered only when the
 * customer's own intent was to cancel (see customer-intent.ts).
 */
function mapScoreToAction(score: number, debitStatus: DebitStatus, intent: CustomerIntent): Action {
  if (score < RISK_THRESHOLDS.low) {
    if (debitStatus === "confirmed_debited") {
      return intent === "confirmed_cancel" ? "refund_confirmed_debit" : "proceed_order_confirmed";
    }
    if (debitStatus === "confirmed_not_debited") return "release_hold_no_action";
    return "refund_precautionary";
  }
  if (score < RISK_THRESHOLDS.medium) return "provisional_access";
  if (score < RISK_THRESHOLDS.high) return "provisional_access_stepup_required";
  return "hold_manual_review";
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function buildPollingReasoning(elapsedMinutes: number): string {
  return `Ambiguity detected ~${round1(elapsedMinutes)} min ago; no confirmed debit signal yet, still within the ${LADDER.fastPathMinutes}-minute fast-path window — continuing to poll.`;
}

function buildDecisionReasoning(
  elapsedMinutes: number,
  ladderStage: LadderStage,
  bypassedFastPath: boolean,
  debitStatus: DebitStatus,
  intent: CustomerIntent,
  riskBreakdown: RiskBreakdown,
  action: Action,
  borderline: boolean
): string {
  const timingPart =
    ladderStage === "forced_resolution"
      ? `Forced resolution at the ${LADDER.forcedResolutionMinutes}-minute deadline (elapsed ~${round1(elapsedMinutes)} min).`
      : bypassedFastPath
        ? `A confirmed debit signal arrived early (~${round1(elapsedMinutes)} min in), so the fast-path wait was skipped.`
        : `Past the ${LADDER.fastPathMinutes}-minute fast-path window (~${round1(elapsedMinutes)} min elapsed).`;

  let debitPart = `Debit status resolved to ${debitStatus}.`;
  if (debitStatus === "confirmed_debited" && riskBreakdown.score < RISK_THRESHOLDS.low) {
    debitPart +=
      intent === "confirmed_cancel"
        ? " Customer confirmed cancellation, so a refund is issued despite the confirmed debit."
        : " No cancellation signal, so the order proceeds normally.";
  }

  const scorePart = `Risk score ${riskBreakdown.score} (${bandName(riskBreakdown.score)})${borderline ? ", borderline (within 0.03 of a cutoff)" : ""}.`;

  return `${timingPart} ${debitPart} ${scorePart} → ${action}.`;
}

/**
 * Runs a transaction through all four stages and returns the final action.
 * `elapsedMinutes` is caller-supplied — this module has no clock of its own.
 * `intentSignals` defaults to "no cancellation reported" when omitted.
 */
export function decide(
  transaction: Transaction,
  signals: DebitSignals,
  elapsedMinutes: number,
  intentSignals: CustomerIntentSignals = DEFAULT_INTENT_SIGNALS
): Decision {
  const debitStatus = arbitrateDebitStatus(signals);
  const intent = arbitrateIntent(intentSignals);
  const timeBasedStage = evaluateLadder(elapsedMinutes);

  // A confirmed debit status from a medium-or-higher trust source is stable —
  // it isn't going to revert itself a few minutes later, so waiting out the
  // fast-path window adds no information. Only genuinely unresolved
  // (`unknown`) cases need that buffer for the picture to settle.
  const bypassedFastPath = debitStatus !== "unknown" && timeBasedStage === "continue_polling";
  const ladderStage = bypassedFastPath ? "proceed" : timeBasedStage;

  if (ladderStage === "continue_polling") {
    return {
      action: "continue_polling",
      ladderStage,
      debitStatus: null,
      riskScore: null,
      riskBreakdown: null,
      borderline: false,
      reasoning: buildPollingReasoning(elapsedMinutes),
    };
  }

  const riskBreakdown = computeRiskScore(transaction);
  const action = mapScoreToAction(riskBreakdown.score, debitStatus, intent);
  const borderline = isBorderline(riskBreakdown.score);

  return {
    action,
    ladderStage,
    debitStatus,
    riskScore: riskBreakdown.score,
    riskBreakdown,
    borderline,
    reasoning: buildDecisionReasoning(
      elapsedMinutes,
      ladderStage,
      bypassedFastPath,
      debitStatus,
      intent,
      riskBreakdown,
      action,
      borderline
    ),
  };
}
