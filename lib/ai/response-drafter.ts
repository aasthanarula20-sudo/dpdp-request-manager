import { callOpenRouter } from "./config";
import type { RequestType } from "../types";

export interface DraftedResponse {
  draft: string;
  isFallback: boolean;
}

const SYSTEM_PROMPT = `You are a response drafting assistant for a DPDP (India's Data Protection Act, 2023) request pipeline.
Given the outcome of a data-subject request, draft a short, plain-language response email to the requester (2-4 sentences). Be respectful, clear, and avoid legal jargon. Do not invent facts not given to you.
Respond with ONLY a JSON object: {"draft": "<the email body text>"}.
This is advisory input — an admin reviews and edits this before anything is sent.`;

function fallbackTemplate(
  requestType: RequestType,
  decision: "approve" | "reject",
  reason?: string
): string {
  if (decision === "reject") {
    return [
      "[FALLBACK TEMPLATE — AI drafting unavailable, please review and personalize]",
      "",
      `Thank you for your ${requestType.replace("_", " ")} request. After review, we are unable to fulfil it at this time.`,
      reason ? `Reason: ${reason}` : "",
      "",
      "If you have questions about this decision, please reply to this message.",
    ]
      .filter(Boolean)
      .join("\n");
  }

  return [
    "[FALLBACK TEMPLATE — AI drafting unavailable, please review and personalize]",
    "",
    `Thank you for your ${requestType.replace("_", " ")} request. We have processed it and completed the requested action.`,
    "",
    "If you have any questions, please reply to this message.",
  ].join("\n");
}

/**
 * Fires after every admin approve/reject decision (extended to cover
 * rejections too, closing a gap from an earlier version that only drafted
 * on approval). Fails toward caution: a visibly-marked fallback template
 * is used instead of crashing the action route.
 */
export async function draftResponse(params: {
  requestType: RequestType;
  decision: "approve" | "reject";
  reason?: string;
  requesterName?: string | null;
}): Promise<DraftedResponse> {
  const { requestType, decision, reason, requesterName } = params;

  try {
    const model = process.env.OPENROUTER_MODEL_DRAFTER;
    if (!model) throw new Error("OPENROUTER_MODEL_DRAFTER is not set");

    const userPrompt = JSON.stringify({
      requestType,
      decision,
      reason: reason ?? null,
      requesterName: requesterName ?? null,
    });

    const result = await callOpenRouter<{ draft: string }>({
      model,
      systemPrompt: SYSTEM_PROMPT,
      userPrompt,
    });

    if (typeof result.draft !== "string" || result.draft.trim().length === 0) {
      throw new Error("Malformed drafter response");
    }

    return { draft: result.draft, isFallback: false };
  } catch {
    return { draft: fallbackTemplate(requestType, decision, reason), isFallback: true };
  }
}
