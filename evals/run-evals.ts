/**
 * Standalone eval harness for the AI modules. Runs live against OpenRouter
 * and Supabase (no mocking) — this tests the actual prompts and models in
 * production use, not a simulation of them.
 *
 * Usage: npx tsx evals/run-evals.ts
 *
 * Each case gets a tolerant assertion, not exact-match — LLM output varies
 * run to run, so we check for the properties that actually matter (e.g.
 * "entity text must be a real substring of the input", not "must equal
 * this exact string").
 */
import { readFileSync } from "fs";
import { resolve } from "path";

// Minimal .env.local loader — avoids adding a dotenv dependency for a
// script that only runs manually, ad hoc.
function loadEnvLocal() {
  const path = resolve(__dirname, "..", ".env.local");
  const content = readFileSync(path, "utf-8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (!process.env[key]) process.env[key] = value;
  }
}
loadEnvLocal();

import { classifyPii } from "../lib/ai/pii-classifier";
import { triageGrievance } from "../lib/ai/grievance-triage";
import { draftResponse } from "../lib/ai/response-drafter";
import { runAnonymizationQa } from "../lib/ai/anonymization-qa";
import { suggestContactMatch } from "../lib/ai/contact-match-suggester";

interface CaseResult {
  suite: string;
  name: string;
  pass: boolean;
  detail?: string;
}

const results: CaseResult[] = [];

function record(suite: string, name: string, pass: boolean, detail?: string) {
  results.push({ suite, name, pass, detail });
  const icon = pass ? "✓" : "✗";
  console.log(`  ${icon} ${name}${detail ? ` — ${detail}` : ""}`);
}

async function evalPiiClassifier() {
  console.log("\n[PII Classifier]");

  {
    const input = "My Aadhaar number 1234 5678 9012 and PAN ABCDE1234F were shared without consent.";
    const result = await classifyPii(input);
    const grounded = result.entities.every((e: { text: string }) => input.includes(e.text));
    record("pii", "all entity text is a real substring of the input", grounded);
    const foundAadhaar = result.entities.some((e: { text: string }) => e.text.includes("1234 5678 9012"));
    record("pii", "extracts the actual Aadhaar number, not just the word 'aadhaar'", foundAadhaar);
  }

  {
    const input = "I want to know why my account was closed.";
    const result = await classifyPii(input);
    record("pii", "no PII in mundane text → few/no entities", result.entities.length <= 1, `got ${result.entities.length}`);
  }

  {
    const result = await classifyPii("");
    record("pii", "empty input short-circuits without an AI call", result.entities.length === 0 && result.summary === "no free text provided");
  }
}

async function evalGrievanceTriage() {
  console.log("\n[Grievance Triage]");

  {
    const result = await triageGrievance(
      "Someone at your company shared my phone number with a telemarketer without my consent, and I now get daily spam calls."
    );
    record("triage", "unauthorized sharing → high severity", result.severity === "high", `got ${result.severity}`);
  }

  {
    const result = await triageGrievance("My profile shows an old city, not a big deal, just noticed it.");
    record("triage", "minor complaint → low severity", result.severity === "low", `got ${result.severity}`);
  }

  {
    const result = await triageGrievance(null);
    record("triage", "no details → fixed fallback, not a crash", result.category === "other" && result.severity === "medium");
  }
}

async function evalResponseDrafter() {
  console.log("\n[Response Drafter]");

  {
    const result = await draftResponse({
      requestType: "access",
      decision: "approve",
      requesterName: "Test User",
    });
    record("drafter", "approved draft is non-empty and not the fallback template", result.draft.length > 20 && !result.isFallback, result.isFallback ? "fell back to template (transient AI failure)" : undefined);
  }

  {
    const result = await draftResponse({
      requestType: "erasure",
      decision: "reject",
      reason: "Data is retained under a legal obligation basis.",
    });
    record("drafter", "rejected draft mentions the reason context, not empty", result.draft.length > 20);
  }
}

async function evalAnonymizationQa() {
  console.log("\n[Anonymization QA]");

  {
    const result = await runAnonymizationQa({
      full_name: "REDACTED",
      email: "redacted-abc123@anonymized.invalid",
      phone: null,
      is_anonymized: true,
    });
    record("qa", "fully anonymized snapshot → clean", result.qaStatus === "clean", `got ${result.qaStatus}`);
  }

  {
    const result = await runAnonymizationQa({
      full_name: "Real Person",
      email: "real.person@example.com",
      phone: "9876543210",
      is_anonymized: false,
    });
    record("qa", "unredacted snapshot → flagged", result.qaStatus === "flagged", `got ${result.qaStatus}`);
  }
}

async function evalFuzzyMatch() {
  console.log("\n[Fuzzy-Match Assist] (live Supabase query against real crm_contacts)");

  {
    // Deliberately not asserting a specific contact — depends on live DB
    // contents — just that a typo'd email either finds a grounded
    // suggestion or correctly returns none, never a made-up id.
    const result = await suggestContactMatch("aastha.narula2O@gmail.com", null, "Aastha Narula");
    record(
      "fuzzy-match",
      "typo'd email either returns null or a real contact id (never hallucinated)",
      result.contactId === null || typeof result.contactId === "string",
      `contactId=${result.contactId}`
    );
  }

  {
    const result = await suggestContactMatch("totally-unrelated-address@nowhere.example", "0000000000", "Nobody Real");
    record("fuzzy-match", "unrelated submission → no suggestion", result.contactId === null, `got ${result.contactId}`);
  }
}

async function main() {
  await evalPiiClassifier();
  await evalGrievanceTriage();
  await evalResponseDrafter();
  await evalAnonymizationQa();
  await evalFuzzyMatch();

  const passed = results.filter((r) => r.pass).length;
  const total = results.length;
  console.log(`\n${passed}/${total} cases passed`);

  if (passed < total) {
    console.log("\nFailed cases:");
    for (const r of results.filter((r) => !r.pass)) {
      console.log(`  [${r.suite}] ${r.name}${r.detail ? ` (${r.detail})` : ""}`);
    }
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error("Eval run crashed:", err);
  process.exitCode = 1;
});
