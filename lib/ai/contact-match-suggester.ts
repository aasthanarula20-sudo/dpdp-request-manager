import { callOpenRouter } from "./config";
import { getServiceClient } from "../supabase/server";

export interface ContactMatchSuggestion {
  contactId: string | null;
  reason: string | null;
}

const NO_SUGGESTION: ContactMatchSuggestion = { contactId: null, reason: null };

const SYSTEM_PROMPT = `You are an identity-matching assistant for a DPDP request pipeline.
A requester's submitted email/phone/name did not exactly match any known contact. You are given the submitted details and a list of known contacts (id, name, email, phone).
Only flag a candidate if it's very likely a typo or minor formatting difference of the SAME submitted value (e.g. "aastha.narula2O@gmail.com" vs "aastha.narula20@gmail.com", a transposed digit in a phone number, a name that's an obvious near-match). Do NOT flag based on similarity alone (e.g. common first names, similar-sounding surnames) — that is not evidence of the same person.
Respond with ONLY a JSON object: {"contactId": "<uuid of the likely match, or null>", "reason": "<one sentence explaining the specific typo/difference you found, or null>"}.
This is advisory only — a human admin decides whether to actually confirm the match. Be conservative: when unsure, return null.`;

/**
 * Fires only when matchContact() found no exact match. Never changes
 * matched_contact_id itself — stores a suggestion for an admin to review
 * and explicitly confirm via the confirm-match route, which re-triggers
 * real OTP verification against the suggested contact. Fails toward
 * caution: any error returns no suggestion rather than guessing.
 */
export async function suggestContactMatch(
  email: string,
  phone: string | null | undefined,
  name: string | null | undefined
): Promise<ContactMatchSuggestion> {
  try {
    const model = process.env.OPENROUTER_MODEL_PII;
    if (!model) throw new Error("OPENROUTER_MODEL_PII is not set");

    const supabase = getServiceClient();
    const { data: candidates, error } = await supabase
      .from("crm_contacts")
      .select("id, full_name, email, phone")
      .limit(50);
    if (error) throw error;
    if (!candidates || candidates.length === 0) return NO_SUGGESTION;

    const result = await callOpenRouter<ContactMatchSuggestion>({
      model,
      systemPrompt: SYSTEM_PROMPT,
      userPrompt: JSON.stringify({
        submitted: { email, phone: phone ?? null, name: name ?? null },
        candidates,
      }),
    });

    if (typeof result.contactId !== "string" && result.contactId !== null) {
      throw new Error("Malformed contact match suggestion");
    }
    // Only trust a suggestion that names a candidate actually in the list —
    // a hallucinated id would 404 when the admin tries to confirm it.
    if (result.contactId && !candidates.some((c) => c.id === result.contactId)) {
      return NO_SUGGESTION;
    }

    return { contactId: result.contactId, reason: result.reason ?? null };
  } catch {
    return NO_SUGGESTION;
  }
}
