"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import type { DataRequestRow } from "@/lib/types";

interface Contact {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  city: string | null;
  legal_basis: string;
  consent_marketing: boolean;
  is_anonymized: boolean;
}

export default function RequestDetail({
  request,
  contact,
}: {
  request: DataRequestRow;
  contact: Contact | null;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState(request.draft_response ?? "");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [showRejectBox, setShowRejectBox] = useState(false);

  const isFinal = request.status === "resolved" || request.status === "rejected";

  async function handleDecision(decision: "approve" | "reject") {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/requests/${request.id}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          decision,
          performedBy: "admin",
          rejectReason: decision === "reject" ? rejectReason || undefined : undefined,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Action failed");
      setMessage(`Done: ${body.status}${body.reason ? ` — ${body.reason}` : ""}`);
      router.refresh();
    } catch (err) {
      setMessage(`Error: ${(err as Error).message}`);
    } finally {
      setBusy(false);
      setShowRejectBox(false);
    }
  }

  async function saveDraft() {
    setBusy(true);
    try {
      await fetch(`/api/requests/${request.id}/draft`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ draftResponse: draft }),
      });
      setMessage("Draft saved.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex-1 bg-slate-50 px-6 py-10">
      <div className="max-w-3xl mx-auto">
        <Link href="/admin/dashboard" className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 mb-6">
          <ChevronLeft className="w-4 h-4" /> Back to dashboard
        </Link>

        <div className="bg-white border border-slate-200 rounded-lg shadow-sm p-6 mb-6">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h1 className="text-xl font-semibold text-slate-900 capitalize">
                {request.request_type.replace("_", " ")}
              </h1>
              <p className="text-sm text-slate-500">{request.id}</p>
            </div>
            <span className="text-xs font-medium px-2 py-1 rounded-full bg-slate-100 text-slate-700 capitalize">
              {request.status}
            </span>
          </div>

          <dl className="grid grid-cols-2 gap-4 text-sm mb-4">
            <Item label="Requester name" value={request.requester_name ?? "—"} />
            <Item label="Requester email" value={request.requester_email} />
            <Item label="Requester phone" value={request.requester_phone ?? "—"} />
            <Item label="Submitted via" value={request.submitted_via} />
            <Item label="Category" value={request.category ?? "—"} />
            <Item label="Severity" value={request.severity ?? "—"} />
          </dl>

          {request.details && (
            <div className="mb-4">
              <p className="text-sm font-medium text-slate-700 mb-1">Details</p>
              <p className="text-sm text-slate-600 whitespace-pre-wrap bg-slate-50 rounded-md p-3">
                {request.details}
              </p>
            </div>
          )}

          <div>
            <p className="text-sm font-medium text-slate-700 mb-1">Detected PII (advisory)</p>
            {request.detected_pii ? (
              <div className="text-sm text-slate-600 bg-slate-50 rounded-md p-3">
                <p className="mb-1">{request.detected_pii.summary}</p>
                {request.detected_pii.entities.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {request.detected_pii.entities.map((e) => (
                      <span key={e} className="text-xs bg-slate-200 text-slate-700 px-2 py-0.5 rounded-full">
                        {e}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm text-slate-400">None detected / not applicable.</p>
            )}
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg shadow-sm p-6 mb-6">
          <h2 className="text-sm font-medium text-slate-700 mb-2">Matched CRM contact</h2>
          {contact ? (
            <dl className="grid grid-cols-2 gap-4 text-sm">
              <Item label="Name" value={contact.full_name} />
              <Item label="Email" value={contact.email} />
              <Item label="Phone" value={contact.phone ?? "—"} />
              <Item label="City" value={contact.city ?? "—"} />
              <Item label="Legal basis" value={contact.legal_basis} />
              <Item label="Consent (marketing)" value={contact.consent_marketing ? "Yes" : "No"} />
            </dl>
          ) : (
            <p className="text-sm text-slate-400">No match found in CRM.</p>
          )}
        </div>

        <div className="bg-white border border-slate-200 rounded-lg shadow-sm p-6 mb-6">
          <h2 className="text-sm font-medium text-slate-700 mb-2">Response draft (editable)</h2>
          <textarea
            className="input min-h-40 font-mono text-xs"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
          <button
            type="button"
            onClick={saveDraft}
            disabled={busy}
            className="mt-3 text-sm rounded-md border border-slate-300 px-3 py-1.5 hover:bg-slate-50 disabled:opacity-40"
          >
            Save draft
          </button>
        </div>

        {!isFinal && (
          <div className="bg-white border border-slate-200 rounded-lg shadow-sm p-6">
            <h2 className="text-sm font-medium text-slate-700 mb-3">Decision</h2>
            {message && <p className="text-sm text-slate-600 mb-3">{message}</p>}
            <div className="flex gap-3">
              <button
                type="button"
                disabled={busy}
                onClick={() => handleDecision("approve")}
                className="rounded-md bg-slate-900 text-white px-4 py-2 text-sm font-medium hover:bg-slate-800 disabled:opacity-40"
              >
                Approve
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => setShowRejectBox((v) => !v)}
                className="rounded-md border border-red-300 text-red-700 px-4 py-2 text-sm font-medium hover:bg-red-50 disabled:opacity-40"
              >
                Reject
              </button>
            </div>
            {showRejectBox && (
              <div className="mt-3">
                <textarea
                  className="input min-h-20"
                  placeholder="Reason for rejection"
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                />
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => handleDecision("reject")}
                  className="mt-2 rounded-md bg-red-600 text-white px-4 py-2 text-sm font-medium hover:bg-red-700 disabled:opacity-40"
                >
                  Confirm rejection
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}

function Item({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-slate-400">{label}</dt>
      <dd className="text-slate-900">{value}</dd>
    </div>
  );
}
