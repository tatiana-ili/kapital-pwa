import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildAnalyticsReport,
  resolvePeriod,
} from '../features/analytics/report.ts';

const baseFilters = {
  preset: '3m',
  from: '2026-09-01',
  to: '2026-09-12',
  bank: 'all',
  accountId: 'all',
  category: 'all',
  merchant: '',
};

function transaction(id, date, amount, overrides = {}) {
  return {
    id,
    date,
    amount,
    merchant: 'Ozon',
    description: 'Оплата',
    category: 'Маркетплейсы',
    bank: 'Ozon Банк',
    accountId: 'ozon-card',
    currency: 'RUB',
    transactionType: amount < 0 ? 'expense' : 'income',
    isTransfer: false,
    isRecurring: false,
    excludedFromAnalytics: false,
    ...overrides,
  };
}

test('analytics excludes transfers and hidden transactions throughout totals and charts', () => {
  const transactions = [
    transaction('income', '2026-09-10', 10000, { category: 'Зарплата' }),
    transaction('expense', '2026-09-10', -2500),
    transaction('transfer', '2026-09-10', -5000, { isTransfer: true }),
    transaction('hidden', '2026-09-10', -900, { excludedFromAnalytics: true }),
    transaction('old', '2026-06-30', -1200),
  ];
  const report = buildAnalyticsReport(transactions, baseFilters, '2026-09-12');

  assert.equal(report.income, 10000);
  assert.equal(report.expenses, 2500);
  assert.equal(report.net, 7500);
  assert.equal(report.savingsRate, 75);
  assert.equal(report.transactionCount, 2);
  assert.deepEqual(report.categories, [
    { name: 'Маркетплейсы', amount: 2500, share: 1 },
  ]);
  assert.deepEqual(report.months, [
    { month: '2026-07', income: 0, expenses: 0 },
    { month: '2026-08', income: 0, expenses: 0 },
    { month: '2026-09', income: 10000, expenses: 2500 },
  ]);
  assert.deepEqual(
    report.largestExpenses.map(({ id }) => id),
    ['expense'],
  );
  assert.equal(report.averagePerDay, 2500 / 74);
  assert.equal(report.averagePerMonth, 2500 / 3);
});

test('month comparison uses equal elapsed days and still sees previous month outside selected period', () => {
  const transactions = [
    transaction('sep', '2026-09-12', -300),
    transaction('aug-in-window', '2026-08-08', -200),
    transaction('aug-late', '2026-08-20', -900),
    transaction('aug-income', '2026-08-09', 500),
  ];
  const report = buildAnalyticsReport(
    transactions,
    { ...baseFilters, preset: 'month' },
    '2026-09-12',
  );

  assert.equal(report.expenses, 300);
  assert.equal(report.comparison.currentExpenses, 300);
  assert.equal(report.comparison.previousExpenses, 200);
  assert.equal(report.comparison.previousIncome, 500);
  assert.equal(report.comparison.throughDay, 12);
});

test('bank, account, category, merchant, and custom date filters combine', () => {
  const transactions = [
    transaction('match', '2026-08-04', -1500),
    transaction('other-account', '2026-08-04', -500, {
      accountId: 'ozon-other',
    }),
    transaction('other-bank', '2026-08-04', -500, { bank: 'Сбер' }),
    transaction('other-category', '2026-08-04', -500, { category: 'Продукты' }),
    transaction('other-merchant', '2026-08-04', -500, {
      merchant: 'Wildberries',
    }),
    transaction('other-date', '2026-08-20', -500),
  ];
  const report = buildAnalyticsReport(
    transactions,
    {
      ...baseFilters,
      preset: 'custom',
      from: '2026-08-01',
      to: '2026-08-10',
      bank: 'Ozon Банк',
      accountId: 'ozon-card',
      category: 'Маркетплейсы',
      merchant: 'oZoN',
    },
    '2026-09-12',
  );

  assert.equal(report.expenses, 1500);
  assert.equal(report.transactionCount, 1);
  assert.equal(report.averagePerDay, 150);
});

test('all-time period starts at the first matching transaction', () => {
  const transactions = [
    transaction('may', '2026-05-15', -100),
    transaction('july', '2026-07-15', -300),
    transaction('other', '2026-03-10', -200, { bank: 'Сбер' }),
  ];
  assert.deepEqual(
    resolvePeriod(
      { ...baseFilters, preset: 'all' },
      transactions.filter((item) => item.bank === 'Ozon Банк'),
      '2026-09-12',
    ),
    { from: '2026-05-15', to: '2026-09-12' },
  );
  const report = buildAnalyticsReport(
    transactions,
    { ...baseFilters, preset: 'all', bank: 'Ozon Банк' },
    '2026-09-12',
  );
  assert.equal(report.expenses, 400);
  assert.equal(report.from, '2026-05-15');
});
