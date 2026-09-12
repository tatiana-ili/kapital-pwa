import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { parseCsv, readStatementFile } from '../features/import/file-reader.ts';
import { bankStatementParsers } from '../features/import/banks/index.ts';
import { parseStoredMapping } from '../features/import/profile-mapping.ts';
import {
  loadLocalImportProfile,
  saveLocalStatement,
} from '../lib/local-finance-store.ts';
import { loadStatementImportProfile } from '../lib/supabase/imports.ts';
import {
  inspectStatementTable,
  parseAmount,
  parseDate,
  parseStatementTable,
} from '../features/import/parser.ts';

test('CSV reader keeps quoted delimiters and detects statement columns', () => {
  const table = parseCsv(
    [
      'Т-Банк;;;;;',
      'Дата операции;Сумма операции;Магазин;Описание;Валюта;Остаток',
      '11.09.2026;-2 450,50;ВкусВилл;"Продукты; дом";RUB;147 549,50',
    ].join('\n'),
  );
  const inspection = inspectStatementTable(table, 'statement.csv');

  assert.equal(inspection.detectedBank, 'tbank');
  assert.equal(inspection.headerRowIndex, 1);
  assert.equal(inspection.mapping.date, 0);
  assert.equal(inspection.mapping.amount, 1);
  assert.equal(table[2][3], 'Продукты; дом');
});

test('selected CSV file is read locally and receives a stable file hash', async () => {
  const file = new File(
    ['Дата;Сумма;Описание\n11.09.2026;-100;Покупка'],
    'sber-statement.csv',
    { type: 'text/csv' },
  );
  const source = await readStatementFile(file);

  assert.equal(source.fileFormat, 'csv');
  assert.equal(source.inspection.detectedBank, 'sber');
  assert.equal(source.fileHash.length, 64);
  assert.equal(source.table.length, 2);
});

test('statement parser normalizes amounts, marks transfer review and finds duplicates', () => {
  const table = parseCsv(
    [
      'Дата;Сумма;Магазин;Описание',
      '11.09.2026;-2 450,50;ВкусВилл;Продукты',
      '10.09.2026;-5 000,00;СБП;Перевод между своими счетами',
      '11.09.2026;-2 450,50;ВкусВилл;Продукты',
    ].join('\n'),
  );
  const inspection = inspectStatementTable(table, 'tbank.csv');
  const source = {
    fileName: 'tbank.csv',
    fileFormat: 'csv',
    fileHash: 'file-hash',
    table,
    inspection,
  };
  const preview = parseStatementTable({ bank: 'tbank', source });

  assert.equal(preview.rows[0].amount, -2450.5);
  assert.equal(preview.rows[0].category, 'Продукты');
  assert.equal(preview.rows[0].status, 'new');
  assert.equal(preview.rows[1].status, 'review');
  assert.equal(preview.rows[1].isTransfer, false);
  assert.equal(preview.rows[2].status, 'duplicate');
  assert.deepEqual(preview.counts, {
    new: 1,
    duplicate: 1,
    review: 1,
    error: 0,
  });
});

test('date and number parsers reject invalid values', () => {
  assert.equal(parseDate('31.02.2026'), '');
  assert.equal(parseDate('2026-09-11'), '2026-09-11');
  assert.equal(parseAmount('(1 234,56 ₽)'), -1234.56);
  assert.equal(parseAmount('—'), undefined);
});

test('Supabase import is atomic, authenticated and uses the existing RLS tables', async () => {
  const migration = await readFile(
    new URL(
      '../supabase/migrations/202609110002_statement_import.sql',
      import.meta.url,
    ),
    'utf8',
  );

  assert.match(
    migration,
    /create or replace function public\.commit_statement_import/,
  );
  assert.match(migration, /security invoker/);
  assert.match(migration, /current_user_id uuid := auth\.uid\(\)/);
  assert.match(migration, /on conflict \(user_id, source_hash\) do nothing/);
  assert.match(
    migration,
    /grant execute on function public\.commit_statement_import/,
  );
});

test('bank parsers detect the source and normalize representative CSV layouts', async () => {
  const cases = [
    {
      bank: 'tbank',
      fileName: 'tbank.csv',
      csv: 'Дата и время операции;Сумма операции;Название операции;Описание\n11.09.2026 12:00;-123,45;Тестовый магазин;Покупка',
      amount: -123.45,
    },
    {
      bank: 'sber',
      fileName: 'sber.csv',
      csv: 'Дата операции;Сумма операции;Сумма списания;Сумма зачисления;Получатель;Назначение платежа\n11.09.2026;123,45;123,45;;Тестовый магазин;Покупка',
      amount: -123.45,
    },
    {
      bank: 'yandex',
      fileName: 'yandex-bank.csv',
      csv: 'Дата и время;Списано;Зачислено;Название;Детали операции\n11.09.2026 12:00;;123,45;Тестовое начисление;Доход',
      amount: 123.45,
    },
    {
      bank: 'ozon',
      fileName: 'ozon-bank.csv',
      csv: 'Дата операции;Расход ₽;Приход ₽;Получатель;Назначение платежа\n11.09.2026;123,45;;Тестовый магазин;Покупка',
      amount: -123.45,
    },
  ];

  for (const item of cases) {
    const file = new File([item.csv], item.fileName, { type: 'text/csv' });
    const source = await readStatementFile(file);
    assert.equal(source.inspection.detectedBank, item.bank);
    const preview = bankStatementParsers[item.bank].parse({
      bank: item.bank,
      source,
    });
    assert.equal(preview.rows.length, 1);
    assert.equal(preview.rows[0].amount, item.amount);
    assert.equal(preview.rows[0].date, '2026-09-11');
    assert.equal(preview.rows[0].status, 'new');
  }
});

test('merchant in a generic statement does not masquerade as the issuing bank', async () => {
  const file = new File(
    ['Дата;Сумма;Магазин\n11.09.2026;-100;Ozon'],
    'statement.csv',
    { type: 'text/csv' },
  );
  const source = await readStatementFile(file);
  assert.equal(source.inspection.detectedBank, undefined);
});

test('demo imports retain a validated column profile for the next statement', () => {
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
    const input = {
      bank: 'sber',
      accountName: 'Тестовый счёт',
      sourceFile: 'sber.csv',
      fileFormat: 'csv',
      fileHash: 'test-file-hash',
      headerSignature: 'test-header-signature',
      columnMapping: { date: 0, expense: 2, merchant: 1 },
      rows: [],
    };
    saveLocalStatement(input);
    assert.deepEqual(
      loadLocalImportProfile('sber', 'csv', 'test-header-signature', 3),
      input.columnMapping,
    );
    assert.equal(
      loadLocalImportProfile('tbank', 'csv', 'test-header-signature', 3),
      undefined,
    );
    assert.equal(
      parseStoredMapping({ date: 0, amount: 99 }, 3),
      undefined,
    );
  } finally {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }
});

test('Supabase profile lookup uses the bank, format and header signature', async () => {
  const filters = [];
  const query = {
    select: () => query,
    eq: (field, value) => {
      filters.push([field, value]);
      return query;
    },
    maybeSingle: async () => ({
      data: { column_mapping: { date: 0, amount: 2 } },
      error: null,
    }),
  };
  const client = {
    from: (table) => {
      assert.equal(table, 'import_profiles');
      return query;
    },
  };

  assert.deepEqual(
    await loadStatementImportProfile(client, 'ozon', 'xlsx', 'headers-1', 3),
    { date: 0, amount: 2 },
  );
  assert.deepEqual(filters, [
    ['bank', 'ozon'],
    ['file_format', 'xlsx'],
    ['header_signature', 'headers-1'],
  ]);
});
