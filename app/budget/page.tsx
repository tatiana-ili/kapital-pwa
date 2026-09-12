'use client';

import { useMemo, useState, type SyntheticEvent } from 'react';
import { PiggyBank, Plus, Trash2 } from 'lucide-react';
import { AppShell } from '@/components/app-shell';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import {
  budgetProgress,
  localDateKey,
  planningRubles,
} from '@/features/planning/calculations';
import { useCategories } from '@/hooks/use-categories';
import { useFinanceData } from '@/hooks/use-finance-data';
import { usePlanning } from '@/hooks/use-planning';

const fieldClass =
  'focus-ring min-h-11 w-full rounded-xl border border-input bg-background px-3 text-sm';

export default function BudgetPage() {
  const {
    transactions,
    loading: financeLoading,
    error: financeError,
  } = useFinanceData({ allTransactions: true });
  const { categories, loading: categoriesLoading } = useCategories();
  const { budgets, loading, error, saveBudget, deleteBudget } = usePlanning();
  const [month, setMonth] = useState(() => localDateKey().slice(0, 7));
  const [category, setCategory] = useState('Продукты');
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const categoryNames = [
    ...new Set(
      categories
        .filter((item) => item.direction !== 'income')
        .map((item) => item.name),
    ),
  ];
  const selectedCategory = categoryNames.includes(category)
    ? category
    : (categoryNames[0] ?? '');
  const rows = useMemo(
    () =>
      budgets
        .filter((item) => item.month === month)
        .map((item) => ({
          ...item,
          ...budgetProgress(item, transactions),
        }))
        .sort((a, b) => b.percent - a.percent),
    [budgets, month, transactions],
  );
  const totalLimit = rows.reduce((sum, row) => sum + row.amount, 0);
  const totalSpent = rows.reduce((sum, row) => sum + row.spent, 0);

  async function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = Number(amount.replace(',', '.'));
    if (
      !selectedCategory ||
      !/^\d{4}-(0[1-9]|1[0-2])$/.test(month) ||
      !Number.isFinite(value) ||
      value <= 0
    ) {
      setMessage('Выберите категорию, месяц и положительный лимит.');
      return;
    }
    setBusy(true);
    setMessage('');
    const saved = await saveBudget({
      category: selectedCategory,
      month,
      amount: value,
    });
    if (saved) {
      setAmount('');
      setMessage('Лимит сохранён.');
    }
    setBusy(false);
  }

  async function remove(id: string) {
    if (busy || !window.confirm('Удалить лимит на этот месяц?')) return;
    setBusy(true);
    setMessage('');
    if (await deleteBudget(id)) setMessage('Лимит удалён.');
    setBusy(false);
  }

  return (
    <AppShell>
      <section className="mx-auto max-w-5xl space-y-6">
        <header className="flex items-start gap-3">
          <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary">
            <PiggyBank className="size-6" aria-hidden="true" />
          </span>
          <div>
            <h2 className="text-3xl font-semibold tracking-[-.04em]">Бюджет</h2>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              Месячные лимиты по категориям и фактические расходы.
            </p>
          </div>
        </header>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="surface-card rounded-3xl border p-5">
            <p className="text-sm text-muted-foreground">Запланировано</p>
            <strong className="mt-2 block text-2xl">
              {planningRubles(totalLimit)}
            </strong>
          </div>
          <div className="surface-card rounded-3xl border p-5">
            <p className="text-sm text-muted-foreground">Потрачено</p>
            <strong className="mt-2 block text-2xl">
              {planningRubles(totalSpent)}
            </strong>
          </div>
          <div className="surface-card rounded-3xl border p-5">
            <p className="text-sm text-muted-foreground">Осталось по лимитам</p>
            <strong className="mt-2 block text-2xl">
              {planningRubles(totalLimit - totalSpent)}
            </strong>
          </div>
        </div>
        {(loading || financeLoading || categoriesLoading) && (
          <output className="flex items-center gap-2 text-sm text-muted-foreground">
            <Spinner className="size-4" /> Загружаем данные…
          </output>
        )}
        {(error || financeError) && (
          <p
            role="alert"
            className="rounded-xl bg-destructive/10 p-4 text-sm text-destructive"
          >
            {error || financeError}
          </p>
        )}
        {message && (
          <output className="block text-sm text-primary">{message}</output>
        )}
        <form
          onSubmit={submit}
          className="surface-card grid gap-4 rounded-3xl border p-5 sm:grid-cols-[1fr_1.5fr_1fr_auto] sm:items-end"
        >
          <div>
            <label
              htmlFor="budget-month"
              className="mb-2 block text-sm font-medium"
            >
              Месяц
            </label>
            <input
              id="budget-month"
              type="month"
              value={month}
              onChange={(event) => setMonth(event.target.value)}
              required
              className={fieldClass}
            />
          </div>
          <div>
            <label
              htmlFor="budget-category"
              className="mb-2 block text-sm font-medium"
            >
              Категория
            </label>
            <select
              id="budget-category"
              value={selectedCategory}
              onChange={(event) => setCategory(event.target.value)}
              required
              className={fieldClass}
            >
              {categoryNames.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label
              htmlFor="budget-amount"
              className="mb-2 block text-sm font-medium"
            >
              Лимит, ₽
            </label>
            <input
              id="budget-amount"
              type="number"
              inputMode="decimal"
              min="0.01"
              step="0.01"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              required
              className={fieldClass}
            />
          </div>
          <Button
            type="submit"
            disabled={busy || loading || categoriesLoading || !selectedCategory}
            className="min-h-11"
          >
            <Plus className="size-4" aria-hidden="true" /> Сохранить
          </Button>
        </form>
        <div className="space-y-3">
          <h3 className="text-xl font-semibold">
            Лимиты за{' '}
            {/^\d{4}-(0[1-9]|1[0-2])$/.test(month)
              ? new Intl.DateTimeFormat('ru-RU', {
                  month: 'long',
                  year: 'numeric',
                }).format(new Date(`${month}-01T12:00:00Z`))
              : 'выбранный месяц'}
          </h3>
          {rows.length === 0 && !loading && (
            <div className="rounded-3xl border border-dashed p-8 text-center text-sm text-muted-foreground">
              Лимитов пока нет. Добавьте первый лимит выше.
            </div>
          )}
          {rows.map((row) => (
            <article
              key={row.id}
              className="surface-card rounded-3xl border p-5"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h4 className="font-semibold">{row.category}</h4>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {planningRubles(row.spent)} из {planningRubles(row.amount)}{' '}
                    · осталось {planningRubles(row.remaining)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void remove(row.id)}
                  disabled={busy}
                  aria-label={`Удалить лимит: ${row.category}`}
                  className="focus-ring grid size-11 shrink-0 place-items-center rounded-xl text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                >
                  <Trash2 className="size-4" aria-hidden="true" />
                </button>
              </div>
              <progress
                className="sr-only"
                value={Math.min(row.percent, 100)}
                max={100}
                aria-label={`Использование лимита: ${row.category}`}
              />
              <div
                className="mt-4 h-2.5 overflow-hidden rounded-full bg-muted"
                aria-hidden="true"
              >
                <div
                  className={`h-full rounded-full ${row.percent >= 100 ? 'bg-destructive' : row.percent >= 80 ? 'bg-chart-4' : 'bg-primary'}`}
                  style={{ width: `${Math.min(row.percent, 100)}%` }}
                />
              </div>
              <p
                className={`mt-2 text-sm font-medium ${row.percent >= 100 ? 'text-destructive' : row.percent >= 80 ? 'text-foreground' : 'text-muted-foreground'}`}
              >
                {row.percent >= 100
                  ? `Лимит превышен на ${planningRubles(-row.remaining)}`
                  : row.percent >= 80
                    ? `Близко к лимиту · ${row.percent}%`
                    : `Использовано ${row.percent}%`}
              </p>
            </article>
          ))}
        </div>
      </section>
    </AppShell>
  );
}
