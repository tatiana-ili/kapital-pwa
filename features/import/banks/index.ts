import type { BankCode } from '../../../lib/finance-data.ts';
import type { ColumnMapping, StatementTable } from '../types.ts';
import { ozonParser } from './ozon-parser.ts';
import { sberParser } from './sber-parser.ts';
import { tbankParser } from './tbank-parser.ts';
import type { BankStatementParser } from './types.ts';
import { yandexParser } from './yandex-parser.ts';

export const bankStatementParsers: Record<BankCode, BankStatementParser> = {
  tbank: tbankParser,
  sber: sberParser,
  yandex: yandexParser,
  ozon: ozonParser,
};

export function detectBankParser(
  fileName: string,
  table: StatementTable,
  headerRowIndex: number,
) {
  const preamble = table
    .slice(0, headerRowIndex)
    .flat()
    .map((cell) => String(cell ?? ''))
    .join(' ');
  return Object.values(bankStatementParsers).find((parser) =>
    parser.matches(fileName, preamble),
  );
}

export function inferBankMapping(
  bank: BankCode,
  headers: string[],
  genericMapping: ColumnMapping,
): ColumnMapping {
  return {
    ...genericMapping,
    ...bankStatementParsers[bank].inferMapping(headers),
  };
}

export function mergeStoredBankMapping(
  bank: BankCode,
  headers: string[],
  inferredMapping: ColumnMapping,
  storedMapping?: ColumnMapping,
) {
  if (!storedMapping) return inferredMapping;
  const merged = { ...inferredMapping, ...storedMapping };

  if (bank === 'tbank' && storedMapping.description !== undefined) {
    const storedHeader = normalizeHeader(headers[storedMapping.description]);
    if (/^номер карты$|^card number$/.test(storedHeader)) {
      if (inferredMapping.description === undefined) {
        delete merged.description;
      } else {
        merged.description = inferredMapping.description;
      }
    }
  }

  return merged;
}

function normalizeHeader(value?: string) {
  return (value ?? '')
    .toLocaleLowerCase('ru')
    .replace(/[«»"']/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
