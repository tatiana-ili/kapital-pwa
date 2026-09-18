import type {
  StatementCommitInput,
  StatementCommitResult,
} from '../features/import/commit-types.ts';
import { categoryRuleUpdates } from '../features/categories/rules.ts';
import type {
  CategoryRule,
  FinanceCategory,
} from '../features/categories/types.ts';
import { stableHash } from '../features/import/parser.ts';
import { parseStoredMapping } from '../features/import/profile-mapping.ts';
import { findTransferCounterpart } from '../features/import/transfers.ts';
import type {
  ColumnMapping,
  StatementFileFormat,
} from '../features/import/types.ts';
import { demoAccounts, demoTransactions } from './demo-data.ts';
import {
  bankNames,
  type BankCode,
  type FinanceAccount,
  type BalanceSnapshot,
  type FinanceTransaction,
} from './finance-data.ts';

const STORAGE_KEY = 'kapital.demo.imports.v1';
export const LOCAL_IMPORT_EVENT = 'kapital:demo-imported';

type StoredImport = {
  fileHash: string;
  accountId?: string;
  sourceFile: string;
  importedAt: string;
  insertedCount: number;
};

type StoredImportProfile = {
  bank: BankCode;
  fileFormat: StatementFileFormat;
  headerSignature: string;
  columnMapping: ColumnMapping;
};

type LocalFinanceState = {
  accounts: FinanceAccount[];
  snapshots: BalanceSnapshot[];
  transactions: FinanceTransaction[];
  imports: StoredImport[];
  profiles: StoredImportProfile[];
};

function createEmptyState(): LocalFinanceState {
  return {
    accounts: [],
    snapshots: [],
    transactions: [],
    imports: [],
    profiles: [],
  };
}

function allVisibleTransactions(state: LocalFinanceState) {
  const savedIds = new Set(state.transactions.map((item) => item.id));
  return [
    ...state.transactions,
    ...demoTransactions.filter((item) => !savedIds.has(item.id)),
  ];
}

function upsertTransaction(
  state: LocalFinanceState,
  transaction: FinanceTransaction,
) {
  const index = state.transactions.findIndex(
    (item) => item.id === transaction.id,
  );
  if (index >= 0) state.transactions[index] = transaction;
  else state.transactions.push(transaction);
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
      snapshots: Array.isArray(parsed.snapshots) ? parsed.snapshots : [],
      transactions: Array.isArray(parsed.transactions)
        ? parsed.transactions
        : [],
      imports: Array.isArray(parsed.imports) ? parsed.imports : [],
      profiles: Array.isArray(parsed.profiles) ? parsed.profiles : [],
    };
  } catch {
    return createEmptyState();
  }
}

export function loadLocalVisibleTransactions() {
  return allVisibleTransactions(loadLocalFinanceData());
}

export function loadLocalImportProfile(
  bank: BankCode,
  fileFormat: StatementFileFormat,
  headerSignature: string,
  columnCount: number,
) {
  const profile = loadLocalFinanceData().profiles.find(
    (item) =>
      item.bank === bank &&
      item.fileFormat === fileFormat &&
      item.headerSignature === headerSignature,
  );
  return parseStoredMapping(profile?.columnMapping, columnCount);
}

export function updateLocalTransaction(updated: FinanceTransaction) {
  const state = loadLocalFinanceData();
  const visible = allVisibleTransactions(state);
  const previous = visible.find((item) => item.id === updated.id);
  if (!previous) return;
  if (previous.isTransfer && !updated.isTransfer && previous.transferGroupId) {
    for (const counterpart of visible) {
      if (
        counterpart.id === updated.id ||
        counterpart.transferGroupId !== previous.transferGroupId
      ) {
        continue;
      }
      upsertTransaction(state, {
        ...counterpart,
        transferGroupId: undefined,
        isTransfer: false,
        transactionType: counterpart.amount > 0 ? 'income' : 'expense',
        excludedFromAnalytics: false,
      });
    }
    updated.transferGroupId = undefined;
  } else if (!previous.isTransfer && updated.isTransfer) {
    const counterpart = findTransferCounterpart(
      updated,
      visible.filter((item) => item.id !== updated.id),
    );
    if (counterpart) {
      updated.transferGroupId = counterpart.id;
      upsertTransaction(state, {
        ...counterpart,
        transferGroupId: counterpart.id,
        isTransfer: true,
        transactionType: 'transfer',
        excludedFromAnalytics: true,
      });
    }
  }
  upsertTransaction(state, updated);
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  window.dispatchEvent(new Event(LOCAL_IMPORT_EVENT));
}

export function renameLocalTransactionCategory(
  oldName: string,
  nextName: string,
) {
  const state = loadLocalFinanceData();
  state.transactions = state.transactions.map((transaction) =>
    transaction.category === oldName
      ? { ...transaction, category: nextName }
      : transaction,
  );
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  window.dispatchEvent(new Event(LOCAL_IMPORT_EVENT));
}

export function applyLocalCategoryRules(
  categories: FinanceCategory[],
  rules: CategoryRule[],
) {
  const state = loadLocalFinanceData();
  const visible = allVisibleTransactions(state);
  const byId = new Map(
    visible.map((transaction) => [transaction.id, transaction]),
  );
  const updates = categoryRuleUpdates(visible, categories, rules);
  for (const update of updates) {
    const transaction = byId.get(update.id);
    if (transaction) {
      upsertTransaction(state, { ...transaction, category: update.category });
    }
  }
  if (updates.length) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    window.dispatchEvent(new Event(LOCAL_IMPORT_EVENT));
  }
  return updates.length;
}

export function saveLocalStatement(
  input: StatementCommitInput,
): StatementCommitResult {
  const state = loadLocalFinanceData();
  const normalizedAccountName = input.accountName.trim();
  const matchingDemoAccount = demoAccounts.find(
    (account) =>
      account.bank === bankNames[input.bank] &&
      account.name.toLocaleLowerCase('ru') ===
        normalizedAccountName.toLocaleLowerCase('ru'),
  );
  const accountId =
    matchingDemoAccount?.id ??
    `local-${input.bank}-${stableHash(normalizedAccountName.toLocaleLowerCase('ru'))}`;
  const earlierImport = state.imports.find(
    (item) => item.fileHash === input.fileHash && item.accountId === accountId,
  );

  const accountIndex = state.accounts.findIndex(
    (item) => item.id === accountId,
  );
  const account: FinanceAccount = {
    id: accountId,
    bank: bankNames[input.bank],
    name: normalizedAccountName,
    currentBalance:
      input.currentBalance ??
      state.accounts[accountIndex]?.currentBalance ??
      matchingDemoAccount?.currentBalance ??
      0,
    currency: 'RUB',
  };
  if (accountIndex >= 0) state.accounts[accountIndex] = account;
  else state.accounts.push(account);
  if (input.currentBalance !== null && input.currentBalance !== undefined) {
    const date = new Date().toISOString().slice(0, 10);
    state.snapshots = state.snapshots.filter(
      (snapshot) => snapshot.accountId !== accountId || snapshot.date !== date,
    );
    state.snapshots.push({ accountId, date, balance: input.currentBalance });
  }

  const knownHashes = new Set(
    state.transactions.map((transaction) => transaction.sourceHash),
  );
  const selectedRows = input.rows.filter(
    (row) =>
      row.selected && row.status !== 'error' && row.status !== 'duplicate',
  );
  const transactions: FinanceTransaction[] = [];
  for (const row of selectedRows) {
    if (knownHashes.has(row.sourceHash)) continue;
    const transaction: FinanceTransaction = {
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
    };
    if (row.isTransfer) {
      const counterpart = findTransferCounterpart(
        transaction,
        allVisibleTransactions(state),
      );
      if (counterpart) {
        transaction.transferGroupId = counterpart.id;
        upsertTransaction(state, {
          ...counterpart,
          transferGroupId: counterpart.id,
          isTransfer: true,
          transactionType: 'transfer',
          excludedFromAnalytics: true,
        });
      }
    }
    state.transactions.push(transaction);
    knownHashes.add(row.sourceHash);
    transactions.push(transaction);
  }
  if (earlierImport) {
    earlierImport.importedAt = new Date().toISOString();
    earlierImport.insertedCount += transactions.length;
  } else {
    state.imports.push({
      fileHash: input.fileHash,
      accountId,
      sourceFile: input.sourceFile,
      importedAt: new Date().toISOString(),
      insertedCount: transactions.length,
    });
  }
  const profile: StoredImportProfile = {
    bank: input.bank,
    fileFormat: input.fileFormat,
    headerSignature: input.headerSignature,
    columnMapping: input.columnMapping,
  };
  const existingProfileIndex = state.profiles.findIndex(
    (item) =>
      item.bank === profile.bank &&
      item.fileFormat === profile.fileFormat &&
      item.headerSignature === profile.headerSignature,
  );
  if (existingProfileIndex >= 0) state.profiles[existingProfileIndex] = profile;
  else state.profiles.push(profile);
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  window.dispatchEvent(new Event(LOCAL_IMPORT_EVENT));

  return {
    alreadyImported: Boolean(earlierImport && transactions.length === 0),
    insertedCount: transactions.length,
    duplicateCount: selectedRows.length - transactions.length,
    reviewCount: selectedRows.filter((row) => row.status === 'review').length,
  };
}
