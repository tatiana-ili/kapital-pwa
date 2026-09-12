import assert from 'node:assert/strict';
import test from 'node:test';
import { loadFinanceData } from '../lib/supabase/finance.ts';

function row(index) {
  return {
    id: `id-${index}`,
    bank: 'tbank',
    account_id: 'account-1',
    transaction_date: '2026-09-10',
    posted_date: null,
    amount: -100,
    currency: 'RUB',
    merchant: 'Пятёрочка',
    description: '',
    category: 'Продукты',
    transaction_type: 'expense',
    is_transfer: false,
    transfer_group_id: null,
    is_recurring: false,
    source_hash: `hash-${index}`,
    source_file: 'synthetic.csv',
    note: null,
    excluded_from_analytics: false,
  };
}

test('analytics loads every Supabase page after the first 500 rows', async () => {
  const rows = Array.from({ length: 501 }, (_, index) => row(index));
  const requestedRanges = [];
  const client = {
    from(table) {
      if (table === 'accounts') {
        return {
          select() {
            return {
              eq() {
                return { order: async () => ({ data: [], error: null }) };
              },
            };
          },
        };
      }
      assert.equal(table, 'transactions');
      return {
        select() {
          return {
            order() {
              return this;
            },
            async range(start, end) {
              requestedRanges.push([start, end]);
              return { data: rows.slice(start, end + 1), error: null };
            },
          };
        },
      };
    },
  };

  const data = await loadFinanceData(client, { allTransactions: true });
  assert.equal(data.transactions.length, 501);
  assert.deepEqual(requestedRanges, [
    [0, 499],
    [500, 999],
  ]);
  assert.equal(data.transactions[500].id, 'id-500');
});
