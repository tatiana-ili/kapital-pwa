'use client';

import Link from 'next/link';
import { useMemo, useState, type SyntheticEvent } from 'react';
import { CalendarClock, ChevronLeft, Pencil, Plus, Trash2 } from 'lucide-react';
import { AppShell } from '@/components/app-shell';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import {
  addCadence,
  detectSubscriptions,
  planningRubles,
  yearlySubscriptionAmount,
} from '@/features/planning/calculations';
import type {
  Subscription,
  SubscriptionCadence,
} from '@/features/planning/types';
import { useFinanceData } from '@/hooks/use-finance-data';
import { usePlanning } from '@/hooks/use-planning';

const fieldClass =
  'focus-ring min-h-11 w-full rounded-xl border border-input bg-background px-3 text-sm';
const cadenceLabels: Record<SubscriptionCadence, string> = {
  weekly: 'Еженедельно',
  monthly: 'Ежемесячно',
  quarterly: 'Раз в квартал',
  yearly: 'Ежегодно',
  unknown: 'Неизвестно',
};
const displayDate = (date: string | null) =>
  date
    ? new Intl.DateTimeFormat('ru-RU').format(new Date(`${date}T12:00:00Z`))
    : 'Нет данных';
const keyOf = (merchant: string) =>
  merchant.trim().replace(/\s+/g, ' ').toLocaleLowerCase('ru');

export default function SubscriptionsPage() {
  const {
    transactions,
    loading: financeLoading,
    error: financeError,
  } = useFinanceData({ allTransactions: true });
  const {
    subscriptions,
    loading,
    error,
    saveSubscription,
    deleteSubscription,
  } = usePlanning();
  const detected = useMemo(
    () => detectSubscriptions(transactions),
    [transactions],
  );
  const rows = useMemo(() => {
    const savedKeys = new Set(
      subscriptions.map((item) => keyOf(item.merchant)),
    );
    const detectedByMerchant = new Map(
      detected.map((item) => [keyOf(item.merchant), item]),
    );
    return [
      ...subscriptions.map((item) => {
        const latest = detectedByMerchant.get(keyOf(item.merchant));
        if (
          !latest?.lastPaidAt ||
          (item.lastPaidAt && latest.lastPaidAt <= item.lastPaidAt)
        )
          return { ...item, detected: false };
        return {
          ...item,
          lastPaidAt: latest.lastPaidAt,
          nextExpectedAt: addCadence(latest.lastPaidAt, item.cadence),
          detected: false,
        };
      }),
      ...detected
        .filter((item) => !savedKeys.has(keyOf(item.merchant)))
        .map((item) => ({ ...item, detected: true })),
    ].sort(
      (a, b) =>
        Number(b.isActive) - Number(a.isActive) ||
        a.merchant.localeCompare(b.merchant, 'ru'),
    );
  }, [subscriptions, detected]);
  const yearly = rows
    .filter((row) => row.isActive)
    .reduce(
      (sum, row) => sum + yearlySubscriptionAmount(row.amount, row.cadence),
      0,
    );
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingMerchant, setEditingMerchant] = useState(false);
  const [merchant, setMerchant] = useState('');
  const [amount, setAmount] = useState('');
  const [cadence, setCadence] = useState<SubscriptionCadence>('monthly');
  const [lastPaidAt, setLastPaidAt] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  function reset() {
    setEditingId(null);
    setEditingMerchant(false);
    setMerchant('');
    setAmount('');
    setCadence('monthly');
    setLastPaidAt('');
  }

  function edit(item: Subscription) {
    setEditingId(item.id.startsWith('detected:') ? null : item.id);
    setEditingMerchant(true);
    setMerchant(item.merchant);
    setAmount(String(item.amount));
    setCadence(item.cadence);
    setLastPaidAt(item.lastPaidAt ?? '');
    setMessage('');
    document
      .getElementById('subscription-form')
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const lastPaidValue = new FormData(event.currentTarget).get('lastPaidAt');
    const enteredLastPaidAt =
      typeof lastPaidValue === 'string' ? lastPaidValue : '';
    const value = Number(amount.replace(',', '.'));
    if (
      !merchant.trim() ||
      merchant.trim().length > 120 ||
      !Number.isFinite(value) ||
      value <= 0 ||
      cadence === 'unknown'
    ) {
      setMessage('Укажите название, положительную сумму и периодичность.');
      return;
    }
    const existing = subscriptions.find(
      (item) => keyOf(item.merchant) === keyOf(merchant),
    );
    if (existing && existing.id !== editingId) {
      setMessage('Такая подписка уже сохранена. Измените её в списке.');
      return;
    }
    setBusy(true);
    setMessage('');
    const saved = await saveSubscription({
      ...(editingId ? { id: editingId } : {}),
      merchant: merchant.trim(),
      amount: value,
      cadence,
      lastPaidAt: enteredLastPaidAt || null,
      nextExpectedAt: enteredLastPaidAt
        ? addCadence(enteredLastPaidAt, cadence)
        : null,
      confidence: null,
      isActive: true,
    });
    if (saved) {
      reset();
      setMessage('Подписка сохранена.');
    }
    setBusy(false);
  }

  async function setActive(item: Subscription, isActive: boolean) {
    if (busy) return;
    setBusy(true);
    setMessage('');
    const saved = await saveSubscription({
      ...(item.id.startsWith('detected:') ? {} : { id: item.id }),
      merchant: item.merchant,
      amount: item.amount,
      cadence: item.cadence,
      lastPaidAt: item.lastPaidAt,
      nextExpectedAt: item.nextExpectedAt,
      confidence: item.confidence,
      isActive,
    });
    if (saved)
      setMessage(
        isActive
          ? 'Подписка снова учитывается.'
          : 'Платёж исключён из списка активных подписок.',
      );
    setBusy(false);
  }

  async function remove(id: string) {
    if (busy || !window.confirm('Удалить сохранённую подписку?')) return;
    setBusy(true);
    setMessage('');
    if (await deleteSubscription(id)) {
      if (editingId === id) reset();
      setMessage('Подписка удалена.');
    }
    setBusy(false);
  }

  return (
    <AppShell>
      <section className="mx-auto max-w-5xl space-y-6">
        <header>
          <Link
            href="/more"
            className="focus-ring inline-flex min-h-11 items-center gap-1 rounded-xl px-3 text-sm font-medium text-muted-foreground hover:bg-muted"
          >
            <ChevronLeft className="size-4" aria-hidden="true" /> Ещё
          </Link>
          <div className="mt-2 flex items-start gap-3">
            <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary">
              <CalendarClock className="size-6" aria-hidden="true" />
            </span>
            <div>
              <h2 className="text-3xl font-semibold tracking-[-.04em]">
                Подписки и регулярные расходы
              </h2>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                Повторяющиеся списания из выписок и добавленные вами платежи.
              </p>
            </div>
          </div>
        </header>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="surface-card rounded-3xl border p-5">
            <p className="text-sm text-muted-foreground">Активных платежей</p>
            <strong className="mt-2 block text-2xl">
              {rows.filter((row) => row.isActive).length}
            </strong>
          </div>
          <div className="surface-card rounded-3xl border p-5">
            <p className="text-sm text-muted-foreground">Всего в месяц</p>
            <strong className="mt-2 block text-2xl">
              {planningRubles(Math.round(yearly / 12))}
            </strong>
          </div>
          <div className="surface-card rounded-3xl border p-5">
            <p className="text-sm text-muted-foreground">Всего в год</p>
            <strong className="mt-2 block text-2xl">
              {planningRubles(yearly)}
            </strong>
          </div>
        </div>
        <p className="text-sm text-muted-foreground">
          Месячная сумма приведена к среднему за год. Обнаруженные платежи —
          предположение по истории операций; проверьте их перед планированием.
        </p>
        {(loading || financeLoading) && (
          <output className="flex items-center gap-2 text-sm text-muted-foreground">
            <Spinner className="size-4" /> Ищем регулярные расходы…
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
          id="subscription-form"
          onSubmit={submit}
          className="surface-card space-y-4 rounded-3xl border p-5"
        >
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-lg font-semibold">
              {editingMerchant ? 'Уточнить платёж' : 'Добавить платёж'}
            </h3>
            {editingMerchant && (
              <button
                type="button"
                onClick={reset}
                className="focus-ring min-h-11 rounded-xl px-3 text-sm text-muted-foreground hover:bg-muted"
              >
                Отменить
              </button>
            )}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label
                htmlFor="subscription-merchant"
                className="mb-2 block text-sm font-medium"
              >
                Название
              </label>
              <input
                id="subscription-merchant"
                value={merchant}
                onChange={(event) => setMerchant(event.target.value)}
                readOnly={editingMerchant}
                maxLength={120}
                required
                className={fieldClass}
              />
              {editingMerchant && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Название связано с операциями в выписке.
                </p>
              )}
            </div>
            <div>
              <label
                htmlFor="subscription-amount"
                className="mb-2 block text-sm font-medium"
              >
                Сумма платежа, ₽
              </label>
              <input
                id="subscription-amount"
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
            <div>
              <label
                htmlFor="subscription-cadence"
                className="mb-2 block text-sm font-medium"
              >
                Периодичность
              </label>
              <select
                id="subscription-cadence"
                value={cadence}
                onChange={(event) =>
                  setCadence(event.target.value as SubscriptionCadence)
                }
                className={fieldClass}
              >
                {cadence === 'unknown' && (
                  <option value="unknown" disabled>
                    Выберите периодичность
                  </option>
                )}
                {(['weekly', 'monthly', 'quarterly', 'yearly'] as const).map(
                  (value) => (
                    <option key={value} value={value}>
                      {cadenceLabels[value]}
                    </option>
                  ),
                )}
              </select>
            </div>
            <div>
              <label
                htmlFor="subscription-last"
                className="mb-2 block text-sm font-medium"
              >
                Последняя оплата, необязательно
              </label>
              <input
                id="subscription-last"
                name="lastPaidAt"
                type="date"
                value={lastPaidAt}
                onChange={(event) => setLastPaidAt(event.target.value)}
                className={fieldClass}
              />
            </div>
          </div>
          <Button type="submit" disabled={busy || loading} className="min-h-11">
            <Plus className="size-4" aria-hidden="true" /> Сохранить
          </Button>
        </form>
        <div className="space-y-3">
          <h3 className="text-xl font-semibold">Регулярные платежи</h3>
          {rows.length === 0 && !loading && !financeLoading && (
            <div className="rounded-3xl border border-dashed p-8 text-center text-sm text-muted-foreground">
              Регулярные списания пока не найдены. Нужны хотя бы три похожие
              оплаты через равные интервалы; платёж можно добавить вручную.
            </div>
          )}
          {rows.map((row) => (
            <article
              key={row.id}
              className="surface-card rounded-3xl border p-5"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h4 className="text-lg font-semibold">{row.merchant}</h4>
                    <span className="rounded-full bg-muted px-2 py-1 text-xs text-muted-foreground">
                      {row.detected
                        ? 'Обнаружено'
                        : row.isActive
                          ? 'Сохранено'
                          : 'Не подписка'}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {cadenceLabels[row.cadence]} · {planningRubles(row.amount)}{' '}
                    за платёж
                  </p>
                </div>
                <strong className="text-lg">
                  {planningRubles(
                    yearlySubscriptionAmount(row.amount, row.cadence),
                  )}
                  <span className="block text-right text-xs font-normal text-muted-foreground">
                    в год
                  </span>
                </strong>
              </div>
              <dl className="mt-4 grid gap-3 border-t pt-4 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-muted-foreground">Последняя оплата</dt>
                  <dd className="mt-1 font-medium">
                    {displayDate(row.lastPaidAt)}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">
                    Следующая предполагаемая
                  </dt>
                  <dd className="mt-1 font-medium">
                    {displayDate(row.nextExpectedAt)}
                  </dd>
                </div>
              </dl>
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => edit(row)}
                  className="focus-ring inline-flex min-h-11 items-center gap-2 rounded-xl border px-3 text-sm font-medium hover:bg-muted"
                >
                  <Pencil className="size-4" aria-hidden="true" /> Уточнить
                </button>
                <button
                  type="button"
                  onClick={() => void setActive(row, !row.isActive)}
                  disabled={busy}
                  className="focus-ring min-h-11 rounded-xl border px-3 text-sm font-medium hover:bg-muted"
                >
                  {row.isActive ? 'Не подписка' : 'Учитывать'}
                </button>
                {!row.detected && (
                  <button
                    type="button"
                    onClick={() => void remove(row.id)}
                    disabled={busy}
                    className="focus-ring inline-flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  >
                    <Trash2 className="size-4" aria-hidden="true" /> Удалить
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
      </section>
    </AppShell>
  );
}
