import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  CategoryData,
  CategoryDirection,
  CategoryRule,
  FinanceCategory,
} from '../../features/categories/types.ts';

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
      .select('id,name,priority,field,operator,value,direction,target_category,is_active')
      .order('priority', { ascending: true }),
  ]);
  if (categoriesResult.error) throw categoriesResult.error;
  if (rulesResult.error) throw rulesResult.error;
  const categories = ((categoriesResult.data ?? []) as CategoryRow[]).map<FinanceCategory>(
    (row) => ({
      id: row.id,
      name: row.name,
      direction: row.direction,
      isSystem: row.is_system,
    }),
  );
  const rules = ((rulesResult.data ?? []) as RuleRow[])
    .filter(
      (row) =>
        (row.field === 'merchant' || row.field === 'description') &&
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
  const needle = value.trim();
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
    return;
  }
  const { error } = await client.from('category_rules').insert({
    user_id: userId,
    name: `${field === 'merchant' ? 'Продавец' : 'Описание'} содержит «${needle}»`,
    priority: 100,
    field,
    operator: 'contains',
    value: needle,
    direction,
    target_category: targetCategory,
    is_active: true,
  });
  if (error) throw error;
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
}

export async function deleteCategoryRule(client: SupabaseClient, id: string) {
  const { error } = await client.from('category_rules').delete().eq('id', id);
  if (error) throw error;
}
