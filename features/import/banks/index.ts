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
