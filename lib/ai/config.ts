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

const DEFAULT_RETRY_DELAY_MS = 800;
// Caps how long a single serverless request will block on a retry — a
// genuine 24s upstream rate-limit wait would risk hitting the platform's
// function timeout, so this trades "always succeed" for "stay responsive
// and let the caller's fallback handle the rest."
const MAX_RETRY_DELAY_MS = 5000;

class OpenRouterCallError extends Error {
  retryAfterMs?: number;
  constructor(message: string, retryAfterMs?: number) {
    super(message);
    this.retryAfterMs = retryAfterMs;
  }
}

function parseRetryAfterMs(response: Response, bodyText: string): number | undefined {
  const header = response.headers.get("retry-after");
  if (header) {
    const seconds = Number(header);
    if (!Number.isNaN(seconds)) return seconds * 1000;
  }
  try {
    const seconds = JSON.parse(bodyText)?.error?.metadata?.retry_after_seconds;
    if (typeof seconds === "number") return seconds * 1000;
  } catch {
    // Body wasn't JSON, or didn't have the field — no retry hint available.
  }
  return undefined;
}

async function callOnce<T>({ model, systemPrompt, userPrompt }: CallOpenRouterParams): Promise<T> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new OpenRouterCallError("OPENROUTER_API_KEY is not set");
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
    const bodyText = await response.text().catch(() => "");
    throw new OpenRouterCallError(
      `OpenRouter request failed: ${response.status} ${response.statusText}`,
      parseRetryAfterMs(response, bodyText)
    );
  }

  const json = await response.json();
  const content = json?.choices?.[0]?.message?.content;
  if (typeof content !== "string" || content.length === 0) {
    // Covers both a genuinely empty response and OpenRouter's occasional
    // quirk of returning an error object with HTTP 200 (e.g. free-tier
    // "at capacity" errors) — either way there's no content to parse.
    throw new OpenRouterCallError("OpenRouter response missing message content");
  }

  return stripFencesAndParse<T>(content);
}

/**
 * Shared OpenRouter chat-completion wrapper. Every AI module in this app
 * calls through this function so error handling and JSON-fence stripping
 * stay in one place. Throws on any failure (missing key, network error,
 * bad response, invalid JSON) — callers must catch and apply their own
 * fail-toward-caution fallback. Never call this from client code.
 *
 * Retries once. Honors OpenRouter's Retry-After hint on rate limits
 * (capped at MAX_RETRY_DELAY_MS), falling back to a short fixed delay for
 * other transient errors (e.g. "at capacity").
 */
export async function callOpenRouter<T>(params: CallOpenRouterParams): Promise<T> {
  try {
    return await callOnce<T>(params);
  } catch (err) {
    const retryAfterMs = err instanceof OpenRouterCallError ? err.retryAfterMs : undefined;
    const delay = Math.min(retryAfterMs ?? DEFAULT_RETRY_DELAY_MS, MAX_RETRY_DELAY_MS);
    await new Promise((resolve) => setTimeout(resolve, delay));
    return callOnce<T>(params);
  }
}
