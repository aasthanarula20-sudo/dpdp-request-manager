export const ADMIN_COOKIE_NAME = "admin_session";

/**
 * Derives the expected session cookie value from ADMIN_PASSWORD via SHA-256,
 * so the plaintext password is never stored client-side. This is a basic
 * MVP gate, not full RBAC — a single shared password by design.
 */
export async function getExpectedSessionValue(): Promise<string | null> {
  const password = process.env.ADMIN_PASSWORD;
  if (!password) return null;

  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
