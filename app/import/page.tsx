'use client';

import Link from 'next/link';
import { type ChangeEvent, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowLeftRight,
  Check,
  CheckCircle2,
  ChevronDown,
  Download,
  FileCheck2,
  FileSpreadsheet,
  LockKeyhole,
  RotateCcw,
  ShieldCheck,
  Upload,
} from 'lucide-react';
import { AppShell } from '@/components/app-shell';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Spinner } from '@/components/ui/spinner';
import type { StatementCommitResult } from '@/features/import/commit-types';
import { readStatementFile } from '@/features/import/file-reader';
import { parseAmount, parseStatementTable } from '@/features/import/parser';
import type {
  ColumnMapping,
  ImportColumnKey,
  ParsedImportRow,
  StatementPreview,
  StatementSource,
} from '@/features/import/types';
import { useFinanceData } from '@/hooks/use-finance-data';
import {
  bankNames,
  formatRubles,
  formatTransactionDate,
  type BankCode,
} from '@/lib/finance-data';
import { saveLocalStatement } from '@/lib/local-finance-store';
import { commitStatementImport } from '@/lib/supabase/imports';

const bankOptions = Object.entries(bankNames) as Array<[BankCode, string]>;
const categoryOptions = [
  'Продукты',
  'Кафе и рестораны',
  'Доставка еды',
  'Транспорт',
  'Такси',
  'Автомобиль',
  'Жильё',
  'Коммунальные услуги',
  'Связь и интернет',
  'Подписки',
  'Маркетплейсы',
  'Одежда',
  'Красота',
  'Здоровье',
  'Развлечения',
  'Путешествия',
  'Образование',
  'Подарки',
  'Налоги',
  'Финансовые услуги',
  'Наличные',
  'Зарплата',
  'Дополнительный доход',
  'Возврат',
  'Проценты',
  'Кэшбэк',
  'Прочее',
];
const mappingFields: Array<{
  key: ImportColumnKey;
  label: string;
  required?: boolean;
}> = [
  { key: 'date', label: 'Дата операции', required: true },
  { key: 'amount', label: 'Сумма со знаком' },
  { key: 'expense', label: 'Отдельная колонка расхода' },
  { key: 'income', label: 'Отдельная колонка прихода' },
  { key: 'merchant', label: 'Магазин или получатель' },
  { key: 'description', label: 'Описание' },
  { key: 'postedDate', label: 'Дата проводки' },
  { key: 'currency', label: 'Валюта' },
  { key: 'balance', label: 'Остаток после операции' },
];

export default function ImportPage() {
  const { client, dataMode, transactions } = useFinanceData();
  const inputRef = useRef<HTMLInputElement>(null);
  const [source, setSource] = useState<StatementSource | null>(null);
  const [bank, setBank] = useState<BankCode | ''>('');
  const [accountName, setAccountName] = useState('');
  const [balance, setBalance] = useState('');
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [preview, setPreview] = useState<StatementPreview | null>(null);
  const [reading, setReading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<StatementCommitResult | null>(null);
  const [visibleRows, setVisibleRows] = useState(30);

  const rowsToSave = useMemo(
    () =>
      preview?.rows.filter(
        (row) =>
          row.selected && row.status !== 'duplicate' && row.status !== 'error',
      ) ?? [],
    [preview],
  );
  const parsedBalance = balance.trim() ? parseAmount(balance) : undefined;
  const balanceIsInvalid = balance.trim() !== '' && parsedBalance === undefined;
  const progress = result ? 100 : preview ? 66 : 33;

  function rebuildPreview(
    nextSource: StatementSource,
    nextBank: BankCode,
    nextMapping: ColumnMapping,
  ) {
    try {
      const parsed = parseStatementTable({
        bank: nextBank,
        source: nextSource,
        mapping: nextMapping,
        existingTransactions: transactions,
      });
      setPreview(parsed);
      setError('');
      if (parsed.endingBalance !== undefined && !balance) {
        setBalance(String(parsed.endingBalance));
      }
    } catch (cause) {
      setPreview(null);
      setError(
        cause instanceof Error
          ? cause.message
          : 'Не удалось разобрать выписку.',
      );
    }
  }

  async function handleFile(file?: File) {
    if (!file || reading) return;
    setReading(true);
    setError('');
    setResult(null);
    setPreview(null);
    setVisibleRows(30);
    try {
      const nextSource = await readStatementFile(file);
      const nextBank = nextSource.inspection.detectedBank || bank;
      const nextMapping = nextSource.inspection.mapping;
      setSource(nextSource);
      setMapping(nextMapping);
      if (!nextBank) {
        setError('Не удалось определить банк. Выберите его вручную.');
        return;
      }
      setBank(nextBank);
      if (!accountName) setAccountName(`${bankNames[nextBank]} · Основной`);
      rebuildPreview(nextSource, nextBank, nextMapping);
    } catch (cause) {
      setSource(null);
      setError(
        cause instanceof Error ? cause.message : 'Не удалось прочитать файл.',
      );
    } finally {
      setReading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  function changeBank(nextBank: BankCode | '') {
    setBank(nextBank);
    if (nextBank && (!accountName || accountName.includes('· Основной'))) {
      setAccountName(`${bankNames[nextBank]} · Основной`);
    }
    if (source && nextBank) rebuildPreview(source, nextBank, mapping);
  }

  function changeMapping(key: ImportColumnKey, value: string) {
    const nextMapping = { ...mapping };
    if (value === '') delete nextMapping[key];
    else nextMapping[key] = Number(value);
    setMapping(nextMapping);
    if (source && bank) rebuildPreview(source, bank, nextMapping);
  }

  function updateRow(id: string, changes: Partial<ParsedImportRow>) {
    setPreview((current) =>
      current
        ? {
            ...current,
            rows: current.rows.map((row) =>
              row.id === id ? { ...row, ...changes } : row,
            ),
          }
        : current,
    );
  }

  function selectImportable(selected: boolean) {
    setPreview((current) =>
      current
        ? {
            ...current,
            rows: current.rows.map((row) =>
              row.status === 'new' || row.status === 'review'
                ? { ...row, selected }
                : row,
            ),
          }
        : current,
    );
  }

  async function saveImport() {
    if (!preview || !bank || !accountName.trim() || !rowsToSave.length) return;
    setSaving(true);
    setError('');
    try {
      const input = {
        bank,
        accountName: accountName.trim(),
        currentBalance: parsedBalance,
        sourceFile: preview.sourceFile,
        fileFormat: preview.fileFormat,
        fileHash: preview.fileHash,
        headerSignature: preview.headerSignature,
        columnMapping: Object.fromEntries(
          Object.entries(preview.mapping).filter(
            (entry): entry is [string, number] => entry[1] !== undefined,
          ),
        ),
        rows: preview.rows,
      };
      const saved = client
        ? await commitStatementImport(client, input)
        : saveLocalStatement(input);
      setResult(saved);
    } catch {
      setError(
        client
          ? 'Не удалось сохранить операции. Примените миграцию второго этапа в Supabase и повторите попытку.'
          : 'Не удалось сохранить демоданные на этом устройстве. Освободите место в браузере и повторите попытку.',
      );
    } finally {
      setSaving(false);
    }
  }

  function resetImport() {
    setSource(null);
    setPreview(null);
    setResult(null);
    setError('');
    setMapping({});
    setBalance('');
    setVisibleRows(30);
  }

  return (
    <AppShell>
      <section className="mx-auto max-w-5xl space-y-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <p className="text-sm font-medium text-primary">Этап 2</p>
              <Badge variant="secondary">
                {dataMode === 'demo' ? 'На устройстве' : 'Supabase'}
              </Badge>
            </div>
            <h2 className="mt-1 text-3xl font-semibold tracking-[-.04em]">
              Импорт выписки
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">
              Выберите выписку, проверьте найденные операции и только потом
              сохраните их.
            </p>
          </div>
          {source && (
            <Button
              variant="outline"
              className="min-h-12 cursor-pointer px-4"
              onClick={resetImport}
              disabled={saving}
            >
              <RotateCcw aria-hidden="true" /> Другой файл
            </Button>
          )}
        </div>

        <div className="surface-card rounded-3xl border p-4 sm:p-5">
          <div className="grid grid-cols-3 gap-2" aria-label="Этапы импорта">
            <Step
              number={1}
              label="Файл"
              active={!preview && !result}
              done={Boolean(preview || result)}
            />
            <Step
              number={2}
              label="Проверка"
              active={Boolean(preview && !result)}
              done={Boolean(result)}
            />
            <Step
              number={3}
              label="Готово"
              active={Boolean(result)}
              done={Boolean(result)}
            />
          </div>
          <Progress
            value={progress}
            aria-label={`Выполнено ${progress}%`}
            className="mt-4 gap-0"
          />
        </div>

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(280px,.65fr)]">
          <div className="space-y-5">
            {!result && (
              <div className="surface-card rounded-3xl border p-4 sm:p-6">
                <label
                  htmlFor="statement-file"
                  className="focus-within:ring-ring/45 flex min-h-56 cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-primary/35 bg-primary/[.035] px-5 py-8 text-center transition-colors hover:border-primary/60 hover:bg-primary/[.06] focus-within:ring-3"
                >
                  <span className="grid size-14 place-items-center rounded-2xl bg-primary/10 text-primary">
                    {reading ? (
                      <Spinner className="size-6" />
                    ) : (
                      <Upload className="size-6" aria-hidden="true" />
                    )}
                  </span>
                  <strong className="mt-4 text-lg">
                    {reading
                      ? 'Читаем выписку…'
                      : source
                        ? source.fileName
                        : 'Выбрать выписку'}
                  </strong>
                  <span className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
                    CSV, XLSX или PDF до 20 МБ. Файл разбирается прямо на вашем
                    устройстве.
                  </span>
                  <span className="mt-4 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground">
                    Открыть файлы
                  </span>
                  <input
                    ref={inputRef}
                    id="statement-file"
                    type="file"
                    accept=".csv,.xlsx,.pdf,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/pdf"
                    className="sr-only"
                    disabled={reading || saving}
                    onChange={(event: ChangeEvent<HTMLInputElement>) =>
                      void handleFile(event.target.files?.[0])
                    }
                  />
                </label>
                <a
                  href="/examples/kapital-demo-statement.csv"
                  download
                  className="focus-ring mt-3 inline-flex min-h-12 cursor-pointer items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold text-primary transition-colors hover:bg-primary/8"
                >
                  <Download className="size-4" aria-hidden="true" />
                  Скачать безопасный пример CSV
                </a>
                <div className="mt-4 flex items-start gap-3 rounded-2xl bg-emerald-500/[.08] p-4 text-sm">
                  <ShieldCheck
                    className="mt-0.5 size-5 shrink-0 text-emerald-600 dark:text-emerald-400"
                    aria-hidden="true"
                  />
                  <p className="leading-relaxed">
                    Мы не просим логин, пароль или SMS-код банка. Исходный файл
                    никуда не отправляется; после подтверждения сохраняются
                    только выбранные операции.
                  </p>
                </div>
              </div>
            )}

            {source && !result && (
              <div className="surface-card rounded-3xl border p-4 sm:p-6">
                <h3 className="text-lg font-semibold">Счёт и формат</h3>
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <label
                    htmlFor="import-bank"
                    className="space-y-2 text-sm font-medium"
                  >
                    <span>Банк</span>
                    <select
                      id="import-bank"
                      value={bank}
                      onChange={(event) =>
                        changeBank(event.target.value as BankCode | '')
                      }
                      className="focus-ring min-h-12 w-full cursor-pointer rounded-xl border bg-background px-3 text-base"
                    >
                      <option value="">Выберите банк</option>
                      {bankOptions.map(([code, label]) => (
                        <option key={code} value={code}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label
                    htmlFor="import-account-name"
                    className="space-y-2 text-sm font-medium"
                  >
                    <span>Название счёта</span>
                    <Input
                      id="import-account-name"
                      value={accountName}
                      onChange={(event) => setAccountName(event.target.value)}
                      className="h-12 rounded-xl text-base md:text-base"
                      placeholder="Например, Основная карта"
                    />
                  </label>
                  <label
                    htmlFor="import-account-balance"
                    className="space-y-2 text-sm font-medium sm:col-span-2"
                  >
                    <span>Текущий остаток, ₽</span>
                    <Input
                      id="import-account-balance"
                      value={balance}
                      onChange={(event) => setBalance(event.target.value)}
                      inputMode="decimal"
                      className="h-12 rounded-xl text-base md:text-base"
                      placeholder="Можно оставить пустым"
                    />
                    <span className="block text-xs font-normal leading-relaxed text-muted-foreground">
                      Нужен только для карточки капитала. Если выписка содержит
                      остаток, он подставится автоматически.
                    </span>
                    {balanceIsInvalid && (
                      <span
                        className="block text-sm font-normal text-destructive"
                        role="alert"
                      >
                        Введите сумму цифрами или оставьте поле пустым.
                      </span>
                    )}
                  </label>
                </div>

                <details className="mt-5 rounded-2xl border bg-muted/35 p-4">
                  <summary className="focus-ring flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 rounded-xl font-medium">
                    Настроить колонки
                    <ChevronDown className="size-5" aria-hidden="true" />
                  </summary>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    Меняйте сопоставление только если автоматическое
                    распознавание ошиблось.
                  </p>
                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    {mappingFields.map((field) => (
                      <label key={field.key} className="space-y-2 text-sm">
                        <span className="font-medium">
                          {field.label}
                          {field.required ? ' *' : ''}
                        </span>
                        <select
                          value={mapping[field.key] ?? ''}
                          onChange={(event) =>
                            changeMapping(field.key, event.target.value)
                          }
                          className="focus-ring min-h-12 w-full cursor-pointer rounded-xl border bg-background px-3 text-base"
                        >
                          <option value="">Не выбрано</option>
                          {source.inspection.headers.map((header, index) => (
                            <option key={`${header}-${index}`} value={index}>
                              {header}
                            </option>
                          ))}
                        </select>
                      </label>
                    ))}
                  </div>
                </details>
              </div>
            )}

            {error && (
              <div
                className="flex items-start gap-3 rounded-2xl border border-destructive/30 bg-destructive/[.07] p-4"
                role="alert"
              >
                <AlertCircle
                  className="mt-0.5 size-5 shrink-0 text-destructive"
                  aria-hidden="true"
                />
                <div>
                  <p className="font-medium">Нужна проверка</p>
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                    {error}
                  </p>
                </div>
              </div>
            )}

            {preview && !result && (
              <PreviewList
                preview={preview}
                rowsToSave={rowsToSave.length}
                visibleRows={visibleRows}
                onShowMore={() => setVisibleRows((current) => current + 30)}
                onUpdateRow={updateRow}
                onSelectAll={selectImportable}
              />
            )}

            {result && (
              <SuccessPanel
                result={result}
                dataMode={dataMode}
                onReset={resetImport}
              />
            )}
          </div>

          <aside className="space-y-5 lg:sticky lg:top-28 lg:self-start">
            <div className="surface-card rounded-3xl border p-5">
              <div className="flex items-center gap-3">
                <span className="grid size-11 place-items-center rounded-2xl bg-primary/10 text-primary">
                  <FileSpreadsheet className="size-5" aria-hidden="true" />
                </span>
                <div>
                  <p className="font-semibold">Что будет импортировано</p>
                  <p className="text-sm text-muted-foreground">
                    Только подтверждённые строки
                  </p>
                </div>
              </div>
              {preview ? (
                <dl className="mt-5 grid grid-cols-2 gap-3 text-sm">
                  <Metric
                    label="Новые"
                    value={preview.counts.new}
                    tone="good"
                  />
                  <Metric
                    label="Проверить"
                    value={preview.counts.review}
                    tone="warn"
                  />
                  <Metric label="Дубли" value={preview.counts.duplicate} />
                  <Metric
                    label="Ошибки"
                    value={preview.counts.error}
                    tone="bad"
                  />
                </dl>
              ) : (
                <p className="mt-5 text-sm leading-relaxed text-muted-foreground">
                  После выбора файла здесь появится итог автоматической
                  проверки.
                </p>
              )}
              {source?.warning && (
                <p className="mt-4 rounded-xl bg-amber-500/10 p-3 text-sm leading-relaxed text-amber-800 dark:text-amber-200">
                  {source.warning}
                </p>
              )}
            </div>

            {preview && !result && (
              <div className="surface-card rounded-3xl border p-5">
                <p className="text-sm text-muted-foreground">Выбрано</p>
                <p className="mt-1 text-3xl font-semibold tabular-nums">
                  {rowsToSave.length}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  операций для сохранения
                </p>
                <Button
                  className="mt-5 min-h-12 w-full cursor-pointer text-base"
                  disabled={
                    saving ||
                    !rowsToSave.length ||
                    !accountName.trim() ||
                    !bank ||
                    balanceIsInvalid
                  }
                  onClick={() => void saveImport()}
                >
                  {saving ? (
                    <>
                      <Spinner /> Сохраняем…
                    </>
                  ) : (
                    <>
                      <FileCheck2 aria-hidden="true" /> Сохранить операции
                    </>
                  )}
                </Button>
                {!accountName.trim() && (
                  <p className="mt-2 text-sm text-destructive" role="alert">
                    Укажите название счёта.
                  </p>
                )}
                <div className="mt-4 flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
                  <LockKeyhole
                    className="mt-0.5 size-4 shrink-0"
                    aria-hidden="true"
                  />
                  <p>
                    {dataMode === 'demo'
                      ? 'Демоданные останутся только в браузере этого устройства.'
                      : 'Операции сохранятся в вашем аккаунте и будут защищены RLS.'}
                  </p>
                </div>
              </div>
            )}
          </aside>
        </div>
      </section>
    </AppShell>
  );
}

function Step({
  number,
  label,
  active,
  done,
}: {
  number: number;
  label: string;
  active: boolean;
  done: boolean;
}) {
  return (
    <div
      className={`flex min-w-0 items-center gap-2 rounded-xl px-2 py-2 sm:px-3 ${active ? 'bg-primary/10 text-primary' : 'text-muted-foreground'}`}
      aria-current={active ? 'step' : undefined}
    >
      <span
        className={`grid size-7 shrink-0 place-items-center rounded-full text-xs font-semibold ${done ? 'bg-emerald-500 text-white' : active ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}
      >
        {done ? <Check className="size-4" aria-hidden="true" /> : number}
      </span>
      <span className="truncate text-xs font-medium sm:text-sm">{label}</span>
    </div>
  );
}

function Metric({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: 'good' | 'warn' | 'bad';
}) {
  const toneClass =
    tone === 'good'
      ? 'text-emerald-700 dark:text-emerald-300'
      : tone === 'warn'
        ? 'text-amber-700 dark:text-amber-300'
        : tone === 'bad'
          ? 'text-destructive'
          : '';
  return (
    <div className="rounded-2xl bg-muted/70 p-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={`mt-1 text-xl font-semibold tabular-nums ${toneClass}`}>
        {value}
      </dd>
    </div>
  );
}

function PreviewList({
  preview,
  rowsToSave,
  visibleRows,
  onShowMore,
  onUpdateRow,
  onSelectAll,
}: {
  preview: StatementPreview;
  rowsToSave: number;
  visibleRows: number;
  onShowMore: () => void;
  onUpdateRow: (id: string, changes: Partial<ParsedImportRow>) => void;
  onSelectAll: (selected: boolean) => void;
}) {
  return (
    <div className="surface-card overflow-hidden rounded-3xl border">
      <div className="flex flex-col gap-3 border-b p-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div>
          <h3 className="font-semibold">Проверьте операции</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {preview.rows.length} строк · выбрано {rowsToSave}
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            className="min-h-12 cursor-pointer"
            onClick={() => onSelectAll(true)}
          >
            Выбрать новые
          </Button>
          <Button
            variant="ghost"
            className="min-h-12 cursor-pointer"
            onClick={() => onSelectAll(false)}
          >
            Снять
          </Button>
        </div>
      </div>
      <div className="divide-y divide-border">
        {preview.rows.slice(0, visibleRows).map((row) => (
          <ImportRowCard key={row.id} row={row} onUpdate={onUpdateRow} />
        ))}
      </div>
      {visibleRows < preview.rows.length && (
        <div className="border-t p-4 text-center">
          <Button
            variant="outline"
            className="min-h-12 cursor-pointer"
            onClick={onShowMore}
          >
            Показать ещё {Math.min(30, preview.rows.length - visibleRows)}
          </Button>
        </div>
      )}
    </div>
  );
}

function ImportRowCard({
  row,
  onUpdate,
}: {
  row: ParsedImportRow;
  onUpdate: (id: string, changes: Partial<ParsedImportRow>) => void;
}) {
  const blocked = row.status === 'duplicate' || row.status === 'error';
  const status = {
    new: {
      label: 'Новая',
      className: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
    },
    duplicate: { label: 'Дубль', className: 'bg-muted text-muted-foreground' },
    review: {
      label: 'Проверить',
      className: 'bg-amber-500/12 text-amber-800 dark:text-amber-200',
    },
    error: { label: 'Ошибка', className: 'bg-destructive/10 text-destructive' },
  }[row.status];

  return (
    <article
      className={`p-4 sm:p-5 ${!row.selected || blocked ? 'opacity-65' : ''}`}
    >
      <div className="flex items-start gap-3">
        <label className="grid min-h-12 min-w-12 cursor-pointer place-items-center rounded-xl hover:bg-muted">
          <span className="sr-only">Импортировать строку {row.rowNumber}</span>
          <input
            type="checkbox"
            checked={row.selected && !blocked}
            disabled={blocked}
            onChange={(event) =>
              onUpdate(row.id, { selected: event.target.checked })
            }
            className="size-5 cursor-pointer accent-primary disabled:cursor-not-allowed"
          />
        </label>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <strong className="block break-words text-sm sm:text-base">
                {row.merchant}
              </strong>
              <span className="mt-1 block text-xs text-muted-foreground sm:text-sm">
                {row.date
                  ? formatTransactionDate(row.date)
                  : `Строка ${row.rowNumber}`}
              </span>
            </div>
            <div className="text-right">
              <p
                className={`font-semibold tabular-nums ${row.amount > 0 ? 'text-emerald-700 dark:text-emerald-300' : ''}`}
              >
                {formatRubles(row.amount)}
              </p>
              <span
                className={`mt-1 inline-flex rounded-full px-2 py-1 text-xs font-semibold ${status.className}`}
              >
                {status.label}
              </span>
            </div>
          </div>
          {!blocked && (
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="space-y-1 text-xs text-muted-foreground">
                <span>Категория</span>
                <select
                  value={row.category}
                  onChange={(event) =>
                    onUpdate(row.id, { category: event.target.value })
                  }
                  className="focus-ring min-h-11 w-full cursor-pointer rounded-xl border bg-background px-3 text-sm text-foreground"
                >
                  {[
                    row.category,
                    ...categoryOptions.filter((item) => item !== row.category),
                  ].map((category) => (
                    <option key={category}>{category}</option>
                  ))}
                </select>
              </label>
              <label className="flex min-h-12 cursor-pointer items-center gap-3 self-end rounded-xl border px-3 text-sm font-medium hover:bg-muted">
                <input
                  type="checkbox"
                  checked={row.isTransfer}
                  onChange={(event) =>
                    onUpdate(row.id, {
                      isTransfer: event.target.checked,
                      excludedFromAnalytics: event.target.checked,
                      transactionType: event.target.checked
                        ? 'transfer'
                        : row.amount > 0
                          ? 'income'
                          : 'expense',
                    })
                  }
                  className="size-5 cursor-pointer accent-primary"
                />
                <ArrowLeftRight
                  className="size-4 text-primary"
                  aria-hidden="true"
                />
                Это перевод
              </label>
            </div>
          )}
          {row.issues.length > 0 && (
            <ul className="mt-3 space-y-1 text-xs leading-relaxed text-amber-800 dark:text-amber-200">
              {row.issues.map((issue) => (
                <li key={issue}>• {issue}</li>
              ))}
            </ul>
          )}
          {row.description && row.description !== row.merchant && (
            <p className="mt-2 break-words text-xs leading-relaxed text-muted-foreground">
              {row.description}
            </p>
          )}
        </div>
      </div>
    </article>
  );
}

function SuccessPanel({
  result,
  dataMode,
  onReset,
}: {
  result: StatementCommitResult;
  dataMode: 'demo' | 'supabase';
  onReset: () => void;
}) {
  return (
    <div className="surface-card rounded-3xl border p-6 text-center sm:p-10">
      <span className="mx-auto grid size-16 place-items-center rounded-3xl bg-emerald-500/12 text-emerald-600 dark:text-emerald-400">
        <CheckCircle2 className="size-8" aria-hidden="true" />
      </span>
      <h3 className="mt-5 text-2xl font-semibold tracking-tight">
        {result.alreadyImported
          ? 'Эта выписка уже загружена'
          : 'Выписка сохранена'}
      </h3>
      <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted-foreground sm:text-base">
        {result.alreadyImported
          ? 'Повторное добавление остановлено, поэтому дубли не появились.'
          : `Добавлено ${result.insertedCount} операций${result.duplicateCount ? `, пропущено дублей: ${result.duplicateCount}` : ''}.`}
      </p>
      {dataMode === 'demo' && (
        <p className="mx-auto mt-4 max-w-md rounded-2xl bg-primary/[.07] p-4 text-sm leading-relaxed">
          В деморежиме импорт сохранён только в браузере этого устройства. После
          подключения Supabase данные будут доступны после входа.
        </p>
      )}
      <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
        <Button
          className="min-h-12 cursor-pointer px-5"
          render={<Link href="/transactions" />}
        >
          Посмотреть операции
        </Button>
        <Button
          variant="outline"
          className="min-h-12 cursor-pointer px-5"
          onClick={onReset}
        >
          Импортировать ещё
        </Button>
      </div>
    </div>
  );
}
