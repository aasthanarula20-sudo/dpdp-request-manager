export type RequestType =
  | "access"
  | "correction"
  | "erasure"
  | "consent_withdrawal"
  | "grievance"
  | "nomination";

export const REQUEST_TYPES: { value: RequestType; label: string; description: string }[] = [
  {
    value: "access",
    label: "Access my data",
    description: "Get a copy of the personal data we hold about you.",
  },
  {
    value: "correction",
    label: "Correct my data",
    description: "Fix inaccurate or outdated information in your record.",
  },
  {
    value: "erasure",
    label: "Erase my data",
    description: "Request deletion of your personal data, where legally possible.",
  },
  {
    value: "consent_withdrawal",
    label: "Withdraw consent",
    description: "Opt out of marketing communications and related processing.",
  },
  {
    value: "grievance",
    label: "Raise a grievance",
    description: "Report a concern about how your data has been handled.",
  },
  {
    value: "nomination",
    label: "Nominate someone",
    description: "Name a nominee who can exercise your rights if you become unable to.",
  },
];

export type RequestStatus = "received" | "verifying" | "in_progress" | "resolved" | "rejected";
export type SubmissionChannel = "self_service" | "admin_manual";
export type SeverityLevel = "low" | "medium" | "high";

export interface DataRequestRow {
  id: string;
  request_type: RequestType;
  requester_name: string | null;
  requester_email: string;
  requester_phone: string | null;
  details: string | null;
  matched_contact_id: string | null;
  status: RequestStatus;
  submitted_via: SubmissionChannel;
  submitted_at: string;
  sla_deadline: string;
  resolved_at: string | null;
  detected_pii: { entities: { type: string; text: string }[]; summary: string } | null;
  category: string | null;
  severity: SeverityLevel | null;
  draft_response: string | null;
  requested_field_changes: Record<string, unknown> | null;
  identity_verified_at: string | null;
  suggested_contact_id: string | null;
  suggested_match_reason: string | null;
}
