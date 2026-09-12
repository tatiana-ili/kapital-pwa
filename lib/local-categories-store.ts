import { defaultCategories } from '../features/categories/defaults.ts';
import type {
  CategoryData,
  CategoryDirection,
  CategoryRule,
  FinanceCategory,
} from '../features/categories/types.ts';
import { renameLocalTransactionCategory } from './local-finance-store.ts';
import { renameLocalBudgetCategory } from './local-planning-store.ts';

const STORAGE_KEY = 'kapital.demo.categories.v1';
export const LOCAL_CATEGORIES_EVENT = 'kapital:categories-updated';

type StoredCategoryData = {
  categories: FinanceCategory[];
  rules: CategoryRule[];
};

function readStored(): StoredCategoryData {
  if (typeof window === 'undefined') return { categories: [], rules: [] };
  try {
    const value = JSON.parse(
      window.localStorage.getItem(STORAGE_KEY) || 'null',
    );
    return {
      categories: Array.isArray(value?.categories) ? value.categories : [],
      rules: Array.isArray(value?.rules)
        ? value.rules.map((rule: CategoryRule) => ({
            ...rule,
            direction: rule.direction ?? 'both',
          }))
        : [],
    };
  } catch {
    return { categories: [], rules: [] };
  }
}

function writeStored(value: StoredCategoryData) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  window.dispatchEvent(new Event(LOCAL_CATEGORIES_EVENT));
}

function normalizedName(name: string) {
  const value = name.replace(/\s+/g, ' ').trim();
  if (!value || value.length > 80) {
    throw new Error('Название категории должно содержать от 1 до 80 символов.');
  }
  return value;
}

function ensureUnique(
  name: string,
  categories: FinanceCategory[],
  exceptId?: string,
) {
  const duplicate = categories.some(
    (item) =>
      item.id !== exceptId &&
      item.name.toLocaleLowerCase('ru') === name.toLocaleLowerCase('ru'),
  );
  if (duplicate) throw new Error('Такая категория уже существует.');
}

export function loadLocalCategoryData(): CategoryData {
  const stored = readStored();
  return {
    categories: [...defaultCategories, ...stored.categories],
    rules: stored.rules,
  };
}

export function createLocalCategory(
  name: string,
  direction: CategoryDirection,
) {
  const nextName = normalizedName(name);
  const stored = readStored();
  ensureUnique(nextName, [...defaultCategories, ...stored.categories]);
  const category: FinanceCategory = {
    id: globalThis.crypto.randomUUID(),
    name: nextName,
    direction,
    isSystem: false,
  };
  stored.categories.push(category);
  writeStored(stored);
  return category;
}

export function renameLocalCategory(id: string, name: string) {
  const nextName = normalizedName(name);
  const stored = readStored();
  const category = stored.categories.find((item) => item.id === id);
  if (!category) throw new Error('Можно переименовать только свою категорию.');
  ensureUnique(nextName, [...defaultCategories, ...stored.categories], id);
  const oldName = category.name;
  category.name = nextName;
  stored.rules = stored.rules.map((rule) =>
    rule.targetCategory === oldName
      ? { ...rule, targetCategory: nextName }
      : rule,
  );
  renameLocalTransactionCategory(oldName, nextName);
  renameLocalBudgetCategory(oldName, nextName);
  writeStored(stored);
}

export function createLocalCategoryRule(
  field: CategoryRule['field'],
  value: string,
  targetCategory: string,
  direction: CategoryDirection,
) {
  const needle = value.trim();
  if (!needle || needle.length > 120) {
    throw new Error('Укажите текст правила длиной до 120 символов.');
  }
  const stored = readStored();
  if (
    ![...defaultCategories, ...stored.categories].some(
      (category) =>
        category.name === targetCategory &&
        (category.direction === direction || category.direction === 'both'),
    )
  ) {
    throw new Error('Выберите существующую категорию.');
  }
  const existing = stored.rules.find(
    (rule) =>
      rule.field === field &&
      rule.operator === 'contains' &&
      rule.direction === direction &&
      rule.value.toLocaleLowerCase('ru') === needle.toLocaleLowerCase('ru'),
  );
  if (existing) {
    existing.targetCategory = targetCategory;
    existing.isActive = true;
    writeStored(stored);
    return existing;
  }
  const rule: CategoryRule = {
    id: globalThis.crypto.randomUUID(),
    name: `${field === 'merchant' ? 'Продавец' : 'Описание'} содержит «${needle}»`,
    priority: 100,
    field,
    operator: 'contains',
    value: needle,
    direction,
    targetCategory,
    isActive: true,
  };
  stored.rules.push(rule);
  writeStored(stored);
  return rule;
}

export function setLocalCategoryRuleActive(id: string, isActive: boolean) {
  const stored = readStored();
  stored.rules = stored.rules.map((rule) =>
    rule.id === id ? { ...rule, isActive } : rule,
  );
  writeStored(stored);
}

export function deleteLocalCategoryRule(id: string) {
  const stored = readStored();
  stored.rules = stored.rules.filter((rule) => rule.id !== id);
  writeStored(stored);
}
