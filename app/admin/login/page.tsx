"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Lock } from "lucide-react";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const res = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Login failed");
      setSubmitting(false);
      return;
    }

    router.push(searchParams.get("next") || "/admin/dashboard");
    router.refresh();
  }

  return (
    <main className="flex-1 flex items-center justify-center bg-slate-50 px-6">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm bg-white border border-slate-200 rounded-lg shadow-sm p-8"
      >
        <div className="flex justify-center mb-4">
          <div className="rounded-full bg-slate-900 p-2.5">
            <Lock className="w-5 h-5 text-white" />
          </div>
        </div>
        <h1 className="text-lg font-semibold text-slate-900 text-center mb-6">Admin sign in</h1>
        <label className="block mb-4">
          <span className="block text-sm font-medium text-slate-700 mb-1">Password</span>
          <input
            type="password"
            className="input"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus
          />
        </label>
        {error && <p className="text-sm text-red-600 mb-4">{error}</p>}
        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-md bg-slate-900 text-white py-2.5 font-medium disabled:opacity-40 hover:bg-slate-800 transition-colors"
        >
          {submitting ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </main>
  );
}

export default function AdminLoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
