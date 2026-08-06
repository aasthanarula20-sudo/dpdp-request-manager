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
 * TODO: no real provider wired up yet (Resend for email, Twilio for SMS).
 * Logs the code so the flow is testable end-to-end before that decision is made.
 */
async function sendOtp(target: OtpTarget, code: string): Promise<void> {
  console.log(`[OTP] code ${code} for contact on file: ${target.email}${target.phone ? ` / ${target.phone}` : ""}`);
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
