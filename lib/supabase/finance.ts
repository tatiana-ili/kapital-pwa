import type { SupabaseClient } from '@supabase/supabase-js';
import {
  bankNames,
  type BankCode,
  type FinanceAccount,
  type BalanceSnapshot,
  type FinanceTransaction,
} from '../finance-data.ts';

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

type SnapshotRow = {
  account_id: string;
  date: string;
  balance: number | string;
};

export type EditableTransactionFields = Pick<
  FinanceTransaction,
  | 'merchant'
  | 'note'
  | 'category'
  | 'isTransfer'
  | 'transactionType'
  | 'excludedFromAnalytics'
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

async function loadAllTransactions(client: SupabaseClient) {
  const rows: TransactionRow[] = [];
  const pageSize = 500;
  for (let offset = 0; ; offset += pageSize) {
    const result = await client
      .from('transactions')
      .select(transactionColumns)
      .order('transaction_date', { ascending: false })
      .order('id', { ascending: false })
      .range(offset, offset + pageSize - 1);
    if (result.error) throw result.error;
    const page = (result.data ?? []) as TransactionRow[];
    rows.push(...page);
    if (page.length < pageSize) break;
  }
  return rows;
}

async function loadAllBalanceSnapshots(client: SupabaseClient) {
  const rows: SnapshotRow[] = [];
  const pageSize = 500;
  for (let offset = 0; ; offset += pageSize) {
    const result = await client
      .from('balance_snapshots')
      .select('account_id,date,balance')
      .order('date', { ascending: true })
      .order('account_id', { ascending: true })
      .range(offset, offset + pageSize - 1);
    if (result.error) throw result.error;
    const page = (result.data ?? []) as SnapshotRow[];
    rows.push(...page);
    if (page.length < pageSize) break;
  }
  return rows;
}

export async function loadFinanceData(
  client: SupabaseClient,
  options: { allTransactions?: boolean; includeSnapshots?: boolean } = {},
) {
  const [accountsResult, transactionsResult, snapshotRows] = await Promise.all([
    client
      .from('accounts')
      .select('id,bank,name,currency,current_balance')
      .eq('is_active', true)
      .order('created_at', { ascending: true }),
    options.allTransactions
      ? loadAllTransactions(client)
      : client
          .from('transactions')
          .select(transactionColumns)
          .order('transaction_date', { ascending: false })
          .limit(500),
    options.includeSnapshots
      ? loadAllBalanceSnapshots(client)
      : Promise.resolve([]),
  ]);

  if (accountsResult.error) throw accountsResult.error;
  if (
    !options.allTransactions &&
    'error' in transactionsResult &&
    transactionsResult.error
  )
    throw transactionsResult.error;

  const transactionRows = options.allTransactions
    ? (transactionsResult as TransactionRow[])
    : ((transactionsResult as { data: TransactionRow[] | null }).data ?? []);

  return {
    accounts: ((accountsResult.data ?? []) as AccountRow[]).map(mapAccount),
    transactions: transactionRows.map(mapTransaction),
    snapshots: (snapshotRows as SnapshotRow[]).map(
      (row): BalanceSnapshot => ({
        accountId: row.account_id,
        date: row.date,
        balance: Number(row.balance),
      }),
    ),
  };
}

export async function saveTransactionChanges(
  client: SupabaseClient,
  id: string,
  changes: Partial<EditableTransactionFields>,
) {
  const payload: Record<string, unknown> = {};
  if (changes.merchant !== undefined)
    payload.merchant = changes.merchant.trim();
  if (changes.note !== undefined) payload.note = changes.note.trim() || null;
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
