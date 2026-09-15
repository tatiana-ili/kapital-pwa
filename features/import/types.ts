import type {
  BankCode,
  FinanceTransaction,
  TransactionType,
} from '@/lib/finance-data';
import type { CategoryRule, FinanceCategory } from '../categories/types.ts';

export type StatementFileFormat = 'csv' | 'xlsx' | 'pdf';
export type StatementCell = string | number | boolean | Date | null | undefined;
export type StatementTable = StatementCell[][];

export type ImportColumnKey =
  | 'date'
  | 'postedDate'
  | 'amount'
  | 'expense'
  | 'income'
  | 'merchant'
  | 'description'
  | 'currency'
  | 'balance'
  | 'sourceReference';

export type ColumnMapping = Partial<Record<ImportColumnKey, number>>;

export type ImportInspection = {
  detectedBank?: BankCode;
  headerRowIndex: number;
  headers: string[];
  headerSignature: string;
  mapping: ColumnMapping;
};

export type PdfValidationCheck = {
  id: string;
  label: string;
  status: 'passed' | 'failed' | 'unavailable';
  expected?: number;
  actual?: number;
  difference?: number;
};

export type PdfImportDiagnostics = {
  parserId: string;
  parserVersion: number;
  templateLabel: string;
  confidence: 'high' | 'review';
  recognizedRowCount: number;
  unrecognizedOperationLineCount: number;
  checks: PdfValidationCheck[];
  endingBalance?: number;
};

export type ImportRowStatus = 'new' | 'duplicate' | 'review' | 'error';

export type ParsedImportRow = {
  id: string;
  rowNumber: number;
  date: string;
  postedDate?: string;
  amount: number;
  currency: 'RUB';
  merchant: string;
  description: string;
  category: string;
  transactionType: TransactionType;
  isTransfer: boolean;
  excludedFromAnalytics: boolean;
  sourceHash: string;
  status: ImportRowStatus;
  issues: string[];
  selected: boolean;
};

export type StatementPreview = {
  bank: BankCode;
  sourceFile: string;
  fileFormat: StatementFileFormat;
  fileHash: string;
  headerSignature: string;
  mapping: ColumnMapping;
  rows: ParsedImportRow[];
  endingBalance?: number;
  pdfUnrecognizedLineCount?: number;
  pdfDiagnostics?: PdfImportDiagnostics;
  counts: Record<ImportRowStatus, number>;
};

export type StatementSource = {
  fileName: string;
  fileFormat: StatementFileFormat;
  fileHash: string;
  table: StatementTable;
  inspection: ImportInspection;
  warning?: string;
  pdfDiagnostics?: PdfImportDiagnostics;
};

export type ParseStatementOptions = {
  bank: BankCode;
  accountName: string;
  existingAccountId?: string;
  source: StatementSource;
  mapping?: ColumnMapping;
  existingTransactions?: FinanceTransaction[];
  categories?: FinanceCategory[];
  categoryRules?: CategoryRule[];
};
