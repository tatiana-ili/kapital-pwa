import type {
  StatementCommitInput,
  StatementCommitResult,
} from '@/features/import/commit-types';
import { stableHash } from '@/features/import/parser';
import {
  bankNames,
  type FinanceAccount,
  type FinanceTransaction,
} from './finance-data';

const STORAGE_KEY = 'kapital.demo.imports.v1';
export const LOCAL_IMPORT_EVENT = 'kapital:demo-imported';

type StoredImport = {
  fileHash: string;
  sourceFile: string;
  importedAt: string;
  insertedCount: number;
};

type LocalFinanceState = {
  accounts: FinanceAccount[];
  transactions: FinanceTransaction[];
  imports: StoredImport[];
};

function createEmptyState(): LocalFinanceState {
  return { accounts: [], transactions: [], imports: [] };
}

export function loadLocalFinanceData(): LocalFinanceState {
  if (typeof window === 'undefined') return createEmptyState();
  try {
    const parsed = JSON.parse(
      window.localStorage.getItem(STORAGE_KEY) || 'null',
    ) as Partial<LocalFinanceState> | null;
    if (!parsed) return createEmptyState();
    return {
      accounts: Array.isArray(parsed.accounts) ? parsed.accounts : [],
      transactions: Array.isArray(parsed.transactions)
        ? parsed.transactions
        : [],
      imports: Array.isArray(parsed.imports) ? parsed.imports : [],
    };
  } catch {
    return createEmptyState();
  }
}

export function updateLocalTransaction(updated: FinanceTransaction) {
  const state = loadLocalFinanceData();
  const index = state.transactions.findIndex((item) => item.id === updated.id);
  if (index < 0) return;
  state.transactions[index] = updated;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  window.dispatchEvent(new Event(LOCAL_IMPORT_EVENT));
}

export function saveLocalStatement(
  input: StatementCommitInput,
): StatementCommitResult {
  const state = loadLocalFinanceData();
  const earlierImport = state.imports.find(
    (item) => item.fileHash === input.fileHash,
  );
  if (earlierImport) {
    return {
      alreadyImported: true,
      insertedCount: 0,
      duplicateCount: input.rows.length,
      reviewCount: 0,
    };
  }

  const normalizedAccountName = input.accountName.trim();
  const accountId = `local-${input.bank}-${stableHash(normalizedAccountName.toLocaleLowerCase('ru'))}`;
  const accountIndex = state.accounts.findIndex(
    (item) => item.id === accountId,
  );
  const account: FinanceAccount = {
    id: accountId,
    bank: bankNames[input.bank],
    name: normalizedAccountName,
    currentBalance:
      input.currentBalance ?? state.accounts[accountIndex]?.currentBalance ?? 0,
    currency: 'RUB',
  };
  if (accountIndex >= 0) state.accounts[accountIndex] = account;
  else state.accounts.push(account);

  const knownHashes = new Set(
    state.transactions.map((transaction) => transaction.sourceHash),
  );
  const selectedRows = input.rows.filter(
    (row) =>
      row.selected && row.status !== 'error' && row.status !== 'duplicate',
  );
  const transactions = selectedRows
    .filter((row) => !knownHashes.has(row.sourceHash))
    .map<FinanceTransaction>((row) => ({
      id: `local-${row.sourceHash}`,
      date: row.date,
      postedDate: row.postedDate,
      merchant: row.merchant,
      description: row.description,
      category: row.isTransfer ? 'Переводы' : row.category,
      bank: bankNames[input.bank],
      accountId,
      amount: row.amount,
      currency: 'RUB',
      transactionType: row.isTransfer ? 'transfer' : row.transactionType,
      isTransfer: row.isTransfer,
      isRecurring: false,
      sourceHash: row.sourceHash,
      sourceFile: input.sourceFile,
      excludedFromAnalytics: row.isTransfer || row.excludedFromAnalytics,
    }));

  state.transactions.push(...transactions);
  state.imports.push({
    fileHash: input.fileHash,
    sourceFile: input.sourceFile,
    importedAt: new Date().toISOString(),
    insertedCount: transactions.length,
  });
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  window.dispatchEvent(new Event(LOCAL_IMPORT_EVENT));

  return {
    alreadyImported: false,
    insertedCount: transactions.length,
    duplicateCount: selectedRows.length - transactions.length,
    reviewCount: selectedRows.filter((row) => row.status === 'review').length,
  };
}
