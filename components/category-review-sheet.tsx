'use client';

import { useMemo, useState } from 'react';
import { ArrowLeftRight, Check, ListFilter, Plus, Search } from 'lucide-react';
import { categoriesForAmount } from '@/features/categories/defaults';
import {
  transactionCanBeAddedToTarget,
  transactionMatchesReviewTarget,
  type CategoryReviewTarget,
} from '@/features/categories/review';
import type { FinanceCategory } from '@/features/categories/types';
import {
  formatRubles,
  formatTransactionDate,
  type FinanceTransaction,
} from '@/lib/finance-data';
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

const INITIAL_VISIBLE_COUNT = 40;

type ReviewMode = 'included' | 'available';

type CategoryReviewSheetProps = {
  target: CategoryReviewTarget;
  categories: FinanceCategory[];
  transactions: FinanceTransaction[];
  loading: boolean;
  savingId: string | null;
  error: string;
  message: string;
  onClose: () => void;
  onMoveToCategory: (transaction: FinanceTransaction, category: string) => void;
  onSetOwnTransfer: (
    transaction: FinanceTransaction,
    isTransfer: boolean,
  ) => void;
};

function targetTitle(target: CategoryReviewTarget) {
  return target.kind === 'own-transfers'
    ? 'Переводы между своими счетами'
    : target.category.name;
}

export function CategoryReviewSheet({
  target,
  categories,
  transactions,
  loading,
  savingId,
  error,
  message,
  onClose,
  onMoveToCategory,
  onSetOwnTransfer,
}: CategoryReviewSheetProps) {
  const [mode, setMode] = useState<ReviewMode>('included');
  const [query, setQuery] = useState('');
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE_COUNT);

  const includedCount = useMemo(
    () =>
      transactions.filter((transaction) =>
        transactionMatchesReviewTarget(transaction, target),
      ).length,
    [target, transactions],
  );

  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('ru');
    return transactions.filter((transaction) => {
      const matchesMode =
        mode === 'included'
          ? transactionMatchesReviewTarget(transaction, target)
          : transactionCanBeAddedToTarget(transaction, target);
      if (!matchesMode) return false;
      if (!normalized) return true;
      return [
        transaction.merchant,
        transaction.description,
        transaction.category,
        transaction.bank,
        transaction.accountId,
        String(Math.abs(transaction.amount)),
      ].some((value) => value.toLocaleLowerCase('ru').includes(normalized));
    });
  }, [mode, query, target, transactions]);

  const visibleTransactions = filtered.slice(0, visibleCount);
  const title = targetTitle(target);
  const availableLabel =
    target.kind === 'own-transfers'
      ? 'Отметить переводом'
      : 'Добавить операции';

  return (
    <Sheet
      open
      onOpenChange={(open) => {
        if (!open && !savingId) onClose();
      }}
    >
      <SheetContent
        side="right"
        showCloseButton={false}
        className="data-[side=right]:w-[94vw] data-[side=right]:sm:max-w-[520px] gap-0"
      >
        <>
          <SheetHeader className="border-b px-4 pb-4 pt-5 sm:px-5">
            <div className="flex items-start gap-3 pr-2">
              <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary">
                {target.kind === 'own-transfers' ? (
                  <ArrowLeftRight className="size-5" aria-hidden="true" />
                ) : (
                  <ListFilter className="size-5" aria-hidden="true" />
                )}
              </span>
              <div className="min-w-0">
                <SheetTitle className="text-xl">{title}</SheetTitle>
                <SheetDescription className="mt-1 leading-relaxed">
                  {target.kind === 'own-transfers'
                    ? 'Эти операции исключены из доходов и расходов.'
                    : target.category.name === 'Переводы'
                      ? 'Это категория операций. Собственные переводы проверяются отдельно.'
                      : 'Проверьте состав категории или добавьте в неё операции.'}
                </SheetDescription>
              </div>
            </div>
          </SheetHeader>

          <div className="border-b px-4 py-4 sm:px-5">
            <fieldset className="grid grid-cols-2 gap-2 rounded-2xl bg-muted p-1">
              <legend className="sr-only">Режим проверки</legend>
              <button
                type="button"
                aria-pressed={mode === 'included'}
                onClick={() => {
                  setMode('included');
                  setVisibleCount(INITIAL_VISIBLE_COUNT);
                }}
                className={`focus-ring min-h-11 cursor-pointer rounded-xl px-3 text-sm font-medium transition-colors ${
                  mode === 'included'
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {target.kind === 'own-transfers' ? 'Отмечено' : 'В категории'}:{' '}
                {includedCount}
              </button>
              <button
                type="button"
                aria-pressed={mode === 'available'}
                onClick={() => {
                  setMode('available');
                  setVisibleCount(INITIAL_VISIBLE_COUNT);
                }}
                className={`focus-ring min-h-11 cursor-pointer rounded-xl px-3 text-sm font-medium transition-colors ${
                  mode === 'available'
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {availableLabel}
              </button>
            </fieldset>

            <div className="relative mt-3">
              <label htmlFor="category-review-search" className="sr-only">
                Поиск операций
              </label>
              <Search
                className="pointer-events-none absolute left-3.5 top-1/2 size-5 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                id="category-review-search"
                type="search"
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setVisibleCount(INITIAL_VISIBLE_COUNT);
                }}
                placeholder="Продавец, банк или сумма"
                className="h-12 rounded-2xl pl-11 text-base md:text-base"
              />
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">
            {error && (
              <p
                className="mb-3 rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-3 text-sm text-destructive"
                role="alert"
              >
                {error}
              </p>
            )}
            {message && (
              <output className="mb-3 block rounded-xl bg-emerald-500/10 px-3 py-3 text-sm text-emerald-700 dark:text-emerald-300">
                {message}
              </output>
            )}

            {loading ? (
              <div
                className="grid min-h-52 place-items-center"
                aria-live="polite"
              >
                <div className="text-center">
                  <Spinner className="mx-auto size-6" />
                  <p className="mt-3 text-sm text-muted-foreground">
                    Загружаем операции…
                  </p>
                </div>
              </div>
            ) : visibleTransactions.length ? (
              <div className="space-y-3">
                {visibleTransactions.map((transaction) => (
                  <ReviewTransaction
                    key={transaction.id}
                    transaction={transaction}
                    target={target}
                    categories={categories}
                    included={mode === 'included'}
                    saving={savingId === transaction.id}
                    disabled={Boolean(savingId)}
                    onMoveToCategory={onMoveToCategory}
                    onSetOwnTransfer={onSetOwnTransfer}
                  />
                ))}
                {visibleCount < filtered.length && (
                  <Button
                    type="button"
                    variant="outline"
                    className="min-h-12 w-full cursor-pointer"
                    onClick={() =>
                      setVisibleCount(
                        (current) => current + INITIAL_VISIBLE_COUNT,
                      )
                    }
                  >
                    Показать ещё{' '}
                    {Math.min(
                      INITIAL_VISIBLE_COUNT,
                      filtered.length - visibleCount,
                    )}
                  </Button>
                )}
              </div>
            ) : (
              <div className="px-3 py-14 text-center">
                {mode === 'included' ? (
                  <Check
                    className="mx-auto size-8 text-muted-foreground"
                    aria-hidden="true"
                  />
                ) : (
                  <Search
                    className="mx-auto size-8 text-muted-foreground"
                    aria-hidden="true"
                  />
                )}
                <h3 className="mt-4 font-semibold">
                  {query
                    ? 'Ничего не найдено'
                    : mode === 'included'
                      ? 'Операций пока нет'
                      : 'Все подходящие операции уже добавлены'}
                </h3>
                <p className="mx-auto mt-1 max-w-sm text-sm leading-relaxed text-muted-foreground">
                  {query
                    ? 'Измените запрос и попробуйте снова.'
                    : mode === 'included'
                      ? `Откройте «${availableLabel}», чтобы изменить состав.`
                      : 'Для этой категории больше нет подходящих операций.'}
                </p>
              </div>
            )}
          </div>

          <SheetFooter className="border-t p-4 sm:p-5">
            <Button
              type="button"
              className="min-h-12 w-full cursor-pointer"
              disabled={Boolean(savingId)}
              onClick={onClose}
            >
              Готово
            </Button>
          </SheetFooter>
        </>
      </SheetContent>
    </Sheet>
  );
}

function ReviewTransaction({
  transaction,
  target,
  categories,
  included,
  saving,
  disabled,
  onMoveToCategory,
  onSetOwnTransfer,
}: {
  transaction: FinanceTransaction;
  target: CategoryReviewTarget;
  categories: FinanceCategory[];
  included: boolean;
  saving: boolean;
  disabled: boolean;
  onMoveToCategory: (transaction: FinanceTransaction, category: string) => void;
  onSetOwnTransfer: (
    transaction: FinanceTransaction,
    isTransfer: boolean,
  ) => void;
}) {
  const categoryNames = [
    ...new Set([
      transaction.category,
      ...categoriesForAmount(categories, transaction.amount).map(
        (category) => category.name,
      ),
    ]),
  ];

  return (
    <article className="rounded-2xl border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold sm:text-base">
            {transaction.merchant}
          </h3>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground sm:text-sm">
            {formatTransactionDate(transaction.date)} · {transaction.bank}
          </p>
          <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
            {transaction.description}
          </p>
          {transaction.isTransfer && target.kind === 'category' && (
            <p className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-primary">
              <ArrowLeftRight className="size-3.5" aria-hidden="true" />
              Перевод между своими счетами
            </p>
          )}
        </div>
        <p
          className={`shrink-0 text-sm font-semibold tabular-nums sm:text-base ${
            transaction.amount > 0
              ? 'text-emerald-600 dark:text-emerald-400'
              : ''
          }`}
        >
          {formatRubles(transaction.amount)}
        </p>
      </div>

      <div className="mt-3">
        {target.kind === 'own-transfers' ? (
          <Button
            type="button"
            variant={included ? 'outline' : 'default'}
            className="min-h-11 w-full cursor-pointer"
            disabled={disabled}
            onClick={() => onSetOwnTransfer(transaction, !included)}
          >
            {saving ? (
              <Spinner className="size-4" />
            ) : included ? (
              'Снять пометку'
            ) : (
              <>
                <ArrowLeftRight className="size-4" aria-hidden="true" />
                Отметить своим переводом
              </>
            )}
          </Button>
        ) : included ? (
          <label className="block space-y-1.5 text-xs font-medium text-muted-foreground">
            <span>Категория операции</span>
            <select
              value={transaction.category}
              disabled={disabled}
              onChange={(event) =>
                onMoveToCategory(transaction, event.target.value)
              }
              className="focus-ring min-h-11 w-full cursor-pointer rounded-xl border bg-background px-3 text-base text-foreground disabled:cursor-wait disabled:opacity-60"
              aria-label={`Категория операции ${transaction.merchant}`}
            >
              {categoryNames.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <Button
            type="button"
            className="min-h-11 w-full cursor-pointer"
            disabled={disabled}
            onClick={() => onMoveToCategory(transaction, target.category.name)}
          >
            {saving ? (
              <Spinner className="size-4" />
            ) : (
              <>
                <Plus className="size-4" aria-hidden="true" />
                Добавить в «{target.category.name}»
              </>
            )}
          </Button>
        )}
      </div>
    </article>
  );
}
