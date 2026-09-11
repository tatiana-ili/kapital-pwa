# Капитал

Mobile-first PWA для контроля личных финансов по выпискам Т-Банка, Сбера, Яндекс Банка и Ozon Банка. В репозитории реализован только Этап 1: Dashboard, Transactions, Supabase/PostgreSQL foundation, PWA и синтетические seed-данные.

## Запуск

```bash
pnpm install
pnpm dev
```

Откройте `http://localhost:3000`. Без `.env.local` приложение работает в demo-режиме. Для Supabase скопируйте `.env.example` в `.env.local` и задайте public URL/anon key; service-role key во frontend не нужен и не должен храниться в репозитории.

Примените `supabase/migrations/202609110001_initial_schema.sql`, затем `supabase/seed.sql` через Supabase CLI или SQL Editor. Seed содержит 120 синтетических операций и не содержит персональных банковских данных.

## Проверка

```bash
pnpm lint
pnpm build
```

Архитектурные решения, importer contract и риски описаны в `docs/architecture.md`.
