'use client';

import { useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  CalendarDays,
  FilterX,
  RefreshCw,
  TrendingUp,
} from 'lucide-react';
import { AppShell } from '@/components/app-shell';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import {
  buildAnalyticsReport,
  localToday,
  resolvePeriod,
  type AnalyticsFilters,
  type PeriodPreset,
} from '@/features/analytics/report';
import { useFinanceData } from '@/hooks/use-finance-data';
import {
  formatRubles,
  formatTransactionDate,
  type BankName,
} from '@/lib/finance-data';

const periods: Array<{ value: PeriodPreset; label: string }> = [
  { value: 'month', label: 'Месяц' },
  { value: '3m', label: '3 мес.' },
  { value: '6m', label: '6 мес.' },
  { value: '12m', label: 'Год' },
  { value: 'all', label: 'Всё' },
  { value: 'custom', label: 'Даты' },
];

const banks: BankName[] = ['Т-Банк', 'Сбер', 'Яндекс Банк', 'Ozon Банк'];
const inputClass =
  'focus-ring min-h-11 w-full min-w-0 rounded-xl border border-input bg-background px-3 text-sm text-foreground transition-colors hover:border-primary/50';

function monthLabel(month: string) {
  return new Intl.DateTimeFormat('ru-RU', {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  })
    .format(new Date(`${month}-01T12:00:00Z`))
    .replace('.', '');
}

function dateLabel(date: string) {
  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  })
    .format(new Date(`${date}T12:00:00Z`))
    .replace('.', '');
}

function changeLabel(current: number, previous: number) {
  if (previous === 0)
    return current === 0 ? 'Без изменений' : 'В прошлом месяце не было';
  const change = ((current - previous) / previous) * 100;
  return `${change > 0 ? '+' : change < 0 ? '−' : ''}${Math.abs(change).toLocaleString('ru-RU', { maximumFractionDigits: 1 })}% к прошлому месяцу`;
}

export default function AnalyticsPage() {
  const { accounts, dataMode, error, loading, refresh, transactions } =
    useFinanceData({
      allTransactions: true,
    });
  const [today] = useState(localToday);
  const [filters, setFilters] = useState<AnalyticsFilters>(() => ({
    preset: '6m',
    from: `${localToday().slice(0, 7)}-01`,
    to: localToday(),
    bank: 'all',
    accountId: 'all',
    category: 'all',
    merchant: '',
  }));

  const bankAccounts = accounts.filter(
    (account) => filters.bank === 'all' || account.bank === filters.bank,
  );
  const categories = useMemo(
    () =>
      [
        ...new Set(
          transactions
            .filter((item) => !item.isTransfer)
            .map((item) => item.category),
        ),
      ].sort((left, right) => left.localeCompare(right, 'ru-RU')),
    [transactions],
  );
  const period = resolvePeriod(filters, transactions, today);
  const invalidPeriod = !period.from || !period.to || period.from > period.to;
  const report = useMemo(
    () =>
      invalidPeriod ? null : buildAnalyticsReport(transactions, filters, today),
    [transactions, filters, today, invalidPeriod],
  );

  function choosePeriod(preset: PeriodPreset) {
    setFilters((current) => {
      if (preset === 'custom' && current.preset !== 'custom') {
        const range = resolvePeriod(current, transactions, today);
        return { ...current, preset, ...range };
      }
      return { ...current, preset };
    });
  }

  function resetFilters() {
    setFilters({
      preset: '6m',
      from: `${today.slice(0, 7)}-01`,
      to: today,
      bank: 'all',
      accountId: 'all',
      category: 'all',
      merchant: '',
    });
  }

  const maxMonthly = report
    ? Math.max(
        1,
        ...report.months.flatMap((month) => [month.income, month.expenses]),
      )
    : 1;
  const maxCategory = report?.categories[0]?.amount ?? 1;

  return (
    <AppShell>
      <div className="space-y-5 lg:space-y-7">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              Аналитика
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Доходы и расходы без переводов и скрытых операций
            </p>
          </div>
          <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
            {dataMode === 'demo' ? 'Демо' : 'Supabase'}
          </span>
        </div>

        {error && (
          <div
            role="alert"
            className="flex flex-wrap items-center gap-3 rounded-2xl border border-destructive/30 bg-destructive/8 p-4"
          >
            <AlertCircle
              className="size-5 shrink-0 text-destructive"
              aria-hidden="true"
            />
            <p className="flex-1 text-sm">{error}</p>
            <Button variant="outline" onClick={() => void refresh()}>
              <RefreshCw aria-hidden="true" /> Повторить
            </Button>
          </div>
        )}

        <section aria-label="Период анализа" className="space-y-3">
          <div className="flex gap-1.5 overflow-x-auto pb-1">
            {periods.map((period) => (
              <button
                key={period.value}
                type="button"
                onClick={() => choosePeriod(period.value)}
                aria-pressed={filters.preset === period.value}
                className={`focus-ring min-h-11 shrink-0 cursor-pointer rounded-xl border px-3.5 text-sm font-medium transition-colors ${filters.preset === period.value ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card text-muted-foreground hover:border-primary/50 hover:text-foreground'}`}
              >
                {period.label}
              </button>
            ))}
          </div>
          {filters.preset === 'custom' && (
            <div className="grid grid-cols-2 gap-3 rounded-2xl border bg-card p-3 sm:max-w-md">
              <label className="space-y-1 text-sm font-medium">
                <span>С</span>
                <input
                  type="date"
                  value={filters.from}
                  max={filters.to || today}
                  onChange={(event) =>
                    setFilters((current) => ({
                      ...current,
                      from: event.target.value,
                    }))
                  }
                  className={inputClass}
                />
              </label>
              <label className="space-y-1 text-sm font-medium">
                <span>По</span>
                <input
                  type="date"
                  value={filters.to}
                  min={filters.from}
                  max={today}
                  onChange={(event) =>
                    setFilters((current) => ({
                      ...current,
                      to: event.target.value,
                    }))
                  }
                  className={inputClass}
                />
              </label>
            </div>
          )}
          {invalidPeriod && (
            <p role="alert" className="text-sm text-destructive">
              Укажите корректный период: начальная дата должна быть не позже
              конечной.
            </p>
          )}
          {report && (
            <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <CalendarDays className="size-4" aria-hidden="true" />
              {dateLabel(report.from)} — {dateLabel(report.to)} ·{' '}
              {report.transactionCount} операций
            </p>
          )}
        </section>

        {loading ? (
          <output className="flex min-h-64 items-center justify-center gap-3 text-muted-foreground">
            <Spinner /> Загружаем аналитику…
          </output>
        ) : report ? (
          <>
            <section
              aria-label="Итоги периода"
              className="grid grid-cols-2 gap-3 xl:grid-cols-4"
            >
              <SummaryCard
                label="Доходы"
                value={formatRubles(report.income)}
                icon={<ArrowDownRight />}
                tone="income"
              />
              <SummaryCard
                label="Расходы"
                value={formatRubles(report.expenses)}
                icon={<ArrowUpRight />}
                tone="expense"
              />
              <SummaryCard
                label="Денежный поток"
                value={formatRubles(report.net)}
                icon={<BarChart3 />}
                tone={report.net >= 0 ? 'income' : 'expense'}
              />
              <SummaryCard
                label="Доля сбережений"
                value={`${report.savingsRate.toLocaleString('ru-RU', { maximumFractionDigits: 1 })}%`}
                icon={<TrendingUp />}
                tone="primary"
              />
            </section>

            <details className="surface-card group rounded-2xl border">
              <summary className="focus-ring flex min-h-12 cursor-pointer items-center justify-between gap-2 rounded-2xl px-4 text-sm font-semibold sm:px-5">
                Фильтры: банк, счёт, категория, продавец
                <span className="text-xs font-normal text-muted-foreground group-open:hidden">
                  Показать
                </span>
                <span className="hidden text-xs font-normal text-muted-foreground group-open:inline">
                  Скрыть
                </span>
              </summary>
              <div className="grid gap-3 border-t p-4 sm:grid-cols-2 sm:p-5 xl:grid-cols-4">
                <label className="space-y-1 text-sm font-medium">
                  <span>Банк</span>
                  <select
                    value={filters.bank}
                    onChange={(event) =>
                      setFilters((current) => ({
                        ...current,
                        bank: event.target.value as AnalyticsFilters['bank'],
                        accountId: 'all',
                      }))
                    }
                    className={inputClass}
                  >
                    <option value="all">Все банки</option>
                    {banks.map((bank) => (
                      <option key={bank} value={bank}>
                        {bank}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="space-y-1 text-sm font-medium">
                  <span>Счёт</span>
                  <select
                    value={filters.accountId}
                    onChange={(event) =>
                      setFilters((current) => ({
                        ...current,
                        accountId: event.target.value,
                      }))
                    }
                    className={inputClass}
                  >
                    <option value="all">Все счета</option>
                    {bankAccounts.map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.bank} · {account.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="space-y-1 text-sm font-medium">
                  <span>Категория</span>
                  <select
                    value={filters.category}
                    onChange={(event) =>
                      setFilters((current) => ({
                        ...current,
                        category: event.target.value,
                      }))
                    }
                    className={inputClass}
                  >
                    <option value="all">Все категории</option>
                    {categories.map((category) => (
                      <option key={category} value={category}>
                        {category}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="space-y-1 text-sm font-medium">
                  <span>Продавец</span>
                  <input
                    type="search"
                    value={filters.merchant}
                    onChange={(event) =>
                      setFilters((current) => ({
                        ...current,
                        merchant: event.target.value,
                      }))
                    }
                    placeholder="Например, Ozon"
                    className={inputClass}
                  />
                </label>
                <Button
                  variant="outline"
                  onClick={resetFilters}
                  className="sm:col-span-2 xl:col-span-4 xl:justify-self-start"
                >
                  <FilterX aria-hidden="true" /> Сбросить фильтры
                </Button>
              </div>
            </details>

            <div className="grid gap-4 xl:grid-cols-[1.05fr_.95fr]">
              <section
                className="surface-card rounded-3xl border p-5 sm:p-6"
                aria-labelledby="categories-title"
              >
                <h3 id="categories-title" className="text-lg font-semibold">
                  Расходы по категориям
                </h3>
                {report.categories.length ? (
                  <div className="mt-5 space-y-4">
                    {report.categories.map((category) => (
                      <div key={category.name}>
                        <div className="mb-1.5 flex items-baseline justify-between gap-3 text-sm">
                          <span className="min-w-0 truncate font-medium">
                            {category.name}
                          </span>
                          <span className="shrink-0 font-semibold tabular-nums">
                            {formatRubles(category.amount)}
                          </span>
                        </div>
                        <div
                          className="h-2.5 overflow-hidden rounded-full bg-muted"
                          aria-label={`${category.name}: ${(category.share * 100).toFixed(1)}% расходов`}
                        >
                          <div
                            className="h-full rounded-full bg-primary"
                            style={{
                              width: `${(category.amount / maxCategory) * 100}%`,
                            }}
                          />
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {(category.share * 100).toLocaleString('ru-RU', {
                            maximumFractionDigits: 1,
                          })}
                          % всех расходов
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <EmptyChart text="За выбранный период расходов нет." />
                )}
              </section>

              <section
                className="surface-card rounded-3xl border p-5 sm:p-6"
                aria-labelledby="months-title"
              >
                <h3 id="months-title" className="text-lg font-semibold">
                  Доходы и расходы по месяцам
                </h3>
                <div className="mt-2 flex flex-wrap gap-4 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <i className="size-2.5 rounded-full bg-emerald-500" />{' '}
                    Доходы
                  </span>
                  <span className="flex items-center gap-1.5">
                    <i className="size-2.5 rounded-full bg-primary" /> Расходы
                  </span>
                </div>
                {report.months.length ? (
                  <div className="mt-5 max-h-[32rem] space-y-4 overflow-y-auto pr-1">
                    {report.months.map((month) => (
                      <div
                        key={month.month}
                        className="grid grid-cols-[3.7rem_minmax(0,1fr)] items-center gap-2.5 sm:grid-cols-[4.5rem_minmax(0,1fr)]"
                      >
                        <span className="text-xs font-medium capitalize text-muted-foreground">
                          {monthLabel(month.month)}
                        </span>
                        <div className="min-w-0 space-y-1.5">
                          <MonthlyBar
                            amount={month.income}
                            max={maxMonthly}
                            tone="income"
                          />
                          <MonthlyBar
                            amount={month.expenses}
                            max={maxMonthly}
                            tone="expense"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <EmptyChart text="Нет операций для графика." />
                )}
              </section>
            </div>

            <section
              className="surface-card rounded-3xl border p-5 sm:p-6"
              aria-labelledby="comparison-title"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 id="comparison-title" className="text-lg font-semibold">
                  Месяц к месяцу
                </h3>
                <p className="text-xs text-muted-foreground">
                  1–{report.comparison.throughDay} число · те же фильтры,
                  включая прошлый месяц
                </p>
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <ComparisonCard
                  label="Расходы"
                  current={report.comparison.currentExpenses}
                  previous={report.comparison.previousExpenses}
                  currentMonth={report.comparison.currentMonth}
                  previousMonth={report.comparison.previousMonth}
                  increaseIsBad
                />
                <ComparisonCard
                  label="Доходы"
                  current={report.comparison.currentIncome}
                  previous={report.comparison.previousIncome}
                  currentMonth={report.comparison.currentMonth}
                  previousMonth={report.comparison.previousMonth}
                />
              </div>
            </section>

            <div className="grid gap-4 xl:grid-cols-[.72fr_1.28fr]">
              <section
                className="surface-card rounded-3xl border p-5 sm:p-6"
                aria-labelledby="averages-title"
              >
                <h3 id="averages-title" className="text-lg font-semibold">
                  Средние расходы
                </h3>
                <div className="mt-4 grid grid-cols-2 gap-3 xl:grid-cols-1">
                  <AverageCard label="В день" value={report.averagePerDay} />
                  <AverageCard label="В месяц" value={report.averagePerMonth} />
                </div>
                <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
                  Среднее за календарные дни и месяцы выбранного периода,
                  включая дни без операций.
                </p>
              </section>
              <section
                className="surface-card rounded-3xl border p-5 sm:p-6"
                aria-labelledby="largest-title"
              >
                <h3 id="largest-title" className="text-lg font-semibold">
                  Крупнейшие траты
                </h3>
                {report.largestExpenses.length ? (
                  <ol className="mt-3 divide-y divide-border">
                    {report.largestExpenses.map((item) => (
                      <li
                        key={item.id}
                        className="flex items-center justify-between gap-3 py-3"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold">
                            {item.merchant || item.description || 'Операция'}
                          </p>
                          <p className="mt-0.5 truncate text-xs text-muted-foreground">
                            {formatTransactionDate(item.date)} · {item.category}{' '}
                            · {item.bank}
                          </p>
                        </div>
                        <span className="shrink-0 text-sm font-semibold tabular-nums">
                          {formatRubles(item.amount)}
                        </span>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <EmptyChart text="Крупных трат пока нет." />
                )}
              </section>
            </div>
          </>
        ) : null}
      </div>
    </AppShell>
  );
}

function SummaryCard({
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
  const color =
    tone === 'income'
      ? 'text-emerald-600 dark:text-emerald-400'
      : tone === 'expense'
        ? 'text-rose-600 dark:text-rose-400'
        : 'text-primary';
  return (
    <article className="surface-card min-w-0 rounded-2xl border p-4 sm:p-5">
      <div className={`flex items-center gap-2 ${color}`}>
        <span className="size-4 [&>svg]:size-4">{icon}</span>
        <p className="text-xs font-medium sm:text-sm">{label}</p>
      </div>
      <p className="mt-3 break-words text-[clamp(1.15rem,4.4vw,1.8rem)] font-semibold leading-tight tracking-tight tabular-nums">
        {value}
      </p>
    </article>
  );
}

function MonthlyBar({
  amount,
  max,
  tone,
}: {
  amount: number;
  max: number;
  tone: 'income' | 'expense';
}) {
  return (
    <div
      className="flex min-w-0 items-center gap-2"
      title={`${tone === 'income' ? 'Доходы' : 'Расходы'}: ${formatRubles(amount)}`}
    >
      <div className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-muted">
        <div
          className={`h-full rounded-full ${tone === 'income' ? 'bg-emerald-500' : 'bg-primary'}`}
          style={{ width: `${(amount / max) * 100}%` }}
        />
      </div>
      <span className="w-[5.6rem] shrink-0 text-right text-[.68rem] font-medium tabular-nums sm:w-[6.5rem] sm:text-xs">
        {formatRubles(amount)}
      </span>
    </div>
  );
}

function ComparisonCard({
  label,
  current,
  previous,
  currentMonth,
  previousMonth,
  increaseIsBad = false,
}: {
  label: string;
  current: number;
  previous: number;
  currentMonth: string;
  previousMonth: string;
  increaseIsBad?: boolean;
}) {
  const increased = current > previous;
  const decreased = current < previous;
  const adverse = increaseIsBad ? increased : decreased;
  return (
    <article className="rounded-2xl bg-muted/65 p-4">
      <div className="flex items-center justify-between gap-3">
        <h4 className="text-sm font-semibold">{label}</h4>
        <span
          className={`text-xs font-medium ${increased || decreased ? (adverse ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400') : 'text-muted-foreground'}`}
        >
          {changeLabel(current, previous)}
        </span>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <div>
          <p className="text-xs capitalize text-muted-foreground">
            {monthLabel(previousMonth)}
          </p>
          <p className="mt-1 text-base font-semibold tabular-nums">
            {formatRubles(previous)}
          </p>
        </div>
        <div>
          <p className="text-xs capitalize text-muted-foreground">
            {monthLabel(currentMonth)}
          </p>
          <p className="mt-1 text-base font-semibold tabular-nums">
            {formatRubles(current)}
          </p>
        </div>
      </div>
    </article>
  );
}

function AverageCard({ label, value }: { label: string; value: number }) {
  return (
    <article className="rounded-2xl bg-muted/65 p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-2 text-xl font-semibold tabular-nums">
        {formatRubles(value)}
      </p>
    </article>
  );
}

function EmptyChart({ text }: { text: string }) {
  return (
    <p className="mt-5 rounded-2xl border border-dashed p-5 text-sm text-muted-foreground">
      {text}
    </p>
  );
}
