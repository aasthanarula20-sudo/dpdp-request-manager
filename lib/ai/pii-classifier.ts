import { callOpenRouter } from "./config";

export interface PiiClassification {
  entities: string[];
  summary: string;
}

const FALLBACK: PiiClassification = {
  entities: [],
  summary: "unavailable — review manually",
};

const SYSTEM_PROMPT = `You are a PII classification assistant for a DPDP (India's Data Protection Act) request pipeline.
Given free text from a data-subject request, identify categories of personal data mentioned (e.g. "financial", "health", "location", "government ID", "biometric", "contact info").
Respond with ONLY a JSON object of the form: {"entities": ["category1", "category2"], "summary": "one-sentence plain-language summary of what personal data appears in the text"}.
This is advisory input for a human reviewer — never authoritative. If no free text is meaningfully present, return {"entities": [], "summary": "no free text provided"}.`;

/**
 * Fires when free text is present on any request. Advisory only — a human
 * reviews detected_pii before anything happens. Fails toward caution: any
 * error returns the fixed fallback rather than crashing the request.
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

    if (!Array.isArray(result.entities) || typeof result.summary !== "string") {
      throw new Error("Malformed PII classification response");
    }

    return result;
  } catch {
    return FALLBACK;
  }
}
