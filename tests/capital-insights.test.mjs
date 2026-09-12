import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildCapitalHistory,
  filterCapitalHistory,
} from '../features/capital/history.ts';
import { generateFinanceInsights } from '../features/insights/generate.ts';
import { saveTransactionChanges } from '../lib/supabase/finance.ts';
import {
  loadLocalFinanceData,
  saveLocalStatement,
} from '../lib/local-finance-store.ts';

const accounts = [
  { id: 'a', bank: 'Т-Банк', name: 'A', currentBalance: 110, currency: 'RUB' },
  { id: 'b', bank: 'Сбер', name: 'B', currentBalance: 190, currency: 'RUB' },
];

function transaction(id, date, amount, overrides = {}) {
  return {
    id,
    date,
    amount,
    merchant: 'Кафе',
    description: '',
    category: 'Кафе и рестораны',
    bank: 'Т-Банк',
    accountId: 'a',
    currency: 'RUB',
    transactionType: 'expense',
    isTransfer: false,
    isRecurring: false,
    excludedFromAnalytics: false,
    ...overrides,
  };
}

test('capital history uses recorded balances from every active account and carries each last snapshot forward', () => {
  const points = buildCapitalHistory(accounts, [
    { accountId: 'a', date: '2026-07-01', balance: 90 },
    { accountId: 'a', date: '2026-08-01', balance: 100 },
    { accountId: 'b', date: '2026-08-01', balance: 200 },
    { accountId: 'a', date: '2026-09-01', balance: 110 },
    { accountId: 'b', date: '2026-09-05', balance: 190 },
  ]);
  assert.deepEqual(points, [
    { date: '2026-08-01', total: 300 },
    { date: '2026-09-01', total: 310 },
    { date: '2026-09-05', total: 300 },
  ]);
  assert.deepEqual(
    filterCapitalHistory(points, '1m', '2026-09-12'),
    points.slice(1),
  );
  assert.deepEqual(filterCapitalHistory(points, 'all', '2026-09-12'), points);
});

test('insights compare equal elapsed days and ignore transfers, hidden and future rows', () => {
  const insights = generateFinanceInsights(
    [
      transaction('previous', '2026-08-05', -2000),
      transaction('current', '2026-09-05', -3000),
      transaction('hidden', '2026-09-06', -10000, {
        excludedFromAnalytics: true,
      }),
      transaction('transfer', '2026-09-07', -20000, { isTransfer: true }),
      transaction('future', '2026-09-20', -100000),
    ],
    '2026-09-12',
  );
  assert.match(
    insights.find((item) => item.id === 'category-growth')?.title ?? '',
    /50%/,
  );
  assert.match(
    insights.find((item) => item.id === 'merchant-growth')?.title ?? '',
    /1\s?000 ₽/,
  );
});

test('recent recurring expenses generate a monthly cost insight', () => {
  const insights = generateFinanceInsights(
    [
      transaction('july', '2026-07-05', -199, {
        merchant: 'Сервис',
        category: 'Подписки',
        isRecurring: true,
      }),
      transaction('august', '2026-08-05', -199, {
        merchant: 'Сервис',
        category: 'Подписки',
        isRecurring: true,
      }),
      transaction('september', '2026-09-05', -199, {
        merchant: 'Сервис',
        category: 'Подписки',
        isRecurring: true,
      }),
    ],
    '2026-09-12',
  );
  assert.match(
    insights.find((item) => item.id === 'subscriptions')?.title ?? '',
    /199 ₽/,
  );
});

test('transaction details persist merchant edits and clear notes in Supabase', async () => {
  let payload;
  const row = {
    id: 'transaction-1',
    bank: 'tbank',
    account_id: 'a',
    transaction_date: '2026-09-05',
    posted_date: null,
    amount: -500,
    currency: 'RUB',
    merchant: 'Новый продавец',
    description: 'Покупка',
    category: 'Прочее',
    transaction_type: 'expense',
    is_transfer: false,
    transfer_group_id: null,
    is_recurring: false,
    source_hash: 'original',
    source_file: 'bank.csv',
    note: null,
    excluded_from_analytics: false,
  };
  const client = {
    from(table) {
      assert.equal(table, 'transactions');
      return {
        update(changes) {
          payload = changes;
          return {
            eq() {
              return {
                select() {
                  return { single: async () => ({ data: row, error: null }) };
                },
              };
            },
          };
        },
      };
    },
  };
  const saved = await saveTransactionChanges(client, 'transaction-1', {
    merchant: '  Новый продавец  ',
    note: ' ',
  });
  assert.deepEqual(payload, { merchant: 'Новый продавец', note: null });
  assert.equal(saved.merchant, 'Новый продавец');
  assert.equal(saved.note, undefined);
  assert.equal(saved.sourceHash, 'original');
});

test('demo import stores an actual balance snapshot when a balance is supplied', () => {
  const values = new Map();
  globalThis.window = {
    localStorage: {
      getItem(key) {
        return values.get(key) ?? null;
      },
      setItem(key, value) {
        values.set(key, value);
      },
    },
    dispatchEvent() {},
  };
  try {
    saveLocalStatement({
      bank: 'tbank',
      accountName: 'Тестовый счёт',
      currentBalance: 12345,
      fileHash: 'snapshot-test',
      sourceFile: 'test.csv',
      fileFormat: 'csv',
      headerSignature: 'test',
      columnMapping: {},
      rows: [],
    });
    assert.deepEqual(
      loadLocalFinanceData().snapshots.map(({ accountId, balance }) => ({
        accountId,
        balance,
      })),
      [{ accountId: loadLocalFinanceData().accounts[0].id, balance: 12345 }],
    );
  } finally {
    delete globalThis.window;
  }
});
