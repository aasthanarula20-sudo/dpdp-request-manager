import { getServiceClient } from "@/lib/supabase/server";
import { decide } from "./resolver";
import type { DebitSignals, Decision, DeliveryStatus, Industry, PaymentMethod, Transaction } from "./types";

export interface TransactionRecord {
  id: string;
  transaction: Transaction;
  signals: DebitSignals;
  ambiguityDetectedAt: string;
  lastEvaluatedAt: string | null;
  decision: Decision;
  createdAt: string;
}

interface Row {
  id: string;
  order_value: number;
  delivery_status: DeliveryStatus;
  payment_method: PaymentMethod;
  industry: Industry;
  settlement_file: DebitSignals["settlementFile"];
  bank_status_api: DebitSignals["bankStatusApi"];
  gateway_webhook: DebitSignals["gatewayWebhook"];
  client_app_state: DebitSignals["clientAppState"];
  ambiguity_detected_at: string;
  last_evaluated_at: string | null;
  ladder_stage: Decision["ladderStage"];
  debit_status: Decision["debitStatus"];
  risk_score: number | null;
  risk_breakdown: Decision["riskBreakdown"];
  action: Decision["action"];
  borderline: boolean;
  reasoning: string;
  created_at: string;
}

function rowToRecord(row: Row): TransactionRecord {
  return {
    id: row.id,
    transaction: {
      orderValue: row.order_value,
      deliveryStatus: row.delivery_status,
      paymentMethod: row.payment_method,
      industry: row.industry,
    },
    signals: {
      settlementFile: row.settlement_file,
      bankStatusApi: row.bank_status_api,
      gatewayWebhook: row.gateway_webhook,
      clientAppState: row.client_app_state,
    },
    ambiguityDetectedAt: row.ambiguity_detected_at,
    lastEvaluatedAt: row.last_evaluated_at,
    decision: {
      action: row.action,
      ladderStage: row.ladder_stage,
      debitStatus: row.debit_status,
      riskScore: row.risk_score,
      riskBreakdown: row.risk_breakdown,
      borderline: row.borderline,
      reasoning: row.reasoning,
    },
    createdAt: row.created_at,
  };
}

function elapsedMinutesSince(isoTimestamp: string): number {
  return (Date.now() - new Date(isoTimestamp).getTime()) / 60_000;
}

export interface CreateTransactionInput {
  transaction: Transaction;
  signals?: Partial<DebitSignals>;
  /** Defaults to now. Pass a past timestamp to seed a transaction as already partway up the ladder. */
  ambiguityDetectedAt?: string;
}

const DEFAULT_SIGNALS: DebitSignals = {
  settlementFile: "not_reported",
  bankStatusApi: "not_reported",
  gatewayWebhook: "not_reported",
  clientAppState: "not_reported",
};

/** Creates a transaction and runs it through the decision layer once, immediately. */
export async function createTransaction(input: CreateTransactionInput): Promise<TransactionRecord> {
  const supabase = getServiceClient();
  const ambiguityDetectedAt = input.ambiguityDetectedAt ?? new Date().toISOString();
  const signals: DebitSignals = { ...DEFAULT_SIGNALS, ...input.signals };
  const decision = decide(input.transaction, signals, elapsedMinutesSince(ambiguityDetectedAt));

  const { data, error } = await supabase
    .from("payment_ambiguity_transactions")
    .insert({
      order_value: input.transaction.orderValue,
      delivery_status: input.transaction.deliveryStatus,
      payment_method: input.transaction.paymentMethod,
      industry: input.transaction.industry,
      settlement_file: signals.settlementFile,
      bank_status_api: signals.bankStatusApi,
      gateway_webhook: signals.gatewayWebhook,
      client_app_state: signals.clientAppState,
      ambiguity_detected_at: ambiguityDetectedAt,
      last_evaluated_at: new Date().toISOString(),
      ladder_stage: decision.ladderStage,
      debit_status: decision.debitStatus,
      risk_score: decision.riskScore,
      risk_breakdown: decision.riskBreakdown,
      action: decision.action,
      borderline: decision.borderline,
      reasoning: decision.reasoning,
    })
    .select()
    .single();

  if (error || !data) throw new Error(error?.message ?? "Failed to create transaction");
  return rowToRecord(data as Row);
}

/**
 * Re-runs the decision layer for a transaction using elapsed time computed
 * from `ambiguity_detected_at` up to now, and any signal updates supplied.
 * Persists the result. This is how a transaction moves up the ladder —
 * there is no background timer; re-evaluation is always caller-triggered.
 */
export async function evaluateTransaction(
  id: string,
  signalUpdates?: Partial<DebitSignals>
): Promise<TransactionRecord> {
  const supabase = getServiceClient();

  const { data: existing, error: fetchError } = await supabase
    .from("payment_ambiguity_transactions")
    .select("*")
    .eq("id", id)
    .single();

  if (fetchError || !existing) throw new Error(fetchError?.message ?? "Transaction not found");

  const row = existing as Row;
  const signals: DebitSignals = {
    settlementFile: signalUpdates?.settlementFile ?? row.settlement_file,
    bankStatusApi: signalUpdates?.bankStatusApi ?? row.bank_status_api,
    gatewayWebhook: signalUpdates?.gatewayWebhook ?? row.gateway_webhook,
    clientAppState: signalUpdates?.clientAppState ?? row.client_app_state,
  };
  const transaction: Transaction = {
    orderValue: row.order_value,
    deliveryStatus: row.delivery_status,
    paymentMethod: row.payment_method,
    industry: row.industry,
  };

  const decision = decide(transaction, signals, elapsedMinutesSince(row.ambiguity_detected_at));

  const { data, error } = await supabase
    .from("payment_ambiguity_transactions")
    .update({
      settlement_file: signals.settlementFile,
      bank_status_api: signals.bankStatusApi,
      gateway_webhook: signals.gatewayWebhook,
      client_app_state: signals.clientAppState,
      last_evaluated_at: new Date().toISOString(),
      ladder_stage: decision.ladderStage,
      debit_status: decision.debitStatus,
      risk_score: decision.riskScore,
      risk_breakdown: decision.riskBreakdown,
      action: decision.action,
      borderline: decision.borderline,
      reasoning: decision.reasoning,
    })
    .eq("id", id)
    .select()
    .single();

  if (error || !data) throw new Error(error?.message ?? "Failed to update transaction");
  return rowToRecord(data as Row);
}

export async function listTransactions(): Promise<TransactionRecord[]> {
  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from("payment_ambiguity_transactions")
    .select("*")
    .order("ambiguity_detected_at", { ascending: false });

  if (error) throw new Error(error.message);
  return (data as Row[]).map(rowToRecord);
}

export async function getTransaction(id: string): Promise<TransactionRecord> {
  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from("payment_ambiguity_transactions")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !data) throw new Error(error?.message ?? "Transaction not found");
  return rowToRecord(data as Row);
}
