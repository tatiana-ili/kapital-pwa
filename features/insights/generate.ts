import {
  detectSubscriptions,
  yearlySubscriptionAmount,
} from '../planning/calculations.ts';
import type { FinanceTransaction } from '../../lib/finance-data.ts';

export type FinanceInsight = {
  id: string;
  title: string;
  detail: string;
};

function rubles(amount: number) {
  return `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(amount)} ₽`;
}

function monthBounds(today: string, offset: number) {
  const [year, month, day] = today.split('-').map(Number);
  const first = new Date(Date.UTC(year, month - 1 + offset, 1));
  const lastDay = new Date(
    Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0),
  ).getUTCDate();
  const key = first.toISOString().slice(0, 7);
  return {
    from: `${key}-01`,
    to: `${key}-${String(Math.min(day, lastDay)).padStart(2, '0')}`,
  };
}

function spendBy(
  transactions: FinanceTransaction[],
  from: string,
  to: string,
  key: 'category' | 'merchant',
) {
  const amounts = new Map<string, number>();
  for (const transaction of transactions) {
    if (
      transaction.date < from ||
      transaction.date > to ||
      transaction.amount >= 0 ||
      transaction.isTransfer ||
      transaction.excludedFromAnalytics
    )
      continue;
    const name = transaction[key].trim();
    if (!name) continue;
    amounts.set(name, (amounts.get(name) ?? 0) - transaction.amount);
  }
  return amounts;
}

export function generateFinanceInsights(
  transactions: FinanceTransaction[],
  today: string,
): FinanceInsight[] {
  const current = monthBounds(today, 0);
  const previous = monthBounds(today, -1);
  const insights: FinanceInsight[] = [];

  const categoryCurrent = spendBy(
    transactions,
    current.from,
    current.to,
    'category',
  );
  const categoryPrevious = spendBy(
    transactions,
    previous.from,
    previous.to,
    'category',
  );
  const categoryGrowth = [...categoryCurrent]
    .map(([name, amount]) => ({
      name,
      amount,
      before: categoryPrevious.get(name) ?? 0,
    }))
    .filter(
      (item) =>
        item.before >= 1000 &&
        item.amount - item.before >= 500 &&
        item.amount >= item.before * 1.1,
    )
    .sort((a, b) => b.amount - b.before - (a.amount - a.before))[0];
  if (categoryGrowth) {
    const percent = Math.round(
      (categoryGrowth.amount / categoryGrowth.before - 1) * 100,
    );
    insights.push({
      id: 'category-growth',
      title: `Расходы в категории «${categoryGrowth.name}» выросли на ${percent}%`,
      detail: `На ${rubles(categoryGrowth.amount - categoryGrowth.before)} больше, чем за те же дни прошлого месяца.`,
    });
  }

  const merchantCurrent = spendBy(
    transactions,
    current.from,
    current.to,
    'merchant',
  );
  const merchantPrevious = spendBy(
    transactions,
    previous.from,
    previous.to,
    'merchant',
  );
  const merchantGrowth = [...merchantCurrent]
    .map(([name, amount]) => ({
      name,
      amount,
      before: merchantPrevious.get(name) ?? 0,
    }))
    .filter((item) => item.amount - item.before >= 1000)
    .sort((a, b) => b.amount - b.before - (a.amount - a.before))[0];
  if (merchantGrowth) {
    insights.push({
      id: 'merchant-growth',
      title: `На «${merchantGrowth.name}» потрачено на ${rubles(merchantGrowth.amount - merchantGrowth.before)} больше`,
      detail: `Сравнение с теми же днями прошлого месяца. Сейчас: ${rubles(merchantGrowth.amount)}.`,
    });
  }

  const recentSubscriptions = detectSubscriptions(transactions).filter(
    (item) => {
      if (!item.lastPaidAt || item.lastPaidAt > today) return false;
      const maxAge = {
        weekly: 12,
        monthly: 40,
        quarterly: 110,
        yearly: 400,
        unknown: 0,
      }[item.cadence];
      const days =
        (Date.parse(`${today}T12:00:00Z`) -
          Date.parse(`${item.lastPaidAt}T12:00:00Z`)) /
        86400000;
      return days <= maxAge;
    },
  );
  const monthlySubscriptions = recentSubscriptions.reduce(
    (sum, item) =>
      sum + yearlySubscriptionAmount(item.amount, item.cadence) / 12,
    0,
  );
  if (monthlySubscriptions > 0) {
    insights.push({
      id: 'subscriptions',
      title: `Регулярные платежи — около ${rubles(Math.round(monthlySubscriptions))} в месяц`,
      detail: `Оценка по ${recentSubscriptions.length} найденным повторяющимся списаниям. Проверьте их на странице подписок.`,
    });
  }

  return insights;
}
