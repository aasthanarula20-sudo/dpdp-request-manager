import Link from "next/link";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex-1 flex flex-col">
      <header className="border-b border-slate-200 bg-white">
        <div className="max-w-6xl mx-auto px-6 py-3 flex items-center gap-6">
          <span className="font-semibold text-slate-900">DPDP Admin</span>
          <nav className="flex gap-4 text-sm">
            <Link href="/admin/dashboard" className="text-slate-600 hover:text-slate-900">
              Dashboard
            </Link>
            <Link href="/admin/quick-entry" className="text-slate-600 hover:text-slate-900">
              Quick entry
            </Link>
            <Link href="/admin/payment-ambiguity" className="text-slate-600 hover:text-slate-900">
              Payment ambiguity
            </Link>
          </nav>
        </div>
      </header>
      {children}
    </div>
  );
}
