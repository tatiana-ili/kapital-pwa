'use client';

import Link from 'next/link';
import { useState, type SyntheticEvent } from 'react';
import { ChevronLeft, Pencil, Plus, Tags, Trash2, WandSparkles } from 'lucide-react';
import { AppShell } from '@/components/app-shell';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { categoriesForAmount } from '@/features/categories/defaults';
import type { CategoryDirection, FinanceCategory } from '@/features/categories/types';
import { useCategories } from '@/hooks/use-categories';

export default function CategoriesPage() {
  const {
    categories,
    rules,
    loading,
    error,
    createCategory,
    renameCategory,
    createRule,
    setRuleActive,
    deleteRule,
  } = useCategories();
  const [name, setName] = useState('');
  const [direction, setDirection] = useState<CategoryDirection>('expense');
  const [renameId, setRenameId] = useState<string | null>(null);
  const [renameName, setRenameName] = useState('');
  const [ruleField, setRuleField] = useState<'merchant' | 'description'>(
    'merchant',
  );
  const [ruleValue, setRuleValue] = useState('');
  const [ruleDirection, setRuleDirection] = useState<'expense' | 'income'>('expense');
  const [ruleTarget, setRuleTarget] = useState('Продукты');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const expenseCategories = categories.filter(
    (category) => category.direction !== 'income',
  );
  const incomeCategories = categories.filter(
    (category) => category.direction !== 'expense',
  );
  const targetNames = [
    ...new Set(
      categoriesForAmount(categories, ruleDirection === 'expense' ? -1 : 1)
        .map((category) => category.name),
    ),
  ];
  const selectedRuleTarget = targetNames.includes(ruleTarget)
    ? ruleTarget
    : targetNames[0] ?? '';

  async function addCategory(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim() || busy) return;
    setBusy(true);
    setMessage('');
    const saved = await createCategory(name, direction);
    if (saved) {
      setName('');
      setMessage('Категория создана.');
    }
    setBusy(false);
  }

  async function saveRename(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!renameId || !renameName.trim() || busy) return;
    setBusy(true);
    setMessage('');
    const saved = await renameCategory(renameId, renameName);
    if (saved) {
      setRenameId(null);
      setRenameName('');
      setMessage('Название обновлено во всех ваших операциях и правилах.');
    }
    setBusy(false);
  }

  async function addRule(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!ruleValue.trim() || !selectedRuleTarget || busy) return;
    setBusy(true);
    setMessage('');
    const saved = await createRule(ruleField, ruleValue, selectedRuleTarget, ruleDirection);
    if (saved) {
      setRuleValue('');
      setMessage('Правило сохранено и применено к уже загруженным операциям.');
    }
    setBusy(false);
  }

  async function changeRule(id: string, isActive: boolean) {
    if (busy) return;
    setBusy(true);
    setMessage('');
    const saved = await setRuleActive(id, isActive);
    if (saved) setMessage(
      isActive
        ? 'Правило включено и применено к уже загруженным операциям.'
        : 'Правило выключено. Уже назначенные категории сохранены.',
    );
    setBusy(false);
  }

  async function removeRule(id: string) {
    if (busy) return;
    setBusy(true);
    setMessage('');
    const saved = await deleteRule(id);
    if (saved) setMessage('Правило удалено. Уже назначенные категории сохранены.');
    setBusy(false);
  }

  function startRename(category: FinanceCategory) {
    setRenameId(category.id);
    setRenameName(category.name);
    setMessage('');
  }

  return (
    <AppShell>
      <section className="mx-auto max-w-5xl space-y-6">
        <div>
          <Link
            href="/more"
            className="focus-ring inline-flex min-h-11 items-center gap-1 rounded-xl px-3 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <ChevronLeft className="size-4" aria-hidden="true" /> Ещё
          </Link>
          <div className="mt-2 flex items-start gap-3">
            <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary">
              <Tags className="size-6" aria-hidden="true" />
            </span>
            <div>
              <h2 className="text-3xl font-semibold tracking-[-.04em]">
                Категории и правила
              </h2>
              <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                Настройте свои категории и научите приложение разбирать новые операции так, как удобно вам.
              </p>
              <a href="#new-rule" className="focus-ring mt-3 inline-flex min-h-11 items-center rounded-xl px-3 text-sm font-semibold text-primary hover:bg-primary/10">
                Перейти к правилам
              </a>
            </div>
          </div>
        </div>

        {loading && (
          <output className="flex items-center gap-2 rounded-2xl bg-muted p-4 text-sm">
            <Spinner className="size-4" /> Загружаем категории…
          </output>
        )}
        {error && (
          <p className="rounded-2xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive" role="alert">
            {error}
          </p>
        )}
        {message && (
          <output className="block rounded-2xl bg-emerald-500/10 p-4 text-sm text-emerald-700 dark:text-emerald-300">
            {message}
          </output>
        )}

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(280px,.9fr)]">
          <div className="space-y-5">
            <form onSubmit={(event) => void addCategory(event)} className="surface-card rounded-3xl border p-5 sm:p-6">
              <h3 className="text-lg font-semibold">Новая категория</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Стандартные категории доступны сразу. Свою можно переименовать позже.
              </p>
              <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_170px]">
                <label htmlFor="category-name" className="space-y-2 text-sm font-medium">
                  <span>Название</span>
                  <Input
                    id="category-name"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    maxLength={80}
                    placeholder="Например, Спорт"
                    className="h-12 rounded-xl text-base md:text-base"
                  />
                </label>
                <label className="space-y-2 text-sm font-medium">
                  <span>Для чего</span>
                  <select
                    value={direction}
                    onChange={(event) => setDirection(event.target.value as CategoryDirection)}
                    className="focus-ring min-h-12 w-full cursor-pointer rounded-xl border bg-background px-3 text-base"
                  >
                    <option value="expense">Расходы</option>
                    <option value="income">Доходы</option>
                    <option value="both">Расходы и доходы</option>
                  </select>
                </label>
              </div>
              <Button type="submit" disabled={busy || !name.trim()} className="mt-4 min-h-12 cursor-pointer">
                <Plus className="size-4" aria-hidden="true" /> Добавить категорию
              </Button>
            </form>

            <CategoryList
              title="Расходы"
              items={expenseCategories}
              renameId={renameId}
              renameName={renameName}
              busy={busy}
              onStartRename={startRename}
              onRenameName={setRenameName}
              onSaveRename={saveRename}
              onCancelRename={() => setRenameId(null)}
            />
            <CategoryList
              title="Доходы"
              items={incomeCategories}
              renameId={renameId}
              renameName={renameName}
              busy={busy}
              onStartRename={startRename}
              onRenameName={setRenameName}
              onSaveRename={saveRename}
              onCancelRename={() => setRenameId(null)}
            />
          </div>

          <div className="space-y-5">
            <form id="new-rule" onSubmit={(event) => void addRule(event)} className="surface-card scroll-mt-24 rounded-3xl border p-5 sm:p-6">
              <div className="flex items-center gap-2">
                <WandSparkles className="size-5 text-primary" aria-hidden="true" />
                <h3 className="text-lg font-semibold">Новое правило</h3>
              </div>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                Правила сразу применяются к уже загруженным операциям и к новым импортам.
              </p>
              <div className="mt-4 space-y-4">
                <label className="block space-y-2 text-sm font-medium">
                  <span>Где искать</span>
                  <select
                    value={ruleField}
                    onChange={(event) => setRuleField(event.target.value as 'merchant' | 'description')}
                    className="focus-ring min-h-12 w-full cursor-pointer rounded-xl border bg-background px-3 text-base"
                  >
                    <option value="merchant">Продавец или получатель</option>
                    <option value="description">Описание операции</option>
                  </select>
                </label>
                <label htmlFor="rule-value" className="block space-y-2 text-sm font-medium">
                  <span>Содержит текст</span>
                  <Input
                    id="rule-value"
                    value={ruleValue}
                    onChange={(event) => setRuleValue(event.target.value)}
                    maxLength={120}
                    placeholder="Например, Пятёрочка"
                    className="h-12 rounded-xl text-base md:text-base"
                  />
                </label>
                <label className="block space-y-2 text-sm font-medium">
                  <span>Для операций</span>
                  <select
                    value={ruleDirection}
                    onChange={(event) => {
                      setRuleDirection(event.target.value as 'expense' | 'income');
                      setRuleTarget('');
                    }}
                    className="focus-ring min-h-12 w-full cursor-pointer rounded-xl border bg-background px-3 text-base"
                  >
                    <option value="expense">Расходы</option>
                    <option value="income">Доходы</option>
                  </select>
                </label>
                <label className="block space-y-2 text-sm font-medium">
                  <span>Категория</span>
                  <select
                    value={selectedRuleTarget}
                    onChange={(event) => setRuleTarget(event.target.value)}
                    className="focus-ring min-h-12 w-full cursor-pointer rounded-xl border bg-background px-3 text-base"
                  >
                    {targetNames.map((target) => (
                      <option key={target} value={target}>{target}</option>
                    ))}
                  </select>
                </label>
              </div>
              <Button type="submit" disabled={busy || !ruleValue.trim() || !selectedRuleTarget} className="mt-4 min-h-12 cursor-pointer">
                <Plus className="size-4" aria-hidden="true" /> Создать правило
              </Button>
            </form>

            <div className="surface-card rounded-3xl border p-5 sm:p-6">
              <h3 className="text-lg font-semibold">Мои правила</h3>
              {rules.length ? (
                <ul className="mt-4 divide-y divide-border">
                  {rules.map((rule) => (
                    <li key={rule.id} className="py-4 first:pt-0 last:pb-0">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="break-words text-sm font-medium">{rule.name}</p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {rule.direction === 'expense' ? 'Расходы' : rule.direction === 'income' ? 'Доходы' : 'Все операции'} · → {rule.targetCategory}
                          </p>
                        </div>
                        <Badge variant={rule.isActive ? 'secondary' : 'outline'}>
                          {rule.isActive ? 'Включено' : 'Выключено'}
                        </Badge>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button
                          variant="outline"
                          className="min-h-11 cursor-pointer"
                          disabled={busy}
                          onClick={() => void changeRule(rule.id, !rule.isActive)}
                        >
                          {rule.isActive ? 'Выключить' : 'Включить'}
                        </Button>
                        <Button
                          variant="ghost"
                          className="min-h-11 cursor-pointer text-destructive"
                          disabled={busy}
                          onClick={() => void removeRule(rule.id)}
                        >
                          <Trash2 className="size-4" aria-hidden="true" /> Удалить
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                  Пока нет правил. Добавьте первое или измените категорию операции — приложение предложит создать правило автоматически.
                </p>
              )}
            </div>
          </div>
        </div>
      </section>
    </AppShell>
  );
}

function CategoryList({
  title,
  items,
  renameId,
  renameName,
  busy,
  onStartRename,
  onRenameName,
  onSaveRename,
  onCancelRename,
}: {
  title: string;
  items: FinanceCategory[];
  renameId: string | null;
  renameName: string;
  busy: boolean;
  onStartRename: (category: FinanceCategory) => void;
  onRenameName: (name: string) => void;
  onSaveRename: (event: SyntheticEvent<HTMLFormElement>) => void;
  onCancelRename: () => void;
}) {
  return (
    <div className="surface-card rounded-3xl border p-5 sm:p-6">
      <h3 className="text-lg font-semibold">{title}</h3>
      <ul className="mt-3 divide-y divide-border">
        {items.map((category) => (
          <li key={category.id} className="py-2 first:pt-0 last:pb-0">
            {renameId === category.id ? (
              <form onSubmit={onSaveRename} className="flex flex-wrap items-center gap-2">
                <label className="min-w-[160px] flex-1">
                  <span className="sr-only">Новое название категории {category.name}</span>
                  <Input
                    value={renameName}
                    onChange={(event) => onRenameName(event.target.value)}
                    maxLength={80}
                    className="h-11 rounded-xl"
                  />
                </label>
                <Button type="submit" disabled={busy || !renameName.trim()} className="min-h-11 cursor-pointer">Сохранить</Button>
                <Button type="button" variant="ghost" onClick={onCancelRename} className="min-h-11 cursor-pointer">Отмена</Button>
              </form>
            ) : (
              <div className="flex min-h-11 items-center justify-between gap-2">
                <span className="min-w-0 break-words text-sm font-medium">{category.name}</span>
                {category.isSystem ? (
                  <span className="text-xs text-muted-foreground">Стандартная</span>
                ) : (
                  <button
                    type="button"
                    onClick={() => onStartRename(category)}
                    className="focus-ring flex min-h-11 shrink-0 cursor-pointer items-center gap-1 rounded-xl px-3 text-xs font-medium text-primary hover:bg-primary/10"
                    aria-label={`Переименовать категорию ${category.name}`}
                  >
                    <Pencil className="size-4" aria-hidden="true" /> Изменить
                  </button>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
      {!items.length && <p className="mt-3 text-sm text-muted-foreground">Категорий пока нет.</p>}
    </div>
  );
}
