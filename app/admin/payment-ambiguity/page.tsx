import Link from "next/link";
import { listTransactions, type TransactionRecord } from "@/lib/payment-ambiguity/store";
import PaymentAmbiguityTable from "./payment-ambiguity-table";

export const dynamic = "force-dynamic";

export default async function PaymentAmbiguityPage() {
  let transactions: TransactionRecord[];
  let loadError: string | null = null;
  try {
    transactions = await listTransactions();
  } catch (err) {
    loadError = (err as Error).message;
    transactions = [];
  }

  return (
    <main className="flex-1 bg-slate-50 px-6 py-10">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-semibold text-slate-900">Payment ambiguity</h1>
          <Link
            href="/admin/payment-ambiguity/new"
            className="rounded-md bg-slate-900 text-white text-sm font-medium px-3 py-1.5 hover:bg-slate-800"
          >
            New transaction
          </Link>
        </div>
        {loadError && <p className="text-red-600 text-sm mb-4">Failed to load transactions: {loadError}</p>}
        <PaymentAmbiguityTable transactions={transactions} />
      </div>
    </main>
  );
}
