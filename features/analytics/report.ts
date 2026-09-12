import type { BankName, FinanceTransaction } from '@/lib/finance-data';

export type PeriodPreset = 'month' | '3m' | '6m' | '12m' | 'all' | 'custom';

export type AnalyticsFilters = {
  preset: PeriodPreset;
  from: string;
  to: string;
  bank: BankName | 'all';
  accountId: string;
  category: string;
  merchant: string;
};

export type MonthlyTotal = { month: string; income: number; expenses: number };

export type AnalyticsReport = {
  from: string;
  to: string;
  income: number;
  expenses: number;
  net: number;
  savingsRate: number;
  averagePerDay: number;
  averagePerMonth: number;
  transactionCount: number;
  categories: Array<{ name: string; amount: number; share: number }>;
  months: MonthlyTotal[];
  largestExpenses: FinanceTransaction[];
  comparison: {
    currentMonth: string;
    previousMonth: string;
    throughDay: number;
    currentIncome: number;
    previousIncome: number;
    currentExpenses: number;
    previousExpenses: number;
  };
};

function utcDay(date: string) {
  return new Date(`${date}T00:00:00Z`).getTime();
}

function monthStart(month: string) {
  return `${month}-01`;
}

function shiftMonth(month: string, offset: number) {
  const [year, monthNumber] = month.split('-').map(Number);
  const shifted = new Date(Date.UTC(year, monthNumber - 1 + offset, 1));
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function localToday(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function filteredScope(
  transactions: FinanceTransaction[],
  filters: AnalyticsFilters,
) {
  const merchant = filters.merchant.trim().toLocaleLowerCase('ru-RU');
  return transactions.filter(
    (transaction) =>
      !transaction.isTransfer &&
      !transaction.excludedFromAnalytics &&
      (filters.bank === 'all' || transaction.bank === filters.bank) &&
      (filters.accountId === 'all' ||
        transaction.accountId === filters.accountId) &&
      (filters.category === 'all' ||
        transaction.category === filters.category) &&
      (!merchant ||
        transaction.merchant.toLocaleLowerCase('ru-RU').includes(merchant)),
  );
}

export function resolvePeriod(
  filters: AnalyticsFilters,
  transactions: FinanceTransaction[],
  today: string,
) {
  const to = filters.preset === 'custom' ? filters.to : today;
  if (filters.preset === 'custom') return { from: filters.from, to };
  if (filters.preset === 'all') {
    return {
      from: transactions.reduce(
        (earliest, transaction) =>
          transaction.date < earliest ? transaction.date : earliest,
        today,
      ),
      to,
    };
  }
  const monthCount =
    filters.preset === 'month' ? 1 : Number(filters.preset.slice(0, -1));
  return {
    from: monthStart(shiftMonth(today.slice(0, 7), 1 - monthCount)),
    to,
  };
}

export function buildAnalyticsReport(
  transactions: FinanceTransaction[],
  filters: AnalyticsFilters,
  today: string,
): AnalyticsReport {
  const scope = filteredScope(transactions, filters);
  const { from, to } = resolvePeriod(filters, scope, today);
  const selected = scope.filter(
    (transaction) => transaction.date >= from && transaction.date <= to,
  );
  const income = selected.reduce(
    (sum, transaction) => sum + Math.max(transaction.amount, 0),
    0,
  );
  const expenses = selected.reduce(
    (sum, transaction) => sum + Math.max(-transaction.amount, 0),
    0,
  );
  const net = income - expenses;
  const categoryTotals = new Map<string, number>();
  const monthTotals = new Map<string, MonthlyTotal>();

  for (const transaction of selected) {
    const month = transaction.date.slice(0, 7);
    const total = monthTotals.get(month) ?? { month, income: 0, expenses: 0 };
    if (transaction.amount > 0) total.income += transaction.amount;
    if (transaction.amount < 0) {
      total.expenses -= transaction.amount;
      categoryTotals.set(
        transaction.category,
        (categoryTotals.get(transaction.category) ?? 0) - transaction.amount,
      );
    }
    monthTotals.set(month, total);
  }

  const months: MonthlyTotal[] = [];
  if (from <= to) {
    for (
      let month = from.slice(0, 7);
      month <= to.slice(0, 7);
      month = shiftMonth(month, 1)
    ) {
      months.push(monthTotals.get(month) ?? { month, income: 0, expenses: 0 });
    }
  }

  const currentMonth = to.slice(0, 7);
  const previousMonth = shiftMonth(currentMonth, -1);
  const throughDay = Number(to.slice(8, 10));
  const comparison = {
    currentMonth,
    previousMonth,
    throughDay,
    currentIncome: 0,
    previousIncome: 0,
    currentExpenses: 0,
    previousExpenses: 0,
  };
  // Keep the same bank/account/category/merchant filters, but include the prior
  // month even when the selected period starts this month.
  for (const transaction of scope) {
    if (Number(transaction.date.slice(8, 10)) > throughDay) continue;
    const month = transaction.date.slice(0, 7);
    if (month !== currentMonth && month !== previousMonth) continue;
    if (month === currentMonth && transaction.date > to) continue;
    const prefix = month === currentMonth ? 'current' : 'previous';
    if (transaction.amount > 0)
      comparison[`${prefix}Income`] += transaction.amount;
    if (transaction.amount < 0)
      comparison[`${prefix}Expenses`] -= transaction.amount;
  }

  const dayCount =
    from <= to ? Math.floor((utcDay(to) - utcDay(from)) / 86_400_000) + 1 : 0;
  return {
    from,
    to,
    income,
    expenses,
    net,
    savingsRate: income > 0 ? (net / income) * 100 : 0,
    averagePerDay: dayCount > 0 ? expenses / dayCount : 0,
    averagePerMonth: months.length > 0 ? expenses / months.length : 0,
    transactionCount: selected.length,
    categories: [...categoryTotals.entries()]
      .map(([name, amount]) => ({
        name,
        amount,
        share: expenses > 0 ? amount / expenses : 0,
      }))
      .sort(
        (left, right) =>
          right.amount - left.amount ||
          left.name.localeCompare(right.name, 'ru-RU'),
      ),
    months,
    largestExpenses: selected
      .filter((transaction) => transaction.amount < 0)
      .sort(
        (left, right) =>
          left.amount - right.amount || right.date.localeCompare(left.date),
      )
      .slice(0, 5),
    comparison,
  };
}
