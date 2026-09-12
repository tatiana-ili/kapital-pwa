export type BankCode = 'tbank' | 'sber' | 'yandex' | 'ozon';
export type BankName = 'Т-Банк' | 'Сбер' | 'Яндекс Банк' | 'Ozon Банк';
export type TransactionType =
  | 'expense'
  | 'income'
  | 'transfer'
  | 'refund'
  | 'cash'
  | 'other';

export type FinanceAccount = {
  id: string;
  bank: BankName;
  name: string;
  currentBalance: number;
  currency: 'RUB';
};

export type FinanceTransaction = {
  id: string;
  date: string;
  postedDate?: string;
  merchant: string;
  description: string;
  category: string;
  bank: BankName;
  accountId: string;
  amount: number;
  currency: 'RUB';
  transactionType: TransactionType;
  isTransfer: boolean;
  transferGroupId?: string;
  isRecurring: boolean;
  sourceHash?: string;
  sourceFile?: string;
  note?: string;
  excludedFromAnalytics: boolean;
};

export const bankNames: Record<BankCode, BankName> = {
  tbank: 'Т-Банк',
  sber: 'Сбер',
  yandex: 'Яндекс Банк',
  ozon: 'Ozon Банк',
};

export type FinanceSummary = {
  totalCapital: number;
  income: number;
  expenses: number;
  net: number;
  savingsRate: number;
  categories: Array<{ name: string; amount: number; share: number }>;
  recentTransactions: FinanceTransaction[];
};

export function calculateFinanceSummary(
  accounts: FinanceAccount[],
  transactions: FinanceTransaction[],
  monthKey = new Date().toISOString().slice(0, 7),
): FinanceSummary {
  const included = transactions.filter(
    (transaction) =>
      transaction.date.startsWith(monthKey) &&
      !transaction.isTransfer &&
      !transaction.excludedFromAnalytics,
  );
  const income = included.reduce(
    (sum, transaction) => sum + Math.max(transaction.amount, 0),
    0,
  );
  const expenses = included.reduce(
    (sum, transaction) => sum + Math.max(-transaction.amount, 0),
    0,
  );
  const categoryTotals = new Map<string, number>();

  for (const transaction of included) {
    if (transaction.amount >= 0) continue;
    categoryTotals.set(
      transaction.category,
      (categoryTotals.get(transaction.category) ?? 0) +
        Math.abs(transaction.amount),
    );
  }

  const sortedCategories = [...categoryTotals.entries()]
    .map(([name, amount]) => ({ name, amount }))
    .sort((left, right) => right.amount - left.amount);
  const leadingCategories = sortedCategories.slice(0, 3);
  const remainingAmount = sortedCategories
    .slice(3)
    .reduce((sum, category) => sum + category.amount, 0);
  const categories = [
    ...leadingCategories,
    ...(remainingAmount > 0
      ? [{ name: 'Остальное', amount: remainingAmount }]
      : []),
  ].map((category) => ({
    ...category,
    share: expenses > 0 ? category.amount / expenses : 0,
  }));
  const net = income - expenses;

  return {
    totalCapital: accounts.reduce(
      (sum, account) => sum + account.currentBalance,
      0,
    ),
    income,
    expenses,
    net,
    savingsRate: income > 0 ? Math.round((net / income) * 100) : 0,
    categories,
    recentTransactions: [...transactions]
      .sort(
        (left, right) =>
          right.date.localeCompare(left.date) ||
          right.id.localeCompare(left.id),
      )
      .slice(0, 3),
  };
}

export function formatRubles(amount: number) {
  const sign = amount > 0 ? '+' : amount < 0 ? '−' : '';
  return `${sign}${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(Math.abs(amount))} ₽`;
}

export function formatTransactionDate(date: string) {
  return new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: 'short' })
    .format(new Date(`${date}T12:00:00Z`))
    .replace('.', '');
}
