import type { FinanceTransaction } from '../../lib/finance-data.ts';
import type {
  Budget,
  Goal,
  Subscription,
  SubscriptionCadence,
} from './types.ts';

export function localDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function planningRubles(amount: number) {
  return `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(amount)} ₽`;
}

export function budgetProgress(
  budget: Budget,
  transactions: FinanceTransaction[],
) {
  const spent = transactions.reduce((sum, transaction) => {
    if (
      !transaction.date.startsWith(budget.month) ||
      transaction.category !== budget.category ||
      transaction.amount >= 0 ||
      transaction.isTransfer ||
      transaction.excludedFromAnalytics
    )
      return sum;
    return sum - transaction.amount;
  }, 0);
  return {
    spent,
    remaining: budget.amount - spent,
    percent: budget.amount > 0 ? Math.round((spent / budget.amount) * 100) : 0,
  };
}

export function monthlyGoalContribution(goal: Goal, today: string) {
  if (!goal.targetDate || goal.currentAmount >= goal.targetAmount) return null;
  const [year, month, day] = today.split('-').map(Number);
  const [targetYear, targetMonth, targetDay] = goal.targetDate
    .split('-')
    .map(Number);
  if (goal.targetDate < today) return null;
  const months = Math.max(
    1,
    (targetYear - year) * 12 + targetMonth - month + (targetDay > day ? 1 : 0),
  );
  return Math.ceil((goal.targetAmount - goal.currentAmount) / months);
}

export function addCadence(date: string, cadence: SubscriptionCadence) {
  const [year, month, day] = date.split('-').map(Number);
  if (cadence === 'weekly') {
    const next = new Date(Date.UTC(year, month - 1, day + 7));
    return next.toISOString().slice(0, 10);
  }
  const months =
    cadence === 'monthly'
      ? 1
      : cadence === 'quarterly'
        ? 3
        : cadence === 'yearly'
          ? 12
          : 0;
  if (!months) return null;
  const first = new Date(Date.UTC(year, month - 1 + months, 1));
  const lastDay = new Date(
    Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0),
  ).getUTCDate();
  return `${first.getUTCFullYear()}-${String(first.getUTCMonth() + 1).padStart(2, '0')}-${String(Math.min(day, lastDay)).padStart(2, '0')}`;
}

export function yearlySubscriptionAmount(
  amount: number,
  cadence: SubscriptionCadence,
) {
  const multiplier = {
    weekly: 52,
    monthly: 12,
    quarterly: 4,
    yearly: 1,
    unknown: 0,
  }[cadence];
  return amount * multiplier;
}

function dayDifference(a: string, b: string) {
  return Math.round(
    (Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86400000,
  );
}

const cadences: Array<{
  cadence: SubscriptionCadence;
  min: number;
  max: number;
}> = [
  { cadence: 'weekly', min: 5, max: 9 },
  { cadence: 'monthly', min: 25, max: 35 },
  { cadence: 'quarterly', min: 80, max: 100 },
  { cadence: 'yearly', min: 340, max: 390 },
];
const recurringCategories = new Set([
  'Подписки',
  'Связь и интернет',
  'Коммунальные услуги',
  'Жильё',
  'Финансовые услуги',
]);

export function detectSubscriptions(
  transactions: FinanceTransaction[],
): Subscription[] {
  const byMerchant = new Map<string, FinanceTransaction[]>();
  for (const transaction of transactions) {
    if (
      transaction.amount >= 0 ||
      transaction.isTransfer ||
      transaction.excludedFromAnalytics ||
      !transaction.merchant.trim() ||
      (!transaction.isRecurring &&
        !recurringCategories.has(transaction.category))
    )
      continue;
    const key = transaction.merchant
      .trim()
      .replace(/\s+/g, ' ')
      .toLocaleLowerCase('ru');
    const group = byMerchant.get(key);
    if (group) group.push(transaction);
    else byMerchant.set(key, [transaction]);
  }
  const detected: Subscription[] = [];
  for (const [key, rows] of byMerchant) {
    const sorted = rows.sort((a, b) => a.date.localeCompare(b.date));
    const latest = sorted.at(-1);
    if (!latest) continue;
    const tail = [latest];
    let match: (typeof cadences)[number] | undefined;
    for (let index = sorted.length - 2; index >= 0; index--) {
      const previous = sorted[index];
      if (Math.abs(previous.amount - latest.amount) / -latest.amount > 0.15)
        break;
      const days = dayDifference(previous.date, tail[0].date);
      if (days <= 0) break;
      if (!match)
        match = cadences.find(({ min, max }) => days >= min && days <= max);
      if (!match || days < match.min || days > match.max) break;
      tail.unshift(previous);
    }
    if (tail.length < 3 || !match) continue;
    const amounts = tail.map((row) => -row.amount).sort((a, b) => a - b);
    const median = amounts[Math.floor(amounts.length / 2)];
    if (
      median <= 0 ||
      amounts.some((amount) => Math.abs(amount - median) / median > 0.15)
    )
      continue;
    const lastPaidAt = latest.date;
    detected.push({
      id: `detected:${key}`,
      merchant: latest.merchant.trim(),
      amount: median,
      cadence: match.cadence,
      lastPaidAt,
      nextExpectedAt: addCadence(lastPaidAt, match.cadence),
      confidence: Math.min(0.99, 0.65 + tail.length * 0.06),
      isActive: true,
    });
  }
  return detected.sort((a, b) => a.merchant.localeCompare(b.merchant, 'ru'));
}
