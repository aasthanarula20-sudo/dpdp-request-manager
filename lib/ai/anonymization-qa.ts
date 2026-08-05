import { callOpenRouter } from "./config";

export interface AnonymizationQaResult {
  qaStatus: "clean" | "flagged";
  residualPiiFound: string[];
}

const SYSTEM_PROMPT = `You are a QA assistant verifying that a data-anonymization or hard-delete action left no residual PII behind.
Given a snapshot of the contact record's state after the action, look for any remaining identifying fields.
Respond with ONLY a JSON object: {"qaStatus": "clean" | "flagged", "residualPiiFound": ["field1", "field2"]}.
Be conservative: if anything looks like it could still identify the person, mark "flagged".`;

/**
 * Fires after hard_delete/anonymize_fields actions. This is the one module
 * where the fail-toward-caution rule is absolute: a failed call MUST return
 * "flagged", never "clean" — a failure must never look indistinguishable
 * from a passed check.
 */
export async function runAnonymizationQa(
  postActionSnapshot: Record<string, unknown>
): Promise<AnonymizationQaResult> {
  try {
    const model = process.env.OPENROUTER_MODEL_QA;
    if (!model) throw new Error("OPENROUTER_MODEL_QA is not set");

    const result = await callOpenRouter<AnonymizationQaResult>({
      model,
      systemPrompt: SYSTEM_PROMPT,
      userPrompt: JSON.stringify(postActionSnapshot),
    });

    if (
      (result.qaStatus !== "clean" && result.qaStatus !== "flagged") ||
      !Array.isArray(result.residualPiiFound)
    ) {
      throw new Error("Malformed QA response");
    }

    return result;
  } catch {
    return {
      qaStatus: "flagged",
      residualPiiFound: ["qa_check_failed_review_manually"],
    };
  }
}
