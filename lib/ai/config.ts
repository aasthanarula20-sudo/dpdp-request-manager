const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

/**
 * Strips ```json fences (or bare ``` fences) that models sometimes wrap
 * JSON output in, then parses. Throws if the result still isn't valid JSON —
 * callers are expected to catch and fall back to their bounded-caution default.
 */
function stripFencesAndParse<T>(raw: string): T {
  const fenced = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
  return JSON.parse(fenced) as T;
}

interface CallOpenRouterParams {
  model: string;
  systemPrompt: string;
  userPrompt: string;
}

/**
 * Shared OpenRouter chat-completion wrapper. Every AI module in this app
 * calls through this function so error handling and JSON-fence stripping
 * stay in one place. Throws on any failure (missing key, network error,
 * bad response, invalid JSON) — callers must catch and apply their own
 * fail-toward-caution fallback. Never call this from client code.
 */
export async function callOpenRouter<T>({
  model,
  systemPrompt,
  userPrompt,
}: CallOpenRouterParams): Promise<T> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY is not set");
  }

  const response = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenRouter request failed: ${response.status} ${response.statusText}`);
  }

  const json = await response.json();
  const content = json?.choices?.[0]?.message?.content;
  if (typeof content !== "string" || content.length === 0) {
    throw new Error("OpenRouter response missing message content");
  }

  return stripFencesAndParse<T>(content);
}
