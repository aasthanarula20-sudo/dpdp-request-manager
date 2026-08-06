import type { RequestType } from "./types";

/**
 * What happens when no crm_contacts match is found, per request type:
 * - "resolved": "no data exists for you" is itself a complete answer — auto-resolves.
 * - "blocked": nothing to act on — auto-rejects with a reason.
 * - "proceeds": continues regardless of match (grievance can still be investigated).
 */
export type NoMatchOutcome = "resolved" | "blocked" | "proceeds";

export interface RequestTypeConfig {
  requiresOtp: boolean;
  noMatchOutcome: NoMatchOutcome;
}

export const REQUEST_TYPE_CONFIG: Record<RequestType, RequestTypeConfig> = {
  access: { requiresOtp: true, noMatchOutcome: "resolved" },
  correction: { requiresOtp: true, noMatchOutcome: "blocked" },
  erasure: { requiresOtp: true, noMatchOutcome: "resolved" },
  consent_withdrawal: { requiresOtp: true, noMatchOutcome: "resolved" },
  grievance: { requiresOtp: false, noMatchOutcome: "proceeds" },
  nomination: { requiresOtp: true, noMatchOutcome: "blocked" },
};
