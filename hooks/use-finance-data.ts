'use client';

import { useCallback, useEffect, useState } from 'react';
import { demoAccounts, demoTransactions } from '@/lib/demo-data';
import type { FinanceAccount, FinanceTransaction } from '@/lib/finance-data';
import {
  loadLocalFinanceData,
  LOCAL_IMPORT_EVENT,
  updateLocalTransaction,
} from '@/lib/local-finance-store';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';
import { loadFinanceData } from '@/lib/supabase/finance';

export function useFinanceData() {
  const [client] = useState(createSupabaseBrowserClient);
  const [accounts, setAccounts] = useState<FinanceAccount[]>(() =>
    client ? [] : demoAccounts,
  );
  const [transactions, setTransactions] = useState<FinanceTransaction[]>(() =>
    client ? [] : demoTransactions,
  );
  const [loading, setLoading] = useState(Boolean(client));
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    if (!client) {
      const local = loadLocalFinanceData();
      const savedIds = new Set(local.transactions.map((item) => item.id));
      const savedAccountIds = new Set(local.accounts.map((item) => item.id));
      setAccounts([
        ...demoAccounts.filter((item) => !savedAccountIds.has(item.id)),
        ...local.accounts,
      ]);
      setTransactions([
        ...local.transactions,
        ...demoTransactions.filter((item) => !savedIds.has(item.id)),
      ]);
      setLoading(false);
      setError('');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const data = await loadFinanceData(client);
      setAccounts(data.accounts);
      setTransactions(data.transactions);
    } catch {
      setAccounts([]);
      setTransactions([]);
      setError(
        'Не удалось загрузить данные. Проверьте соединение и попробуйте ещё раз.',
      );
    } finally {
      setLoading(false);
    }
  }, [client]);

  useEffect(() => {
    if (!client) {
      const syncLocalData = () => {
        const local = loadLocalFinanceData();
        const savedIds = new Set(local.transactions.map((item) => item.id));
        const savedAccountIds = new Set(local.accounts.map((item) => item.id));
        setAccounts([
          ...demoAccounts.filter((item) => !savedAccountIds.has(item.id)),
          ...local.accounts,
        ]);
        setTransactions([
          ...local.transactions,
          ...demoTransactions.filter((item) => !savedIds.has(item.id)),
        ]);
      };
      syncLocalData();
      window.addEventListener(LOCAL_IMPORT_EVENT, syncLocalData);
      window.addEventListener('storage', syncLocalData);
      return () => {
        window.removeEventListener(LOCAL_IMPORT_EVENT, syncLocalData);
        window.removeEventListener('storage', syncLocalData);
      };
    }
    let active = true;

    void loadFinanceData(client)
      .then((data) => {
        if (!active) return;
        setAccounts(data.accounts);
        setTransactions(data.transactions);
      })
      .catch(() => {
        if (!active) return;
        setAccounts([]);
        setTransactions([]);
        setError(
          'Не удалось загрузить данные. Проверьте соединение и попробуйте ещё раз.',
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [client]);

  const replaceTransaction = useCallback(
    (updated: FinanceTransaction) => {
      setTransactions((current) =>
        current.map((transaction) =>
          transaction.id === updated.id ? updated : transaction,
        ),
      );
      if (!client) updateLocalTransaction(updated);
    },
    [client],
  );

  return {
    accounts,
    client,
    dataMode: client ? ('supabase' as const) : ('demo' as const),
    error,
    loading,
    refresh,
    replaceTransaction,
    transactions,
  };
}
