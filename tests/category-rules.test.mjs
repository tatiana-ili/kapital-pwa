import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { parseCsv } from '../features/import/file-reader.ts';
import {
  inspectStatementTable,
  parseStatementTable,
} from '../features/import/parser.ts';
import {
  auditLocalCategoryRules,
  createLocalCategory,
  createLocalCategoryRule,
  loadLocalCategoryData,
  renameLocalCategory,
  setLocalCategoryRuleActive,
  updateLocalCategoryRule,
} from '../lib/local-categories-store.ts';
import {
  loadLocalFinanceData,
  saveLocalStatement,
  updateLocalTransaction,
} from '../lib/local-finance-store.ts';
import { demoTransactions } from '../lib/demo-data.ts';
import {
  ownTransferChanges,
  transactionCanBeAddedToTarget,
  transactionMatchesReviewTarget,
} from '../features/categories/review.ts';
import {
  applyCategoryRules,
  findMatchingCategoryRule,
} from '../features/categories/rules.ts';
import { planCategoryRuleAudit } from '../features/categories/audit.ts';
import {
  loadLocalPlanningData,
  saveLocalBudget,
} from '../lib/local-planning-store.ts';
import {
  auditStoredCategoryRules,
  createCategory as createRemoteCategory,
  createCategoryRule as createRemoteCategoryRule,
  updateCategoryRule as updateRemoteCategoryRule,
} from '../lib/supabase/categories.ts';

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

test('new category rules match any comma-separated keyword across operation fields', () => {
  const categories = loadLocalCategoryData().categories;
  const rule = {
    id: 'all-fields',
    name: 'Операция содержит «Ozon, абонемент»',
    priority: 100,
    field: 'all',
    operator: 'contains',
    value: 'Ozon, абонемент',
    direction: 'expense',
    targetCategory: 'Продукты',
    isActive: true,
  };
  for (const input of [
    { merchant: 'Ozon', description: '', amount: -100 },
    { merchant: 'Клуб', description: 'Оплата абонемента', amount: -100 },
    { merchant: 'Клуб', description: '', amount: -100, sourceFile: 'ozon.csv' },
  ]) {
    assert.equal(
      applyCategoryRules(input, 'Прочее', categories, [rule]),
      'Продукты',
    );
  }
  assert.equal(
    applyCategoryRules(
      { merchant: 'Клуб', description: '', amount: -100, bank: 'sber' },
      'Прочее',
      categories,
      [{ ...rule, value: 'Сбер, Яндекс' }],
    ),
    'Продукты',
  );
  assert.equal(
    applyCategoryRules(
      { merchant: 'Клуб', description: 'Обычная покупка', amount: -100 },
      'Прочее',
      categories,
      [rule],
    ),
    'Прочее',
  );
  assert.equal(
    applyCategoryRules(
      { merchant: 'Ozon', description: '', amount: 100 },
      'Прочее',
      categories,
      [rule],
    ),
    'Прочее',
  );
  assert.equal(
    applyCategoryRules(
      { merchant: 'Ozon', description: '', amount: -100 },
      'Прочее',
      categories,
      [{ ...rule, field: 'merchant', value: 'Ozon, абонемент' }],
    ),
    'Прочее',
  );
});

test('review finds the active rule matching an operation description', () => {
  const categories = loadLocalCategoryData().categories;
  const rule = {
    id: 'description-rule',
    name: 'Описание содержит «Абонемент»',
    priority: 100,
    field: 'description',
    operator: 'contains',
    value: 'Абонемент',
    direction: 'expense',
    targetCategory: 'Здоровье',
    isActive: true,
  };
  const operation = {
    merchant: 'Тестовый клуб',
    description: 'Оплата АБОНЕМЕНТА',
    amount: -1500,
  };
  assert.equal(
    findMatchingCategoryRule(operation, categories, [rule])?.id,
    rule.id,
  );
  assert.equal(
    findMatchingCategoryRule(operation, categories, [
      { ...rule, isActive: false },
    ]),
    undefined,
  );
  assert.equal(
    findMatchingCategoryRule({ ...operation, amount: 1500 }, categories, [
      rule,
    ]),
    undefined,
  );
});

test('rule audit removes duplicates and merges adjacent keywords without changing matches', () => {
  const rules = [
    {
      id: 'ozon',
      priority: 98,
      field: 'all',
      value: 'Ozon',
      targetCategory: 'Маркетплейсы',
    },
    {
      id: 'wildberries',
      priority: 99,
      field: 'all',
      value: 'Wildberries',
      targetCategory: 'Маркетплейсы',
    },
    {
      id: 'ozon-duplicate',
      priority: 100,
      field: 'all',
      value: 'OZON',
      targetCategory: 'Маркетплейсы',
    },
    {
      id: 'taxi',
      priority: 101,
      field: 'all',
      value: 'Такси',
      targetCategory: 'Такси',
    },
  ].map((rule) => ({
    name: rule.id,
    operator: 'contains',
    direction: 'expense',
    isActive: true,
    ...rule,
  }));
  const plan = planCategoryRuleAudit(rules);
  assert.equal(plan.duplicatesRemoved, 1);
  assert.equal(plan.mergedRules, 1);
  assert.equal(plan.rules.length, 2);
  assert.equal(plan.rules[0].value, 'Ozon, Wildberries');
  const categories = loadLocalCategoryData().categories;
  for (const merchant of ['Ozon', 'Wildberries', 'Такси', 'Другое']) {
    const operation = { merchant, description: '', amount: -100 };
    assert.equal(
      applyCategoryRules(operation, 'Прочее', categories, rules),
      applyCategoryRules(operation, 'Прочее', categories, plan.rules),
    );
  }
  const separated = planCategoryRuleAudit([
    rules[0],
    { ...rules[3], priority: 99 },
    { ...rules[1], priority: 100 },
  ]);
  assert.equal(separated.mergedRules, 0);
});

test('an all-fields rule does not match an already assigned category', () => {
  const categories = loadLocalCategoryData().categories;
  const rule = {
    id: 'category-name',
    name: 'Операция содержит «Здоровье»',
    priority: 100,
    field: 'all',
    operator: 'contains',
    value: 'Здоровье',
    direction: 'expense',
    targetCategory: 'Транспорт',
    isActive: true,
  };
  assert.equal(
    applyCategoryRules(
      {
        merchant: 'Клуб',
        description: 'Оплата',
        amount: -100,
        category: 'Здоровье',
      },
      'Здоровье',
      categories,
      [rule],
    ),
    'Здоровье',
  );
});

test('an all-fields rule applies to previously imported operations', () => {
  withLocalStorage(() => {
    const table = parseCsv(
      'Дата;Сумма;Магазин;Описание\n11.09.2026;-1500;Тестовый клуб;Абонемент',
    );
    const source = {
      fileName: 'tbank.csv',
      fileFormat: 'csv',
      fileHash: 'all-fields-rule',
      table,
      inspection: inspectStatementTable(table, 'tbank.csv'),
    };
    const preview = parseStatementTable({
      bank: 'tbank',
      accountName: 'Основной',
      source,
    });
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
    createLocalCategoryRule(
      'all',
      'неизвестно, абонемент',
      'Здоровье',
      'expense',
    );
    assert.equal(loadLocalFinanceData().transactions[0].category, 'Здоровье');
  });
});

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

test('creating or changing a category rule updates existing local operations', () => {
  withLocalStorage(() => {
    const table = parseCsv(
      'Дата;Сумма;Магазин;Описание\n11.09.2026;-1500;Тестовый клуб;Абонемент',
    );
    const source = {
      fileName: 'tbank.csv',
      fileFormat: 'csv',
      fileHash: 'existing-category-rule-file',
      table,
      inspection: inspectStatementTable(table, 'tbank.csv'),
    };
    const preview = parseStatementTable({
      bank: 'tbank',
      accountName: 'Основной',
      source,
    });
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
    assert.equal(loadLocalFinanceData().transactions[0].category, 'Прочее');

    createLocalCategoryRule('merchant', 'Тестовый клуб', 'Здоровье', 'expense');
    assert.equal(loadLocalFinanceData().transactions[0].category, 'Здоровье');

    const changedRule = createLocalCategoryRule(
      'merchant',
      'Тестовый клуб',
      'Развлечения',
      'expense',
    );
    assert.equal(
      loadLocalFinanceData().transactions[0].category,
      'Развлечения',
    );

    setLocalCategoryRuleActive(changedRule.id, false);
    const saved = loadLocalFinanceData().transactions[0];
    updateLocalTransaction({ ...saved, category: 'Прочее' });
    setLocalCategoryRuleActive(changedRule.id, true);
    assert.equal(
      loadLocalFinanceData().transactions[0].category,
      'Развлечения',
    );
  });
});

test('a newly added matching rule takes precedence for existing operations', () => {
  withLocalStorage(() => {
    const table = parseCsv(
      'Дата;Сумма;Магазин;Описание\n11.09.2026;-1500;Тестовый клуб;Абонемент',
    );
    const source = {
      fileName: 'clubs.csv',
      fileFormat: 'csv',
      fileHash: 'rule-priority',
      table,
      inspection: inspectStatementTable(table, 'clubs.csv'),
    };
    const preview = parseStatementTable({
      bank: 'tbank',
      accountName: 'Основной',
      source,
    });
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
    createLocalCategoryRule('merchant', 'Тестовый клуб', 'Здоровье', 'expense');
    const newer = createLocalCategoryRule(
      'description',
      'Абонемент',
      'Транспорт',
      'expense',
    );
    const data = loadLocalCategoryData();
    const operation = loadLocalFinanceData().transactions[0];
    assert.equal(operation.category, 'Транспорт');
    assert.equal(
      findMatchingCategoryRule(operation, data.categories, data.rules)?.id,
      newer.id,
    );
  });
});

test('rule audit reapplies rules to every existing local operation and verifies the result', () => {
  withLocalStorage(() => {
    const table = parseCsv(
      'Дата;Сумма;Магазин;Описание\n11.09.2026;-1500;Тестовый клуб;Абонемент',
    );
    const source = {
      fileName: 'clubs.csv',
      fileFormat: 'csv',
      fileHash: 'audit-existing-rules',
      table,
      inspection: inspectStatementTable(table, 'clubs.csv'),
    };
    const preview = parseStatementTable({
      bank: 'tbank',
      accountName: 'Основной',
      source,
    });
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
    createLocalCategoryRule('merchant', 'Тестовый клуб', 'Здоровье', 'expense');
    const saved = loadLocalFinanceData().transactions[0];
    updateLocalTransaction({ ...saved, category: 'Прочее' });
    const report = auditLocalCategoryRules();
    assert.ok(report.checkedTransactions > 1);
    assert.equal(report.recategorized, 1);
    assert.equal(loadLocalFinanceData().transactions[0].category, 'Здоровье');
    assert.equal(auditLocalCategoryRules().recategorized, 0);
  });
});

test('editing a rule takes precedence over another matching rule and recategorizes history', () => {
  withLocalStorage(() => {
    const table = parseCsv(
      'Дата;Сумма;Магазин;Описание\n11.09.2026;-1500;Тестовый клуб;Абонемент',
    );
    const source = {
      fileName: 'clubs.csv',
      fileFormat: 'csv',
      fileHash: 'edited-rule-priority',
      table,
      inspection: inspectStatementTable(table, 'clubs.csv'),
    };
    const preview = parseStatementTable({
      bank: 'tbank',
      accountName: 'Основной',
      source,
    });
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
    const first = createLocalCategoryRule(
      'merchant',
      'Тестовый клуб',
      'Здоровье',
      'expense',
    );
    const second = createLocalCategoryRule(
      'description',
      'Абонемент',
      'Транспорт',
      'expense',
    );
    assert.equal(loadLocalFinanceData().transactions[0].category, 'Транспорт');
    const edited = updateLocalCategoryRule(
      first.id,
      'merchant',
      'Тестовый клуб',
      'Здоровье',
      'expense',
    );
    assert.ok(edited.priority < second.priority);
    assert.equal(loadLocalFinanceData().transactions[0].category, 'Здоровье');
  });
});

test('editing a rule keeps its identity and applies the new condition to existing operations', () => {
  withLocalStorage(() => {
    const table = parseCsv(
      'Дата;Сумма;Магазин\n11.09.2026;-500;Первый клуб\n12.09.2026;-700;Второй клуб',
    );
    const source = {
      fileName: 'clubs.csv',
      fileFormat: 'csv',
      fileHash: 'editable-rule',
      table,
      inspection: inspectStatementTable(table, 'clubs.csv'),
    };
    const preview = parseStatementTable({
      bank: 'tbank',
      accountName: 'Основной',
      source,
    });
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
    const rule = createLocalCategoryRule(
      'merchant',
      'Первый клуб',
      'Здоровье',
      'expense',
    );
    createLocalCategoryRule(
      'description',
      'Абонемент',
      'Развлечения',
      'expense',
    );
    const edited = updateLocalCategoryRule(
      rule.id,
      'merchant',
      ' Второй клуб ',
      'Транспорт',
      'expense',
    );
    assert.equal(edited.id, rule.id);
    assert.equal(edited.name, 'Продавец содержит «Второй клуб»');
    assert.ok(edited.priority < rule.priority);
    assert.equal(
      loadLocalFinanceData().transactions.find(
        (item) => item.merchant === 'Второй клуб',
      )?.category,
      'Транспорт',
    );
    assert.throws(
      () =>
        updateLocalCategoryRule(
          rule.id,
          'description',
          'Абонемент',
          'Транспорт',
          'expense',
        ),
      /уже существует/,
    );
    assert.equal(
      loadLocalCategoryData().rules.find((item) => item.id === rule.id)?.value,
      'Второй клуб',
    );
  });
});

test('editing a disabled rule does not apply it until enabled', () => {
  withLocalStorage(() => {
    const rule = createLocalCategoryRule(
      'merchant',
      'Первый клуб',
      'Здоровье',
      'expense',
    );
    setLocalCategoryRuleActive(rule.id, false);
    const edited = updateLocalCategoryRule(
      rule.id,
      'merchant',
      'Второй клуб',
      'Транспорт',
      'expense',
    );
    assert.equal(edited.isActive, false);
    assert.equal(
      loadLocalCategoryData().rules.find((item) => item.id === rule.id)
        ?.isActive,
      false,
    );
  });
});

test('a remote category rule updates matches beyond the first 500 operations', async () => {
  const transactions = Array.from({ length: 501 }, (_, index) => ({
    id: `transaction-${index}`,
    merchant: index === 500 ? 'Тестовый клуб' : `Магазин ${index}`,
    description: 'Операция',
    amount: -500,
    category: 'Прочее',
    is_transfer: false,
  }));
  const rules = [];
  const ranges = [];
  const updates = [];

  function filterQuery(result, expectedFilters) {
    let remainingFilters = expectedFilters;
    const query = {
      eq() {
        remainingFilters -= 1;
        return remainingFilters === 0 ? Promise.resolve(result) : query;
      },
    };
    return query;
  }

  const client = {
    auth: {
      async getUser() {
        return { data: { user: { id: 'user-1' } }, error: null };
      },
    },
    from(table) {
      if (table === 'categories') {
        return {
          select(columns) {
            if (columns === 'direction') {
              return filterQuery(
                {
                  data: [{ direction: 'expense' }],
                  error: null,
                },
                1,
              );
            }
            return {
              async order() {
                return {
                  data: [
                    {
                      id: 'health',
                      name: 'Здоровье',
                      direction: 'expense',
                      is_system: true,
                    },
                  ],
                  error: null,
                };
              },
            };
          },
        };
      }
      if (table === 'category_rules') {
        return {
          select(columns) {
            if (columns === 'id,value') {
              return filterQuery({ data: [], error: null }, 3);
            }
            return {
              async order() {
                return { data: rules, error: null };
              },
            };
          },
          async insert(payload) {
            rules.push({
              id: 'rule-1',
              name: payload.name,
              priority: payload.priority,
              field: payload.field,
              operator: payload.operator,
              value: payload.value,
              direction: payload.direction,
              target_category: payload.target_category,
              is_active: payload.is_active,
            });
            return { error: null };
          },
        };
      }
      if (table === 'transactions') {
        return {
          select() {
            return {
              order() {
                return {
                  async range(start, end) {
                    ranges.push([start, end]);
                    return {
                      data: transactions.slice(start, end + 1),
                      error: null,
                    };
                  },
                };
              },
            };
          },
          update(payload) {
            return {
              async in(_field, ids) {
                updates.push({ category: payload.category, ids });
                for (const transaction of transactions) {
                  if (ids.includes(transaction.id)) {
                    transaction.category = payload.category;
                  }
                }
                return { error: null };
              },
            };
          },
        };
      }
      throw new Error(`Unexpected table: ${table}`);
    },
  };

  const updatedCount = await createRemoteCategoryRule(
    client,
    'merchant',
    'Тестовый клуб',
    'Здоровье',
    'expense',
  );

  assert.equal(updatedCount, 1);
  assert.deepEqual(ranges, [
    [0, 499],
    [500, 999],
  ]);
  assert.deepEqual(updates, [
    { category: 'Здоровье', ids: ['transaction-500'] },
  ]);
  transactions[500].category = 'Прочее';
  const audit = await auditStoredCategoryRules(client);
  assert.equal(audit.checkedTransactions, 501);
  assert.equal(audit.recategorized, 1);
  assert.equal(transactions[500].category, 'Здоровье');
});

test('remote rule audit persists duplicate removal and merged conditions', async () => {
  const rows = [
    { id: 'ozon', priority: 98, value: 'Ozon' },
    { id: 'wildberries', priority: 99, value: 'Wildberries' },
    { id: 'ozon-duplicate', priority: 100, value: 'OZON' },
  ].map((rule) => ({
    name: rule.value,
    field: 'all',
    operator: 'contains',
    direction: 'expense',
    target_category: 'Маркетплейсы',
    is_active: true,
    ...rule,
  }));
  const client = {
    from(table) {
      if (table === 'categories') {
        return {
          select() {
            return {
              async order() {
                return {
                  data: [
                    {
                      id: 'market',
                      name: 'Маркетплейсы',
                      direction: 'expense',
                      is_system: true,
                    },
                  ],
                  error: null,
                };
              },
            };
          },
        };
      }
      if (table === 'category_rules') {
        return {
          select() {
            return {
              async order() {
                return { data: rows, error: null };
              },
            };
          },
          update(changes) {
            return {
              async eq(_field, id) {
                Object.assign(
                  rows.find((rule) => rule.id === id),
                  changes,
                );
                return { error: null };
              },
            };
          },
          delete() {
            return {
              async in(_field, ids) {
                for (let index = rows.length - 1; index >= 0; index -= 1) {
                  if (ids.includes(rows[index].id)) rows.splice(index, 1);
                }
                return { error: null };
              },
            };
          },
        };
      }
      if (table === 'transactions') {
        return {
          select() {
            return {
              order() {
                return {
                  async range() {
                    return { data: [], error: null };
                  },
                };
              },
            };
          },
        };
      }
      throw new Error(`Unexpected table: ${table}`);
    },
  };
  const report = await auditStoredCategoryRules(client);
  assert.equal(report.duplicatesRemoved, 1);
  assert.equal(report.mergedRules, 1);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].value, 'Ozon, Wildberries');
});

test('editing a remote rule saves its condition and reapplies active rules', async () => {
  const rows = [
    {
      id: 'rule-1',
      name: 'Продавец содержит «Старый»',
      priority: 100,
      field: 'merchant',
      operator: 'contains',
      value: 'Старый',
      direction: 'expense',
      target_category: 'Здоровье',
      is_active: true,
    },
  ];
  const updates = [];
  let transactionReads = 0;
  const client = {
    from(table) {
      if (table === 'categories') {
        return {
          select() {
            return {
              async order() {
                return {
                  data: [
                    {
                      id: 'health',
                      name: 'Здоровье',
                      direction: 'expense',
                      is_system: true,
                    },
                    {
                      id: 'transport',
                      name: 'Транспорт',
                      direction: 'expense',
                      is_system: true,
                    },
                  ],
                  error: null,
                };
              },
            };
          },
        };
      }
      if (table === 'category_rules') {
        return {
          select() {
            return {
              async order() {
                return { data: rows, error: null };
              },
            };
          },
          update(payload) {
            return {
              async eq(_column, id) {
                updates.push({ id, payload });
                Object.assign(rows[0], payload);
                return { error: null };
              },
            };
          },
        };
      }
      if (table === 'transactions') {
        return {
          select() {
            return {
              order() {
                return {
                  async range() {
                    transactionReads += 1;
                    return { data: [], error: null };
                  },
                };
              },
            };
          },
        };
      }
      throw new Error(`Unexpected table: ${table}`);
    },
  };
  const count = await updateRemoteCategoryRule(
    client,
    'rule-1',
    'description',
    ' Новое ',
    'Транспорт',
    'expense',
  );
  assert.equal(count, 0);
  assert.deepEqual(updates, [
    {
      id: 'rule-1',
      payload: {
        name: 'Описание содержит «Новое»',
        priority: 99,
        field: 'description',
        value: 'Новое',
        target_category: 'Транспорт',
        direction: 'expense',
      },
    },
  ]);
  assert.equal(transactionReads, 1);
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

test('an existing personal category can be extended to income', () => {
  withLocalStorage(() => {
    assert.throws(
      () => createLocalCategory('Зарплата', 'expense'),
      /Название занято стандартной категорией/,
    );
    const created = createLocalCategory('Спорт', 'expense');
    const extended = createLocalCategory('спорт', 'income');
    assert.equal(extended.id, created.id);
    assert.equal(extended.direction, 'both');
    assert.equal(
      loadLocalCategoryData().categories.filter(
        (item) => item.id === created.id,
      ).length,
      1,
    );
    assert.throws(() => createLocalCategory('Спорт', 'income'), /уже доступна/);
  });
});

test('an income category is saved remotely and an existing expense category can be extended', async () => {
  const categories = [];
  const client = {
    auth: {
      async getUser() {
        return { data: { user: { id: 'user-1' } }, error: null };
      },
    },
    from(table) {
      if (table === 'categories') {
        return {
          select() {
            return {
              async order() {
                return { data: categories, error: null };
              },
            };
          },
          async insert(row) {
            categories.push({ id: `category-${categories.length}`, ...row });
            return { error: null };
          },
          update(changes) {
            return {
              async eq(_field, id) {
                Object.assign(
                  categories.find((item) => item.id === id),
                  changes,
                );
                return { error: null };
              },
            };
          },
        };
      }
      if (table === 'category_rules') {
        return {
          select() {
            return {
              async order() {
                return { data: [], error: null };
              },
            };
          },
        };
      }
      throw new Error(`Unexpected table: ${table}`);
    },
  };
  await createRemoteCategory(client, 'Подработка', 'income');
  assert.equal(categories[0].direction, 'income');
  await createRemoteCategory(client, 'Спорт', 'expense');
  await createRemoteCategory(client, 'спорт', 'income');
  assert.equal(categories.length, 2);
  assert.equal(categories[1].direction, 'both');
});

test('category review keeps category and own-transfer status independent', () => {
  const transfer = demoTransactions.find((item) => item.isTransfer);
  const expense = demoTransactions.find(
    (item) => !item.isTransfer && item.amount < 0,
  );
  assert.ok(transfer);
  assert.ok(expense);

  const ownTransfers = { kind: 'own-transfers' };
  const groceries = {
    kind: 'category',
    category: {
      id: 'groceries',
      name: expense.category,
      direction: 'expense',
      isSystem: true,
    },
  };

  assert.equal(transactionMatchesReviewTarget(transfer, ownTransfers), true);
  assert.equal(transactionMatchesReviewTarget(expense, ownTransfers), false);
  assert.equal(transactionMatchesReviewTarget(expense, groceries), true);
  assert.equal(transactionCanBeAddedToTarget(transfer, groceries), true);
  assert.equal(
    transactionCanBeAddedToTarget(
      { ...expense, amount: Math.abs(expense.amount) },
      groceries,
    ),
    false,
  );
});

test('own-transfer review updates analytics flags without changing category', () => {
  const expense = demoTransactions.find(
    (item) => !item.isTransfer && item.amount < 0,
  );
  assert.ok(expense);

  const markChanges = ownTransferChanges(expense, true);
  assert.deepEqual(markChanges, {
    isTransfer: true,
    transactionType: 'transfer',
    excludedFromAnalytics: true,
  });
  assert.deepEqual(ownTransferChanges(expense, false), {
    isTransfer: false,
    transactionType: 'expense',
    excludedFromAnalytics: false,
  });
  assert.equal('category' in markChanges, false);
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
