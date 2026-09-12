'use client';

import Link from 'next/link';
import { useState, type SyntheticEvent } from 'react';
import {
  ChevronLeft,
  Goal as GoalIcon,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react';
import { AppShell } from '@/components/app-shell';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import {
  localDateKey,
  monthlyGoalContribution,
  planningRubles,
} from '@/features/planning/calculations';
import type { Goal } from '@/features/planning/types';
import { usePlanning } from '@/hooks/use-planning';

const fieldClass =
  'focus-ring min-h-11 w-full rounded-xl border border-input bg-background px-3 text-sm';

export default function GoalsPage() {
  const { goals, loading, error, saveGoal, deleteGoal } = usePlanning();
  const [today] = useState(localDateKey);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [target, setTarget] = useState('');
  const [current, setCurrent] = useState('0');
  const [targetDate, setTargetDate] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  function reset() {
    setEditingId(null);
    setName('');
    setTarget('');
    setCurrent('0');
    setTargetDate('');
  }

  function edit(goal: Goal) {
    setEditingId(goal.id);
    setName(goal.name);
    setTarget(String(goal.targetAmount));
    setCurrent(String(goal.currentAmount));
    setTargetDate(goal.targetDate ?? '');
    setMessage('');
    document
      .getElementById('goal-form')
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const dateValue = new FormData(event.currentTarget).get('targetDate');
    const enteredDate = typeof dateValue === 'string' ? dateValue : '';
    const targetAmount = Number(target.replace(',', '.'));
    const currentAmount = Number(current.replace(',', '.'));
    if (
      !name.trim() ||
      name.trim().length > 100 ||
      !Number.isFinite(targetAmount) ||
      targetAmount <= 0 ||
      !Number.isFinite(currentAmount) ||
      currentAmount < 0
    ) {
      setMessage(
        'Укажите название, положительную цель и неотрицательную накопленную сумму.',
      );
      return;
    }
    setBusy(true);
    setMessage('');
    const saved = await saveGoal({
      ...(editingId ? { id: editingId } : {}),
      name: name.trim(),
      targetAmount,
      currentAmount,
      targetDate: enteredDate || null,
    });
    if (saved) {
      reset();
      setMessage('Цель сохранена.');
    }
    setBusy(false);
  }

  async function remove(id: string) {
    if (busy || !window.confirm('Удалить финансовую цель?')) return;
    setBusy(true);
    setMessage('');
    if (await deleteGoal(id)) {
      if (editingId === id) reset();
      setMessage('Цель удалена.');
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
              <GoalIcon className="size-6" aria-hidden="true" />
            </span>
            <div>
              <h2 className="text-3xl font-semibold tracking-[-.04em]">
                Финансовые цели
              </h2>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                Планируйте накопления и отмечайте прогресс вручную.
              </p>
            </div>
          </div>
        </header>
        {loading && (
          <output className="flex items-center gap-2 text-sm text-muted-foreground">
            <Spinner className="size-4" /> Загружаем цели…
          </output>
        )}
        {error && (
          <p
            role="alert"
            className="rounded-xl bg-destructive/10 p-4 text-sm text-destructive"
          >
            {error}
          </p>
        )}
        {message && (
          <output className="block text-sm text-primary">{message}</output>
        )}
        <form
          id="goal-form"
          onSubmit={submit}
          className="surface-card space-y-4 rounded-3xl border p-5"
        >
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-lg font-semibold">
              {editingId ? 'Изменить цель' : 'Новая цель'}
            </h3>
            {editingId && (
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
            <div className="sm:col-span-2">
              <label
                htmlFor="goal-name"
                className="mb-2 block text-sm font-medium"
              >
                Название
              </label>
              <input
                id="goal-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={100}
                required
                placeholder="Например, отпуск"
                className={fieldClass}
              />
            </div>
            <div>
              <label
                htmlFor="goal-target"
                className="mb-2 block text-sm font-medium"
              >
                Целевая сумма, ₽
              </label>
              <input
                id="goal-target"
                type="number"
                inputMode="decimal"
                min="0.01"
                step="0.01"
                value={target}
                onChange={(event) => setTarget(event.target.value)}
                required
                className={fieldClass}
              />
            </div>
            <div>
              <label
                htmlFor="goal-current"
                className="mb-2 block text-sm font-medium"
              >
                Уже накоплено, ₽
              </label>
              <input
                id="goal-current"
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                value={current}
                onChange={(event) => setCurrent(event.target.value)}
                required
                className={fieldClass}
              />
            </div>
            <div>
              <label
                htmlFor="goal-date"
                className="mb-2 block text-sm font-medium"
              >
                Дата цели, необязательно
              </label>
              <input
                id="goal-date"
                name="targetDate"
                type="date"
                value={targetDate}
                onChange={(event) => setTargetDate(event.target.value)}
                className={fieldClass}
              />
            </div>
          </div>
          <Button type="submit" disabled={busy || loading} className="min-h-11">
            <Plus className="size-4" aria-hidden="true" />{' '}
            {editingId ? 'Сохранить изменения' : 'Добавить цель'}
          </Button>
        </form>
        <div className="space-y-3">
          <h3 className="text-xl font-semibold">Ваши цели</h3>
          {goals.length === 0 && !loading && (
            <div className="rounded-3xl border border-dashed p-8 text-center text-sm text-muted-foreground">
              Добавьте цель и укажите, сколько уже накоплено.
            </div>
          )}
          {goals.map((goal) => {
            const percent = Math.round(
              (goal.currentAmount / goal.targetAmount) * 100,
            );
            const contribution = monthlyGoalContribution(goal, today);
            return (
              <article
                key={goal.id}
                className="surface-card rounded-3xl border p-5"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h4 className="text-lg font-semibold">{goal.name}</h4>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {planningRubles(goal.currentAmount)} из{' '}
                      {planningRubles(goal.targetAmount)}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <button
                      type="button"
                      onClick={() => edit(goal)}
                      aria-label={`Изменить цель: ${goal.name}`}
                      className="focus-ring grid size-11 place-items-center rounded-xl text-muted-foreground hover:bg-muted hover:text-foreground"
                    >
                      <Pencil className="size-4" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={() => void remove(goal.id)}
                      disabled={busy}
                      aria-label={`Удалить цель: ${goal.name}`}
                      className="focus-ring grid size-11 place-items-center rounded-xl text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    >
                      <Trash2 className="size-4" aria-hidden="true" />
                    </button>
                  </div>
                </div>
                <progress
                  className="sr-only"
                  value={Math.min(percent, 100)}
                  max={100}
                  aria-label={`Прогресс цели: ${goal.name}`}
                />
                <div
                  className="mt-4 h-2.5 overflow-hidden rounded-full bg-muted"
                  aria-hidden="true"
                >
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${Math.min(percent, 100)}%` }}
                  />
                </div>
                <div className="mt-3 flex flex-wrap justify-between gap-2 text-sm">
                  <span className="font-medium">{percent}% накоплено</span>
                  <span className="text-muted-foreground">
                    {goal.targetDate
                      ? `К ${new Intl.DateTimeFormat('ru-RU').format(new Date(`${goal.targetDate}T12:00:00Z`))}`
                      : 'Без даты'}
                  </span>
                </div>
                {goal.currentAmount >= goal.targetAmount ? (
                  <p className="mt-2 text-sm font-medium text-primary">
                    Цель достигнута
                  </p>
                ) : contribution !== null ? (
                  <p className="mt-2 text-sm text-muted-foreground">
                    Нужно откладывать около {planningRubles(contribution)} в
                    месяц
                  </p>
                ) : goal.targetDate && goal.targetDate < today ? (
                  <p className="mt-2 text-sm text-destructive">
                    Дата цели прошла — обновите план
                  </p>
                ) : null}
              </article>
            );
          })}
        </div>
      </section>
    </AppShell>
  );
}
