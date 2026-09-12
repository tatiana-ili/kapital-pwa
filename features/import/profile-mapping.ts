import type { ColumnMapping, ImportColumnKey } from './types.ts';

const keys: ImportColumnKey[] = [
  'date',
  'postedDate',
  'amount',
  'expense',
  'income',
  'merchant',
  'description',
  'currency',
  'balance',
];

export function parseStoredMapping(
  value: unknown,
  columnCount: number,
): ColumnMapping | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }
  const entries = value as Record<string, unknown>;
  const mapping: ColumnMapping = {};
  for (const key of keys) {
    if (!(key in entries)) continue;
    const index = entries[key];
    if (
      typeof index !== 'number' ||
      !Number.isInteger(index) ||
      index < 0 ||
      index >= columnCount
    ) {
      return undefined;
    }
    mapping[key] = index;
  }
  if (
    mapping.date === undefined ||
    (mapping.amount === undefined &&
      mapping.expense === undefined &&
      mapping.income === undefined)
  ) {
    return undefined;
  }
  return mapping;
}
