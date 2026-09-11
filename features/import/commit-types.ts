import type { BankCode } from '@/lib/finance-data';
import type { ParsedImportRow, StatementFileFormat } from './types';

export type StatementCommitInput = {
  bank: BankCode;
  accountName: string;
  currentBalance?: number;
  sourceFile: string;
  fileFormat: StatementFileFormat;
  fileHash: string;
  headerSignature: string;
  columnMapping: Record<string, number>;
  rows: ParsedImportRow[];
};

export type StatementCommitResult = {
  alreadyImported: boolean;
  insertedCount: number;
  duplicateCount: number;
  reviewCount: number;
};
