'use client';

import Link from 'next/link';
import {
  AlertCircle,
  ArrowDownRight,
  ArrowUpRight,
  ChevronRight,
  Plus,
  RefreshCw,
  TrendingUp,
  WalletCards,
} from 'lucide-react';
import { AppShell } from '@/components/app-shell';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { useFinanceData } from '@/hooks/use-finance-data';
import {
  calculateFinanceSummary,
  formatRubles,
  formatTransactionDate,
  type BankName,
} from '@/lib/finance-data';

const bankTone: Record<BankName, string> = {
  'Т-Банк': 'bg-[#ffd84d] text-[#201c00]',
  Сбер: 'bg-[#21a038] text-white',
  'Яндекс Банк': 'bg-[#ff3b30] text-white',
  'Ozon Банк': 'bg-[#2563eb] text-white',
};
const categoryColors = ['#2563eb', '#7c3aed', '#0ea5a4', '#f59e0b'];

export default function Home() {
  const { accounts, dataMode, error, loading, refresh, transactions } =
    useFinanceData();
  const today = new Date();
  const monthKey = today.toISOString().slice(0, 7);
  const summary = calculateFinanceSummary(accounts, transactions, monthKey);
  const monthLabel = new Intl.DateTimeFormat('ru-RU', {
    month: 'long',
    year: 'numeric',
  }).format(today);
  const donutBackground = buildDonutGradient(
    summary.categories.map((category) => category.share),
  );

  return (
    <AppShell>
      <div className="space-y-6 lg:space-y-8">
        <div className="flex items-center justify-between gap-4">
          <p className="text-sm text-muted-foreground">
            {dataMode === 'demo'
              ? 'Безопасные демонстрационные данные'
              : 'Данные из защищённой базы'}
          </p>
          <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
            {dataMode === 'demo' ? 'Демо' : 'Supabase'}
          </span>
        </div>

        {error && (
          <div
            className="flex flex-col gap-3 rounded-2xl border border-destructive/30 bg-destructive/8 p-4 sm:flex-row sm:items-center"
            role="alert"
          >
            <div className="flex flex-1 items-start gap-3">
              <AlertCircle
                className="mt-0.5 size-5 shrink-0 text-destructive"
                aria-hidden="true"
              />
              <p className="text-sm leading-relaxed">{error}</p>
            </div>
            <Button
              variant="outline"
              className="min-h-11"
              onClick={() => void refresh()}
            >
              <RefreshCw aria-hidden="true" /> Повторить
            </Button>
          </div>
        )}

        {loading ? (
          <LoadingDashboard />
        ) : (
          <>
            <section className="balance-card relative overflow-hidden rounded-[28px] p-6 text-white shadow-[0_24px_70px_rgba(37,99,235,0.22)] sm:p-8">
              <div className="relative z-10">
                <div className="flex items-center justify-between gap-4">
                  <p className="text-sm font-medium text-blue-100">
                    Общий капитал
                  </p>
                  <span className="inline-flex items-center gap-1 rounded-full bg-white/12 px-2.5 py-1 text-xs font-semibold text-blue-50">
                    <TrendingUp className="size-3.5" aria-hidden="true" />
                    {formatRubles(summary.net)} за месяц
                  </span>
                </div>
                <p className="mt-3 text-[clamp(2.25rem,8vw,4.5rem)] font-semibold leading-none tracking-[-.055em] tabular-nums">
                  {formatRubles(summary.totalCapital)}
                </p>
                <div className="mt-7 flex items-end justify-between gap-5">
                  <div>
                    <p className="text-xs text-blue-200">
                      Доходы минус расходы
                    </p>
                    <p className="mt-1 text-base font-semibold tabular-nums">
                      {formatRubles(summary.net)}
                    </p>
                  </div>
                  <svg
                    className="h-14 w-32 overflow-visible sm:w-48"
                    viewBox="0 0 190 56"
                    aria-label="Динамика капитала"
                  >
                    <title>Динамика капитала</title>
                    <defs>
                      <linearGradient
                        id="spark-fill"
                        x1="0"
                        x2="0"
                        y1="0"
                        y2="1"
                      >
                        <stop offset="0" stopColor="white" stopOpacity=".3" />
                        <stop offset="1" stopColor="white" stopOpacity="0" />
                      </linearGradient>
                    </defs>
                    <path
                      d="M0 49 C18 48 22 35 38 38 S62 49 76 31 S102 39 118 22 S146 30 160 15 S178 11 190 4 V56 H0Z"
                      fill="url(#spark-fill)"
                    />
                    <path
                      d="M0 49 C18 48 22 35 38 38 S62 49 76 31 S102 39 118 22 S146 30 160 15 S178 11 190 4"
                      fill="none"
                      stroke="white"
                      strokeLinecap="round"
                      strokeWidth="3"
                    />
                  </svg>
                </div>
              </div>
            </section>

            <section aria-labelledby="accounts-title">
              <div className="mb-3 flex items-center justify-between">
                <h2
                  id="accounts-title"
                  className="text-lg font-semibold tracking-tight"
                >
                  Счета
                </h2>
                <Button
                  variant="ghost"
                  size="sm"
                  className="min-h-11 px-3 text-primary"
                  disabled
                >
                  <Plus aria-hidden="true" /> Добавить
                </Button>
              </div>
              {accounts.length ? (
                <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
                  {accounts.map((account) => (
                    <article
                      key={account.id}
                      className="surface-card rounded-2xl border p-4"
                    >
                      <div
                        className={`grid size-9 place-items-center rounded-xl text-sm font-bold ${bankTone[account.bank]}`}
                      >
                        {account.bank.slice(0, 1)}
                      </div>
                      <p className="mt-4 truncate text-sm text-muted-foreground">
                        {account.bank} · {account.name}
                      </p>
                      <p className="mt-1 text-lg font-semibold tracking-tight tabular-nums">
                        {formatRubles(account.currentBalance)}
                      </p>
                    </article>
                  ))}
                </div>
              ) : (
                <EmptyDashboard
                  icon={<WalletCards />}
                  title="Счета пока не добавлены"
                  description="После импорта первой выписки счета появятся здесь."
                />
              )}
            </section>

            <section aria-labelledby="month-title">
              <div className="mb-3 flex items-end justify-between gap-4">
                <div>
                  <h2
                    id="month-title"
                    className="text-lg font-semibold tracking-tight capitalize"
                  >
                    {monthLabel}
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    1–{today.getDate()} число
                  </p>
                </div>
                <span className="text-sm font-medium text-muted-foreground">
                  Текущий месяц
                </span>
              </div>
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <Metric
                  label="Доходы"
                  value={formatRubles(summary.income)}
                  icon={<ArrowDownRight />}
                  tone="income"
                />
                <Metric
                  label="Расходы"
                  value={formatRubles(-summary.expenses)}
                  icon={<ArrowUpRight />}
                  tone="expense"
                />
                <Metric
                  label="Остаток"
                  value={formatRubles(summary.net)}
                  icon={<ArrowDownRight />}
                  tone={summary.net >= 0 ? 'income' : 'expense'}
                />
                <Metric
                  label="Накоплено"
                  value={`${summary.savingsRate}%`}
                  icon={<TrendingUp />}
                  tone="primary"
                />
              </div>
            </section>

            <section className="grid gap-4 xl:grid-cols-[1.1fr_.9fr]">
              <article className="surface-card rounded-3xl border p-5 sm:p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-semibold tracking-tight">
                      Расходы по категориям
                    </h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Без переводов и исключённых операций
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon-lg"
                    aria-label="Открыть аналитику"
                    disabled
                  >
                    <ChevronRight aria-hidden="true" />
                  </Button>
                </div>
                {summary.categories.length ? (
                  <div className="mt-6 flex flex-col items-center gap-7 sm:flex-row sm:justify-around">
                    <div
                      className="relative grid size-44 shrink-0 place-items-center rounded-full"
                      style={{ background: donutBackground }}
                      aria-label={`Расходы ${formatRubles(-summary.expenses)}`}
                    >
                      <div className="grid size-28 place-items-center rounded-full bg-card text-center">
                        <div>
                          <p className="text-xs text-muted-foreground">Всего</p>
                          <p className="mt-1 font-semibold tabular-nums">
                            {formatRubles(-summary.expenses)}
                          </p>
                        </div>
                      </div>
                    </div>
                    <div className="w-full space-y-3">
                      {summary.categories.map((category, index) => (
                        <CategoryDot
                          key={category.name}
                          color={categoryColors[index]}
                          name={category.name}
                          value={formatRubles(-category.amount)}
                        />
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="mt-6 rounded-2xl bg-muted px-4 py-8 text-center text-sm text-muted-foreground">
                    За этот месяц расходов пока нет.
                  </p>
                )}
              </article>

              <article className="surface-card rounded-3xl border p-5 sm:p-6">
                <div className="flex items-center justify-between gap-4">
                  <h2 className="text-lg font-semibold tracking-tight">
                    Последние операции
                  </h2>
                  <Link
                    className="focus-ring min-h-11 rounded-xl px-3 py-3 text-sm font-semibold text-primary transition-colors hover:bg-primary/8"
                    href="/transactions"
                  >
                    Все
                  </Link>
                </div>
                {summary.recentTransactions.length ? (
                  <div className="mt-2 divide-y divide-border">
                    {summary.recentTransactions.map((transaction) => (
                      <div
                        key={transaction.id}
                        className="flex min-h-[76px] items-center gap-3 py-3"
                      >
                        <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-muted text-sm font-bold text-muted-foreground">
                          {transaction.merchant.slice(0, 1)}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium">
                            {transaction.merchant}
                          </p>
                          <p className="mt-0.5 truncate text-sm text-muted-foreground">
                            {formatTransactionDate(transaction.date)} ·{' '}
                            {transaction.category}
                          </p>
                        </div>
                        <p
                          className={`shrink-0 text-sm font-semibold tabular-nums ${transaction.amount > 0 ? 'text-emerald-600 dark:text-emerald-400' : ''}`}
                        >
                          {formatRubles(transaction.amount)}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-4 rounded-2xl bg-muted px-4 py-8 text-center text-sm text-muted-foreground">
                    Операций пока нет.
                  </p>
                )}
              </article>
            </section>
          </>
        )}
      </div>
    </AppShell>
  );
}

function buildDonutGradient(shares: number[]) {
  if (!shares.length) return 'var(--muted)';
  let offset = 0;
  const stops = shares.map((share, index) => {
    const start = offset;
    offset += share * 100;
    return `${categoryColors[index]} ${start}% ${offset}%`;
  });
  return `conic-gradient(${stops.join(', ')})`;
}

function LoadingDashboard() {
  return (
    <div
      className="surface-card grid min-h-72 place-items-center rounded-3xl border"
      aria-live="polite"
    >
      <div className="text-center">
        <Spinner className="mx-auto size-6" />
        <p className="mt-3 text-sm text-muted-foreground">
          Загружаем ваши финансы…
        </p>
      </div>
    </div>
  );
}

function EmptyDashboard({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="surface-card rounded-2xl border px-5 py-10 text-center">
      <span className="mx-auto grid size-11 place-items-center rounded-2xl bg-primary/10 text-primary [&_svg]:size-5">
        {icon}
      </span>
      <h3 className="mt-4 font-semibold">{title}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{description}</p>
    </div>
  );
}

function Metric({
  label,
  value,
  icon,
  tone,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  tone: 'income' | 'expense' | 'primary';
}) {
  const tones = {
    income: 'bg-emerald-500/12 text-emerald-600 dark:text-emerald-400',
    expense: 'bg-rose-500/12 text-rose-600 dark:text-rose-400',
    primary: 'bg-primary/12 text-primary',
  };
  return (
    <article className="surface-card rounded-2xl border p-4">
      <div
        className={`grid size-9 place-items-center rounded-xl [&_svg]:size-4 ${tones[tone]}`}
      >
        {icon}
      </div>
      <p className="mt-4 text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 text-[clamp(1.15rem,5vw,1.5rem)] font-semibold tracking-tight tabular-nums">
        {value}
      </p>
    </article>
  );
}

function CategoryDot({
  color,
  name,
  value,
}: {
  color: string;
  name: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-3 text-sm">
      <span
        className="size-2.5 rounded-full"
        style={{ backgroundColor: color }}
        aria-hidden="true"
      />
      <span className="flex-1 text-muted-foreground">{name}</span>
      <span className="font-medium tabular-nums">{value}</span>
    </div>
  );
}
