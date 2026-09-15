import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { parseCsv, readStatementFile } from '../features/import/file-reader.ts';
import { describeStatementReadError } from '../features/import/read-error.ts';
import { bankStatementParsers } from '../features/import/banks/index.ts';
import { parseStoredMapping } from '../features/import/profile-mapping.ts';
import {
  loadLocalImportProfile,
  saveLocalStatement,
} from '../lib/local-finance-store.ts';
import { loadStatementImportProfile } from '../lib/supabase/imports.ts';
import { findTransferCounterpart } from '../features/import/transfers.ts';
import { parseKnownBankPdf } from '../features/import/pdf-layout.ts';
import {
  loadLocalFinanceData,
  updateLocalTransaction,
} from '../lib/local-finance-store.ts';
import { demoAccounts } from '../lib/demo-data.ts';
import {
  createTransactionFingerprint,
  inspectStatementTable,
  parseAmount,
  parseDate,
  parseStatementTable,
} from '../features/import/parser.ts';

function pdfPage(pageNumber, rows) {
  return {
    pageNumber,
    width: 595,
    height: 842,
    items: rows.flatMap(([y, cells]) =>
      cells.map(([x, str]) => ({
        str,
        x,
        y,
        width: Math.max(10, str.length * 4),
      })),
    ),
  };
}

function pdfSource(fileName, bankPdf) {
  const inspection = inspectStatementTable(bankPdf.table, fileName);
  inspection.detectedBank = bankPdf.bank;
  return {
    fileName,
    fileFormat: 'pdf',
    fileHash: `${bankPdf.bank}-pdf`,
    table: bankPdf.table,
    inspection,
    pdfDiagnostics: bankPdf.diagnostics,
  };
}

test('PDF module load failure offers a reload without exposing a chunk URL', () => {
  const cause = new Error(
    'Failed to load chunk /_next/static/chunks/299vvn65nf9yr.js from module 43169',
  );
  cause.name = 'ChunkLoadError';

  const result = describeStatementReadError(cause, 'statement.pdf');
  assert.equal(result.reloadSuggested, true);
  assert.match(result.message, /модуль чтения PDF/);
  assert.doesNotMatch(result.message, /_next|43169/);

  const invalidFile = describeStatementReadError(
    new Error('Файл больше 20 МБ.'),
    'statement.pdf',
  );
  assert.deepEqual(invalidFile, {
    message: 'Файл больше 20 МБ.',
    reloadSuggested: false,
  });
});

test('PDF text fragments are counted separately while incomplete operations remain visible', () => {
  const table = [
    ['Дата операции', 'Сумма операции', 'Магазин'],
    ['04.09.2026', '-3,90', 'Оплата услуг'],
    ['Продолжение описания', '', ''],
    ['Дата операции', 'Сумма операции', 'Магазин'],
    ['33', '', ''],
    ['05.09.2026', '', 'Неполная операция'],
  ];
  const source = {
    fileName: 'statement.pdf',
    fileFormat: 'pdf',
    fileHash: 'test-pdf',
    table,
    inspection: inspectStatementTable(table, 'statement.pdf'),
  };

  const preview = parseStatementTable({
    bank: 'sber',
    accountName: 'Тестовый счёт',
    source,
  });
  assert.equal(preview.pdfUnrecognizedLineCount, 3);
  assert.equal(preview.counts.new, 1);
  assert.equal(preview.counts.error, 1);
  assert.deepEqual(
    preview.rows.map((row) => row.rowNumber),
    [2, 6],
  );
  assert.deepEqual(
    preview.rows.map((row) => row.selected),
    [true, false],
  );
});

test('T-Bank PDF layout keeps wrapped descriptions and validates statement totals', () => {
  const parsed = parseKnownBankPdf(
    [
      pdfPage(1, [
        [
          760,
          [
            [50, 'Т-Банк'],
            [50, 'Справка о движении средств'],
          ],
        ],
        [
          730,
          [
            [50, 'Дата и время операции'],
            [290, 'Сумма операции в валюте карты'],
          ],
        ],
        [
          700,
          [
            [50, '11.09.2026'],
            [125, '11.09.2026'],
            [200, '-100.00 ₽'],
            [300, '-100.00 ₽'],
            [395, 'Оплата в GLOBUS'],
            [525, '1234'],
          ],
        ],
        [
          688,
          [
            [50, '10:15'],
            [125, '10:16'],
            [395, 'MOSCOW RUS'],
          ],
        ],
        [
          660,
          [
            [50, '10.09.2026'],
            [125, '10.09.2026'],
            [200, '+250.00 ₽'],
            [300, '+250.00 ₽'],
            [395, 'Пополнение. Система быстрых платежей'],
            [525, '1234'],
          ],
        ],
        [
          648,
          [
            [50, '09:30'],
            [125, '09:30'],
          ],
        ],
        [
          100,
          [
            [50, 'Пополнения:'],
            [125, '250.00 ₽'],
          ],
        ],
        [
          86,
          [
            [50, 'Расходы:'],
            [125, '100.00 ₽'],
          ],
        ],
      ]),
    ],
    'Справка_ТБанк.pdf',
  );

  assert.equal(parsed.bank, 'tbank');
  assert.equal(parsed.table.length, 3);
  assert.equal(parsed.table[1][2], -100);
  assert.equal(parsed.table[1][3], 'GLOBUS MOSCOW RUS');
  assert.equal(parsed.diagnostics.confidence, 'high');
  assert.ok(
    parsed.diagnostics.checks.every((check) => check.status === 'passed'),
  );
});

test('Yandex PDF layout uses contract currency and auto-confirms exact own-account transfers', () => {
  const parsed = parseKnownBankPdf(
    [
      pdfPage(1, [
        [780, [[20, 'Яндекс Банк']]],
        [
          750,
          [[20, 'Выписка по Договору за период с 01.01.2026 по 02.01.2026']],
        ],
        [
          730,
          [
            [20, 'Входящий остаток на 01.01.2026'],
            [520, '100,00 ₽'],
          ],
        ],
        [
          710,
          [
            [20, 'Описание операции'],
            [205, 'Дата и время операции МСК'],
          ],
        ],
        [
          680,
          [
            [20, 'Оплата товаров и услуг VKUSVILL'],
            [205, '01.01.2026'],
            [295, '01.01.2026'],
            [420, '-40,00 ₽'],
            [520, '-40,00 ₽'],
          ],
        ],
        [668, [[205, 'в 12:45']]],
        [
          640,
          [
            [20, 'Перевод между счетами одного клиента'],
            [205, '02.01.2026'],
            [295, '02.01.2026'],
            [420, '+10,00 ₽'],
            [520, '+10,00 ₽'],
          ],
        ],
        [628, [[205, 'в 09:10']]],
        [
          590,
          [
            [20, 'Исходящий остаток за 02.01.2026'],
            [520, '70,00 ₽'],
          ],
        ],
        [
          570,
          [
            [20, 'Всего расходных операций'],
            [520, '-40,00 ₽'],
          ],
        ],
        [
          550,
          [
            [20, 'Всего приходных операций'],
            [520, '+10,00 ₽'],
          ],
        ],
      ]),
    ],
    'Выписка_ЯндексБанк.pdf',
  );
  const source = pdfSource('Выписка_ЯндексБанк.pdf', parsed);
  const preview = parseStatementTable({
    bank: 'yandex',
    accountName: 'Яндекс Банк · Основной',
    source,
  });

  assert.equal(parsed.table[1][2], -40);
  assert.equal(parsed.table[1][3], 'VKUSVILL');
  assert.equal(parsed.diagnostics.confidence, 'high');
  assert.equal(preview.rows[1].isTransfer, true);
  assert.equal(preview.rows[1].status, 'new');
  assert.equal(preview.rows[1].selected, true);
  assert.match(preview.rows[0].sourceHash, /^v3-/);
});

test('Sber PDF layout treats unsigned debits as expenses and verifies both totals', () => {
  const parsed = parseKnownBankPdf(
    [
      pdfPage(1, [
        [
          780,
          [
            [45, 'СБЕР'],
            [45, 'Индивидуальная выписка по платёжному счёту'],
          ],
        ],
        [
          750,
          [
            [45, 'Дата операции (МСК)'],
            [145, 'Категория'],
            [470, 'Сумма в валюте счёта'],
          ],
        ],
        [
          700,
          [
            [45, '10.09.2026 04:09'],
            [145, 'Прочие расходы'],
            [500, '5 000,00'],
          ],
        ],
        [
          688,
          [
            [45, '10.09.2026'],
            [145, 'Автоплатёж дом интернет. Операция по карте'],
          ],
        ],
        [
          650,
          [
            [45, '09.09.2026 08:00'],
            [145, 'Прочие операции'],
            [500, '+1 000,00'],
          ],
        ],
        [
          638,
          [
            [45, '09.09.2026'],
            [145, 'Заработная плата. Операция по счёту'],
          ],
        ],
        [
          120,
          [
            [350, 'Пополнение'],
            [500, '+1 000,00'],
          ],
        ],
        [
          106,
          [
            [350, 'Списание'],
            [500, '5 000,00'],
          ],
        ],
      ]),
    ],
    'Выписка_Сбер.pdf',
  );

  assert.equal(parsed.bank, 'sber');
  assert.equal(parsed.table[1][2], -5000);
  assert.equal(parsed.table[2][2], 1000);
  assert.equal(parsed.diagnostics.confidence, 'high');
  assert.ok(
    parsed.diagnostics.checks.every((check) => check.status === 'passed'),
  );
});

test('PDF source references distinguish same-day repeated purchases without changing legacy hashes', () => {
  const common = {
    bank: 'tbank',
    accountName: 'Основной',
    date: '2026-09-11',
    amount: -100,
    merchant: 'Кофейня',
    description: 'Оплата в кофейне',
  };
  const legacy = createTransactionFingerprint(common);
  const first = createTransactionFingerprint({
    ...common,
    sourceReference: '10:00',
  });
  const second = createTransactionFingerprint({
    ...common,
    sourceReference: '18:00',
  });

  assert.match(legacy, /^v2-/);
  assert.match(first, /^v3-/);
  assert.notEqual(first, second);
});

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

test('statement parser normalizes amounts, recognizes an internal transfer and finds duplicates', () => {
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
  const preview = parseStatementTable({
    bank: 'tbank',
    accountName: 'Основной',
    source,
  });

  assert.equal(preview.rows[0].amount, -2450.5);
  assert.equal(preview.rows[0].category, 'Продукты');
  assert.equal(preview.rows[0].status, 'new');
  assert.equal(preview.rows[1].status, 'new');
  assert.equal(preview.rows[1].isTransfer, true);
  assert.equal(preview.rows[1].selected, true);
  assert.equal(preview.rows[2].status, 'duplicate');
  assert.deepEqual(preview.counts, {
    new: 2,
    duplicate: 1,
    review: 0,
    error: 0,
  });
});

test('an ordinary transfer to another bank does not require manual review', () => {
  const table = parseCsv(
    'Дата;Сумма;Магазин;Описание\n10.09.2026;-5000;Перевод на карту другого банка;Получатель',
  );
  const preview = parseStatementTable({
    bank: 'tbank',
    accountName: 'Основной',
    source: {
      fileName: 'tbank.csv',
      fileFormat: 'csv',
      fileHash: 'external-transfer',
      table,
      inspection: inspectStatementTable(table, 'tbank.csv'),
    },
  });

  assert.equal(preview.rows[0].status, 'new');
  assert.equal(preview.rows[0].isTransfer, false);
  assert.equal(preview.rows[0].selected, true);
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
      accountName: 'Основной',
      source,
    });
    assert.equal(preview.rows.length, 1);
    assert.equal(preview.rows[0].amount, item.amount);
    assert.equal(preview.rows[0].date, '2026-09-11');
    assert.equal(preview.rows[0].status, 'new');
  }
});

test('fingerprint separates accounts and still finds legacy rows on the same account', () => {
  const table = parseCsv(
    'Дата;Сумма;Магазин;Описание\n11.09.2026;-250;Тестовый магазин;Покупка',
  );
  const source = {
    fileName: 'tbank.csv',
    fileFormat: 'csv',
    fileHash: 'new-file',
    table,
    inspection: inspectStatementTable(table, 'tbank.csv'),
  };
  const existingTransactions = [
    {
      accountId: 'account-b',
      date: '2026-09-11',
      amount: -250,
      merchant: 'Тестовый магазин',
      description: 'Покупка',
      sourceHash: 'v1-legacy-hash',
    },
  ];

  const accountA = parseStatementTable({
    bank: 'tbank',
    accountName: 'Счёт А',
    existingAccountId: 'account-a',
    source,
    existingTransactions,
  });
  const accountB = parseStatementTable({
    bank: 'tbank',
    accountName: 'Счёт Б',
    existingAccountId: 'account-b',
    source,
    existingTransactions,
  });

  assert.equal(accountA.rows[0].status, 'new');
  assert.equal(accountB.rows[0].status, 'duplicate');
  assert.notEqual(accountA.rows[0].sourceHash, accountB.rows[0].sourceHash);
  assert.match(accountA.rows[0].sourceHash, /^v2-/);
  assert.equal(
    parseStatementTable({
      bank: 'tbank',
      accountName: 'сЧёТ а',
      existingAccountId: 'account-a',
      source,
    }).rows[0].sourceHash,
    accountA.rows[0].sourceHash,
  );
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
    assert.equal(parseStoredMapping({ date: 0, amount: 99 }, 3), undefined);
  } finally {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }
});

test('the same file can be imported once per account', () => {
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
    const base = {
      bank: 'tbank',
      sourceFile: 'same.csv',
      fileFormat: 'csv',
      fileHash: 'same-file-hash',
      headerSignature: 'headers',
      columnMapping: { date: 0, amount: 1 },
      rows: [],
    };
    assert.equal(
      saveLocalStatement({ ...base, accountName: 'Счёт А' }).alreadyImported,
      false,
    );
    assert.equal(
      saveLocalStatement({ ...base, accountName: 'Счёт А' }).alreadyImported,
      true,
    );
    assert.equal(
      saveLocalStatement({ ...base, accountName: 'Счёт Б' }).alreadyImported,
      false,
    );
    assert.equal(loadLocalFinanceData().imports.length, 2);
  } finally {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }
});

test('a later import of the same file can add a deferred review row', () => {
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
    const base = {
      bank: 'tbank',
      accountName: 'Основной',
      sourceFile: 'partial.csv',
      fileFormat: 'csv',
      fileHash: 'partial-file',
      headerSignature: 'headers',
      columnMapping: { date: 0, amount: 1 },
    };
    const row = (sourceHash, selected, status) => ({
      id: sourceHash,
      rowNumber: 2,
      date: '2026-09-11',
      amount: -100,
      currency: 'RUB',
      merchant: sourceHash,
      description: '',
      category: 'Прочее',
      transactionType: 'expense',
      isTransfer: false,
      excludedFromAnalytics: false,
      sourceHash,
      status,
      issues: [],
      selected,
    });
    const first = saveLocalStatement({
      ...base,
      rows: [row('v2-first', true, 'new'), row('v2-review', false, 'review')],
    });
    const retry = saveLocalStatement({
      ...base,
      rows: [
        row('v2-first', false, 'duplicate'),
        row('v2-review', true, 'review'),
      ],
    });
    const repeated = saveLocalStatement({
      ...base,
      rows: [row('v2-review', true, 'review')],
    });
    assert.equal(first.insertedCount, 1);
    assert.equal(retry.insertedCount, 1);
    assert.equal(retry.alreadyImported, false);
    assert.equal(repeated.insertedCount, 0);
    assert.equal(repeated.alreadyImported, true);
    assert.equal(loadLocalFinanceData().imports[0].insertedCount, 2);
  } finally {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }
});

test('demo import reuses an existing synthetic account by name', () => {
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
    saveLocalStatement({
      bank: 'tbank',
      accountName: 'black',
      sourceFile: 'demo.csv',
      fileFormat: 'csv',
      fileHash: 'existing-demo-account',
      headerSignature: 'headers',
      columnMapping: { date: 0, amount: 1 },
      rows: [],
    });
    assert.equal(
      loadLocalFinanceData().accounts[0].id,
      demoAccounts.find((account) => account.name === 'Black')?.id,
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

test('transfer matcher requires a unique cross-account counterpart', () => {
  const incoming = {
    accountId: 'new-account',
    date: '2026-09-11',
    amount: 5000,
    merchant: 'Пополнение счёта',
    description: 'СБП',
  };
  const outgoing = {
    id: 'outgoing',
    accountId: 'old-account',
    date: '2026-09-10',
    amount: -5000,
    merchant: 'Перевод между счетами',
    description: 'СБП',
  };
  assert.equal(findTransferCounterpart(incoming, [outgoing])?.id, 'outgoing');
  assert.equal(
    findTransferCounterpart(incoming, [outgoing, { ...outgoing, id: 'other' }]),
    undefined,
  );
  assert.equal(
    findTransferCounterpart(incoming, [
      { ...outgoing, accountId: 'new-account' },
    ]),
    undefined,
  );
  assert.equal(
    findTransferCounterpart(
      { ...incoming, merchant: 'Покупка', description: '' },
      [{ ...outgoing, merchant: 'Магазин', description: '' }],
    ),
    undefined,
  );
});

test('a unique opposite-side transfer is imported without manual confirmation', () => {
  const table = parseCsv(
    'Дата;Сумма;Магазин;Описание\n11.09.2026;5000;Пополнение счёта;СБП',
  );
  const source = {
    fileName: 'tbank.csv',
    fileFormat: 'csv',
    fileHash: 'incoming-transfer',
    table,
    inspection: inspectStatementTable(table, 'tbank.csv'),
  };
  const preview = parseStatementTable({
    bank: 'tbank',
    accountName: 'Новый счёт',
    existingAccountId: 'new-account',
    source,
    existingTransactions: [
      {
        id: 'outgoing',
        accountId: 'old-account',
        date: '2026-09-10',
        amount: -5000,
        merchant: 'Перевод между счетами',
        description: 'СБП',
      },
    ],
  });

  assert.equal(preview.rows[0].isTransfer, true);
  assert.equal(preview.rows[0].status, 'new');
  assert.equal(preview.rows[0].selected, true);
});

test('confirmed demo transfers link both sides and unlink together', () => {
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
    const row = (sourceHash, amount, merchant, isTransfer) => ({
      id: sourceHash,
      rowNumber: 2,
      date: '2026-09-11',
      amount,
      currency: 'RUB',
      merchant,
      description: 'СБП между своими счетами',
      category: 'Переводы',
      transactionType: isTransfer
        ? 'transfer'
        : amount > 0
          ? 'income'
          : 'expense',
      isTransfer,
      excludedFromAnalytics: isTransfer,
      sourceHash,
      status: 'review',
      issues: [],
      selected: true,
    });
    const input = (bank, accountName, fileHash, transaction) => ({
      bank,
      accountName,
      sourceFile: `${bank}.csv`,
      fileFormat: 'csv',
      fileHash,
      headerSignature: 'headers',
      columnMapping: { date: 0, amount: 1 },
      rows: [transaction],
    });
    saveLocalStatement(
      input(
        'tbank',
        'Основной',
        'out-file',
        row('v2-out', -5000, 'Перевод', false),
      ),
    );
    saveLocalStatement(
      input(
        'sber',
        'Основной',
        'in-file',
        row('v2-in', 5000, 'Пополнение счёта', true),
      ),
    );

    const linked = loadLocalFinanceData().transactions;
    assert.equal(linked.length, 2);
    assert.equal(linked[0].isTransfer, true);
    assert.equal(linked[1].isTransfer, true);
    assert.equal(linked[0].transferGroupId, linked[1].transferGroupId);
    assert.equal(linked[0].excludedFromAnalytics, true);
    assert.equal(linked[1].excludedFromAnalytics, true);

    updateLocalTransaction({
      ...linked[1],
      isTransfer: false,
      transactionType: 'income',
      excludedFromAnalytics: false,
    });
    const unlinked = loadLocalFinanceData().transactions;
    assert.equal(unlinked[0].isTransfer, false);
    assert.equal(unlinked[1].isTransfer, false);
    assert.equal(unlinked[0].transferGroupId, undefined);
    assert.equal(unlinked[1].transferGroupId, undefined);
  } finally {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }
});
