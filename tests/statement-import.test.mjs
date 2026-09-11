import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { parseCsv, readStatementFile } from '../features/import/file-reader.ts';
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
