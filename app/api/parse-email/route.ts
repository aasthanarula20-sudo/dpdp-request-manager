import { NextRequest, NextResponse } from "next/server";
import { callOpenRouter } from "@/lib/ai/config";

interface ParsedEmail {
  requestType: string | null;
  name: string | null;
  email: string | null;
  phone: string | null;
  details: string | null;
}

const SYSTEM_PROMPT = `You are an intake assistant for a DPDP (India's Data Protection Act, 2023) admin desk.
An admin is pasting in raw text from an email or a call transcript describing a person's data-rights request.
Extract the following fields and respond with ONLY a JSON object:
{"requestType": "access" | "correction" | "erasure" | "consent_withdrawal" | "grievance" | "nomination" | null,
 "name": "<full name or null>",
 "email": "<email address or null>",
 "phone": "<phone number or null>",
 "details": "<a short summary of what they're asking for, or the raw complaint text>"}
If a field cannot be determined, use null. This is advisory only — the admin reviews and edits every field before submission.`;

export async function POST(req: NextRequest) {
  let body: { rawText?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const rawText = body.rawText;
  if (!rawText || typeof rawText !== "string" || rawText.trim().length === 0) {
    return NextResponse.json({ error: "rawText is required" }, { status: 400 });
  }

  try {
    const model = process.env.OPENROUTER_MODEL_DRAFTER;
    if (!model) throw new Error("OPENROUTER_MODEL_DRAFTER is not set");

    const parsed = await callOpenRouter<ParsedEmail>({
      model,
      systemPrompt: SYSTEM_PROMPT,
      userPrompt: rawText,
    });

    return NextResponse.json({ parsed, isFallback: false });
  } catch (err) {
    // Fail toward caution: return an empty, clearly-unparsed shell rather
    // than guessing — the admin fills the form in manually.
    return NextResponse.json({
      parsed: {
        requestType: null,
        name: null,
        email: null,
        phone: null,
        details: rawText,
      } satisfies ParsedEmail,
      isFallback: true,
      error: (err as Error).message,
    });
  }
}
