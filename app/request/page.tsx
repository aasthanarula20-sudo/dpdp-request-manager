"use client";

import { useState } from "react";
import Link from "next/link";
import { CheckCircle2, ChevronLeft } from "lucide-react";
import { REQUEST_TYPES, type RequestType } from "@/lib/types";

type Step = "type" | "details" | "review" | "done";

interface FormState {
  requestType: RequestType | null;
  name: string;
  email: string;
  phone: string;
  details: string;
  correctionChanges: string;
  nomineeName: string;
  nomineeContact: string;
}

const initialState: FormState = {
  requestType: null,
  name: "",
  email: "",
  phone: "",
  details: "",
  correctionChanges: "",
  nomineeName: "",
  nomineeContact: "",
};

export default function RequestPage() {
  const [step, setStep] = useState<Step>("type");
  const [form, setForm] = useState<FormState>(initialState);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ requestId: string; slaDeadline: string } | null>(null);

  const selectedType = REQUEST_TYPES.find((t) => t.value === form.requestType);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit() {
    if (!form.requestType) return;
    setSubmitting(true);
    setError(null);

    let requestedFieldChanges: Record<string, unknown> | undefined;
    let details = form.details || undefined;

    if (form.requestType === "correction") {
      requestedFieldChanges = { description: form.correctionChanges };
    }
    if (form.requestType === "nomination") {
      requestedFieldChanges = {
        nomineeName: form.nomineeName,
        nomineeContactInfo: form.nomineeContact,
      };
      details = `Nominee: ${form.nomineeName} — Contact: ${form.nomineeContact}${
        form.details ? ` — ${form.details}` : ""
      }`;
    }

    try {
      const res = await fetch("/api/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestType: form.requestType,
          name: form.name || undefined,
          email: form.email,
          phone: form.phone || undefined,
          details,
          requestedFieldChanges,
          submittedVia: "self_service",
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Something went wrong submitting your request.");
      }

      const data = await res.json();
      setResult({ requestId: data.requestId, slaDeadline: data.slaDeadline });
      setStep("done");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="flex-1 bg-slate-50 px-6 py-16">
      <div className="max-w-2xl mx-auto">
        {step !== "done" && (
          <div className="mb-8 flex items-center gap-2 text-sm text-slate-500">
            <StepDot active={step === "type"} done={step !== "type"} label="1" />
            <div className="h-px w-8 bg-slate-300" />
            <StepDot active={step === "details"} done={step === "review"} label="2" />
            <div className="h-px w-8 bg-slate-300" />
            <StepDot active={step === "review"} done={false} label="3" />
          </div>
        )}

        <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-8">
          {step === "type" && (
            <TypeStep
              selected={form.requestType}
              onSelect={(t) => update("requestType", t)}
              onNext={() => setStep("details")}
            />
          )}

          {step === "details" && selectedType && (
            <DetailsStep
              form={form}
              update={update}
              onBack={() => setStep("type")}
              onNext={() => setStep("review")}
            />
          )}

          {step === "review" && selectedType && (
            <ReviewStep
              form={form}
              selectedType={selectedType}
              submitting={submitting}
              error={error}
              onBack={() => setStep("details")}
              onSubmit={handleSubmit}
            />
          )}

          {step === "done" && result && (
            <DoneStep requestId={result.requestId} slaDeadline={result.slaDeadline} />
          )}
        </div>
      </div>
    </main>
  );
}

function StepDot({ active, done, label }: { active: boolean; done: boolean; label: string }) {
  return (
    <div
      className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium ${
        active
          ? "bg-slate-900 text-white"
          : done
          ? "bg-slate-300 text-slate-700"
          : "bg-slate-200 text-slate-400"
      }`}
    >
      {label}
    </div>
  );
}

function TypeStep({
  selected,
  onSelect,
  onNext,
}: {
  selected: RequestType | null;
  onSelect: (t: RequestType) => void;
  onNext: () => void;
}) {
  return (
    <div>
      <h2 className="text-xl font-semibold text-slate-900 mb-1">What would you like to do?</h2>
      <p className="text-sm text-slate-500 mb-6">Select the option that best matches your request.</p>
      <div className="grid gap-3">
        {REQUEST_TYPES.map((t) => (
          <button
            key={t.value}
            type="button"
            onClick={() => onSelect(t.value)}
            className={`text-left rounded-md border px-4 py-3 transition-colors ${
              selected === t.value
                ? "border-slate-900 bg-slate-50"
                : "border-slate-200 hover:border-slate-400"
            }`}
          >
            <div className="font-medium text-slate-900">{t.label}</div>
            <div className="text-sm text-slate-500">{t.description}</div>
          </button>
        ))}
      </div>
      <button
        type="button"
        disabled={!selected}
        onClick={onNext}
        className="mt-6 w-full rounded-md bg-slate-900 text-white py-2.5 font-medium disabled:opacity-40 hover:bg-slate-800 transition-colors"
      >
        Continue
      </button>
    </div>
  );
}

function DetailsStep({
  form,
  update,
  onBack,
  onNext,
}: {
  form: FormState;
  update: <K extends keyof FormState>(key: K, value: FormState[K]) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const canContinue =
    form.email.trim().length > 0 &&
    (form.requestType !== "correction" || form.correctionChanges.trim().length > 0) &&
    (form.requestType !== "nomination" ||
      (form.nomineeName.trim().length > 0 && form.nomineeContact.trim().length > 0));

  return (
    <div>
      <button
        type="button"
        onClick={onBack}
        className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 mb-4"
      >
        <ChevronLeft className="w-4 h-4" /> Back
      </button>
      <h2 className="text-xl font-semibold text-slate-900 mb-6">Your details</h2>

      <div className="grid gap-4">
        <Field label="Full name">
          <input
            type="text"
            value={form.name}
            onChange={(e) => update("name", e.target.value)}
            className="input"
          />
        </Field>
        <Field label="Email address" required>
          <input
            type="email"
            value={form.email}
            onChange={(e) => update("email", e.target.value)}
            className="input"
            required
          />
        </Field>
        <Field label="Phone number">
          <input
            type="tel"
            value={form.phone}
            onChange={(e) => update("phone", e.target.value)}
            className="input"
          />
        </Field>

        {form.requestType === "correction" && (
          <Field label="What would you like corrected?" required>
            <textarea
              value={form.correctionChanges}
              onChange={(e) => update("correctionChanges", e.target.value)}
              className="input min-h-24"
              placeholder="Describe the fields and the correct values, e.g. 'My city should be Pune, not Mumbai.'"
            />
          </Field>
        )}

        {form.requestType === "nomination" && (
          <>
            <Field label="Nominee full name" required>
              <input
                type="text"
                value={form.nomineeName}
                onChange={(e) => update("nomineeName", e.target.value)}
                className="input"
              />
            </Field>
            <Field label="Nominee contact info" required>
              <input
                type="text"
                value={form.nomineeContact}
                onChange={(e) => update("nomineeContact", e.target.value)}
                className="input"
                placeholder="Email or phone"
              />
            </Field>
          </>
        )}

        {(form.requestType === "grievance" || form.requestType === "erasure") && (
          <Field label="Additional details (optional)">
            <textarea
              value={form.details}
              onChange={(e) => update("details", e.target.value)}
              className="input min-h-24"
            />
          </Field>
        )}
      </div>

      <button
        type="button"
        disabled={!canContinue}
        onClick={onNext}
        className="mt-6 w-full rounded-md bg-slate-900 text-white py-2.5 font-medium disabled:opacity-40 hover:bg-slate-800 transition-colors"
      >
        Continue to review
      </button>
    </div>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="block text-sm font-medium text-slate-700 mb-1">
        {label} {required && <span className="text-slate-400">*</span>}
      </span>
      {children}
    </label>
  );
}

function ReviewStep({
  form,
  selectedType,
  submitting,
  error,
  onBack,
  onSubmit,
}: {
  form: FormState;
  selectedType: { value: RequestType; label: string; description: string };
  submitting: boolean;
  error: string | null;
  onBack: () => void;
  onSubmit: () => void;
}) {
  return (
    <div>
      <button
        type="button"
        onClick={onBack}
        className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 mb-4"
      >
        <ChevronLeft className="w-4 h-4" /> Back
      </button>
      <h2 className="text-xl font-semibold text-slate-900 mb-6">Review your request</h2>

      <dl className="grid gap-3 text-sm mb-6">
        <ReviewRow label="Request type" value={selectedType.label} />
        <ReviewRow label="Name" value={form.name || "—"} />
        <ReviewRow label="Email" value={form.email} />
        <ReviewRow label="Phone" value={form.phone || "—"} />
        {form.requestType === "correction" && (
          <ReviewRow label="Requested change" value={form.correctionChanges} />
        )}
        {form.requestType === "nomination" && (
          <ReviewRow label="Nominee" value={`${form.nomineeName} (${form.nomineeContact})`} />
        )}
        {form.details && <ReviewRow label="Details" value={form.details} />}
      </dl>

      {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

      <button
        type="button"
        disabled={submitting}
        onClick={onSubmit}
        className="w-full rounded-md bg-slate-900 text-white py-2.5 font-medium disabled:opacity-40 hover:bg-slate-800 transition-colors"
      >
        {submitting ? "Submitting…" : "Submit request"}
      </button>
    </div>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 border-b border-slate-100 pb-2">
      <dt className="text-slate-500">{label}</dt>
      <dd className="text-slate-900 text-right">{value}</dd>
    </div>
  );
}

function DoneStep({ requestId, slaDeadline }: { requestId: string; slaDeadline: string }) {
  const deadline = new Date(slaDeadline).toLocaleDateString("en-IN", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="text-center py-4">
      <div className="flex justify-center mb-4">
        <CheckCircle2 className="w-10 h-10 text-emerald-600" />
      </div>
      <h2 className="text-xl font-semibold text-slate-900 mb-2">Request submitted</h2>
      <p className="text-slate-600 mb-6">
        We&apos;ve received your request and will respond within the statutory timeline.
      </p>
      <div className="bg-slate-50 rounded-md border border-slate-200 p-4 text-left text-sm mb-6">
        <div className="flex justify-between mb-1">
          <span className="text-slate-500">Reference ID</span>
          <span className="font-mono text-slate-900">{requestId}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-500">Response due by</span>
          <span className="text-slate-900">{deadline}</span>
        </div>
      </div>
      <Link href="/" className="text-sm text-slate-500 hover:text-slate-700">
        Return to home
      </Link>
    </div>
  );
}
