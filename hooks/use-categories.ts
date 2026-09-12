'use client';

import { useCallback, useEffect, useState } from 'react';
import type { CategoryDirection, CategoryRule } from '@/features/categories/types';
import { defaultCategories } from '@/features/categories/defaults';
import {
  createLocalCategory,
  createLocalCategoryRule,
  deleteLocalCategoryRule,
  loadLocalCategoryData,
  LOCAL_CATEGORIES_EVENT,
  renameLocalCategory,
  setLocalCategoryRuleActive,
} from '@/lib/local-categories-store';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';
import {
  createCategory as createRemoteCategory,
  createCategoryRule as createRemoteRule,
  deleteCategoryRule as deleteRemoteRule,
  loadCategoryData,
  renameCategory as renameRemoteCategory,
  setCategoryRuleActive as setRemoteRuleActive,
} from '@/lib/supabase/categories';

export function useCategories() {
  const [client] = useState(createSupabaseBrowserClient);
  const [data, setData] = useState(() => ({
    categories: defaultCategories,
    rules: [] as CategoryRule[],
  }));
  const [loading, setLoading] = useState(Boolean(client));
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    if (!client) {
      setData(loadLocalCategoryData());
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      setData(await loadCategoryData(client));
      setError('');
    } catch {
      setError('Не удалось загрузить категории и правила.');
    } finally {
      setLoading(false);
    }
  }, [client]);

  useEffect(() => {
    if (!client) {
      const sync = () => setData(loadLocalCategoryData());
      const initialSync = window.setTimeout(sync, 0);
      window.addEventListener(LOCAL_CATEGORIES_EVENT, sync);
      window.addEventListener('storage', sync);
      return () => {
        window.clearTimeout(initialSync);
        window.removeEventListener(LOCAL_CATEGORIES_EVENT, sync);
        window.removeEventListener('storage', sync);
      };
    }
    let active = true;
    void loadCategoryData(client)
      .then((nextData) => {
        if (!active) return;
        setData(nextData);
        setError('');
      })
      .catch(() => {
        if (active) setError('Не удалось загрузить категории и правила.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [client]);

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
    categories: data.categories,
    rules: data.rules,
    loading,
    error,
    refresh,
    createCategory: (name: string, direction: CategoryDirection) =>
      mutate(() =>
        client
          ? createRemoteCategory(client, name, direction)
          : createLocalCategory(name, direction),
      ),
    renameCategory: (id: string, name: string) =>
      mutate(() =>
        client
          ? renameRemoteCategory(client, id, name)
          : renameLocalCategory(id, name),
      ),
    createRule: (
      field: CategoryRule['field'],
      value: string,
      targetCategory: string,
      direction: CategoryDirection,
    ) =>
      mutate(() =>
        client
          ? createRemoteRule(client, field, value, targetCategory, direction)
          : createLocalCategoryRule(field, value, targetCategory, direction),
      ),
    setRuleActive: (id: string, isActive: boolean) =>
      mutate(() =>
        client
          ? setRemoteRuleActive(client, id, isActive)
          : setLocalCategoryRuleActive(id, isActive),
      ),
    deleteRule: (id: string) =>
      mutate(() =>
        client ? deleteRemoteRule(client, id) : deleteLocalCategoryRule(id),
      ),
  };
}
