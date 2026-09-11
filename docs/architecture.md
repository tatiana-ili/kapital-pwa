# Архитектура «Капитал»

## 1. Анализ требований и границы первой итерации

Приложение — персональный mobile-first PWA для Android, который агрегирует выписки четырёх банков. Единственный доверенный способ получения банковских данных — ручной импорт файлов; прямые подключения, scraping, платёжные действия и хранение банковских учётных данных исключены.

Этап 1 включает рабочий Dashboard, экран Transactions, PWA-оболочку, светлую/тёмную темы, Supabase-клиент, PostgreSQL-схему с RLS и детерминированный demo dataset. Приложение использует официальный Next.js App Router и статический export для публикации через Sites. CSV/XLSX/PDF-парсинг, правила категоризации и остальные продуктовые разделы остаются следующими отдельными итерациями.

## 2. Структура проекта

```text
app/
  page.tsx                    Dashboard
  transactions/page.tsx      операции, поиск, фильтр, карточка операции
components/
  app-shell.tsx               адаптивная навигация и общий layout
  theme-toggle.tsx            локальная настройка темы
lib/
  finance-data.ts             типы, форматирование и расчёт показателей
  demo-data.ts                139 безопасных демо-операций
  supabase/browser.ts         browser client без секретов
  supabase/finance.ts         чтение и безопасные изменения через RLS
hooks/
  use-finance-data.ts         единый источник данных для Dashboard и Transactions
supabase/
  migrations/                 версионируемая PostgreSQL-схема и RLS
  seed.sql                    demo user, accounts, 120+ операций, snapshots
public/
  manifest.webmanifest        Android PWA metadata
  sw.js                       offline cache для app shell
docs/
  architecture.md             решения, importer design и риски
```

Дальнейшие домены добавляются независимо: `features/import`, `features/categories`, `features/analytics`, `features/budgets`, `features/subscriptions`, `features/goals`, `features/assistant`. UI не должен знать формат банковских файлов; он работает только с нормализованной транзакцией.

## 3. SQL-модель

- `accounts` — счета и текущие остатки по банкам.
- `transactions` — единый ledger. `amount < 0` означает расход, `amount > 0` доход. `source_hash` уникален в пределах пользователя.
- `categories` и `category_rules` — системные/пользовательские категории и будущие правила.
- `import_profiles` и `imports` — сохранённые mapping-профили и аудит файлов.
- `balance_snapshots` — история капитала.
- `budgets`, `goals`, `subscriptions` — таблицы следующих этапов, созданные заранее, чтобы не менять базовые связи.

Все персональные таблицы защищены Row Level Security правилом `user_id = auth.uid()`. Публичному браузерному клиенту разрешены только строки текущего пользователя. Service-role key не используется во frontend.

## 4. Архитектура импортёров (Этап 2)

```text
file → detector → bank parser → normalized rows → validation
     → fingerprint/dedup → transfer matcher → preview → atomic commit
```

Единый контракт парсера:

```ts
interface BankStatementParser {
  id: 'tbank' | 'sber' | 'yandex' | 'ozon';
  detect(input: WorkbookLike): DetectionScore;
  inspect(input: WorkbookLike): SourceColumns;
  parse(input: WorkbookLike, mapping?: ColumnMapping): ParseResult;
}
```

Модули `tbankParser`, `sberParser`, `yandexParser`, `ozonParser` не пишут в БД. Они возвращают одинаковые `NormalizedTransaction` и диагностические сообщения с номером строки. Если уверенность detector ниже порога, пользователь получает preview колонок и mapping UI; mapping сохраняется в `import_profiles` по банку, формату и сигнатуре заголовков.

Fingerprint строится из нормализованных `bank + account + transaction_date + amount + merchant + description`. Сначала выполняется точный dedup по `source_hash`, затем эвристическая зона «требует проверки». Внутренние переводы сопоставляются отдельным matcher по модулю суммы, окну даты, разным своим счетам и ключевым словам. Матч никогда не удаляет строку: обе операции получают общий `transfer_group_id` и исключаются из расхода/дохода.

PDF считается best-effort источником. Табличный PDF можно извлечь, скан требует OCR и всегда должен попадать в ручную проверку.

## 5. Основные риски и спорные места

1. Форматы банков меняются без версионирования. Нужны fixture-файлы без персональных данных и regression tests для каждой версии parser.
2. Банки по-разному показывают дату операции и дату проводки. Обе даты хранятся; fingerprint должен использовать стабильную выбранную дату и версию алгоритма.
3. Refund и card reversal легко принять за доход. Это отдельный `transaction_type`, а не категория дохода.
4. Внутренние переводы могут иметь комиссию, задержку и разные валюты. Auto-match должен иметь confidence и ручное подтверждение; комиссия остаётся расходом.
5. Остаток нельзя надёжно восстановить только по операциям, если выписка неполная. Источник истины для капитала — `accounts.current_balance` и `balance_snapshots`.
6. Demo-режим не является авторизованным production-режимом. После задания Supabase env приложение требует сессию; RLS остаётся обязательной последней линией защиты.
7. PWA-кеш хранит только статические ресурсы. Навигации, API-ответы и ответы внешнего Supabase origin исключены из кеша.
8. AI получает только минимальную выборку или агрегаты и не имеет мутационных банковских инструментов. Ключ должен оставаться только на сервере.
