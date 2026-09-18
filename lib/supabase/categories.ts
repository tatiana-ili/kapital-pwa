import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  CategoryData,
  CategoryDirection,
  CategoryRule,
  FinanceCategory,
} from '../../features/categories/types.ts';
import {
  planCategoryRuleAudit,
  type CategoryRuleAuditReport,
} from '../../features/categories/audit.ts';
import {
  applyCategoryRules,
  categoryRuleName,
  categoryRuleUpdates,
  nextCategoryRulePriority,
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

function normalizeRuleTransactions(rows: RuleTransactionRow[]) {
  return rows.map((transaction) => ({
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
  }));
}

async function applyStoredCategoryRules(client: SupabaseClient) {
  const [{ categories, rules }, transactions] = await Promise.all([
    loadCategoryData(client),
    loadRuleTransactions(client),
  ]);
  const updates = categoryRuleUpdates(
    normalizeRuleTransactions(transactions),
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
  const nextName = name.replace(/\s+/g, ' ').trim();
  if (!nextName || nextName.length > 80) {
    throw new Error('Название категории должно содержать от 1 до 80 символов.');
  }
  const { categories } = await loadCategoryData(client);
  const matches = categories.filter(
    (category) =>
      category.name.toLocaleLowerCase('ru') ===
      nextName.toLocaleLowerCase('ru'),
  );
  if (
    matches.some(
      (category) =>
        category.direction === direction || category.direction === 'both',
    )
  ) {
    throw new Error(
      'Такая категория уже доступна для выбранного типа операций.',
    );
  }
  if (matches.length) {
    const owned = matches.find((category) => !category.isSystem);
    if (!owned) {
      throw new Error(
        'Название занято стандартной категорией. Выберите другое название.',
      );
    }
    const { error } = await client
      .from('categories')
      .update({ direction: 'both' })
      .eq('id', owned.id);
    if (error) throw error;
    return;
  }
  const userId = await currentUserId(client);
  const { error } = await client.from('categories').insert({
    user_id: userId,
    name: nextName,
    direction,
    is_system: false,
  });
  if (
    error?.code === '23505' ||
    /category with this name already exists/i.test(error?.message ?? '')
  ) {
    throw new Error('Такая категория уже существует.');
  }
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
  const { categories, rules } = await loadCategoryData(client);
  if (
    !categories.some(
      (category) =>
        category.name === targetCategory &&
        (category.direction === direction || category.direction === 'both'),
    )
  ) {
    throw new Error('Выберите категорию для этого типа операций.');
  }
  const priority = nextCategoryRulePriority(rules);
  const existing = rules.find(
    (rule) =>
      rule.field === field &&
      rule.direction === direction &&
      rule.value.toLocaleLowerCase('ru') === needle.toLocaleLowerCase('ru'),
  );
  if (existing) {
    const { error } = await client
      .from('category_rules')
      .update({
        target_category: targetCategory,
        is_active: true,
        priority,
      })
      .eq('id', existing.id);
    if (error) throw error;
    return applyStoredCategoryRules(client);
  }
  const { error } = await client.from('category_rules').insert({
    user_id: userId,
    name: categoryRuleName(field, needle),
    priority,
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
      priority: nextCategoryRulePriority(rules),
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

export async function auditStoredCategoryRules(
  client: SupabaseClient,
): Promise<CategoryRuleAuditReport> {
  const [{ categories, rules }, rows] = await Promise.all([
    loadCategoryData(client),
    loadRuleTransactions(client),
  ]);
  const transactions = normalizeRuleTransactions(rows);
  const plan = planCategoryRuleAudit(rules);
  if (
    transactions.some(
      (transaction) =>
        applyCategoryRules(
          transaction,
          transaction.category,
          categories,
          rules,
        ) !==
        applyCategoryRules(
          transaction,
          transaction.category,
          categories,
          plan.rules,
        ),
    )
  ) {
    throw new Error(
      'Объединение меняет результат категоризации. Правила не изменены.',
    );
  }

  for (const update of plan.updates) {
    const { error } = await client
      .from('category_rules')
      .update({ name: update.name, value: update.value })
      .eq('id', update.id);
    if (error) throw error;
  }
  for (let offset = 0; offset < plan.deleteIds.length; offset += 100) {
    const { error } = await client
      .from('category_rules')
      .delete()
      .in('id', plan.deleteIds.slice(offset, offset + 100));
    if (error) throw error;
  }

  const recategorized = await applyStoredCategoryRules(client);
  const [{ categories: currentCategories, rules: currentRules }, currentRows] =
    await Promise.all([loadCategoryData(client), loadRuleTransactions(client)]);
  const currentById = new Map(currentRules.map((rule) => [rule.id, rule]));
  if (
    plan.deleteIds.some((id) => currentById.has(id)) ||
    plan.updates.some(
      (update) => currentById.get(update.id)?.value !== update.value,
    )
  ) {
    throw new Error('Не все дубли правил удалены. Повторите проверку.');
  }
  if (
    categoryRuleUpdates(
      normalizeRuleTransactions(currentRows),
      currentCategories,
      currentRules,
    ).length
  ) {
    throw new Error(
      'Не все операции получили категорию по правилам. Повторите проверку.',
    );
  }
  return {
    checkedTransactions: currentRows.length,
    recategorized,
    duplicatesRemoved: plan.duplicatesRemoved,
    mergedRules: plan.mergedRules,
    mergedGroups: plan.mergedGroups,
  };
}
