export interface SendEmailResult {
  sent: boolean;
  error?: string;
}

/**
 * Same Resend setup as lib/otp.ts (shared sender, no custom domain
 * verified yet). Best-effort by design: a failed notification email
 * should never block or reverse an admin's approve/reject decision —
 * callers log/report the failure but keep going.
 */
export async function sendEmail(to: string, subject: string, html: string): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return { sent: false, error: "RESEND_API_KEY is not set" };
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "DPDP Request Manager <onboarding@resend.dev>",
      to: [to],
      subject,
      html,
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    return { sent: false, error: `Resend send failed (${res.status}): ${detail}` };
  }

  return { sent: true };
}
