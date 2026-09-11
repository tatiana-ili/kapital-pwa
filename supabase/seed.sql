-- Synthetic records only. No real names, accounts, cards, or banking credentials.
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000000', '11111111-1111-4111-8111-111111111111', 'authenticated', 'authenticated', 'demo@kapital.local', crypt(gen_random_uuid()::text, gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"display_name":"Демо"}', now(), now())
on conflict (id) do nothing;

insert into public.accounts (id, user_id, bank, name, current_balance) values
  ('21111111-1111-4111-8111-111111111111','11111111-1111-4111-8111-111111111111','tbank','Black',210000),
  ('22222222-2222-4222-8222-222222222222','11111111-1111-4111-8111-111111111111','sber','Основной',350000),
  ('23333333-3333-4333-8333-333333333333','11111111-1111-4111-8111-111111111111','yandex','Плюс',75400),
  ('24444444-4444-4444-8444-444444444444','11111111-1111-4111-8111-111111111111','ozon','Ozon Карта',200000)
on conflict (id) do update set current_balance = excluded.current_balance;

with templates as (
  select * from unnest(
    array['Пятёрочка','Перекрёсток','ВкусВилл','Ozon','Wildberries','Яндекс Такси','Яндекс Еда','Самокат','Лента','Аптека Ригла','АЗС Лукойл','Surf Coffee','Тануки','YouTube Premium','Telegram Premium','МТС','Мосэнергосбыт','Кинопоиск','Спортмастер','Золотое яблоко','РЖД','Читай-город','Детский мир','Вкусно — и точка'],
    array['Продукты','Продукты','Продукты','Маркетплейсы','Маркетплейсы','Такси','Доставка еды','Доставка еды','Продукты','Здоровье','Автомобиль','Кафе и рестораны','Кафе и рестораны','Подписки','Подписки','Связь и интернет','Коммунальные услуги','Подписки','Одежда','Красота','Путешествия','Образование','Дети','Кафе и рестораны'],
    array[1840,4260,3180,5990,3790,970,2360,1780,5120,1430,2860,520,3650,399,299,950,3180,399,4290,2650,6820,1590,2470,890]
  ) with ordinality as t(merchant, category, base_amount, ord)
), generated as (
  select
    n,
    case n % 4 when 1 then 'tbank'::public.bank_code when 2 then 'sber'::public.bank_code when 3 then 'yandex'::public.bank_code else 'ozon'::public.bank_code end as bank,
    case n % 4 when 1 then '21111111-1111-4111-8111-111111111111'::uuid when 2 then '22222222-2222-4222-8222-222222222222'::uuid when 3 then '23333333-3333-4333-8333-333333333333'::uuid else '24444444-4444-4444-8444-444444444444'::uuid end as account_id,
    (date '2026-09-11' - ((n - 1) % 110)) as transaction_date,
    case when n % 30 = 0 then 'Зарплата' else t.merchant end as merchant,
    case when n % 30 = 0 then 'Зарплата' else t.category end as category,
    case when n % 30 = 0 then (220000 + (n % 3) * 5000)::numeric else -(t.base_amount + (n % 7) * 110)::numeric end as amount,
    case when n % 30 = 0 then 'income'::public.transaction_kind else 'expense'::public.transaction_kind end as transaction_type
  from generate_series(1,120) n
  join templates t on t.ord = ((n - 1) % 24) + 1
)
insert into public.transactions (user_id, bank, account_id, transaction_date, posted_date, amount, merchant, description, category, transaction_type, is_recurring, source_file, source_hash)
select
  '11111111-1111-4111-8111-111111111111', bank, account_id, transaction_date, transaction_date, amount, merchant,
  case when transaction_type = 'income' then 'Зачисление заработной платы' else 'Оплата: ' || merchant end,
  category, transaction_type,
  merchant in ('Зарплата','YouTube Premium','Telegram Premium','МТС','Кинопоиск'),
  'demo-seed.csv',
  encode(digest(concat_ws('|', bank::text, account_id::text, transaction_date::text, amount::text, merchant, n::text), 'sha256'), 'hex')
from generated
on conflict (user_id, source_hash) do nothing;

with snapshots as (
  select date '2025-10-01' + (month_index || ' months')::interval as snapshot_date, month_index
  from generate_series(0,11) month_index
)
insert into public.balance_snapshots (user_id, date, bank, account_id, balance)
select '11111111-1111-4111-8111-111111111111', snapshot_date::date, a.bank, a.id,
  greatest(0, a.current_balance - (11 - month_index) * (9000 + (extract(day from a.created_at)::int % 4) * 1200))
from snapshots cross join public.accounts a
where a.user_id = '11111111-1111-4111-8111-111111111111'
on conflict (account_id, date) do update set balance = excluded.balance;
