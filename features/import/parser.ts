import {
  bankNames,
  type BankCode,
  type BankName,
  type FinanceTransaction,
  type TransactionType,
} from '../../lib/finance-data.ts';
import type {
  ColumnMapping,
  ImportColumnKey,
  ImportInspection,
  ParsedImportRow,
  ParseStatementOptions,
  StatementCell,
  StatementPreview,
  StatementTable,
} from './types.ts';

const columnAliases: Record<ImportColumnKey, RegExp[]> = {
  date: [
    /^дата$/,
    /дата операции/,
    /operation date/,
    /transaction date/,
    /^date$/,
  ],
  postedDate: [
    /дата (обработки|проводки|платежа|списания)/,
    /posted date/,
    /processing date/,
  ],
  amount: [
    /^сумма$/,
    /сумма операции/,
    /сумма в валюте/,
    /^amount$/,
    /transaction amount/,
  ],
  expense: [/^расход/, /^списан/, /^debit$/, /withdrawal/],
  income: [/^приход/, /^зачислен/, /^credit$/, /deposit/],
  merchant: [
    /^магазин$/,
    /^merchant$/,
    /место операции/,
    /название операции/,
    /получатель/,
    /контрагент/,
  ],
  description: [
    /^описание$/,
    /назначение платежа/,
    /^детали$/,
    /^комментарий$/,
    /^description$/,
    /operation details/,
  ],
  currency: [/^валюта$/, /валюта операции/, /^currency$/],
  balance: [/^остаток/, /баланс после/, /^balance/],
};

const bankMatchers: Array<[BankCode, RegExp[]]> = [
  ['tbank', [/т[ -]?банк/i, /тинькофф/i, /tinkoff/i, /tbank/i]],
  ['sber', [/сбер/i, /sber/i]],
  ['yandex', [/яндекс/i, /yandex/i]],
  ['ozon', [/ozon/i, /озон/i]],
];

const bankCodesByName: Record<BankName, BankCode> = {
  'Т-Банк': 'tbank',
  Сбер: 'sber',
  'Яндекс Банк': 'yandex',
  'Ozon Банк': 'ozon',
};

const categoryRules: Array<[string, RegExp]> = [
  [
    'Продукты',
    /пят[её]роч|перекр[её]ст|вкусвилл|магнит|лента|самокат|продукт/i,
  ],
  [
    'Кафе и рестораны',
    /кафе|coffee|кофе|restaurant|ресторан|бургер|kfc|вкусно/i,
  ],
  ['Такси', /такси|taxi|яндекс go|uber/i],
  ['Транспорт', /метро|транспорт|ржд|аэрофлот|автобус/i],
  ['Маркетплейсы', /ozon|wildberries|вайлдберриз|marketplace|яндекс маркет/i],
  ['Подписки', /подписк|subscription|яндекс плюс|spotify|netflix|ivi|okko/i],
  ['Связь и интернет', /мтс|мегафон|билайн|tele2|ростелеком|интернет/i],
  ['Коммунальные услуги', /жкх|коммунал|квартплат|электроэнерг/i],
  ['Здоровье', /аптек|клиник|медицин|health/i],
  ['Красота', /салон|космет|beauty/i],
  ['Образование', /образован|курс|school|университет/i],
  ['Развлечения', /кино|театр|билет|развлеч/i],
  ['Финансовые услуги', /комисси|страхован|процент по кредит/i],
  ['Наличные', /банкомат|снятие налич/i],
];

const transferPattern =
  /перевод|transfer|сбп|между счетами|на карту|с карты|пополнение счета/i;
const refundPattern = /возврат|refund|отмена операции|reversal/i;

export class StatementParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StatementParseError';
  }
}

export function normalizeCell(value: StatementCell) {
  if (value instanceof Date) return formatDateParts(value);
  return String(value ?? '')
    .replace(/^\ufeff/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeHeader(value: StatementCell) {
  return normalizeCell(value)
    .toLocaleLowerCase('ru')
    .replace(/[«»"']/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function matchColumn(headers: string[], key: ImportColumnKey) {
  return headers.findIndex((header) =>
    columnAliases[key].some((pattern) => pattern.test(header)),
  );
}

function inferMapping(headers: string[]): ColumnMapping {
  const mapping: ColumnMapping = {};
  (Object.keys(columnAliases) as ImportColumnKey[]).forEach((key) => {
    const index = matchColumn(headers, key);
    if (index >= 0) mapping[key] = index;
  });
  return mapping;
}

function mappingScore(mapping: ColumnMapping) {
  let score = Object.keys(mapping).length;
  if (mapping.date !== undefined) score += 4;
  if (
    mapping.amount !== undefined ||
    mapping.expense !== undefined ||
    mapping.income !== undefined
  ) {
    score += 4;
  }
  if (mapping.merchant !== undefined || mapping.description !== undefined) {
    score += 2;
  }
  return score;
}

function detectBank(fileName: string, table: StatementTable) {
  const sample = `${fileName} ${table
    .slice(0, 15)
    .flat()
    .map(normalizeCell)
    .join(' ')}`;
  return bankMatchers.find(([, patterns]) =>
    patterns.some((pattern) => pattern.test(sample)),
  )?.[0];
}

export function inspectStatementTable(
  table: StatementTable,
  fileName = '',
): ImportInspection {
  if (!table.length) {
    throw new StatementParseError('В файле нет строк для импорта.');
  }

  let headerRowIndex = 0;
  let headers = table[0]?.map(normalizeHeader) ?? [];
  let mapping = inferMapping(headers);
  let bestScore = mappingScore(mapping);

  table.slice(0, 25).forEach((row, index) => {
    const candidateHeaders = row.map(normalizeHeader);
    const candidateMapping = inferMapping(candidateHeaders);
    const score = mappingScore(candidateMapping);
    if (score > bestScore) {
      headerRowIndex = index;
      headers = candidateHeaders;
      mapping = candidateMapping;
      bestScore = score;
    }
  });

  const displayHeaders = (table[headerRowIndex] ?? []).map((value, index) => {
    const label = normalizeCell(value);
    return label || `Колонка ${index + 1}`;
  });

  return {
    detectedBank: detectBank(fileName, table),
    headerRowIndex,
    headers: displayHeaders,
    headerSignature: stableHash(headers.join('|')),
    mapping,
  };
}

export function parseStatementTable({
  bank,
  source,
  mapping = source.inspection.mapping,
  existingTransactions = [],
}: ParseStatementOptions): StatementPreview {
  validateMapping(mapping);

  const existingHashes = new Set(
    existingTransactions.map(
      (transaction) =>
        transaction.sourceHash || fingerprintExisting(transaction),
    ),
  );
  const seenHashes = new Set<string>();
  const rows: ParsedImportRow[] = [];
  let endingBalance: number | undefined;

  source.table
    .slice(source.inspection.headerRowIndex + 1)
    .forEach((rawRow, offset) => {
      if (rawRow.every((cell) => !normalizeCell(cell))) return;
      const rowNumber = source.inspection.headerRowIndex + offset + 2;
      const issues: string[] = [];
      const date = parseDate(readMapped(rawRow, mapping.date));
      const postedDate = parseDate(readMapped(rawRow, mapping.postedDate));
      const amount = parseMappedAmount(rawRow, mapping);
      const description = normalizeCell(
        readMapped(rawRow, mapping.description),
      );
      const merchant =
        normalizeCell(readMapped(rawRow, mapping.merchant)) ||
        description ||
        'Операция';
      const currencyValue = normalizeCell(
        readMapped(rawRow, mapping.currency),
      ).toUpperCase();
      const balance = parseAmount(readMapped(rawRow, mapping.balance));
      if (balance !== undefined) endingBalance = balance;

      if (!date) issues.push('Не распознана дата');
      if (amount === undefined || amount === 0) {
        issues.push('Не распознана ненулевая сумма');
      }
      if (currencyValue && !/^(RUB|RUR|РУБ|₽)$/.test(currencyValue)) {
        issues.push(`Валюта ${currencyValue} пока не поддерживается`);
      }

      const safeDate = date || '';
      const safeAmount = amount ?? 0;
      const combinedText = `${merchant} ${description}`;
      const suggestedTransfer = transferPattern.test(combinedText);
      const transactionType = inferTransactionType(safeAmount, combinedText);
      const category = inferCategory(safeAmount, combinedText, transactionType);
      const sourceHash = createTransactionFingerprint({
        bank,
        date: safeDate,
        amount: safeAmount,
        merchant,
        description,
      });
      const duplicate =
        existingHashes.has(sourceHash) || seenHashes.has(sourceHash);

      let status: ParsedImportRow['status'] = 'new';
      if (issues.length) status = 'error';
      else if (duplicate) status = 'duplicate';
      else if (suggestedTransfer) {
        status = 'review';
        issues.push('Похоже на перевод — проверьте перед сохранением');
      }

      seenHashes.add(sourceHash);
      rows.push({
        id: `${sourceHash}-${rowNumber}`,
        rowNumber,
        date: safeDate,
        postedDate: postedDate || undefined,
        amount: safeAmount,
        currency: 'RUB',
        merchant,
        description,
        category,
        transactionType,
        isTransfer: false,
        excludedFromAnalytics: false,
        sourceHash,
        status,
        issues,
        selected: status === 'new' || status === 'review',
      });
    });

  if (!rows.length) {
    throw new StatementParseError(
      'После строки заголовков не найдено ни одной операции.',
    );
  }

  return {
    bank,
    sourceFile: source.fileName,
    fileFormat: source.fileFormat,
    fileHash: source.fileHash,
    headerSignature: source.inspection.headerSignature,
    mapping,
    rows,
    endingBalance,
    counts: {
      new: rows.filter((row) => row.status === 'new').length,
      duplicate: rows.filter((row) => row.status === 'duplicate').length,
      review: rows.filter((row) => row.status === 'review').length,
      error: rows.filter((row) => row.status === 'error').length,
    },
  };
}

function validateMapping(mapping: ColumnMapping) {
  if (mapping.date === undefined) {
    throw new StatementParseError(
      'Не найдена колонка с датой. Укажите её в настройке колонок.',
    );
  }
  if (
    mapping.amount === undefined &&
    mapping.expense === undefined &&
    mapping.income === undefined
  ) {
    throw new StatementParseError(
      'Не найдена колонка с суммой. Укажите общую сумму либо приход и расход.',
    );
  }
}

function readMapped(row: StatementCell[], index?: number) {
  return index === undefined ? undefined : row[index];
}

function parseMappedAmount(row: StatementCell[], mapping: ColumnMapping) {
  if (mapping.amount !== undefined) {
    return parseAmount(row[mapping.amount]);
  }
  const expense = parseAmount(readMapped(row, mapping.expense));
  const income = parseAmount(readMapped(row, mapping.income));
  if (income !== undefined && income !== 0) return Math.abs(income);
  if (expense !== undefined && expense !== 0) return -Math.abs(expense);
  return undefined;
}

export function parseAmount(value: StatementCell) {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : undefined;
  }
  const raw = normalizeCell(value);
  if (!raw || raw === '-' || raw === '—') return undefined;
  const negativeByParentheses = /^\(.*\)$/.test(raw);
  let normalized = raw
    .replace(/[₽рrub]/gi, '')
    .replace(/[−–—]/g, '-')
    .replace(/\s/g, '')
    .replace(/[()]/g, '');

  const commaIndex = normalized.lastIndexOf(',');
  const dotIndex = normalized.lastIndexOf('.');
  if (commaIndex > dotIndex) {
    normalized = normalized.replace(/\./g, '').replace(',', '.');
  } else if (dotIndex > commaIndex && commaIndex >= 0) {
    normalized = normalized.replace(/,/g, '');
  } else if ((normalized.match(/,/g) ?? []).length > 1) {
    normalized = normalized.replace(/,/g, '');
  } else {
    normalized = normalized.replace(',', '.');
  }

  normalized = normalized.replace(/[^0-9+.-]/g, '');
  const amount = Number(normalized);
  if (!Number.isFinite(amount)) return undefined;
  return negativeByParentheses ? -Math.abs(amount) : amount;
}

export function parseDate(value: StatementCell) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return formatDateParts(value);
  }
  const raw = normalizeCell(value);
  if (!raw) return '';

  const iso = raw.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (iso) return validDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));

  const russian = raw.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})/);
  if (russian) {
    const year = Number(russian[3]);
    return validDate(
      year < 100 ? 2000 + year : year,
      Number(russian[2]),
      Number(russian[1]),
    );
  }
  return '';
}

function validDate(year: number, month: number, day: number) {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return '';
  }
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function formatDateParts(value: Date) {
  return validDate(value.getFullYear(), value.getMonth() + 1, value.getDate());
}

function inferTransactionType(amount: number, text: string): TransactionType {
  if (refundPattern.test(text)) return 'refund';
  if (/банкомат|снятие налич/i.test(text)) return 'cash';
  if (amount > 0) return 'income';
  if (amount < 0) return 'expense';
  return 'other';
}

function inferCategory(amount: number, text: string, type: TransactionType) {
  if (type === 'refund') return 'Возврат';
  if (amount > 0) {
    if (/зарплат|salary/i.test(text)) return 'Зарплата';
    if (/кэшб[эе]к|cashback/i.test(text)) return 'Кэшбэк';
    if (/процент/i.test(text)) return 'Проценты';
    return 'Дополнительный доход';
  }
  return (
    categoryRules.find(([, pattern]) => pattern.test(text))?.[0] || 'Прочее'
  );
}

export function createTransactionFingerprint(input: {
  bank: BankCode;
  date: string;
  amount: number;
  merchant: string;
  description: string;
}) {
  const normalized = [
    input.bank,
    input.date,
    input.amount.toFixed(2),
    normalizeFingerprintText(input.merchant),
    normalizeFingerprintText(input.description),
  ].join('|');
  return `v1-${stableHash(normalized)}`;
}

function fingerprintExisting(transaction: FinanceTransaction) {
  return createTransactionFingerprint({
    bank: bankCodesByName[transaction.bank],
    date: transaction.date,
    amount: transaction.amount,
    merchant: transaction.merchant,
    description: transaction.description,
  });
}

function normalizeFingerprintText(value: string) {
  return value
    .toLocaleLowerCase('ru')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

export function stableHash(value: string) {
  let first = 0x811c9dc5;
  let second = 0x9e3779b9;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    first = Math.imul(first ^ code, 0x01000193);
    second = Math.imul(second ^ code, 0x85ebca6b);
  }
  return `${(first >>> 0).toString(16).padStart(8, '0')}${(second >>> 0).toString(16).padStart(8, '0')}`;
}

export function bankLabel(bank: BankCode) {
  return bankNames[bank];
}
