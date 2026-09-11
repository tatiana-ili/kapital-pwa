alter table public.transactions
  add column if not exists needs_review boolean not null default false;

create or replace function public.commit_statement_import(
  p_bank public.bank_code,
  p_account_name text,
  p_current_balance numeric,
  p_source_file text,
  p_file_format text,
  p_file_hash text,
  p_header_signature text,
  p_column_mapping jsonb,
  p_transactions jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  current_user_id uuid := auth.uid();
  target_account_id uuid;
  target_import_id uuid;
  v_inserted_count integer := 0;
  v_duplicate_count integer := 0;
  v_review_count integer := 0;
  v_requested_count integer := coalesce(jsonb_array_length(p_transactions), 0);
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;
  if nullif(trim(p_account_name), '') is null then
    raise exception 'Account name is required';
  end if;
  if p_file_format not in ('csv', 'xlsx', 'pdf') then
    raise exception 'Unsupported statement format';
  end if;
  if jsonb_typeof(p_transactions) <> 'array' then
    raise exception 'Transactions must be a JSON array';
  end if;

  insert into public.accounts (
    user_id,
    bank,
    name,
    current_balance
  ) values (
    current_user_id,
    p_bank,
    trim(p_account_name),
    coalesce(p_current_balance, 0)
  )
  on conflict (user_id, bank, name) do update
    set current_balance = coalesce(p_current_balance, accounts.current_balance),
        updated_at = now()
  returning id into target_account_id;

  insert into public.import_profiles (
    user_id,
    bank,
    file_format,
    header_signature,
    column_mapping
  ) values (
    current_user_id,
    p_bank,
    p_file_format,
    p_header_signature,
    p_column_mapping
  )
  on conflict (user_id, bank, file_format, header_signature) do update
    set column_mapping = excluded.column_mapping,
        updated_at = now();

  insert into public.imports (
    user_id,
    bank,
    source_file,
    file_hash,
    status,
    error_summary
  ) values (
    current_user_id,
    p_bank,
    p_source_file,
    p_file_hash,
    'previewed',
    jsonb_build_object(
      'file_format', p_file_format,
      'header_signature', p_header_signature
    )
  )
  on conflict (user_id, file_hash) do nothing
  returning id into target_import_id;

  if target_import_id is null then
    return jsonb_build_object(
      'already_imported', true,
      'inserted_count', 0,
      'duplicate_count', v_requested_count,
      'review_count', 0
    );
  end if;

  insert into public.transactions (
    user_id,
    bank,
    account_id,
    transaction_date,
    posted_date,
    amount,
    currency,
    merchant,
    description,
    category,
    transaction_type,
    is_transfer,
    excluded_from_analytics,
    source_file,
    source_hash,
    needs_review
  )
  select
    current_user_id,
    p_bank,
    target_account_id,
    row.transaction_date,
    row.posted_date,
    row.amount,
    coalesce(nullif(row.currency, ''), 'RUB'),
    coalesce(row.merchant, ''),
    coalesce(row.description, ''),
    coalesce(nullif(row.category, ''), 'Прочее'),
    row.transaction_type::public.transaction_kind,
    coalesce(row.is_transfer, false),
    coalesce(row.excluded_from_analytics, false),
    p_source_file,
    row.source_hash,
    coalesce(row.needs_review, false)
  from jsonb_to_recordset(p_transactions) as row(
    transaction_date date,
    posted_date date,
    amount numeric,
    currency text,
    merchant text,
    description text,
    category text,
    transaction_type text,
    is_transfer boolean,
    excluded_from_analytics boolean,
    source_hash text,
    needs_review boolean
  )
  where row.amount <> 0
    and nullif(row.source_hash, '') is not null
  on conflict (user_id, source_hash) do nothing;

  get diagnostics v_inserted_count = row_count;
  v_duplicate_count := v_requested_count - v_inserted_count;

  select count(*)::integer
  into v_review_count
  from jsonb_to_recordset(p_transactions) as item(needs_review boolean)
  where coalesce(item.needs_review, false);

  update public.imports
  set status = 'completed',
      new_count = v_inserted_count,
      duplicate_count = v_duplicate_count,
      review_count = v_review_count
  where id = target_import_id;

  if p_current_balance is not null then
    insert into public.balance_snapshots (
      user_id,
      date,
      bank,
      account_id,
      balance
    ) values (
      current_user_id,
      current_date,
      p_bank,
      target_account_id,
      p_current_balance
    )
    on conflict (account_id, date) do update
      set balance = excluded.balance;
  end if;

  return jsonb_build_object(
    'already_imported', false,
    'inserted_count', v_inserted_count,
    'duplicate_count', v_duplicate_count,
    'review_count', v_review_count
  );
end;
$$;

revoke all on function public.commit_statement_import(
  public.bank_code,
  text,
  numeric,
  text,
  text,
  text,
  text,
  jsonb,
  jsonb
) from public;

grant execute on function public.commit_statement_import(
  public.bank_code,
  text,
  numeric,
  text,
  text,
  text,
  text,
  jsonb,
  jsonb
) to authenticated;
