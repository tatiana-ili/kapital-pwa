'use client';

import { useMemo, useState } from 'react';
import {
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowUpRight,
  EyeOff,
  RefreshCw,
  Search,
  X,
} from 'lucide-react';
import { AppShell } from '@/components/app-shell';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { searchTransactions } from '@/features/search/transactions';
import { useFinanceData } from '@/hooks/use-finance-data';
import { formatRubles } from '@/lib/finance-data';

const PAGE_SIZE = 40;
const examples = ['Ozon', 'Яндекс', 'кофе', '1990'];
const neutralRubles = (amount: number) =>
  `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(amount)} ₽`;
const fullDate = (date: string) =>
  new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  })
    .format(new Date(`${date}T12:00:00Z`))
    .replace('.', '');

export default function SearchPage() {
  const { dataMode, error, loading, refresh, transactions } = useFinanceData({
    allTransactions: true,
  });
  const [query, setQuery] = useState('');
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const report = useMemo(
    () => searchTransactions(transactions, query),
    [transactions, query],
  );
  const hasQuery = Boolean(query.trim());

  function changeQuery(value: string) {
    setQuery(value);
    setVisibleCount(PAGE_SIZE);
  }

  return (
    <AppShell>
      <section className="mx-auto max-w-5xl space-y-6">
        <header className="flex items-start gap-3">
          <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary">
            <Search className="size-6" aria-hidden="true" />
          </span>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-3xl font-semibold tracking-[-.04em]">
                Поиск операций
              </h2>
              <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
                {dataMode === 'demo' ? 'Демо' : 'Supabase'}
              </span>
            </div>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              Поиск по всей истории: продавец, описание, категория, заметка или
              точная сумма.
            </p>
          </div>
        </header>

        <div className="surface-card rounded-3xl border p-4 sm:p-5">
          <label
            htmlFor="global-transaction-search"
            className="mb-2 block text-sm font-medium"
          >
            Что найти
          </label>
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3.5 top-1/2 size-5 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <input
              id="global-transaction-search"
              type="search"
              value={query}
              onChange={(event) => changeQuery(event.target.value)}
              autoComplete="off"
              placeholder="Например, Ozon или 2500"
              className="focus-ring min-h-12 w-full rounded-2xl border border-input bg-background pl-11 pr-12 text-base"
            />
            {query && (
              <button
                type="button"
                onClick={() => changeQuery('')}
                aria-label="Очистить поиск"
                className="focus-ring absolute right-1 top-1/2 grid size-11 -translate-y-1/2 cursor-pointer place-items-center rounded-xl text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <X className="size-4" aria-hidden="true" />
              </button>
            )}
          </div>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
            Можно объединить слова и сумму, например «Яндекс 1990». Для суммы с
            копейками используйте запятую.
          </p>
          {!hasQuery && (
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <span className="mr-1 text-xs text-muted-foreground">
                Попробуйте:
              </span>
              {examples.map((example) => (
                <button
                  key={example}
                  type="button"
                  onClick={() => changeQuery(example)}
                  className="focus-ring min-h-11 cursor-pointer rounded-xl bg-muted px-4 text-sm font-medium transition-colors hover:bg-primary/10 hover:text-primary"
                >
                  {example}
                </button>
              ))}
            </div>
          )}
        </div>

        {error && (
          <div
            role="alert"
            className="flex flex-col gap-3 rounded-2xl border border-destructive/30 bg-destructive/8 p-4 sm:flex-row sm:items-center"
          >
            <p className="flex-1 text-sm">{error}</p>
            <Button
              variant="outline"
              onClick={() => void refresh()}
              className="min-h-11"
            >
              <RefreshCw className="size-4" aria-hidden="true" /> Повторить
            </Button>
          </div>
        )}
        {loading && (
          <output className="flex items-center gap-2 rounded-2xl bg-muted p-4 text-sm text-muted-foreground">
            <Spinner className="size-4" /> Загружаем историю операций…
          </output>
        )}

        {hasQuery && !loading && !error && (
          <>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="surface-card rounded-3xl border p-5">
                <p className="text-sm text-muted-foreground">
                  Найдено операций
                </p>
                <strong className="mt-2 block text-2xl tabular-nums">
                  {report.matches.length}
                </strong>
              </div>
              <div className="surface-card rounded-3xl border p-5">
                <p className="text-sm text-muted-foreground">Расходы</p>
                <strong className="mt-2 block text-2xl tabular-nums">
                  {neutralRubles(report.expenses)}
                </strong>
              </div>
              <div className="surface-card rounded-3xl border p-5">
                <p className="text-sm text-muted-foreground">Доходы</p>
                <strong className="mt-2 block text-2xl tabular-nums">
                  {neutralRubles(report.income)}
                </strong>
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <output aria-live="polite" className="font-medium">
                Итого по найденным: {formatRubles(report.net)}
              </output>
              <span className="text-muted-foreground">
                В итогах не учитываются внутренние переводы и скрытые из
                аналитики операции.
              </span>
            </div>

            {report.matches.length ? (
              <div className="surface-card overflow-hidden rounded-3xl border">
                <div className="flex items-center justify-between gap-3 border-b px-4 py-3 text-sm sm:px-5">
                  <h3 className="font-semibold">Результаты</h3>
                  <span className="text-muted-foreground">
                    Показано {Math.min(visibleCount, report.matches.length)} из{' '}
                    {report.matches.length}
                  </span>
                </div>
                <div className="divide-y divide-border">
                  {report.matches.slice(0, visibleCount).map((transaction) => (
                    <article
                      key={transaction.id}
                      className="flex gap-3 px-4 py-4 sm:px-5"
                    >
                      <span
                        className={`grid size-10 shrink-0 place-items-center rounded-xl ${transaction.isTransfer ? 'bg-muted text-muted-foreground' : transaction.amount > 0 ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'bg-primary/10 text-primary'}`}
                      >
                        {transaction.isTransfer ? (
                          <ArrowLeftRight
                            className="size-5"
                            aria-hidden="true"
                          />
                        ) : transaction.amount > 0 ? (
                          <ArrowDownLeft
                            className="size-5"
                            aria-hidden="true"
                          />
                        ) : (
                          <ArrowUpRight className="size-5" aria-hidden="true" />
                        )}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
                          <h4 className="min-w-0 font-semibold break-words">
                            {transaction.merchant || 'Операция'}
                          </h4>
                          <span
                            className={`shrink-0 font-semibold tabular-nums ${transaction.amount > 0 ? 'text-emerald-600 dark:text-emerald-400' : ''}`}
                          >
                            {formatRubles(transaction.amount)}
                          </span>
                        </div>
                        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                          {fullDate(transaction.date)} · {transaction.category}{' '}
                          · {transaction.bank}
                        </p>
                        {transaction.description &&
                          transaction.description !== transaction.merchant && (
                            <p className="mt-1 text-sm leading-relaxed text-muted-foreground break-words">
                              {transaction.description}
                            </p>
                          )}
                        {transaction.note && (
                          <p className="mt-1 text-sm leading-relaxed break-words">
                            {transaction.note}
                          </p>
                        )}
                        {(transaction.isTransfer ||
                          transaction.excludedFromAnalytics) && (
                          <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-muted px-2 py-1 text-xs text-muted-foreground">
                            <EyeOff className="size-3" aria-hidden="true" /> Не
                            входит в итог
                          </span>
                        )}
                      </div>
                    </article>
                  ))}
                </div>
                {visibleCount < report.matches.length && (
                  <div className="border-t p-4 text-center">
                    <Button
                      variant="outline"
                      onClick={() =>
                        setVisibleCount((count) => count + PAGE_SIZE)
                      }
                      className="min-h-11"
                    >
                      Показать ещё
                    </Button>
                  </div>
                )}
              </div>
            ) : (
              <div className="rounded-3xl border border-dashed p-8 text-center">
                <Search
                  className="mx-auto size-8 text-muted-foreground"
                  aria-hidden="true"
                />
                <h3 className="mt-3 font-semibold">Ничего не найдено</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Проверьте написание или попробуйте другой запрос.
                </p>
              </div>
            )}
          </>
        )}
      </section>
    </AppShell>
  );
}
