import { parseStatementTable } from '../parser.ts';
import type { BankColumnAliases, BankStatementParser } from './types.ts';
import type { BankCode } from '../../../lib/finance-data.ts';
import type { ColumnMapping, ImportColumnKey } from '../types.ts';

function normalizeHeader(value: string) {
  return value
    .toLocaleLowerCase('ru')
    .replace(/[«»"']/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function createBankParser(
  id: BankCode,
  markers: readonly RegExp[],
  aliases: BankColumnAliases,
): BankStatementParser {
  return {
    id,
    matches(fileName, preamble) {
      return markers.some((marker) =>
        marker.test(`${fileName} ${preamble}`),
      );
    },
    inferMapping(headers) {
      const normalized = headers.map(normalizeHeader);
      const mapping: ColumnMapping = {};
      for (const [key, patterns] of Object.entries(aliases) as Array<
        [ImportColumnKey, readonly RegExp[]]
      >) {
        const index = normalized.findIndex((header) =>
          patterns.some((pattern) => pattern.test(header)),
        );
        if (index >= 0) mapping[key] = index;
      }
      return mapping;
    },
    parse(options) {
      return parseStatementTable({ ...options, bank: id });
    },
  };
}
