"use client";

import { useState } from "react";
import Link from "next/link";
import { CheckCircle2, ChevronLeft } from "lucide-react";
import { REQUEST_TYPES, type RequestStatus, type RequestType } from "@/lib/types";

type Step = "type" | "details" | "review" | "otp" | "correctionFields" | "done";

interface FormState {
  requestType: RequestType | null;
  name: string;
  email: string;
  phone: string;
  details: string;
  nomineeName: string;
  nomineeContact: string;
}

interface CurrentFields {
  full_name: string;
  email: string;
  phone: string | null;
  city: string | null;
}

const initialState: FormState = {
  requestType: null,
  name: "",
  email: "",
  phone: "",
  details: "",
  nomineeName: "",
  nomineeContact: "",
};

const CORRECTABLE_FIELD_LABELS: Record<keyof CurrentFields, string> = {
  full_name: "Full name",
  email: "Email",
  phone: "Phone",
  city: "City",
};

export default function RequestPage() {
  const [step, setStep] = useState<Step>("type");
  const [form, setForm] = useState<FormState>(initialState);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [requestId, setRequestId] = useState<string | null>(null);
  const [slaDeadline, setSlaDeadline] = useState<string | null>(null);
  const [matched, setMatched] = useState(false);
  const [finalStatus, setFinalStatus] = useState<RequestStatus | null>(null);
  const [noMatchReason, setNoMatchReason] = useState<string | null>(null);
  const [currentFields, setCurrentFields] = useState<CurrentFields | null>(null);

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

      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Something went wrong submitting your request.");

      setRequestId(data.requestId);
      setSlaDeadline(data.slaDeadline);
      setMatched(data.matchedContactId !== null);
      setNoMatchReason(data.reason ?? null);

      if (data.otpRequired) {
        setStep("otp");
      } else {
        setFinalStatus(data.status);
        setStep("done");
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  function handleOtpVerified(fields: CurrentFields | null) {
    if (form.requestType === "correction" && fields) {
      setCurrentFields(fields);
      setStep("correctionFields");
    } else {
      setFinalStatus("verifying");
      setStep("done");
    }
  }

  return (
    <main className="flex-1 bg-slate-50 px-6 py-16">
      <div className="max-w-2xl mx-auto">
        {step !== "done" && (
          <div className="mb-8 flex items-center gap-2 text-sm text-slate-500">
            <StepDot active={step === "type"} done={step !== "type"} label="1" />
            <div className="h-px w-8 bg-slate-300" />
            <StepDot active={step === "details"} done={step === "review" || step === "otp" || step === "correctionFields"} label="2" />
            <div className="h-px w-8 bg-slate-300" />
            <StepDot active={step === "review"} done={step === "otp" || step === "correctionFields"} label="3" />
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

          {step === "otp" && requestId && (
            <OtpStep requestId={requestId} onVerified={handleOtpVerified} />
          )}

          {step === "correctionFields" && requestId && currentFields && (
            <CorrectionFieldsStep
              requestId={requestId}
              currentFields={currentFields}
              onDone={() => {
                setFinalStatus("verifying");
                setStep("done");
              }}
            />
          )}

          {step === "done" && requestId && slaDeadline && finalStatus && form.requestType && (
            <DoneStep
              requestId={requestId}
              slaDeadline={slaDeadline}
              status={finalStatus}
              matched={matched}
              reason={noMatchReason}
              requestType={form.requestType}
            />
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
          <p className="text-sm text-slate-500 bg-slate-50 border border-slate-200 rounded-md p-3">
            After we verify your identity, you&apos;ll see your current on-file details and can
            pick exactly which fields to correct.
          </p>
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

function OtpStep({
  requestId,
  onVerified,
}: {
  requestId: string;
  onVerified: (fields: CurrentFields | null) => void;
}) {
  const [code, setCode] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleVerify() {
    setVerifying(true);
    setError(null);
    try {
      const res = await fetch(`/api/requests/${requestId}/verify-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const data = await res.json();

      if (!res.ok) {
        if (data.error === "incorrect") {
          setError(`Incorrect code. ${data.attemptsRemaining} attempt(s) remaining.`);
        } else if (data.error === "expired") {
          setError("This code has expired. Please submit a new request to get a fresh one.");
        } else if (data.error === "locked") {
          setError("Too many incorrect attempts. Please submit a new request.");
        } else {
          setError(data.error ?? "Verification failed.");
        }
        return;
      }

      onVerified(data.currentFields ?? null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setVerifying(false);
    }
  }

  return (
    <div>
      <h2 className="text-xl font-semibold text-slate-900 mb-2">Verify it&apos;s you</h2>
      <p className="text-sm text-slate-500 mb-6">
        We sent a 6-digit code to the contact information already on file for this record.
        Enter it below to continue. The code expires in 10 minutes.
      </p>

      <Field label="Verification code" required>
        <input
          type="text"
          inputMode="numeric"
          maxLength={6}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
          className="input tracking-[0.3em] text-center font-mono text-lg"
          placeholder="000000"
        />
      </Field>

      {error && <p className="text-sm text-red-600 mt-3">{error}</p>}

      <button
        type="button"
        disabled={verifying || code.length !== 6}
        onClick={handleVerify}
        className="mt-6 w-full rounded-md bg-slate-900 text-white py-2.5 font-medium disabled:opacity-40 hover:bg-slate-800 transition-colors"
      >
        {verifying ? "Verifying…" : "Verify"}
      </button>
    </div>
  );
}

function CorrectionFieldsStep({
  requestId,
  currentFields,
  onDone,
}: {
  requestId: string;
  currentFields: CurrentFields;
  onDone: () => void;
}) {
  const [checked, setChecked] = useState<Record<keyof CurrentFields, boolean>>({
    full_name: false,
    email: false,
    phone: false,
    city: false,
  });
  const [values, setValues] = useState<Record<keyof CurrentFields, string>>({
    full_name: "",
    email: "",
    phone: "",
    city: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const anyChecked = Object.values(checked).some(Boolean);

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);

    const changes: Record<string, string> = {};
    (Object.keys(checked) as (keyof CurrentFields)[]).forEach((key) => {
      if (checked[key] && values[key].trim().length > 0) {
        changes[key] = values[key].trim();
      }
    });

    if (Object.keys(changes).length === 0) {
      setError("Enter a new value for at least one field you've selected.");
      setSubmitting(false);
      return;
    }

    try {
      const res = await fetch(`/api/requests/${requestId}/correction-fields`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ changes }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to submit correction.");
      onDone();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <h2 className="text-xl font-semibold text-slate-900 mb-2">What needs correcting?</h2>
      <p className="text-sm text-slate-500 mb-6">
        Here&apos;s what we currently have on file. Select the field(s) that are wrong and enter
        the correct value.
      </p>

      <div className="grid gap-4">
        {(Object.keys(CORRECTABLE_FIELD_LABELS) as (keyof CurrentFields)[]).map((key) => (
          <div key={key} className="border border-slate-200 rounded-md p-3">
            <label className="flex items-center gap-2 mb-2">
              <input
                type="checkbox"
                checked={checked[key]}
                onChange={(e) => setChecked((c) => ({ ...c, [key]: e.target.checked }))}
              />
              <span className="font-medium text-slate-900">{CORRECTABLE_FIELD_LABELS[key]}</span>
              <span className="text-sm text-slate-500 ml-auto">
                Current: {currentFields[key] || "—"}
              </span>
            </label>
            {checked[key] && (
              <input
                type="text"
                value={values[key]}
                onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.value }))}
                className="input"
                placeholder={`Correct ${CORRECTABLE_FIELD_LABELS[key].toLowerCase()}`}
              />
            )}
          </div>
        ))}
      </div>

      {error && <p className="text-sm text-red-600 mt-4">{error}</p>}

      <button
        type="button"
        disabled={submitting || !anyChecked}
        onClick={handleSubmit}
        className="mt-6 w-full rounded-md bg-slate-900 text-white py-2.5 font-medium disabled:opacity-40 hover:bg-slate-800 transition-colors"
      >
        {submitting ? "Submitting…" : "Submit correction"}
      </button>
    </div>
  );
}

const NEXT_STEPS: Record<RequestType, string> = {
  access:
    "Your request goes to our team to compile the personal data we hold about you. This is a read-only, low-risk request.",
  correction:
    "Our team will verify the change you selected against your record and apply it manually.",
  erasure:
    "We'll check whether your data is subject to a legal or contractual retention requirement. If not, it will be permanently deleted once approved.",
  consent_withdrawal:
    "We'll turn off marketing communications tied to your record. This is low-risk and reversible if you opt back in later.",
  grievance:
    "This goes straight to a human reviewer — grievances are never auto-resolved, and we may reach out for more information.",
  nomination:
    "Your nominee's details will be recorded against your account for future reference.",
};

function DoneStep({
  requestId,
  slaDeadline,
  status,
  matched,
  reason,
  requestType,
}: {
  requestId: string;
  slaDeadline: string;
  status: RequestStatus;
  matched: boolean;
  reason: string | null;
  requestType: RequestType;
}) {
  const deadline = new Date(slaDeadline).toLocaleDateString("en-IN", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const typeLabel = REQUEST_TYPES.find((t) => t.value === requestType)?.label ?? requestType;

  const heading =
    status === "resolved" ? "Request resolved" : status === "rejected" ? "Request closed" : "Request submitted";

  const intro =
    status === "verifying"
      ? `We've received your ${typeLabel.toLowerCase()} request and will respond within the statutory timeline.`
      : reason ?? "Your request has been processed.";

  return (
    <div className="text-center py-4">
      <div className="flex justify-center mb-4">
        <CheckCircle2 className="w-10 h-10 text-emerald-600" />
      </div>
      <h2 className="text-xl font-semibold text-slate-900 mb-2">{heading}</h2>
      <p className="text-slate-600 mb-6">{intro}</p>

      <div className="bg-slate-50 rounded-md border border-slate-200 p-4 text-left text-sm mb-4">
        <div className="flex justify-between mb-1">
          <span className="text-slate-500">Reference ID</span>
          <span className="font-mono text-slate-900">{requestId}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-500">Response due by</span>
          <span className="text-slate-900">{deadline}</span>
        </div>
      </div>

      {status === "verifying" && (
        <div className="bg-blue-50 border border-blue-100 rounded-md p-4 text-left text-sm mb-4">
          <div className="font-medium text-blue-900 mb-1">What happens next</div>
          <p className="text-blue-800">{NEXT_STEPS[requestType]}</p>
        </div>
      )}

      {status === "verifying" && !matched && (
        <div className="bg-amber-50 border border-amber-200 rounded-md p-4 text-left text-sm mb-6">
          <div className="font-medium text-amber-900 mb-1">Couldn&apos;t find your record</div>
          <p className="text-amber-800">
            We didn&apos;t find an existing record matching the email or phone number you
            provided. Our team will review this manually — quote your reference ID above if you
            contact support.
          </p>
        </div>
      )}

      <Link href="/" className="text-sm text-slate-500 hover:text-slate-700">
        Return to home
      </Link>
    </div>
  );
}
