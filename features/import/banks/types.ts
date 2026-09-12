import type { BankCode } from '../../../lib/finance-data.ts';
import type {
  ColumnMapping,
  ImportColumnKey,
  ParseStatementOptions,
  StatementPreview,
} from '../types.ts';

export type BankStatementParser = {
  id: BankCode;
  matches: (fileName: string, preamble: string) => boolean;
  inferMapping: (headers: string[]) => ColumnMapping;
  parse: (options: ParseStatementOptions) => StatementPreview;
};

export type BankColumnAliases = Partial<
  Record<ImportColumnKey, readonly RegExp[]>
>;
