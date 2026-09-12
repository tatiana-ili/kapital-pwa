import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { parseCsv } from '../features/import/file-reader.ts';
import {
  inspectStatementTable,
  parseStatementTable,
} from '../features/import/parser.ts';
import {
  createLocalCategory,
  createLocalCategoryRule,
  loadLocalCategoryData,
  renameLocalCategory,
  setLocalCategoryRuleActive,
} from '../lib/local-categories-store.ts';
import {
  loadLocalFinanceData,
  saveLocalStatement,
  updateLocalTransaction,
} from '../lib/local-finance-store.ts';
import { demoTransactions } from '../lib/demo-data.ts';
import {
  loadLocalPlanningData,
  saveLocalBudget,
} from '../lib/local-planning-store.ts';

function withLocalStorage(run) {
  const previousWindow = globalThis.window;
  const storage = new Map();
  globalThis.window = {
    localStorage: {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value),
    },
    dispatchEvent: () => {},
  };
  try {
    run();
  } finally {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }
}

test('custom category rule changes future imports and survives category rename', () => {
  withLocalStorage(() => {
    const category = createLocalCategory('Спорт', 'expense');
    const rule = createLocalCategoryRule(
      'merchant',
      'Тестовый клуб',
      'Спорт',
      'expense',
    );
    const table = parseCsv(
      'Дата;Сумма;Магазин;Описание\n11.09.2026;-1500;Тестовый клуб;Абонемент',
    );
    const source = {
      fileName: 'tbank.csv',
      fileFormat: 'csv',
      fileHash: 'test-categories-file',
      table,
      inspection: inspectStatementTable(table, 'tbank.csv'),
    };
    const data = loadLocalCategoryData();
    const preview = parseStatementTable({
      bank: 'tbank',
      accountName: 'Основной',
      source,
      categories: data.categories,
      categoryRules: data.rules,
    });
    assert.equal(preview.rows[0].category, 'Спорт');
    saveLocalStatement({
      bank: 'tbank',
      accountName: 'Основной',
      sourceFile: source.fileName,
      fileFormat: source.fileFormat,
      fileHash: source.fileHash,
      headerSignature: source.inspection.headerSignature,
      columnMapping: source.inspection.mapping,
      rows: preview.rows,
    });

    saveLocalBudget({ category: 'Спорт', month: '2026-09', amount: 5000 });

    renameLocalCategory(category.id, 'Фитнес');
    const renamed = loadLocalCategoryData();
    assert.equal(
      renamed.rules.find((item) => item.id === rule.id)?.targetCategory,
      'Фитнес',
    );
    assert.equal(loadLocalFinanceData().transactions[0].category, 'Фитнес');
    assert.equal(loadLocalPlanningData().budgets[0].category, 'Фитнес');

    setLocalCategoryRuleActive(rule.id, false);
    const disabled = loadLocalCategoryData();
    const secondPreview = parseStatementTable({
      bank: 'tbank',
      accountName: 'Другой счёт',
      source,
      categories: disabled.categories,
      categoryRules: disabled.rules,
    });
    assert.equal(secondPreview.rows[0].category, 'Прочее');
  });
});

test('the same merchant can have separate expense and income rules', () => {
  withLocalStorage(() => {
    createLocalCategoryRule('merchant', 'Тестовый клуб', 'Здоровье', 'expense');
    createLocalCategoryRule('merchant', 'Тестовый клуб', 'Зарплата', 'income');
    const table = parseCsv(
      'Дата;Сумма;Магазин\n11.09.2026;-500;Тестовый клуб\n11.09.2026;500;Тестовый клуб',
    );
    const source = {
      fileName: 'tbank.csv',
      fileFormat: 'csv',
      fileHash: 'directions',
      table,
      inspection: inspectStatementTable(table, 'tbank.csv'),
    };
    const data = loadLocalCategoryData();
    const preview = parseStatementTable({
      bank: 'tbank',
      accountName: 'Основной',
      source,
      categories: data.categories,
      categoryRules: data.rules,
    });
    assert.equal(data.rules.length, 2);
    assert.equal(preview.rows[0].category, 'Здоровье');
    assert.equal(preview.rows[1].category, 'Зарплата');
  });
});

test('edits to synthetic demo transactions persist as local overrides', () => {
  withLocalStorage(() => {
    const original = demoTransactions.find((item) => !item.isTransfer);
    assert.ok(original);
    updateLocalTransaction({ ...original, category: 'Спорт' });
    const saved = loadLocalFinanceData().transactions.find(
      (item) => item.id === original.id,
    );
    assert.equal(saved?.category, 'Спорт');
  });
});

test('custom names cannot shadow a category in another direction', () => {
  withLocalStorage(() => {
    assert.throws(
      () => createLocalCategory('Зарплата', 'expense'),
      /уже существует/,
    );
    createLocalCategory('Спорт', 'expense');
    assert.throws(
      () => createLocalCategory('спорт', 'income'),
      /уже существует/,
    );
  });
});

test('category rename and transfer matching run through invoker policies', async () => {
  const categoryMigration = await readFile(
    new URL(
      '../supabase/migrations/202609120004_category_management.sql',
      import.meta.url,
    ),
    'utf8',
  );
  const integrityMigration = await readFile(
    new URL(
      '../supabase/migrations/202609120003_import_integrity.sql',
      import.meta.url,
    ),
    'utf8',
  );
  assert.match(categoryMigration, /security invoker/);
  assert.match(categoryMigration, /categories_validate_before_write/);
  assert.match(categoryMigration, /add column if not exists direction/);
  assert.match(categoryMigration, /update public\.transactions/);
  assert.match(categoryMigration, /update public\.category_rules/);
  assert.match(integrityMigration, /security invoker/);
  assert.match(integrityMigration, /transfer_group_id/);
  assert.match(integrityMigration, /account_id <> new\.account_id/);
  assert.match(
    integrityMigration,
    /on conflict \(user_id, account_id, file_hash\) do update/,
  );
});
