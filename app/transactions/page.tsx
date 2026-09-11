'use client';

import { useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowUpRight,
  Check,
  EyeOff,
  RefreshCw,
  Search,
  SlidersHorizontal,
} from 'lucide-react';
import { AppShell } from '@/components/app-shell';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Spinner } from '@/components/ui/spinner';
import { useFinanceData } from '@/hooks/use-finance-data';
import {
  formatRubles,
  formatTransactionDate,
  type FinanceTransaction,
} from '@/lib/finance-data';
import { saveTransactionChanges } from '@/lib/supabase/finance';

const bankFilters = [
  'Все банки',
  'Т-Банк',
  'Сбер',
  'Яндекс Банк',
  'Ozon Банк',
] as const;
const categories = [
  'Продукты',
  'Кафе и рестораны',
  'Такси',
  'Маркетплейсы',
  'Подписки',
  'Переводы',
  'Прочее',
];

export default function TransactionsPage() {
  const {
    client,
    dataMode,
    error,
    loading,
    refresh,
    replaceTransaction,
    transactions,
  } = useFinanceData();
  const [query, setQuery] = useState('');
  const [bank, setBank] = useState<(typeof bankFilters)[number]>('Все банки');
  const [selected, setSelected] = useState<FinanceTransaction | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');
  const [saveError, setSaveError] = useState('');

  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('ru');
    return transactions.filter((transaction) => {
      const bankMatches = bank === 'Все банки' || transaction.bank === bank;
      const textMatches =
        !normalized ||
        [
          transaction.merchant,
          transaction.description,
          transaction.category,
          transaction.bank,
          String(Math.abs(transaction.amount)),
        ].some((value) => value.toLocaleLowerCase('ru').includes(normalized));
      return bankMatches && textMatches;
    });
  }, [bank, query, transactions]);

  const total = filtered.reduce(
    (sum, transaction) =>
      transaction.isTransfer || transaction.excludedFromAnalytics
        ? sum
        : sum + transaction.amount,
    0,
  );

  async function updateSelected(changes: Partial<FinanceTransaction>) {
    if (!selected || saving) return;
    const optimistic = { ...selected, ...changes };
    setSaveError('');
    setSaveMessage('');

    if (!client) {
      replaceTransaction(optimistic);
      setSelected(optimistic);
      setSaveMessage('Изменение сохранено в деморежиме на этом устройстве.');
      return;
    }

    setSaving(true);
    try {
      const persisted = await saveTransactionChanges(
        client,
        selected.id,
        changes,
      );
      replaceTransaction(persisted);
      setSelected(persisted);
      setSaveMessage('Изменение сохранено в Supabase.');
    } catch {
      setSaveError(
        'Не удалось сохранить изменение. Проверьте соединение и повторите попытку.',
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppShell>
      <section className="space-y-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <p className="text-sm font-medium text-primary">История</p>
              <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
                {dataMode === 'demo' ? 'Демо' : 'Supabase'}
              </span>
            </div>
            <h2 className="mt-1 text-3xl font-semibold tracking-[-.04em]">
              Операции
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {transactions.length}{' '}
              {dataMode === 'demo'
                ? 'демо-операций'
                : 'операций в защищённой базе'}
            </p>
          </div>
          <div className="surface-card rounded-2xl border px-4 py-3 sm:text-right">
            <p className="text-xs text-muted-foreground">Итого по выборке</p>
            <p
              className={`mt-1 text-lg font-semibold tabular-nums ${total >= 0 ? 'text-emerald-600 dark:text-emerald-400' : ''}`}
            >
              {formatRubles(total)}
            </p>
          </div>
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
              <p className="text-sm">{error}</p>
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

        <div className="surface-card rounded-3xl border p-3 sm:p-4">
          <div className="relative block">
            <label className="sr-only" htmlFor="transaction-search">
              Поиск по операциям
            </label>
            <Search
              className="pointer-events-none absolute left-3.5 top-1/2 size-5 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              id="transaction-search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="h-12 rounded-2xl pl-11 pr-4 text-base md:text-base"
              placeholder="Магазин, категория или сумма"
              type="search"
            />
          </div>
          <div
            className="mt-3 flex gap-2 overflow-x-auto pb-1"
            aria-label="Фильтр по банку"
          >
            {bankFilters.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setBank(item)}
                className={`focus-ring min-h-11 shrink-0 cursor-pointer rounded-xl px-4 text-sm font-medium transition-colors ${bank === item ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'}`}
              >
                {item}
              </button>
            ))}
          </div>
        </div>

        <div className="surface-card overflow-hidden rounded-3xl border">
          <div className="flex items-center justify-between border-b px-4 py-3 sm:px-5">
            <p className="text-sm font-medium">Найдено: {filtered.length}</p>
            <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <SlidersHorizontal className="size-3.5" aria-hidden="true" />
              Переводы исключены из итога
            </span>
          </div>
          {loading ? (
            <div
              className="grid min-h-56 place-items-center"
              aria-live="polite"
            >
              <div className="text-center">
                <Spinner className="mx-auto size-6" />
                <p className="mt-3 text-sm text-muted-foreground">
                  Загружаем операции…
                </p>
              </div>
            </div>
          ) : filtered.length ? (
            <div className="divide-y divide-border">
              {filtered.map((transaction) => (
                <TransactionRow
                  key={transaction.id}
                  transaction={transaction}
                  onSelect={() => {
                    setSelected(transaction);
                    setSaveError('');
                    setSaveMessage('');
                  }}
                />
              ))}
            </div>
          ) : (
            <div className="px-6 py-16 text-center">
              <Search
                className="mx-auto size-8 text-muted-foreground"
                aria-hidden="true"
              />
              <h3 className="mt-4 font-semibold">Ничего не найдено</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Попробуйте другой запрос или выберите все банки.
              </p>
            </div>
          )}
        </div>
      </section>

      <Sheet
        open={Boolean(selected)}
        onOpenChange={(open) => {
          if (!open && !saving) setSelected(null);
        }}
      >
        <SheetContent
          side="right"
          className="w-[min(92vw,430px)] sm:max-w-[430px]"
        >
          {selected && (
            <>
              <SheetHeader className="border-b px-5 pb-5 pt-6">
                <SheetTitle className="pr-10 text-xl">
                  {selected.merchant}
                </SheetTitle>
                <SheetDescription>
                  {formatTransactionDate(selected.date)} · {selected.bank}
                </SheetDescription>
                <p
                  className={`pt-3 text-3xl font-semibold tracking-tight tabular-nums ${selected.amount > 0 ? 'text-emerald-600 dark:text-emerald-400' : ''}`}
                >
                  {formatRubles(selected.amount)}
                </p>
              </SheetHeader>
              <div className="flex-1 space-y-5 overflow-y-auto px-5 py-2">
                <Detail label="Категория">
                  <select
                    aria-label="Категория"
                    value={selected.category}
                    disabled={saving}
                    onChange={(event) =>
                      void updateSelected({ category: event.target.value })
                    }
                    className="focus-ring min-h-11 w-full cursor-pointer rounded-xl border bg-background px-3 text-base disabled:cursor-wait disabled:opacity-60"
                  >
                    {[
                      selected.category,
                      ...categories.filter(
                        (category) => category !== selected.category,
                      ),
                    ].map((category) => (
                      <option key={category}>{category}</option>
                    ))}
                  </select>
                </Detail>
                <Detail label="Описание">
                  <p>{selected.description}</p>
                </Detail>
                <Detail label="Счёт">
                  <p>{selected.accountId}</p>
                </Detail>
                <div className="space-y-2">
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => {
                      const isTransfer = !selected.isTransfer;
                      void updateSelected({
                        isTransfer,
                        transactionType: isTransfer
                          ? 'transfer'
                          : selected.amount > 0
                            ? 'income'
                            : 'expense',
                        excludedFromAnalytics: isTransfer,
                      });
                    }}
                    className="focus-ring flex min-h-12 w-full cursor-pointer items-center gap-3 rounded-xl border px-3 text-left transition-colors hover:bg-muted disabled:cursor-wait disabled:opacity-60"
                  >
                    <ArrowLeftRight
                      className="size-5 text-primary"
                      aria-hidden="true"
                    />
                    <span className="flex-1 text-sm font-medium">
                      Перевод между своими счетами
                    </span>
                    {selected.isTransfer && (
                      <Check
                        className="size-4 text-emerald-500"
                        aria-hidden="true"
                      />
                    )}
                  </button>
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() =>
                      void updateSelected({
                        excludedFromAnalytics: !selected.excludedFromAnalytics,
                      })
                    }
                    className="focus-ring flex min-h-12 w-full cursor-pointer items-center gap-3 rounded-xl border px-3 text-left transition-colors hover:bg-muted disabled:cursor-wait disabled:opacity-60"
                  >
                    <EyeOff
                      className="size-5 text-muted-foreground"
                      aria-hidden="true"
                    />
                    <span className="flex-1 text-sm font-medium">
                      Не учитывать в аналитике
                    </span>
                    {selected.excludedFromAnalytics && (
                      <Check
                        className="size-4 text-emerald-500"
                        aria-hidden="true"
                      />
                    )}
                  </button>
                </div>
                {saving && (
                  <output className="flex items-center gap-2 rounded-xl bg-muted px-3 py-3 text-sm">
                    <Spinner className="size-4" /> Сохраняем…
                  </output>
                )}
                {saveMessage && (
                  <output className="block rounded-xl bg-emerald-500/10 px-3 py-3 text-sm text-emerald-700 dark:text-emerald-300">
                    {saveMessage}
                  </output>
                )}
                {saveError && (
                  <p
                    className="rounded-xl bg-destructive/10 px-3 py-3 text-sm text-destructive"
                    role="alert"
                  >
                    {saveError}
                  </p>
                )}
                <p className="rounded-xl bg-muted px-3 py-3 text-xs leading-relaxed text-muted-foreground">
                  {dataMode === 'demo'
                    ? 'В деморежиме изменения хранятся только до закрытия приложения.'
                    : 'Изменения сохраняются в вашей защищённой базе Supabase.'}
                </p>
              </div>
              <SheetFooter className="border-t p-5">
                <Button
                  className="min-h-12 w-full"
                  disabled={saving}
                  onClick={() => setSelected(null)}
                >
                  Готово
                </Button>
              </SheetFooter>
            </>
          )}
        </SheetContent>
      </Sheet>
    </AppShell>
  );
}

function TransactionRow({
  transaction,
  onSelect,
}: {
  transaction: FinanceTransaction;
  onSelect: () => void;
}) {
  const Icon = transaction.isTransfer
    ? ArrowLeftRight
    : transaction.amount > 0
      ? ArrowDownLeft
      : ArrowUpRight;
  return (
    <button
      type="button"
      onClick={onSelect}
      className="focus-ring flex min-h-[82px] w-full cursor-pointer items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/60 sm:px-5"
    >
      <span
        className={`grid size-11 shrink-0 place-items-center rounded-2xl ${transaction.amount > 0 ? 'bg-emerald-500/12 text-emerald-600 dark:text-emerald-400' : transaction.isTransfer ? 'bg-primary/12 text-primary' : 'bg-muted text-muted-foreground'}`}
      >
        <Icon className="size-5" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <strong className="truncate text-sm sm:text-base">
            {transaction.merchant}
          </strong>
          {transaction.isRecurring && (
            <Badge variant="secondary" className="hidden sm:inline-flex">
              Регулярный
            </Badge>
          )}
        </span>
        <span className="mt-1 block truncate text-xs text-muted-foreground sm:text-sm">
          {formatTransactionDate(transaction.date)} · {transaction.category} ·{' '}
          {transaction.bank}
        </span>
      </span>
      <span
        className={`shrink-0 text-sm font-semibold tabular-nums sm:text-base ${transaction.amount > 0 ? 'text-emerald-600 dark:text-emerald-400' : ''}`}
      >
        {formatRubles(transaction.amount)}
      </span>
    </button>
  );
}

function Detail({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-[.1em] text-muted-foreground">
        {label}
      </p>
      {children}
    </div>
  );
}
