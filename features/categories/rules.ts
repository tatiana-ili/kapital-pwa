import { categoriesForAmount } from './defaults.ts';
import type { CategoryRule, FinanceCategory } from './types.ts';

type ExistingTransaction = {
  id: string;
  merchant: string;
  description: string;
  amount: number;
  category: string;
  isTransfer?: boolean;
};

export function applyCategoryRules(
  input: {
    merchant: string;
    description: string;
    amount: number;
    isTransfer?: boolean;
  },
  fallback: string,
  categories: FinanceCategory[],
  rules: CategoryRule[],
) {
  if (input.isTransfer) return 'Переводы';
  const available = new Set(
    categoriesForAmount(categories, input.amount).map((item) => item.name),
  );
  const sorted = [...rules].sort(
    (left, right) =>
      left.priority - right.priority ||
      Number(left.direction === 'both') - Number(right.direction === 'both') ||
      left.id.localeCompare(right.id),
  );
  for (const rule of sorted) {
    if (
      !rule.isActive ||
      rule.operator !== 'contains' ||
      (rule.direction !== 'both' &&
        rule.direction !== (input.amount >= 0 ? 'income' : 'expense')) ||
      !available.has(rule.targetCategory)
    ) {
      continue;
    }
    const needle = rule.value.trim().toLocaleLowerCase('ru');
    if (!needle) continue;
    if (input[rule.field].toLocaleLowerCase('ru').includes(needle)) {
      return rule.targetCategory;
    }
  }
  return fallback;
}

export function categoryRuleUpdates(
  transactions: ExistingTransaction[],
  categories: FinanceCategory[],
  rules: CategoryRule[],
) {
  return transactions.flatMap((transaction) => {
    const category = applyCategoryRules(
      transaction,
      transaction.category,
      categories,
      rules,
    );
    return category === transaction.category
      ? []
      : [{ id: transaction.id, category }];
  });
}
