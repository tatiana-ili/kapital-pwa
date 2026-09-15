import type { FinanceCategory } from './types.ts';
import type { FinanceTransaction } from '../../lib/finance-data.ts';

export type CategoryReviewTarget =
  | { kind: 'own-transfers' }
  | { kind: 'category'; category: FinanceCategory };

export function transactionMatchesReviewTarget(
  transaction: FinanceTransaction,
  target: CategoryReviewTarget,
) {
  return target.kind === 'own-transfers'
    ? transaction.isTransfer
    : transaction.category === target.category.name;
}

export function transactionCanBeAddedToTarget(
  transaction: FinanceTransaction,
  target: CategoryReviewTarget,
) {
  if (transactionMatchesReviewTarget(transaction, target)) return false;
  if (target.kind === 'own-transfers') return true;
  const direction = transaction.amount >= 0 ? 'income' : 'expense';
  return (
    target.category.direction === 'both' ||
    target.category.direction === direction
  );
}

export function ownTransferChanges(
  transaction: FinanceTransaction,
  isTransfer: boolean,
) {
  return {
    isTransfer,
    transactionType: isTransfer
      ? ('transfer' as const)
      : transaction.amount > 0
        ? ('income' as const)
        : ('expense' as const),
    excludedFromAnalytics: isTransfer,
  };
}
