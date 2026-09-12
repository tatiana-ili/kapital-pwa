import type { SupabaseClient } from '@supabase/supabase-js';
import {
  bankNames,
  type BankCode,
  type FinanceAccount,
  type FinanceTransaction,
} from '@/lib/finance-data';

const transactionColumns =
  'id,bank,account_id,transaction_date,posted_date,amount,currency,merchant,description,category,transaction_type,is_transfer,transfer_group_id,is_recurring,source_hash,source_file,note,excluded_from_analytics';

type AccountRow = {
  id: string;
  bank: BankCode;
  name: string;
  currency: string;
  current_balance: number | string;
};

type TransactionRow = {
  id: string;
  bank: BankCode;
  account_id: string;
  transaction_date: string;
  posted_date: string | null;
  amount: number | string;
  currency: string;
  merchant: string;
  description: string;
  category: string;
  transaction_type: FinanceTransaction['transactionType'];
  is_transfer: boolean;
  transfer_group_id: string | null;
  is_recurring: boolean;
  source_hash: string;
  source_file: string;
  note: string | null;
  excluded_from_analytics: boolean;
};

export type EditableTransactionFields = Pick<
  FinanceTransaction,
  'category' | 'isTransfer' | 'transactionType' | 'excludedFromAnalytics'
>;

function mapAccount(row: AccountRow): FinanceAccount {
  return {
    id: row.id,
    bank: bankNames[row.bank],
    name: row.name,
    currentBalance: Number(row.current_balance),
    currency: (row.currency || 'RUB') as 'RUB',
  };
}

function mapTransaction(row: TransactionRow): FinanceTransaction {
  return {
    id: row.id,
    date: row.transaction_date,
    postedDate: row.posted_date || undefined,
    merchant: row.merchant,
    description: row.description,
    category: row.category,
    bank: bankNames[row.bank],
    accountId: row.account_id,
    amount: Number(row.amount),
    currency: (row.currency || 'RUB') as 'RUB',
    transactionType: row.transaction_type,
    isTransfer: row.is_transfer,
    transferGroupId: row.transfer_group_id || undefined,
    isRecurring: row.is_recurring,
    sourceHash: row.source_hash,
    sourceFile: row.source_file,
    note: row.note || undefined,
    excludedFromAnalytics: row.excluded_from_analytics,
  };
}

export async function loadFinanceData(client: SupabaseClient) {
  const [accountsResult, transactionsResult] = await Promise.all([
    client
      .from('accounts')
      .select('id,bank,name,currency,current_balance')
      .eq('is_active', true)
      .order('created_at', { ascending: true }),
    client
      .from('transactions')
      .select(transactionColumns)
      .order('transaction_date', { ascending: false })
      .limit(500),
  ]);

  if (accountsResult.error) throw accountsResult.error;
  if (transactionsResult.error) throw transactionsResult.error;

  return {
    accounts: ((accountsResult.data ?? []) as AccountRow[]).map(mapAccount),
    transactions: ((transactionsResult.data ?? []) as TransactionRow[]).map(
      mapTransaction,
    ),
  };
}

export async function saveTransactionChanges(
  client: SupabaseClient,
  id: string,
  changes: Partial<EditableTransactionFields>,
) {
  const payload: Record<string, unknown> = {};
  if (changes.category !== undefined) payload.category = changes.category;
  if (changes.isTransfer !== undefined)
    payload.is_transfer = changes.isTransfer;
  if (changes.transactionType !== undefined)
    payload.transaction_type = changes.transactionType;
  if (changes.excludedFromAnalytics !== undefined) {
    payload.excluded_from_analytics = changes.excludedFromAnalytics;
  }

  const { data, error } = await client
    .from('transactions')
    .update(payload)
    .eq('id', id)
    .select(transactionColumns)
    .single();

  if (error) throw error;
  return mapTransaction(data as TransactionRow);
}
