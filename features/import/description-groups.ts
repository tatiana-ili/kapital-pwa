import type { CategoryDirection } from '../categories/types.ts';
import type { ParsedImportRow } from './types.ts';

export type RepeatedDescriptionGroup = {
  key: string;
  description: string;
  normalizedDescription: string;
  direction: Exclude<CategoryDirection, 'both'>;
  rowIds: string[];
  count: number;
  totalAmount: number;
  currentCategory?: string;
};

export function normalizeDescription(value: string) {
  return value.replace(/\s+/g, ' ').trim().toLocaleLowerCase('ru');
}

export function descriptionRuleValue(value: string) {
  return value.replace(/\s+/g, ' ').trim().slice(0, 120).trim();
}

export function groupRepeatedDescriptions(rows: ParsedImportRow[]) {
  const groups = new Map<
    string,
    Omit<RepeatedDescriptionGroup, 'count' | 'currentCategory'> & {
      categories: Set<string>;
    }
  >();

  for (const row of rows) {
    const description = row.description.replace(/\s+/g, ' ').trim();
    const normalizedDescription = normalizeDescription(description);
    if (
      row.status === 'duplicate' ||
      row.status === 'error' ||
      row.isTransfer ||
      !normalizedDescription ||
      normalizedDescription === 'операция' ||
      isProbableCardNumber(normalizedDescription)
    ) {
      continue;
    }

    const direction = row.amount >= 0 ? 'income' : 'expense';
    const key = `${direction}:${normalizedDescription}`;
    const existing = groups.get(key);
    if (existing) {
      existing.rowIds.push(row.id);
      existing.totalAmount += row.amount;
      existing.categories.add(row.category);
      continue;
    }

    groups.set(key, {
      key,
      description,
      normalizedDescription,
      direction,
      rowIds: [row.id],
      totalAmount: row.amount,
      categories: new Set([row.category]),
    });
  }

  return [...groups.values()]
    .filter((group) => group.rowIds.length > 1)
    .map<RepeatedDescriptionGroup>((group) => ({
      key: group.key,
      description: group.description,
      normalizedDescription: group.normalizedDescription,
      direction: group.direction,
      rowIds: group.rowIds,
      count: group.rowIds.length,
      totalAmount: group.totalAmount,
      currentCategory:
        group.categories.size === 1 ? [...group.categories][0] : undefined,
    }))
    .sort(
      (left, right) =>
        right.count - left.count ||
        left.description.localeCompare(right.description, 'ru'),
    );
}

function isProbableCardNumber(value: string) {
  return /^(?:номер карты\s*)?(?:[*xх•]\s*){2,}\d{0,4}$|^\d{4}$/.test(value);
}
