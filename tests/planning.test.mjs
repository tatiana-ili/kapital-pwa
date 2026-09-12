import assert from 'node:assert/strict';
import test from 'node:test';
import {
  addCadence,
  budgetProgress,
  detectSubscriptions,
  monthlyGoalContribution,
  yearlySubscriptionAmount,
} from '../features/planning/calculations.ts';

function transaction(id, date, amount, overrides = {}) {
  return {
    id,
    date,
    amount,
    merchant: 'YouTube Premium',
    category: 'Подписки',
    isTransfer: false,
    excludedFromAnalytics: false,
    ...overrides,
  };
}

test('budget counts only included expenses for the chosen month and category', () => {
  const budget = {
    id: '1',
    month: '2026-09',
    category: 'Продукты',
    amount: 1000,
  };
  const transactions = [
    transaction('a', '2026-09-01', -850, { category: 'Продукты' }),
    transaction('b', '2026-09-02', -100, {
      category: 'Продукты',
      isTransfer: true,
    }),
    transaction('c', '2026-09-03', -150, {
      category: 'Продукты',
      excludedFromAnalytics: true,
    }),
    transaction('d', '2026-09-04', 100, { category: 'Продукты' }),
    transaction('e', '2026-08-01', -100, { category: 'Продукты' }),
    transaction('f', '2026-09-01', -100, { category: 'Такси' }),
  ];
  assert.deepEqual(budgetProgress(budget, transactions), {
    spent: 850,
    remaining: 150,
    percent: 85,
  });
});

test('recurring detection requires matching merchant, amount and cadence', () => {
  const transactions = [
    transaction('old', '2026-01-04', -1200),
    transaction('a', '2026-06-05', -399),
    transaction('b', '2026-07-05', -399),
    transaction('c', '2026-08-05', -419),
    transaction('d', '2026-06-02', -1500, { merchant: 'Ozon' }),
    transaction('e', '2026-07-02', -4300, { merchant: 'Ozon' }),
    transaction('f', '2026-08-02', -2200, { merchant: 'Ozon' }),
    transaction('g', '2026-06-02', -199, { merchant: 'МТС', isTransfer: true }),
    transaction('h', '2026-07-02', -199, { merchant: 'МТС' }),
    transaction('i', '2026-08-02', -199, { merchant: 'МТС' }),
    transaction('j', '2026-06-03', -1000, {
      merchant: 'Магазин',
      category: 'Продукты',
    }),
    transaction('k', '2026-07-03', -1000, {
      merchant: 'Магазин',
      category: 'Продукты',
    }),
    transaction('l', '2026-08-03', -1000, {
      merchant: 'Магазин',
      category: 'Продукты',
    }),
  ];
  const result = detectSubscriptions(transactions);
  assert.equal(result.length, 1);
  assert.equal(result[0].merchant, 'YouTube Premium');
  assert.equal(result[0].cadence, 'monthly');
  assert.equal(result[0].nextExpectedAt, '2026-09-05');
});

test('calendar dates and annual amounts handle month ends and different cadences', () => {
  assert.equal(addCadence('2026-01-31', 'monthly'), '2026-02-28');
  assert.equal(addCadence('2026-02-28', 'yearly'), '2027-02-28');
  assert.equal(yearlySubscriptionAmount(100, 'weekly'), 5200);
  assert.equal(yearlySubscriptionAmount(100, 'quarterly'), 400);
});

test('goal contribution uses remaining amount and deadline', () => {
  const goal = {
    targetAmount: 120000,
    currentAmount: 60000,
    targetDate: '2026-12-01',
  };
  assert.equal(monthlyGoalContribution(goal, '2026-09-01'), 20000);
  assert.equal(
    monthlyGoalContribution(
      { ...goal, targetDate: '2026-08-01' },
      '2026-09-01',
    ),
    null,
  );
  assert.equal(
    monthlyGoalContribution({ ...goal, currentAmount: 120000 }, '2026-09-01'),
    null,
  );
});
