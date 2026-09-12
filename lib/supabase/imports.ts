import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  StatementCommitInput,
  StatementCommitResult,
} from '@/features/import/commit-types';
import { parseStoredMapping } from '../../features/import/profile-mapping.ts';
import type { StatementFileFormat } from '@/features/import/types';
import type { BankCode } from '@/lib/finance-data';

type RpcResult = {
  already_imported?: boolean;
  inserted_count?: number;
  duplicate_count?: number;
  review_count?: number;
};

export async function loadStatementImportProfile(
  client: SupabaseClient,
  bank: BankCode,
  fileFormat: StatementFileFormat,
  headerSignature: string,
  columnCount: number,
) {
  const { data, error } = await client
    .from('import_profiles')
    .select('column_mapping')
    .eq('bank', bank)
    .eq('file_format', fileFormat)
    .eq('header_signature', headerSignature)
    .maybeSingle();
  if (error) throw error;
  return parseStoredMapping(data?.column_mapping, columnCount);
}

export async function commitStatementImport(
  client: SupabaseClient,
  input: StatementCommitInput,
): Promise<StatementCommitResult> {
  const rows = input.rows
    .filter(
      (row) =>
        row.selected && row.status !== 'error' && row.status !== 'duplicate',
    )
    .map((row) => ({
      transaction_date: row.date,
      posted_date: row.postedDate ?? null,
      amount: row.amount,
      currency: row.currency,
      merchant: row.merchant,
      description: row.description,
      category: row.isTransfer ? 'Переводы' : row.category,
      transaction_type: row.isTransfer ? 'transfer' : row.transactionType,
      is_transfer: row.isTransfer,
      excluded_from_analytics: row.isTransfer || row.excludedFromAnalytics,
      source_hash: row.sourceHash,
      needs_review: row.status === 'review' && !row.isTransfer,
    }));

  const { data, error } = await client.rpc('commit_statement_import', {
    p_bank: input.bank,
    p_account_name: input.accountName,
    p_current_balance: input.currentBalance ?? null,
    p_source_file: input.sourceFile,
    p_file_format: input.fileFormat,
    p_file_hash: input.fileHash,
    p_header_signature: input.headerSignature,
    p_column_mapping: input.columnMapping,
    p_transactions: rows,
  });

  if (error) throw error;
  const result = (data ?? {}) as RpcResult;
  return {
    alreadyImported: Boolean(result.already_imported),
    insertedCount: Number(result.inserted_count ?? 0),
    duplicateCount: Number(result.duplicate_count ?? 0),
    reviewCount: Number(result.review_count ?? 0),
  };
}
