create extension if not exists pgcrypto;

create type public.bank_code as enum ('tbank', 'sber', 'yandex', 'ozon');
create type public.transaction_kind as enum ('expense', 'income', 'transfer', 'refund', 'cash', 'other');
create type public.category_direction as enum ('expense', 'income', 'both');
create type public.import_status as enum ('pending', 'previewed', 'completed', 'failed');

create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  bank public.bank_code not null,
  name text not null,
  currency char(3) not null default 'RUB',
  current_balance numeric(18,2) not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, bank, name)
);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  name text not null,
  direction public.category_direction not null,
  parent_id uuid references public.categories(id) on delete set null,
  color text,
  icon text,
  is_system boolean not null default false,
  created_at timestamptz not null default now()
);
create unique index categories_system_name_direction_idx on public.categories (name, direction) where user_id is null;
create unique index categories_user_name_direction_idx on public.categories (user_id, name, direction) where user_id is not null;

create table public.import_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  bank public.bank_code not null,
  file_format text not null check (file_format in ('csv', 'xlsx', 'pdf')),
  header_signature text not null,
  column_mapping jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, bank, file_format, header_signature)
);

create table public.imports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  bank public.bank_code,
  source_file text not null,
  file_hash text not null,
  status public.import_status not null default 'pending',
  new_count integer not null default 0,
  duplicate_count integer not null default 0,
  review_count integer not null default 0,
  error_summary jsonb,
  created_at timestamptz not null default now(),
  unique (user_id, file_hash)
);

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  bank public.bank_code not null,
  account_id uuid not null references public.accounts(id) on delete cascade,
  transaction_date date not null,
  posted_date date,
  amount numeric(18,2) not null check (amount <> 0),
  currency char(3) not null default 'RUB',
  merchant text not null default '',
  description text not null default '',
  category text not null default 'Прочее',
  subcategory text,
  transaction_type public.transaction_kind not null default 'other',
  is_transfer boolean not null default false,
  transfer_group_id uuid,
  is_recurring boolean not null default false,
  source_file text not null,
  source_hash text not null,
  note text,
  excluded_from_analytics boolean not null default false,
  created_at timestamptz not null default now(),
  unique (user_id, source_hash),
  check ((transaction_type = 'transfer') = is_transfer or not is_transfer)
);
create index transactions_user_date_idx on public.transactions (user_id, transaction_date desc);
create index transactions_user_category_idx on public.transactions (user_id, category);
create index transactions_user_merchant_idx on public.transactions using gin (to_tsvector('simple', merchant || ' ' || description));
create index transactions_transfer_group_idx on public.transactions (transfer_group_id) where transfer_group_id is not null;

create table public.category_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  priority integer not null default 100,
  field text not null check (field in ('merchant', 'description', 'bank', 'amount')),
  operator text not null check (operator in ('contains', 'equals', 'starts_with', 'regex', 'between')),
  value jsonb not null,
  target_category text not null,
  target_subcategory text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create index category_rules_user_priority_idx on public.category_rules (user_id, priority, created_at);

create table public.balance_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  bank public.bank_code not null,
  account_id uuid not null references public.accounts(id) on delete cascade,
  balance numeric(18,2) not null,
  created_at timestamptz not null default now(),
  unique (account_id, date)
);

create table public.budgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category text not null,
  month date not null check (month = date_trunc('month', month)::date),
  amount numeric(18,2) not null check (amount > 0),
  created_at timestamptz not null default now(),
  unique (user_id, category, month)
);

create table public.goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  target_amount numeric(18,2) not null check (target_amount > 0),
  current_amount numeric(18,2) not null default 0 check (current_amount >= 0),
  target_date date,
  created_at timestamptz not null default now()
);

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  merchant text not null,
  amount numeric(18,2) not null check (amount > 0),
  cadence text not null check (cadence in ('weekly', 'monthly', 'quarterly', 'yearly', 'unknown')),
  last_paid_at date,
  next_expected_at date,
  confidence numeric(4,3) check (confidence between 0 and 1),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

insert into public.categories (name, direction, is_system) values
  ('Продукты','expense',true), ('Кафе и рестораны','expense',true), ('Доставка еды','expense',true),
  ('Транспорт','expense',true), ('Такси','expense',true), ('Автомобиль','expense',true),
  ('Жильё','expense',true), ('Коммунальные услуги','expense',true), ('Связь и интернет','expense',true),
  ('Подписки','expense',true), ('Маркетплейсы','expense',true), ('Одежда','expense',true),
  ('Красота','expense',true), ('Здоровье','expense',true), ('Развлечения','expense',true),
  ('Путешествия','expense',true), ('Образование','expense',true), ('Подарки','expense',true),
  ('Дети','expense',true), ('Переводы','both',true), ('Налоги','expense',true),
  ('Финансовые услуги','expense',true), ('Наличные','expense',true), ('Прочее','both',true),
  ('Зарплата','income',true), ('Дополнительный доход','income',true), ('Возврат','income',true),
  ('Проценты','income',true), ('Кэшбэк','income',true), ('Подарки','income',true);

alter table public.accounts enable row level security;
alter table public.categories enable row level security;
alter table public.import_profiles enable row level security;
alter table public.imports enable row level security;
alter table public.transactions enable row level security;
alter table public.category_rules enable row level security;
alter table public.balance_snapshots enable row level security;
alter table public.budgets enable row level security;
alter table public.goals enable row level security;
alter table public.subscriptions enable row level security;

create policy "accounts_owner_all" on public.accounts for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "categories_read" on public.categories for select using (user_id is null or user_id = auth.uid());
create policy "categories_owner_insert" on public.categories for insert with check (user_id = auth.uid());
create policy "categories_owner_update" on public.categories for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "categories_owner_delete" on public.categories for delete using (user_id = auth.uid());
create policy "import_profiles_owner_all" on public.import_profiles for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "imports_owner_all" on public.imports for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "transactions_owner_all" on public.transactions for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "category_rules_owner_all" on public.category_rules for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "balance_snapshots_owner_all" on public.balance_snapshots for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "budgets_owner_all" on public.budgets for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "goals_owner_all" on public.goals for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "subscriptions_owner_all" on public.subscriptions for all using (user_id = auth.uid()) with check (user_id = auth.uid());
