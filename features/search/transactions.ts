import type { FinanceTransaction } from '../../lib/finance-data.ts';

export type TransactionSearchResult = {
  matches: FinanceTransaction[];
  income: number;
  expenses: number;
  net: number;
  includedCount: number;
};

function normalizeText(value: string) {
  return value
    .normalize('NFKC')
    .toLocaleLowerCase('ru')
    .replace(/ё/g, 'е')
    .replace(/\s+/g, ' ')
    .trim();
}

function amountInKopecks(value: string) {
  const compact = value
    .replace(/[\s\u00a0\u202f₽]/g, '')
    .replace(',', '.')
    .replace(/^−/, '-');
  if (!/^[+-]?\d+(?:\.\d{1,2})?$/.test(compact)) return null;
  const amount = Number(compact);
  return Number.isFinite(amount) ? Math.round(Math.abs(amount) * 100) : null;
}

function matchesQuery(transaction: FinanceTransaction, query: string) {
  const text = normalizeText(
    [
      transaction.merchant,
      transaction.description,
      transaction.category,
      transaction.note ?? '',
    ].join(' '),
  );
  const amount = Math.round(Math.abs(transaction.amount) * 100);
  const wholeAmount = amountInKopecks(query);
  if (wholeAmount !== null)
    return amount === wholeAmount || text.includes(normalizeText(query));

  return normalizeText(query)
    .split(' ')
    .filter(Boolean)
    .every((token) => {
      const tokenAmount = amountInKopecks(token);
      return (
        text.includes(token) || (tokenAmount !== null && amount === tokenAmount)
      );
    });
}

export function searchTransactions(
  transactions: FinanceTransaction[],
  query: string,
): TransactionSearchResult {
  const trimmed = query.trim();
  if (!trimmed)
    return { matches: [], income: 0, expenses: 0, net: 0, includedCount: 0 };

  const matches = transactions
    .filter((transaction) => matchesQuery(transaction, trimmed))
    .sort(
      (left, right) =>
        right.date.localeCompare(left.date) || right.id.localeCompare(left.id),
    );
  let income = 0;
  let expenses = 0;
  let includedCount = 0;
  for (const transaction of matches) {
    if (transaction.isTransfer || transaction.excludedFromAnalytics) continue;
    includedCount++;
    if (transaction.amount > 0) income += transaction.amount;
    else expenses -= transaction.amount;
  }
  return { matches, income, expenses, net: income - expenses, includedCount };
}
