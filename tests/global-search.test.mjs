import assert from 'node:assert/strict';
import test from 'node:test';
import { searchTransactions } from '../features/search/transactions.ts';

function transaction(id, merchant, amount, overrides = {}) {
  return {
    id,
    date: '2026-09-10',
    merchant,
    description: `Оплата: ${merchant}`,
    category: 'Маркетплейсы',
    bank: 'Ozon Банк',
    amount,
    isTransfer: false,
    excludedFromAnalytics: false,
    ...overrides,
  };
}

test('global search matches normalized text across fields and exact amounts', () => {
  const rows = [
    transaction('ozon', 'Ozon', -2500),
    transaction('large', 'Ozon', -25000),
    transaction('coffee', 'Кофемания', -1990.5, {
      category: 'Кафе и рестораны',
    }),
    transaction('yandex', 'Яндекс Такси', -700, { bank: 'Яндекс Банк' }),
    transaction('note', 'Аптека', -300, { note: 'Для ребёнка' }),
  ];
  assert.deepEqual(
    searchTransactions(rows, 'ozon 2500').matches.map((row) => row.id),
    ['ozon'],
  );
  assert.deepEqual(
    searchTransactions(rows, '2 500').matches.map((row) => row.id),
    ['ozon'],
  );
  assert.deepEqual(
    searchTransactions(rows, '−2 500 ₽').matches.map((row) => row.id),
    ['ozon'],
  );
  assert.deepEqual(
    searchTransactions(rows, '1990,50').matches.map((row) => row.id),
    ['coffee'],
  );
  assert.deepEqual(
    searchTransactions(rows, 'КОФЕ').matches.map((row) => row.id),
    ['coffee'],
  );
  assert.deepEqual(
    searchTransactions(rows, 'яндекс такси').matches.map((row) => row.id),
    ['yandex'],
  );
  assert.deepEqual(
    searchTransactions(rows, 'ребенка').matches.map((row) => row.id),
    ['note'],
  );
  assert.equal(searchTransactions([rows[2]], 'Ozon').matches.length, 0);
  assert.equal(searchTransactions(rows, '').matches.length, 0);
});

test('search shows matching transfers and hidden rows but excludes them from totals', () => {
  const rows = [
    transaction('expense', 'Ozon', -2500),
    transaction('income', 'Ozon возврат', 500),
    transaction('transfer', 'Ozon перевод', -1000, { isTransfer: true }),
    transaction('hidden', 'Ozon', -700, { excludedFromAnalytics: true }),
  ];
  const result = searchTransactions(rows, 'ozon');
  assert.equal(result.matches.length, 4);
  assert.equal(result.includedCount, 2);
  assert.equal(result.expenses, 2500);
  assert.equal(result.income, 500);
  assert.equal(result.net, -2000);
});

test('search covers the complete supplied history and sorts newest first', () => {
  const rows = Array.from({ length: 600 }, (_, index) =>
    transaction(`id-${index}`, 'Кофе', -100, {
      date: index === 599 ? '2026-09-12' : '2026-08-01',
    }),
  );
  const result = searchTransactions(rows, 'кофе');
  assert.equal(result.matches.length, 600);
  assert.equal(result.matches[0].id, 'id-599');
  assert.equal(result.expenses, 60000);
});
