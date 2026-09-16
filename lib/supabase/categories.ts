import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  CategoryData,
  CategoryDirection,
  CategoryRule,
  FinanceCategory,
} from '../../features/categories/types.ts';
import {
  categoryRuleName,
  categoryRuleUpdates,
  normalizeCategoryRuleValue,
} from '../../features/categories/rules.ts';

type CategoryRow = {
  id: string;
  name: string;
  direction: CategoryDirection;
  is_system: boolean;
};

type RuleRow = {
  id: string;
  name: string;
  priority: number;
  field: string;
  operator: string;
  value: unknown;
  direction: CategoryDirection;
  target_category: string;
  is_active: boolean;
};

type RuleTransactionRow = {
  id: string;
  merchant: string;
  description: string;
  amount: number | string;
  category: string;
  is_transfer: boolean;
  bank?: string;
  account_id?: string;
  transaction_date?: string;
  posted_date?: string;
  currency?: string;
  transaction_type?: string;
  note?: string;
  source_file?: string;
};

async function loadRuleTransactions(client: SupabaseClient) {
  const rows: RuleTransactionRow[] = [];
  const pageSize = 500;
  for (let offset = 0; ; offset += pageSize) {
    const result = await client
      .from('transactions')
      .select(
        'id,merchant,description,amount,category,is_transfer,bank,account_id,transaction_date,posted_date,currency,transaction_type,note,source_file',
      )
      .order('id', { ascending: true })
      .range(offset, offset + pageSize - 1);
    if (result.error) throw result.error;
    const page = (result.data ?? []) as RuleTransactionRow[];
    rows.push(...page);
    if (page.length < pageSize) break;
  }
  return rows;
}

async function applyStoredCategoryRules(client: SupabaseClient) {
  const [{ categories, rules }, transactions] = await Promise.all([
    loadCategoryData(client),
    loadRuleTransactions(client),
  ]);
  const updates = categoryRuleUpdates(
    transactions.map((transaction) => ({
      id: transaction.id,
      merchant: transaction.merchant,
      description: transaction.description,
      amount: Number(transaction.amount),
      category: transaction.category,
      isTransfer: transaction.is_transfer,
      bank: transaction.bank,
      accountId: transaction.account_id,
      date: transaction.transaction_date,
      postedDate: transaction.posted_date,
      currency: transaction.currency,
      transactionType: transaction.transaction_type,
      note: transaction.note,
      sourceFile: transaction.source_file,
    })),
    categories,
    rules,
  );
  const idsByCategory = new Map<string, string[]>();
  for (const update of updates) {
    idsByCategory.set(update.category, [
      ...(idsByCategory.get(update.category) ?? []),
      update.id,
    ]);
  }
  for (const [category, ids] of idsByCategory) {
    for (let offset = 0; offset < ids.length; offset += 100) {
      const { error } = await client
        .from('transactions')
        .update({ category })
        .in('id', ids.slice(offset, offset + 100));
      if (error) throw error;
    }
  }
  return updates.length;
}

async function currentUserId(client: SupabaseClient) {
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) throw error || new Error('Требуется вход.');
  return data.user.id;
}

export async function loadCategoryData(
  client: SupabaseClient,
): Promise<CategoryData> {
  const [categoriesResult, rulesResult] = await Promise.all([
    client
      .from('categories')
      .select('id,name,direction,is_system')
      .order('name', { ascending: true }),
    client
      .from('category_rules')
      .select(
        'id,name,priority,field,operator,value,direction,target_category,is_active',
      )
      .order('priority', { ascending: true }),
  ]);
  if (categoriesResult.error) throw categoriesResult.error;
  if (rulesResult.error) throw rulesResult.error;
  const categories = (
    (categoriesResult.data ?? []) as CategoryRow[]
  ).map<FinanceCategory>((row) => ({
    id: row.id,
    name: row.name,
    direction: row.direction,
    isSystem: row.is_system,
  }));
  const rules = ((rulesResult.data ?? []) as RuleRow[])
    .filter(
      (row) =>
        (row.field === 'all' ||
          row.field === 'merchant' ||
          row.field === 'description') &&
        row.operator === 'contains' &&
        typeof row.value === 'string',
    )
    .map<CategoryRule>((row) => ({
      id: row.id,
      name: row.name,
      priority: row.priority,
      field: row.field as CategoryRule['field'],
      operator: 'contains',
      value: row.value as string,
      direction: row.direction,
      targetCategory: row.target_category,
      isActive: row.is_active,
    }));
  return { categories, rules };
}

export async function createCategory(
  client: SupabaseClient,
  name: string,
  direction: CategoryDirection,
) {
  const userId = await currentUserId(client);
  const { error } = await client.from('categories').insert({
    user_id: userId,
    name: name.trim(),
    direction,
    is_system: false,
  });
  if (error) throw error;
}

export async function renameCategory(
  client: SupabaseClient,
  id: string,
  name: string,
) {
  const { error } = await client.rpc('rename_user_category', {
    p_category_id: id,
    p_new_name: name.trim(),
  });
  if (error) throw error;
}

export async function createCategoryRule(
  client: SupabaseClient,
  field: CategoryRule['field'],
  value: string,
  targetCategory: string,
  direction: CategoryDirection,
) {
  const userId = await currentUserId(client);
  const needle = normalizeCategoryRuleValue(value);
  if (!needle || needle.length > 120) {
    throw new Error('Укажите текст правила длиной до 120 символов.');
  }
  const { data: targetRows, error: targetError } = await client
    .from('categories')
    .select('direction')
    .eq('name', targetCategory);
  if (targetError) throw targetError;
  if (
    !(targetRows ?? []).some(
      (category) =>
        category.direction === direction || category.direction === 'both',
    )
  ) {
    throw new Error('Выберите категорию для этого типа операций.');
  }
  const { data: existingRules, error: lookupError } = await client
    .from('category_rules')
    .select('id,value')
    .eq('field', field)
    .eq('operator', 'contains')
    .eq('direction', direction);
  if (lookupError) throw lookupError;
  const existing = (existingRules ?? []).find(
    (rule) =>
      typeof rule.value === 'string' &&
      rule.value.toLocaleLowerCase('ru') === needle.toLocaleLowerCase('ru'),
  );
  if (existing) {
    const { error } = await client
      .from('category_rules')
      .update({ target_category: targetCategory, is_active: true })
      .eq('id', existing.id);
    if (error) throw error;
    return applyStoredCategoryRules(client);
  }
  const { error } = await client.from('category_rules').insert({
    user_id: userId,
    name: categoryRuleName(field, needle),
    priority: 100,
    field,
    operator: 'contains',
    value: needle,
    direction,
    target_category: targetCategory,
    is_active: true,
  });
  if (error) throw error;
  return applyStoredCategoryRules(client);
}

export async function updateCategoryRule(
  client: SupabaseClient,
  id: string,
  field: CategoryRule['field'],
  value: string,
  targetCategory: string,
  direction: CategoryDirection,
) {
  const needle = normalizeCategoryRuleValue(value);
  if (!needle || needle.length > 120) {
    throw new Error('Укажите текст правила длиной до 120 символов.');
  }
  const { categories, rules } = await loadCategoryData(client);
  const original = rules.find((rule) => rule.id === id);
  if (!original) throw new Error('Правило не найдено.');
  if (
    !categories.some(
      (category) =>
        category.name === targetCategory &&
        (category.direction === direction || category.direction === 'both'),
    )
  ) {
    throw new Error('Выберите категорию для этого типа операций.');
  }
  if (
    rules.some(
      (rule) =>
        rule.id !== id &&
        rule.field === field &&
        rule.direction === direction &&
        rule.value.toLocaleLowerCase('ru') === needle.toLocaleLowerCase('ru'),
    )
  ) {
    throw new Error('Такое правило уже существует.');
  }
  const { error } = await client
    .from('category_rules')
    .update({
      name: categoryRuleName(field, needle),
      field,
      value: needle,
      target_category: targetCategory,
      direction,
    })
    .eq('id', id);
  if (error) throw error;
  if (original.isActive) return applyStoredCategoryRules(client);
}

export async function setCategoryRuleActive(
  client: SupabaseClient,
  id: string,
  isActive: boolean,
) {
  const { error } = await client
    .from('category_rules')
    .update({ is_active: isActive })
    .eq('id', id);
  if (error) throw error;
  if (isActive) return applyStoredCategoryRules(client);
}

export async function deleteCategoryRule(client: SupabaseClient, id: string) {
  const { error } = await client.from('category_rules').delete().eq('id', id);
  if (error) throw error;
}
