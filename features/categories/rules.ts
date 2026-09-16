import { categoriesForAmount } from './defaults.ts';
import type { CategoryRule, FinanceCategory } from './types.ts';
import { bankNames } from '../../lib/finance-data.ts';

type ExistingTransaction = {
  id: string;
  merchant: string;
  description: string;
  amount: number;
  category: string;
  isTransfer?: boolean;
  bank?: string;
  accountId?: string;
  date?: string;
  postedDate?: string;
  currency?: string;
  transactionType?: string;
  note?: string;
  sourceFile?: string;
};

type RuleInput = Omit<ExistingTransaction, 'id' | 'category'> & {
  category?: string;
};

export function categoryRuleKeywords(value: string) {
  return value
    .split(',')
    .map((part) => part.trim().toLocaleLowerCase('ru'))
    .filter(Boolean);
}

export function normalizeCategoryRuleValue(value: string) {
  return value
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .join(', ');
}

function searchableText(input: RuleInput, field: CategoryRule['field']) {
  if (field === 'merchant' || field === 'description') {
    return [input[field]];
  }
  const bankName =
    input.bank && input.bank in bankNames
      ? bankNames[input.bank as keyof typeof bankNames]
      : undefined;
  return [
    input.merchant,
    input.description,
    input.bank,
    bankName,
    input.accountId,
    input.date,
    input.postedDate,
    input.currency,
    input.transactionType,
    input.note,
    input.sourceFile,
    input.category,
    String(input.amount),
    String(Math.abs(input.amount)),
  ];
}

export function applyCategoryRules(
  input: RuleInput,
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
    const keywords =
      rule.field === 'all'
        ? categoryRuleKeywords(rule.value)
        : [rule.value.trim().toLocaleLowerCase('ru')].filter(Boolean);
    if (!keywords.length) continue;
    const values = searchableText(input, rule.field).map((value) =>
      (value ?? '').toLocaleLowerCase('ru'),
    );
    if (
      keywords.some((keyword) =>
        values.some((value) => value.includes(keyword)),
      )
    ) {
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
