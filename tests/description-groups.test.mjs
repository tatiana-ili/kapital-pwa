import assert from 'node:assert/strict';
import test from 'node:test';
import {
  descriptionRuleValue,
  groupRepeatedDescriptions,
} from '../features/import/description-groups.ts';

function row(id, description, amount, overrides = {}) {
  return {
    id,
    rowNumber: Number(id.replace(/\D/g, '')) || 1,
    date: '2026-09-11',
    amount,
    currency: 'RUB',
    merchant: description,
    description,
    category: amount >= 0 ? 'Дополнительный доход' : 'Прочее',
    transactionType: amount >= 0 ? 'income' : 'expense',
    isTransfer: false,
    excludedFromAnalytics: false,
    sourceHash: `hash-${id}`,
    status: 'new',
    issues: [],
    selected: true,
    ...overrides,
  };
}

test('repeated descriptions are normalized, grouped and sorted by count', () => {
  const groups = groupRepeatedDescriptions([
    row('row-1', 'Оплата в FUDMART', -100),
    row('row-2', '  оплата   В FUDMART ', -200),
    row('row-3', 'Внешний перевод', -300),
    row('row-4', 'Внешний перевод', -400),
    row('row-5', 'Внешний перевод', -500),
    row('row-6', 'Оплата в FUDMART', 100),
    row('row-7', '1234', -50),
    row('row-8', '1234', -60),
    row('row-9', 'Дубль', -70, { status: 'duplicate' }),
    row('row-10', 'Дубль', -70),
    row('row-11', 'Перевод', -100, { isTransfer: true }),
    row('row-12', 'Перевод', -100, { isTransfer: true }),
  ]);

  assert.deepEqual(
    groups.map((group) => ({
      description: group.description,
      direction: group.direction,
      count: group.count,
      totalAmount: group.totalAmount,
    })),
    [
      {
        description: 'Внешний перевод',
        direction: 'expense',
        count: 3,
        totalAmount: -1200,
      },
      {
        description: 'Оплата в FUDMART',
        direction: 'expense',
        count: 2,
        totalAmount: -300,
      },
    ],
  );
});

test('description rules stay within the persisted rule length limit', () => {
  assert.equal(descriptionRuleValue(`  ${'а'.repeat(140)}  `).length, 120);
});
