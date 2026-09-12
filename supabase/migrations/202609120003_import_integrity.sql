-- A file can be reused for another account; deduplicate import history per account.
alter table public.imports
  add column if not exists account_id uuid references public.accounts(id) on delete cascade;
alter table public.imports
  drop constraint if exists imports_user_id_file_hash_key;
create unique index if not exists imports_user_account_file_hash_idx
  on public.imports (user_id, account_id, file_hash);

-- Keep v2 fingerprints account-scoped while recognizing rows imported with v1.
-- Pair a confirmed transfer only when one plausible counterpart exists.
create or replace function public.prepare_transaction_integrity()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  candidate_ids uuid[];
  transfer_words text := '(перевод|transfer|сбп|между счетами|на карту|с карты|пополнение сч[её]та)';
begin
  -- Updates made by this trigger must not try to pair or unpair again.
  if pg_trigger_depth() > 1 then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.source_hash like 'v2-%' and exists (
      select 1
      from public.transactions old_row
      where old_row.user_id = new.user_id
        and old_row.account_id = new.account_id
        and old_row.source_hash like 'v1-%'
        and old_row.transaction_date = new.transaction_date
        and old_row.amount = new.amount
        and old_row.merchant = new.merchant
        and old_row.description = new.description
    ) then
      return null;
    end if;
  elsif old.is_transfer and not new.is_transfer and old.transfer_group_id is not null then
    update public.transactions counterpart
    set is_transfer = false,
        transaction_type = case
          when counterpart.amount > 0 then 'income'::public.transaction_kind
          else 'expense'::public.transaction_kind
        end,
        excluded_from_analytics = false,
        transfer_group_id = null
    where counterpart.user_id = new.user_id
      and counterpart.id <> new.id
      and counterpart.transfer_group_id = old.transfer_group_id;
    new.transfer_group_id := null;
  end if;

  if new.is_transfer and new.transfer_group_id is null then
    select array_agg(id) into candidate_ids
    from (
      select counterpart.id
      from public.transactions counterpart
      where counterpart.user_id = new.user_id
        and counterpart.id <> new.id
        and counterpart.account_id <> new.account_id
        and counterpart.transfer_group_id is null
        and sign(counterpart.amount) = -sign(new.amount)
        and abs(counterpart.amount + new.amount) <= greatest(1, abs(new.amount) * 0.005)
        and abs(counterpart.transaction_date - new.transaction_date) <= 3
        and (
          coalesce(new.merchant, '') || ' ' || coalesce(new.description, '') || ' ' ||
          coalesce(counterpart.merchant, '') || ' ' || coalesce(counterpart.description, '')
        ) ~* transfer_words
      order by abs(counterpart.transaction_date - new.transaction_date), counterpart.id
      limit 2
    ) eligible;

    if array_length(candidate_ids, 1) = 1 then
      new.transfer_group_id := candidate_ids[1];
      update public.transactions counterpart
      set is_transfer = true,
          transaction_type = 'transfer',
          excluded_from_analytics = true,
          transfer_group_id = candidate_ids[1]
      where counterpart.id = candidate_ids[1]
        and counterpart.user_id = new.user_id
        and counterpart.transfer_group_id is null;
      if not found then
        new.transfer_group_id := null;
      end if;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists transactions_integrity_before_write on public.transactions;
create trigger transactions_integrity_before_write
before insert or update of is_transfer on public.transactions
for each row execute function public.prepare_transaction_integrity();

-- Recreate the atomic import RPC with an account-scoped file check.
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
  v_already_imported boolean := false;
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

  select exists (
    select 1 from public.imports previous
    where previous.user_id = current_user_id
      and previous.account_id = target_account_id
      and previous.file_hash = p_file_hash
  ) into v_already_imported;

  insert into public.imports (
    user_id,
    bank,
    source_file,
    file_hash,
    account_id,
    status,
    error_summary
  ) values (
    current_user_id,
    p_bank,
    p_source_file,
    p_file_hash,
    target_account_id,
    'previewed',
    jsonb_build_object(
      'file_format', p_file_format,
      'header_signature', p_header_signature
    )
  )
  on conflict (user_id, account_id, file_hash) do update
    set status = 'previewed'
  returning id into target_import_id;

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
      new_count = new_count + v_inserted_count,
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
    'already_imported', v_already_imported and v_inserted_count = 0,
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
