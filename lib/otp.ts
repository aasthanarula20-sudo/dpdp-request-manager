import crypto from "crypto";
import { getServiceClient } from "./supabase/server";

const OTP_EXPIRY_MINUTES = 10;
const MAX_ATTEMPTS = 5;

export interface OtpTarget {
  email: string;
  phone: string | null;
}

function hashOtp(code: string): string {
  return crypto.createHash("sha256").update(code).digest("hex");
}

function generateOtp(): string {
  return crypto.randomInt(0, 1_000_000).toString().padStart(6, "0");
}

/**
 * SMS delivery isn't wired up (no provider chosen) — OTPs go by email only.
 * In production, a missing RESEND_API_KEY is a hard failure — silently
 * falling back to console-log-only would look like a successful send
 * while no email ever went out. Local/dev environments still fall back,
 * since that's the documented no-provider testing path.
 */
async function sendOtp(target: OtpTarget, code: string): Promise<void> {
  console.log(`[OTP] code ${code} for contact on file: ${target.email}${target.phone ? ` / ${target.phone}` : ""}`);

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("RESEND_API_KEY is not set — cannot send verification email in production");
    }
    return;
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "DPDP Request Manager <onboarding@resend.dev>",
      to: [target.email],
      subject: "Your verification code",
      html: `<p>Your verification code is:</p><p style="font-size:24px;font-weight:bold;letter-spacing:4px;">${code}</p><p>This code expires in ${OTP_EXPIRY_MINUTES} minutes. If you didn't request this, you can ignore this email.</p>`,
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Resend email send failed (${res.status}): ${detail}`);
  }
}

/**
 * Generates and stores a fresh OTP for a request, and sends it to the
 * contact info already on file — never to whatever the requester just
 * typed into the form. That's the actual security property.
 */
export async function issueOtp(requestId: string, target: OtpTarget): Promise<void> {
  const code = generateOtp();
  const otpHash = hashOtp(code);
  const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000).toISOString();

  const supabase = getServiceClient();
  const { error } = await supabase
    .from("data_requests")
    .update({ otp_hash: otpHash, otp_expires_at: expiresAt, otp_attempts: 0 })
    .eq("id", requestId);
  if (error) throw error;

  await sendOtp(target, code);
}

export type VerifyOtpResult =
  | { ok: true }
  | {
      ok: false;
      reason: "not_pending" | "expired" | "locked" | "incorrect";
      attemptsRemaining?: number;
    };

/**
 * Verifies a submitted code against the stored hash. On success, marks
 * identity_verified_at and advances status from "received" to "verifying",
 * and clears the OTP fields so the code can't be replayed.
 */
export async function verifyOtp(requestId: string, code: string): Promise<VerifyOtpResult> {
  const supabase = getServiceClient();
  const { data: request, error } = await supabase
    .from("data_requests")
    .select("status, otp_hash, otp_expires_at, otp_attempts")
    .eq("id", requestId)
    .maybeSingle();

  if (error) throw error;
  if (!request) throw new Error("Request not found");

  if (request.status !== "received" || !request.otp_hash) {
    return { ok: false, reason: "not_pending" };
  }
  if (request.otp_attempts >= MAX_ATTEMPTS) {
    return { ok: false, reason: "locked" };
  }
  if (!request.otp_expires_at || new Date(request.otp_expires_at) < new Date()) {
    return { ok: false, reason: "expired" };
  }

  const providedHash = hashOtp(code.trim());
  if (providedHash !== request.otp_hash) {
    const attempts = request.otp_attempts + 1;
    await supabase.from("data_requests").update({ otp_attempts: attempts }).eq("id", requestId);
    return {
      ok: false,
      reason: "incorrect",
      attemptsRemaining: Math.max(0, MAX_ATTEMPTS - attempts),
    };
  }

  const { error: updateError } = await supabase
    .from("data_requests")
    .update({
      identity_verified_at: new Date().toISOString(),
      status: "verifying",
      otp_hash: null,
      otp_expires_at: null,
      otp_attempts: 0,
    })
    .eq("id", requestId);
  if (updateError) throw updateError;

  return { ok: true };
}
