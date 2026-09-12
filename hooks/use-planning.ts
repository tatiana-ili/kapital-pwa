'use client';

import { useCallback, useEffect, useState } from 'react';
import type {
  Budget,
  Goal,
  PlanningData,
  Subscription,
} from '@/features/planning/types';
import {
  deleteLocalBudget,
  deleteLocalGoal,
  deleteLocalSubscription,
  loadLocalPlanningData,
  LOCAL_PLANNING_EVENT,
  saveLocalBudget,
  saveLocalGoal,
  saveLocalSubscription,
} from '@/lib/local-planning-store';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';
import {
  deleteBudget,
  deleteGoal,
  deleteSubscription,
  loadPlanningData,
  saveBudget,
  saveGoal,
  saveSubscription,
} from '@/lib/supabase/planning';

const empty: PlanningData = { budgets: [], goals: [], subscriptions: [] };

export function usePlanning() {
  const [client] = useState(createSupabaseBrowserClient);
  const [data, setData] = useState<PlanningData>(empty);
  const [loading, setLoading] = useState(Boolean(client));
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    if (!client) {
      setData(loadLocalPlanningData());
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      setData(await loadPlanningData(client));
      setError('');
    } catch {
      setError('Не удалось загрузить планы. Попробуйте обновить страницу.');
    } finally {
      setLoading(false);
    }
  }, [client]);

  useEffect(() => {
    if (client) {
      const timer = window.setTimeout(() => void refresh(), 0);
      return () => window.clearTimeout(timer);
    }
    const sync = () => setData(loadLocalPlanningData());
    const timer = window.setTimeout(sync, 0);
    window.addEventListener(LOCAL_PLANNING_EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener(LOCAL_PLANNING_EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, [client, refresh]);

  async function mutate(action: () => unknown) {
    setError('');
    try {
      await action();
      await refresh();
      return true;
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Не удалось сохранить изменение.',
      );
      return false;
    }
  }

  return {
    ...data,
    loading,
    error,
    refresh,
    saveBudget: (value: Omit<Budget, 'id'>) =>
      mutate(() =>
        client ? saveBudget(client, value) : saveLocalBudget(value),
      ),
    deleteBudget: (id: string) =>
      mutate(() => (client ? deleteBudget(client, id) : deleteLocalBudget(id))),
    saveGoal: (value: Omit<Goal, 'id'> & { id?: string }) =>
      mutate(() => (client ? saveGoal(client, value) : saveLocalGoal(value))),
    deleteGoal: (id: string) =>
      mutate(() => (client ? deleteGoal(client, id) : deleteLocalGoal(id))),
    saveSubscription: (value: Omit<Subscription, 'id'> & { id?: string }) =>
      mutate(() =>
        client ? saveSubscription(client, value) : saveLocalSubscription(value),
      ),
    deleteSubscription: (id: string) =>
      mutate(() =>
        client ? deleteSubscription(client, id) : deleteLocalSubscription(id),
      ),
  };
}
