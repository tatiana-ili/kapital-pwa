import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateFinanceSummary } from '../lib/finance-data.ts';

const account = {
  id: 'account-1',
  bank: 'Т-Банк',
  name: 'Основной',
  currentBalance: 100000,
  currency: 'RUB',
};

function transaction(overrides) {
  return {
    id: overrides.id,
    date: '2026-09-10',
    merchant: 'Операция',
    description: '',
    category: 'Прочее',
    bank: 'Т-Банк',
    accountId: account.id,
    amount: -1000,
    currency: 'RUB',
    transactionType: 'expense',
    isTransfer: false,
    isRecurring: false,
    excludedFromAnalytics: false,
    ...overrides,
  };
}

test('dashboard totals exclude transfers and manually excluded rows', () => {
  const summary = calculateFinanceSummary(
    [account],
    [
      transaction({ id: 'income', amount: 10000, transactionType: 'income' }),
      transaction({ id: 'food', amount: -2500, category: 'Продукты' }),
      transaction({
        id: 'transfer',
        amount: -4000,
        isTransfer: true,
        transactionType: 'transfer',
      }),
      transaction({
        id: 'excluded',
        amount: -500,
        excludedFromAnalytics: true,
      }),
      transaction({ id: 'old', date: '2026-08-31', amount: -9000 }),
    ],
    '2026-09',
  );

  assert.equal(summary.totalCapital, 100000);
  assert.equal(summary.income, 10000);
  assert.equal(summary.expenses, 2500);
  assert.equal(summary.net, 7500);
  assert.equal(summary.savingsRate, 75);
  assert.deepEqual(summary.categories, [
    { name: 'Продукты', amount: 2500, share: 1 },
  ]);
});

test('dashboard groups smaller categories into Остальное', () => {
  const summary = calculateFinanceSummary(
    [account],
    [
      transaction({ id: 'one', amount: -400, category: 'A' }),
      transaction({ id: 'two', amount: -300, category: 'B' }),
      transaction({ id: 'three', amount: -200, category: 'C' }),
      transaction({ id: 'four', amount: -100, category: 'D' }),
    ],
    '2026-09',
  );

  assert.deepEqual(
    summary.categories.map(({ name, amount }) => ({ name, amount })),
    [
      { name: 'A', amount: 400 },
      { name: 'B', amount: 300 },
      { name: 'C', amount: 200 },
      { name: 'Остальное', amount: 100 },
    ],
  );
});
