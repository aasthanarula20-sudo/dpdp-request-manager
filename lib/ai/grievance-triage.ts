import { callOpenRouter } from "./config";

export interface GrievanceTriage {
  category: string;
  severity: "low" | "medium" | "high";
}

const FALLBACK: GrievanceTriage = { category: "other", severity: "medium" };

const SYSTEM_PROMPT = `You are a grievance triage assistant for a DPDP (India's Data Protection Act) request pipeline.
Given a grievance description, classify it. Respond with ONLY a JSON object: {"category": "<short category, e.g. 'unauthorized_sharing', 'marketing_spam', 'data_breach', 'inaccurate_data', 'other'>", "severity": "low" | "medium" | "high"}.
Severity guidance: "high" for suspected breaches, unauthorized third-party sharing, or financial/health data exposure; "medium" for consent violations or repeated unwanted contact; "low" for minor or unclear complaints.
This is advisory input for a human reviewer — never authoritative.`;

/**
 * Fires when request_type === 'grievance'. Advisory only — populates
 * category/severity before an admin ever sees the request, but a human
 * still handles the actual escalation. Fails toward caution: returns a
 * fixed medium-severity fallback rather than crashing or under-classifying.
 */
export async function triageGrievance(details: string | null | undefined): Promise<GrievanceTriage> {
  if (!details || details.trim().length === 0) {
    // Nothing to classify — asking the model to triage an empty complaint
    // just produces an arbitrary guess (observed: "other"/"low", not our
    // documented "other"/"medium" fallback), for no benefit over the fixed
    // default.
    return FALLBACK;
  }

  try {
    const model = process.env.OPENROUTER_MODEL_TRIAGE;
    if (!model) throw new Error("OPENROUTER_MODEL_TRIAGE is not set");

    const result = await callOpenRouter<GrievanceTriage>({
      model,
      systemPrompt: SYSTEM_PROMPT,
      userPrompt: details,
    });

    const validSeverities = ["low", "medium", "high"];
    if (typeof result.category !== "string" || !validSeverities.includes(result.severity)) {
      throw new Error("Malformed grievance triage response");
    }

    return result;
  } catch {
    return FALLBACK;
  }
}
