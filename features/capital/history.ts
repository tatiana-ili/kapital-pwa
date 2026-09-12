import type {
  BalanceSnapshot,
  FinanceAccount,
} from '../../lib/finance-data.ts';

export type CapitalPoint = { date: string; total: number };
export type CapitalPeriod = '1m' | '3m' | '6m' | '12m' | 'all';

export const capitalPeriods: Array<{ value: CapitalPeriod; label: string }> = [
  { value: '1m', label: '1 месяц' },
  { value: '3m', label: '3 месяца' },
  { value: '6m', label: '6 месяцев' },
  { value: '12m', label: '1 год' },
  { value: 'all', label: 'Всё время' },
];

export function buildCapitalHistory(
  accounts: FinanceAccount[],
  snapshots: BalanceSnapshot[],
): CapitalPoint[] {
  const accountIds = new Set(accounts.map((account) => account.id));
  if (!accountIds.size) return [];
  const ordered = snapshots
    .filter(
      (snapshot) =>
        accountIds.has(snapshot.accountId) &&
        /^\d{4}-\d{2}-\d{2}$/.test(snapshot.date) &&
        Number.isFinite(snapshot.balance),
    )
    .sort(
      (left, right) =>
        left.date.localeCompare(right.date) ||
        left.accountId.localeCompare(right.accountId),
    );
  const latestBalances = new Map<string, number>();
  const points: CapitalPoint[] = [];
  for (let index = 0; index < ordered.length;) {
    const date = ordered[index].date;
    while (index < ordered.length && ordered[index].date === date) {
      latestBalances.set(ordered[index].accountId, ordered[index].balance);
      index++;
    }
    if (latestBalances.size === accountIds.size) {
      points.push({
        date,
        total: [...latestBalances.values()].reduce(
          (sum, balance) => sum + balance,
          0,
        ),
      });
    }
  }
  return points;
}

export function filterCapitalHistory(
  points: CapitalPoint[],
  period: CapitalPeriod,
  today: string,
): CapitalPoint[] {
  if (period === 'all') return points.filter((point) => point.date <= today);
  const months = { '1m': 1, '3m': 3, '6m': 6, '12m': 12 }[period];
  const [year, month, day] = today.split('-').map(Number);
  const first = new Date(Date.UTC(year, month - 1 - months, 1));
  const lastDay = new Date(
    Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0),
  ).getUTCDate();
  const from = `${first.getUTCFullYear()}-${String(first.getUTCMonth() + 1).padStart(2, '0')}-${String(Math.min(day, lastDay)).padStart(2, '0')}`;
  return points.filter((point) => point.date >= from && point.date <= today);
}

export function capitalLinePath(
  points: CapitalPoint[],
  width: number,
  height: number,
  padding = 0,
) {
  if (!points.length) return '';
  const values = points.map((point) => point.total);
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  const spread = maximum - minimum || Math.max(Math.abs(maximum) * 0.02, 1);
  const bottom = minimum - spread * 0.15;
  const top = maximum + spread * 0.15;
  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;
  const firstDate = Date.parse(`${points[0].date}T12:00:00Z`);
  const lastDate = Date.parse(`${points.at(-1)!.date}T12:00:00Z`);
  return points
    .map((point, index) => {
      const x =
        padding +
        (points.length === 1
          ? innerWidth / 2
          : ((Date.parse(`${point.date}T12:00:00Z`) - firstDate) /
              (lastDate - firstDate)) *
            innerWidth);
      const y = padding + ((top - point.total) / (top - bottom)) * innerHeight;
      return `${index === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(' ');
}
