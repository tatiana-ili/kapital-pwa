import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  Budget,
  Goal,
  PlanningData,
  Subscription,
} from '../../features/planning/types.ts';

async function userId(client: SupabaseClient) {
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) throw error || new Error('Требуется вход.');
  return data.user.id;
}

export async function loadPlanningData(
  client: SupabaseClient,
): Promise<PlanningData> {
  const [budgets, goals, subscriptions] = await Promise.all([
    client
      .from('budgets')
      .select('id,category,month,amount')
      .order('month', { ascending: false }),
    client
      .from('goals')
      .select('id,name,target_amount,current_amount,target_date')
      .order('created_at'),
    client
      .from('subscriptions')
      .select(
        'id,merchant,amount,cadence,last_paid_at,next_expected_at,confidence,is_active',
      )
      .order('merchant'),
  ]);
  if (budgets.error) throw budgets.error;
  if (goals.error) throw goals.error;
  if (subscriptions.error) throw subscriptions.error;
  return {
    budgets: (budgets.data ?? []).map(
      (row): Budget => ({
        id: row.id,
        category: row.category,
        month: row.month.slice(0, 7),
        amount: Number(row.amount),
      }),
    ),
    goals: (goals.data ?? []).map(
      (row): Goal => ({
        id: row.id,
        name: row.name,
        targetAmount: Number(row.target_amount),
        currentAmount: Number(row.current_amount),
        targetDate: row.target_date,
      }),
    ),
    subscriptions: (subscriptions.data ?? []).map(
      (row): Subscription => ({
        id: row.id,
        merchant: row.merchant,
        amount: Number(row.amount),
        cadence: row.cadence,
        lastPaidAt: row.last_paid_at,
        nextExpectedAt: row.next_expected_at,
        confidence: row.confidence === null ? null : Number(row.confidence),
        isActive: row.is_active,
      }),
    ),
  };
}

export async function saveBudget(
  client: SupabaseClient,
  budget: Omit<Budget, 'id'>,
) {
  const { error } = await client.from('budgets').upsert(
    {
      user_id: await userId(client),
      category: budget.category,
      month: `${budget.month}-01`,
      amount: budget.amount,
    },
    { onConflict: 'user_id,category,month' },
  );
  if (error) throw error;
}

export async function deleteBudget(client: SupabaseClient, id: string) {
  const { error } = await client.from('budgets').delete().eq('id', id);
  if (error) throw error;
}

export async function saveGoal(
  client: SupabaseClient,
  goal: Omit<Goal, 'id'> & { id?: string },
) {
  const row = {
    name: goal.name,
    target_amount: goal.targetAmount,
    current_amount: goal.currentAmount,
    target_date: goal.targetDate,
  };
  const result = goal.id
    ? await client.from('goals').update(row).eq('id', goal.id)
    : await client
        .from('goals')
        .insert({ ...row, user_id: await userId(client) });
  if (result.error) throw result.error;
}

export async function deleteGoal(client: SupabaseClient, id: string) {
  const { error } = await client.from('goals').delete().eq('id', id);
  if (error) throw error;
}

export async function saveSubscription(
  client: SupabaseClient,
  item: Omit<Subscription, 'id'> & { id?: string },
) {
  const row = {
    merchant: item.merchant,
    amount: item.amount,
    cadence: item.cadence,
    last_paid_at: item.lastPaidAt,
    next_expected_at: item.nextExpectedAt,
    confidence: item.confidence,
    is_active: item.isActive,
  };
  const result = item.id
    ? await client.from('subscriptions').update(row).eq('id', item.id)
    : await client
        .from('subscriptions')
        .insert({ ...row, user_id: await userId(client) });
  if (result.error) throw result.error;
}

export async function deleteSubscription(client: SupabaseClient, id: string) {
  const { error } = await client.from('subscriptions').delete().eq('id', id);
  if (error) throw error;
}
