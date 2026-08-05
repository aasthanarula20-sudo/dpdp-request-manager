"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { REQUEST_TYPES, type RequestType } from "@/lib/types";

interface ParsedEmail {
  requestType: RequestType | null;
  name: string | null;
  email: string | null;
  phone: string | null;
  details: string | null;
}

export default function QuickEntryPage() {
  const router = useRouter();
  const [rawText, setRawText] = useState("");
  const [parsing, setParsing] = useState(false);
  const [parsed, setParsed] = useState<ParsedEmail | null>(null);
  const [parseFallback, setParseFallback] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleParse() {
    if (!rawText.trim()) return;
    setParsing(true);
    setError(null);
    try {
      const res = await fetch("/api/parse-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rawText }),
      });
      const body = await res.json();
      setParsed(body.parsed);
      setParseFallback(Boolean(body.isFallback));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setParsing(false);
    }
  }

  function updateParsed<K extends keyof ParsedEmail>(key: K, value: ParsedEmail[K]) {
    setParsed((p) => (p ? { ...p, [key]: value } : p));
  }

  async function handleSubmit() {
    if (!parsed || !parsed.requestType || !parsed.email) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestType: parsed.requestType,
          name: parsed.name || undefined,
          email: parsed.email,
          phone: parsed.phone || undefined,
          details: parsed.details || undefined,
          submittedVia: "admin_manual",
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to submit request");
      router.push(`/admin/requests/${body.requestId}`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="flex-1 bg-slate-50 px-6 py-10">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-2xl font-semibold text-slate-900 mb-6">Quick entry</h1>

        <div className="bg-white border border-slate-200 rounded-lg shadow-sm p-6 mb-6">
          <label className="block mb-3">
            <span className="block text-sm font-medium text-slate-700 mb-1">
              Paste raw email or call notes
            </span>
            <textarea
              className="input min-h-40"
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
              placeholder="Paste the requester's email text or your call notes here…"
            />
          </label>
          <button
            type="button"
            onClick={handleParse}
            disabled={parsing || !rawText.trim()}
            className="rounded-md bg-slate-900 text-white px-4 py-2 text-sm font-medium hover:bg-slate-800 disabled:opacity-40"
          >
            {parsing ? "Parsing…" : "Parse with AI"}
          </button>
        </div>

        {parsed && (
          <div className="bg-white border border-slate-200 rounded-lg shadow-sm p-6">
            {parseFallback && (
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2 mb-4">
                AI parsing was unavailable — fields below are blank. Please fill them in manually.
              </p>
            )}
            <h2 className="text-sm font-medium text-slate-700 mb-3">Review and confirm</h2>
            <div className="grid gap-4">
              <label className="block">
                <span className="block text-sm font-medium text-slate-700 mb-1">Request type</span>
                <select
                  className="input"
                  value={parsed.requestType ?? ""}
                  onChange={(e) => updateParsed("requestType", (e.target.value || null) as RequestType | null)}
                >
                  <option value="">Select…</option>
                  {REQUEST_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="block text-sm font-medium text-slate-700 mb-1">Name</span>
                <input
                  className="input"
                  value={parsed.name ?? ""}
                  onChange={(e) => updateParsed("name", e.target.value)}
                />
              </label>
              <label className="block">
                <span className="block text-sm font-medium text-slate-700 mb-1">Email</span>
                <input
                  className="input"
                  value={parsed.email ?? ""}
                  onChange={(e) => updateParsed("email", e.target.value)}
                />
              </label>
              <label className="block">
                <span className="block text-sm font-medium text-slate-700 mb-1">Phone</span>
                <input
                  className="input"
                  value={parsed.phone ?? ""}
                  onChange={(e) => updateParsed("phone", e.target.value)}
                />
              </label>
              <label className="block">
                <span className="block text-sm font-medium text-slate-700 mb-1">Details</span>
                <textarea
                  className="input min-h-24"
                  value={parsed.details ?? ""}
                  onChange={(e) => updateParsed("details", e.target.value)}
                />
              </label>
            </div>

            {error && <p className="text-sm text-red-600 mt-4">{error}</p>}

            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting || !parsed.requestType || !parsed.email}
              className="mt-5 w-full rounded-md bg-slate-900 text-white py-2.5 font-medium disabled:opacity-40 hover:bg-slate-800 transition-colors"
            >
              {submitting ? "Submitting…" : "Submit request"}
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
