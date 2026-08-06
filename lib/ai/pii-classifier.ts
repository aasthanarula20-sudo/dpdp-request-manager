import { callOpenRouter } from "./config";

export interface PiiEntity {
  type: string;
  text: string;
}

export interface PiiClassification {
  entities: PiiEntity[];
  summary: string;
}

const FALLBACK: PiiClassification = {
  entities: [],
  summary: "unavailable — review manually",
};

const SYSTEM_PROMPT = `You are a PII classification assistant for a DPDP (India's Data Protection Act) request pipeline.
Given free text from a data-subject request, find every specific mention of personal data and extract it.
Respond with ONLY a JSON object: {"entities": [{"type": "<category, e.g. 'financial', 'health', 'location', 'government ID', 'biometric', 'contact info'>", "text": "<the EXACT substring from the input that contains this PII, verbatim, unmodified>"}], "summary": "one-sentence plain-language summary of what personal data appears in the text"}.
"text" must be copied character-for-character from the input — it will be used to locate and redact that exact phrase later, so paraphrasing or fixing typos breaks that.
This is advisory input for a human reviewer — never authoritative. If no free text is meaningfully present, return {"entities": [], "summary": "no free text provided"}.`;

/**
 * Fires when free text is present on any request. Advisory only — a human
 * reviews detected_pii before anything happens. Fails toward caution: any
 * error returns the fixed fallback rather than crashing the request.
 *
 * entities[].text is the exact source substring (not a paraphrase) so the
 * admin can redact that specific mention with a single click — see
 * app/api/requests/[id]/redact-pii/route.ts.
 */
export async function classifyPii(freeText: string): Promise<PiiClassification> {
  if (!freeText || freeText.trim().length === 0) {
    return { entities: [], summary: "no free text provided" };
  }

  try {
    const model = process.env.OPENROUTER_MODEL_PII;
    if (!model) throw new Error("OPENROUTER_MODEL_PII is not set");

    const result = await callOpenRouter<PiiClassification>({
      model,
      systemPrompt: SYSTEM_PROMPT,
      userPrompt: freeText,
    });

    if (
      !Array.isArray(result.entities) ||
      typeof result.summary !== "string" ||
      result.entities.some((e) => typeof e.type !== "string" || typeof e.text !== "string")
    ) {
      throw new Error("Malformed PII classification response");
    }

    // Entities the model hallucinated (not actually in the source text)
    // can't be located for redaction later — drop them rather than keep a
    // tag whose "Erase" button would silently do nothing.
    const grounded = result.entities.filter((e) => freeText.includes(e.text));

    return { entities: grounded, summary: result.summary };
  } catch {
    return FALLBACK;
  }
}
