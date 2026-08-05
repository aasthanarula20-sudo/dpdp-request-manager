import Link from "next/link";
import { ShieldCheck } from "lucide-react";

export default function Home() {
  return (
    <main className="flex-1 flex flex-col items-center justify-center px-6 py-24 bg-slate-50">
      <div className="max-w-xl w-full text-center">
        <div className="flex justify-center mb-6">
          <div className="rounded-full bg-slate-900 p-3">
            <ShieldCheck className="w-7 h-7 text-white" />
          </div>
        </div>
        <h1 className="text-3xl font-semibold text-slate-900 mb-3">
          Data Rights Request Manager
        </h1>
        <p className="text-slate-600 mb-10 leading-relaxed">
          Submit a request under India&apos;s Digital Personal Data Protection Act, 2023 —
          access, correct, or erase your personal data, withdraw consent, raise a
          grievance, or nominate someone to act on your behalf.
        </p>
        <Link
          href="/request"
          className="inline-flex items-center justify-center rounded-md bg-slate-900 px-6 py-3 text-white font-medium hover:bg-slate-800 transition-colors"
        >
          Submit a request
        </Link>
        <div className="mt-6">
          <Link href="/admin/login" className="text-sm text-slate-400 hover:text-slate-600">
            Admin sign in
          </Link>
        </div>
      </div>
    </main>
  );
}
