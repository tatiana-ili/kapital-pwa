import type { BankCode } from '../../lib/finance-data.ts';
import type {
  PdfImportDiagnostics,
  PdfValidationCheck,
  StatementTable,
} from './types.ts';

export type PdfTextItem = {
  str: string;
  x: number;
  y: number;
  width: number;
};

export type PdfTextPage = {
  pageNumber: number;
  width: number;
  height: number;
  items: PdfTextItem[];
};

type PdfLine = {
  y: number;
  items: PdfTextItem[];
};

type ExtractedRow = {
  date: string;
  postedDate: string;
  amount: number;
  merchant: string;
  description: string;
  sourceReference: string;
  section: number;
};

type KnownPdfResult = {
  bank: BankCode;
  table: StatementTable;
  diagnostics: PdfImportDiagnostics;
};

type SectionControls = {
  opening?: number;
  closing?: number;
  income?: number;
  expenses?: number;
};

const CANONICAL_HEADERS = [
  'Дата операции',
  'Дата проводки',
  'Сумма операции',
  'Магазин',
  'Описание',
  'Валюта',
  'Идентификатор операции',
];

const datePattern = /\b\d{1,2}[./-]\d{1,2}[./-]\d{2,4}\b/;
const moneyPattern = /[+−–—-]?\s*\d[\d\s]*(?:[.,]\d{2})/g;

export function parseKnownBankPdf(
  pages: PdfTextPage[],
  fileName: string,
): KnownPdfResult | undefined {
  const sample = normalizeText(
    `${fileName} ${pages
      .slice(0, 5)
      .flatMap((page) => page.items)
      .map((item) => item.str)
      .join(' ')}`,
  );

  if (/т[ -]?банк|тинькофф|tinkoff|tbank/i.test(sample)) {
    return parseTbankPdf(pages);
  }
  if (/яндекс[ -]?банк|yandex[ -]?bank/i.test(sample)) {
    return parseYandexPdf(pages);
  }
  if (/сбер|sber/i.test(sample)) return parseSberPdf(pages);
  return undefined;
}

function parseTbankPdf(pages: PdfTextPage[]): KnownPdfResult {
  const rows: ExtractedRow[] = [];
  const controls: SectionControls = {};
  let unrecognized = 0;

  for (const page of pages) {
    const lines = groupLines(page.items);
    let current:
      | {
          date: string[];
          postedDate: string[];
          amount: number;
          operationAmount: string;
          description: string[];
          card: string[];
          lastY: number;
        }
      | undefined;
    let inTable = false;

    const flush = () => {
      if (!current) return;
      const description = joinParts(current.description) || 'Операция';
      const date = joinParts(current.date);
      const postedDate = joinParts(current.postedDate);
      const card = joinParts(current.card);
      rows.push({
        date,
        postedDate,
        amount: current.amount,
        merchant: merchantFromDescription('tbank', description),
        description,
        sourceReference: makeSourceReference(
          0,
          date,
          postedDate,
          current.amount,
          `${card}|${current.operationAmount}`,
        ),
        section: 0,
      });
      current = undefined;
    };

    for (const line of lines) {
      const fullText = lineText(line);
      if (/дата и время операции/i.test(fullText)) inTable = true;
      controls.income ??= amountAfterLabel(fullText, /пополнения?\s*:?/i);
      controls.expenses ??= amountAfterLabel(fullText, /расходы?\s*:?/i);

      const date = cellText(page, line, 0.08, 0.205);
      const operationAmount = cellText(page, line, 0.325, 0.485);
      const accountAmount = cellText(page, line, 0.485, 0.66);
      const amount = parseMoney(accountAmount) ?? parseMoney(operationAmount);
      if (datePattern.test(date) && amount !== undefined) {
        flush();
        inTable = true;
        current = {
          date: [date],
          postedDate: [cellText(page, line, 0.205, 0.325)],
          amount,
          operationAmount,
          description: [cellText(page, line, 0.66, 0.875)],
          card: [cellText(page, line, 0.875, 1)],
          lastY: line.y,
        };
        continue;
      }

      if (current && current.lastY - line.y <= 19) {
        current.date.push(date);
        current.postedDate.push(cellText(page, line, 0.205, 0.325));
        current.description.push(cellText(page, line, 0.66, 0.875));
        current.card.push(cellText(page, line, 0.875, 1));
        current.lastY = line.y;
      } else {
        flush();
        if (inTable && looksLikeMissedOperation(fullText)) unrecognized += 1;
      }
    }
    flush();
  }

  const checks = totalChecks(rows, controls, 0);
  return knownResult(
    'tbank',
    rows,
    'Т-Банк · Справка о движении средств',
    'tbank-movement',
    checks,
    unrecognized,
  );
}

function parseYandexPdf(pages: PdfTextPage[]): KnownPdfResult {
  const rows: ExtractedRow[] = [];
  const controls = new Map<number, SectionControls>();
  let section = -1;
  let unrecognized = 0;

  for (const page of pages) {
    const lines = groupLines(page.items);
    let current:
      | {
          date: string[];
          postedDate: string[];
          amount: number;
          operationAmount: string;
          description: string[];
          card: string[];
          lastY: number;
          section: number;
        }
      | undefined;
    let inTable = false;

    const flush = () => {
      if (!current) return;
      const description = joinParts(current.description) || 'Операция';
      const date = joinParts(current.date);
      const postedDate = joinParts(current.postedDate);
      const card = joinParts(current.card);
      rows.push({
        date,
        postedDate,
        amount: current.amount,
        merchant: merchantFromDescription('yandex', description),
        description,
        sourceReference: makeSourceReference(
          current.section,
          date,
          postedDate,
          current.amount,
          `${card}|${current.operationAmount}`,
        ),
        section: current.section,
      });
      current = undefined;
    };

    for (const line of lines) {
      const fullText = lineText(line);
      if (/выписка по договору за период/i.test(fullText)) {
        flush();
        section += 1;
        controls.set(section, {});
        inTable = false;
      }
      if (section < 0 && /входящий остаток/i.test(fullText)) {
        section = 0;
        controls.set(section, {});
      }
      const sectionControls = controls.get(Math.max(0, section)) ?? {};
      controls.set(Math.max(0, section), sectionControls);
      sectionControls.opening ??= amountAfterLabel(
        fullText,
        /входящий остаток[^:]*:?/i,
      );
      sectionControls.closing ??= amountAfterLabel(
        fullText,
        /исходящий остаток[^:]*:?/i,
      );
      sectionControls.expenses ??= amountAfterLabel(
        fullText,
        /всего расходных операций\s*:?/i,
      );
      sectionControls.income ??= amountAfterLabel(
        fullText,
        /всего приходных операций\s*:?/i,
      );
      if (/описание операции/i.test(fullText) && /дата/i.test(fullText)) {
        inTable = true;
      }

      const date = cellText(page, line, 0.335, 0.49);
      const operationAmount = cellText(page, line, 0.69, 0.85);
      const accountAmount = cellText(page, line, 0.85, 1);
      const amount = parseMoney(accountAmount) ?? parseMoney(operationAmount);
      if (datePattern.test(date) && amount !== undefined) {
        flush();
        inTable = true;
        if (section < 0) {
          section = 0;
          controls.set(section, sectionControls);
        }
        current = {
          date: [date],
          postedDate: [cellText(page, line, 0.49, 0.61)],
          amount,
          operationAmount,
          description: [cellText(page, line, 0, 0.335)],
          card: [cellText(page, line, 0.61, 0.69)],
          lastY: line.y,
          section,
        };
        continue;
      }

      if (current && current.lastY - line.y <= 19) {
        current.date.push(date);
        current.postedDate.push(cellText(page, line, 0.49, 0.61));
        current.description.push(cellText(page, line, 0, 0.335));
        current.card.push(cellText(page, line, 0.61, 0.69));
        current.lastY = line.y;
      } else {
        flush();
        if (inTable && looksLikeMissedOperation(fullText)) unrecognized += 1;
      }
    }
    flush();
  }

  const checks: PdfValidationCheck[] = [];
  for (const [sectionNumber, sectionControls] of controls) {
    const sectionRows = rows.filter((row) => row.section === sectionNumber);
    checks.push(...totalChecks(sectionRows, sectionControls, sectionNumber));
    if (
      sectionControls.opening !== undefined &&
      sectionControls.closing !== undefined
    ) {
      checks.push(
        moneyCheck(
          `balance-${sectionNumber}`,
          `Баланс выписки ${sectionNumber + 1}`,
          sectionControls.closing,
          sectionControls.opening + sumRows(sectionRows),
        ),
      );
    }
  }
  const endingBalance = [...controls.values()].at(-1)?.closing;
  return knownResult(
    'yandex',
    rows,
    'Яндекс Банк · Выписка по договору',
    'yandex-contract',
    checks,
    unrecognized,
    endingBalance,
  );
}

function parseSberPdf(pages: PdfTextPage[]): KnownPdfResult {
  const rows: ExtractedRow[] = [];
  const controls: SectionControls = {};
  let unrecognized = 0;

  for (const page of pages) {
    const lines = groupLines(page.items);
    let current:
      | {
          dateParts: string[];
          rawAmount: string;
          category: string;
          description: string[];
          lastY: number;
        }
      | undefined;
    let inTable = false;

    const flush = () => {
      if (!current) return;
      const dateParts = current.dateParts.filter((value) =>
        datePattern.test(value),
      );
      const date = current.dateParts[0] || '';
      const postedDate = dateParts[1] || dateParts[0] || '';
      const rawDescription = joinParts(current.description);
      const description = joinParts([current.category, rawDescription]);
      const parsedAmount = parseMoney(current.rawAmount) ?? 0;
      const amount = sberSignedAmount(
        parsedAmount,
        current.rawAmount,
        current.category,
        rawDescription,
      );
      rows.push({
        date,
        postedDate,
        amount,
        merchant: merchantFromDescription(
          'sber',
          rawDescription || current.category,
        ),
        description,
        sourceReference: makeSourceReference(
          0,
          date,
          postedDate,
          amount,
          `${current.category}|${rawDescription}`,
        ),
        section: 0,
      });
      current = undefined;
    };

    for (const line of lines) {
      const fullText = lineText(line);
      if (/дата операции/i.test(fullText) && /категория/i.test(fullText)) {
        inTable = true;
      }
      controls.income ??= amountAfterLabel(fullText, /пополнение\s*:?/i);
      controls.expenses ??= amountAfterLabel(fullText, /списание\s*:?/i);

      const date = cellText(page, line, 0.07, 0.24);
      const middle = cellText(page, line, 0.24, 0.76);
      const amountText = cellText(page, line, 0.76, 1);
      const amount = parseMoney(amountText);
      const startsRow = Boolean(datePattern.test(date) && amount !== undefined);

      if (startsRow) {
        flush();
        inTable = true;
        current = {
          dateParts: [date],
          rawAmount: amountText,
          category: middle,
          description: [],
          lastY: line.y,
        };
        continue;
      }

      if (current && current.lastY - line.y <= 19) {
        current.dateParts.push(date);
        current.description.push(middle);
        current.lastY = line.y;
      } else {
        flush();
        if (inTable && looksLikeMissedOperation(fullText)) unrecognized += 1;
      }
    }
    flush();
  }

  const checks = totalChecks(rows, controls, 0);
  return knownResult(
    'sber',
    rows,
    'Сбер · Индивидуальная выписка по платёжному счёту',
    'sber-payment-account',
    checks,
    unrecognized,
  );
}

function knownResult(
  bank: BankCode,
  rows: ExtractedRow[],
  templateLabel: string,
  parserId: string,
  checks: PdfValidationCheck[],
  unrecognizedOperationLineCount: number,
  endingBalance?: number,
): KnownPdfResult {
  const effectiveChecks = checks.length
    ? checks
    : [
        {
          id: 'controls',
          label: 'Контрольные итоги',
          status: 'unavailable' as const,
        },
      ];
  const confidence =
    rows.length > 0 &&
    unrecognizedOperationLineCount === 0 &&
    effectiveChecks.length >= 2 &&
    effectiveChecks.every((check) => check.status === 'passed')
      ? 'high'
      : 'review';

  return {
    bank,
    table: [
      CANONICAL_HEADERS,
      ...rows.map((row) => [
        row.date,
        row.postedDate,
        row.amount,
        row.merchant,
        row.description,
        'RUB',
        row.sourceReference,
      ]),
    ],
    diagnostics: {
      parserId,
      parserVersion: 1,
      templateLabel,
      confidence,
      recognizedRowCount: rows.length,
      unrecognizedOperationLineCount,
      checks: effectiveChecks,
      endingBalance,
    },
  };
}

function totalChecks(
  rows: ExtractedRow[],
  controls: SectionControls,
  section: number,
) {
  const checks: PdfValidationCheck[] = [];
  if (controls.income !== undefined) {
    checks.push(
      moneyCheck(
        `income-${section}`,
        `Доходы${section ? ` · выписка ${section + 1}` : ''}`,
        Math.abs(controls.income),
        rows.reduce((sum, row) => sum + Math.max(0, row.amount), 0),
      ),
    );
  }
  if (controls.expenses !== undefined) {
    checks.push(
      moneyCheck(
        `expenses-${section}`,
        `Расходы${section ? ` · выписка ${section + 1}` : ''}`,
        Math.abs(controls.expenses),
        Math.abs(rows.reduce((sum, row) => sum + Math.min(0, row.amount), 0)),
      ),
    );
  }
  return checks;
}

function moneyCheck(
  id: string,
  label: string,
  expected: number,
  actual: number,
): PdfValidationCheck {
  const difference = roundMoney(actual - expected);
  return {
    id,
    label,
    expected: roundMoney(expected),
    actual: roundMoney(actual),
    difference,
    status: Math.abs(difference) <= 0.02 ? 'passed' : 'failed',
  };
}

function sumRows(rows: ExtractedRow[]) {
  return roundMoney(rows.reduce((sum, row) => sum + row.amount, 0));
}

function sberSignedAmount(
  amount: number,
  rawAmount: string,
  category: string,
  description: string,
) {
  if (/\+/.test(rawAmount)) return Math.abs(amount);
  if (/[−–—-]/.test(rawAmount)) return -Math.abs(amount);
  if (
    /заработн|зачислен|возврат|кэшб[эе]к|процент|пособ|пенси/i.test(
      `${category} ${description}`,
    )
  ) {
    return Math.abs(amount);
  }
  return -Math.abs(amount);
}

function merchantFromDescription(bank: BankCode, value: string) {
  let merchant = normalizeText(value);
  if (bank === 'tbank') {
    merchant = merchant
      .replace(/^оплата (?:товаров и услуг|услуг|в)\s*/i, '')
      .replace(/^пополнение\.\s*/i, '');
  } else if (bank === 'yandex') {
    merchant = merchant
      .replace(/^оплата товаров и услуг\s*/i, '')
      .replace(/^оплата сбп qr\s*/i, '')
      .replace(/^входящий перевод сбп[,.:]?\s*/i, 'Входящий перевод СБП · ')
      .replace(/^исходящий перевод сбп[,.:]?\s*/i, 'Исходящий перевод СБП · ');
  } else if (bank === 'sber') {
    merchant = merchant
      .replace(/\.\s*операция по (?:сч[её]ту|карте).*$/i, '')
      .replace(/\s+операция по (?:сч[её]ту|карте).*$/i, '');
  }
  return merchant || 'Операция';
}

function groupLines(items: PdfTextItem[]) {
  const lines: PdfLine[] = [];
  for (const item of [...items].sort((left, right) => right.y - left.y)) {
    const line = lines.find(
      (candidate) => Math.abs(candidate.y - item.y) <= 2.5,
    );
    if (line) line.items.push(item);
    else lines.push({ y: item.y, items: [item] });
  }
  return lines
    .sort((left, right) => right.y - left.y)
    .map((line) => ({
      ...line,
      items: line.items.sort((left, right) => left.x - right.x),
    }));
}

function cellText(
  page: PdfTextPage,
  line: PdfLine,
  start: number,
  end: number,
) {
  return joinParts(
    line.items
      .filter(
        (item) => item.x / page.width >= start && item.x / page.width < end,
      )
      .map((item) => item.str),
  );
}

function lineText(line: PdfLine) {
  return joinParts(line.items.map((item) => item.str));
}

function joinParts(parts: string[]) {
  return normalizeText(parts.filter(Boolean).join(' '));
}

function normalizeText(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}

function parseMoney(value: string) {
  const matches = [...normalizeText(value).matchAll(moneyPattern)];
  const raw = matches.at(-1)?.[0];
  if (!raw) return undefined;
  const negative = /[−–—-]/.test(raw);
  const normalized = raw
    .replace(/[−–—]/g, '-')
    .replace(/\s/g, '')
    .replace(/[^\d,.-]/g, '')
    .replace(',', '.');
  const amount = Number(normalized);
  if (!Number.isFinite(amount)) return undefined;
  return negative ? -Math.abs(amount) : amount;
}

function amountAfterLabel(text: string, label: RegExp) {
  const match = label.exec(text);
  if (!match || match.index === undefined) return undefined;
  return parseMoney(text.slice(match.index + match[0].length));
}

function looksLikeMissedOperation(text: string) {
  if (
    /остаток|всего (?:расходных|приходных)|пополнения?\s*:|расходы?\s*:|списание/i.test(
      text,
    )
  ) {
    return false;
  }
  return datePattern.test(text) && parseMoney(text) !== undefined;
}

function makeSourceReference(
  section: number,
  date: string,
  postedDate: string,
  amount: number,
  discriminator: string,
) {
  return normalizeText(
    `${section}|${date}|${postedDate}|${amount.toFixed(2)}|${discriminator}`,
  );
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
