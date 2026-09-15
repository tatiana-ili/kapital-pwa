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
import { categoriesForAmount } from '@/features/categories/defaults';
import type { FinanceCategory } from '@/features/categories/types';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Spinner } from '@/components/ui/spinner';
import type { StatementCommitResult } from '@/features/import/commit-types';
import {
  bankStatementParsers,
  inferBankMapping,
} from '@/features/import/banks';
import { readStatementFile } from '@/features/import/file-reader';
import { describeStatementReadError } from '@/features/import/read-error';
import { inspectStatementTable, parseAmount } from '@/features/import/parser';
import type {
  ColumnMapping,
  ImportColumnKey,
  ParsedImportRow,
  StatementPreview,
  StatementSource,
} from '@/features/import/types';
import { useFinanceData } from '@/hooks/use-finance-data';
import { useCategories } from '@/hooks/use-categories';
import {
  bankNames,
  formatRubles,
  formatTransactionDate,
  type BankCode,
} from '@/lib/finance-data';
import {
  loadLocalImportProfile,
  saveLocalStatement,
} from '@/lib/local-finance-store';
import {
  commitStatementImport,
  loadStatementImportProfile,
} from '@/lib/supabase/imports';

const bankOptions = Object.entries(bankNames) as Array<[BankCode, string]>;
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
  const { accounts, client, dataMode, transactions } = useFinanceData();
  const {
    categories,
    rules: categoryRules,
    loading: categoriesLoading,
    error: categoriesError,
    refresh: refreshCategories,
    createRule,
  } = useCategories();
  const inputRef = useRef<HTMLInputElement>(null);
  const [source, setSource] = useState<StatementSource | null>(null);
  const [bank, setBank] = useState<BankCode | ''>('');
  const [accountName, setAccountName] = useState('');
  const [balance, setBalance] = useState('');
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [preview, setPreview] = useState<StatementPreview | null>(null);
  const [reading, setReading] = useState(false);
  const [pdfProgress, setPdfProgress] = useState<{
    current: number;
    total: number;
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [reloadSuggested, setReloadSuggested] = useState(false);
  const [pdfReviewConfirmed, setPdfReviewConfirmed] = useState(false);
  const [result, setResult] = useState<StatementCommitResult | null>(null);
  const [visibleRows, setVisibleRows] = useState(30);
  const [showOnlyAttention, setShowOnlyAttention] = useState(false);
  const [ruleSuggestion, setRuleSuggestion] = useState<{
    merchant: string;
    category: string;
    direction: 'expense' | 'income';
  } | null>(null);
  const [savingRule, setSavingRule] = useState(false);
  const [ruleMessage, setRuleMessage] = useState('');

  const rowsToSave = useMemo(
    () =>
      preview?.rows.filter(
        (row) =>
          row.selected && row.status !== 'duplicate' && row.status !== 'error',
      ) ?? [],
    [preview],
  );
  const previewSummary = useMemo(() => {
    const dates = rowsToSave.map((row) => row.date).sort();
    return {
      income: rowsToSave.reduce(
        (sum, row) => sum + (row.isTransfer ? 0 : Math.max(0, row.amount)),
        0,
      ),
      expenses: rowsToSave.reduce(
        (sum, row) => sum + (row.isTransfer ? 0 : Math.min(0, row.amount)),
        0,
      ),
      transferCount: rowsToSave.filter((row) => row.isTransfer).length,
      period: dates.length
        ? `${formatFullDate(dates[0])}${dates[0] === dates[dates.length - 1] ? '' : ` — ${formatFullDate(dates[dates.length - 1])}`}`
        : 'Нет выбранных операций',
    };
  }, [rowsToSave]);
  const pdfNeedsReview =
    preview?.fileFormat === 'pdf' &&
    (Boolean(preview.pdfUnrecognizedLineCount) ||
      preview.counts.error > 0 ||
      preview.pdfDiagnostics?.confidence === 'review');
  const parsedBalance = balance.trim() ? parseAmount(balance) : undefined;
  const balanceIsInvalid = balance.trim() !== '' && parsedBalance === undefined;
  const progress = result ? 100 : preview ? 66 : 33;

  async function resolveMapping(
    nextSource: StatementSource,
    nextBank: BankCode,
  ) {
    const generic = inspectStatementTable(
      nextSource.table,
      nextSource.fileName,
    ).mapping;
    const inferred = inferBankMapping(
      nextBank,
      nextSource.inspection.headers,
      generic,
    );
    try {
      const stored = client
        ? await loadStatementImportProfile(
            client,
            nextBank,
            nextSource.fileFormat,
            nextSource.inspection.headerSignature,
            nextSource.inspection.headers.length,
          )
        : loadLocalImportProfile(
            nextBank,
            nextSource.fileFormat,
            nextSource.inspection.headerSignature,
            nextSource.inspection.headers.length,
          );
      return stored ?? inferred;
    } catch {
      return inferred;
    }
  }

  function rebuildPreview(
    nextSource: StatementSource,
    nextBank: BankCode,
    nextMapping: ColumnMapping,
    nextAccountName: string,
  ) {
    setPdfReviewConfirmed(false);
    try {
      const existingAccountId = accounts.find(
        (account) =>
          account.bank === bankNames[nextBank] &&
          account.name.toLocaleLowerCase('ru') ===
            nextAccountName.trim().toLocaleLowerCase('ru'),
      )?.id;
      const parsed = bankStatementParsers[nextBank].parse({
        bank: nextBank,
        accountName: nextAccountName,
        existingAccountId,
        source: nextSource,
        mapping: nextMapping,
        existingTransactions: transactions,
        categories,
        categoryRules,
      });
      setPreview(parsed);
      setShowOnlyAttention(parsed.counts.review + parsed.counts.error > 0);
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
    if (!file || reading || categoriesLoading || categoriesError) return;
    setReading(true);
    setPdfProgress(null);
    setError('');
    setReloadSuggested(false);
    setPdfReviewConfirmed(false);
    setResult(null);
    setPreview(null);
    setRuleSuggestion(null);
    setRuleMessage('');
    setVisibleRows(30);
    try {
      const nextSource = await readStatementFile(file, {
        onPdfProgress: (current, total) => setPdfProgress({ current, total }),
      });
      const nextBank = nextSource.inspection.detectedBank;
      setSource(nextSource);
      if (!nextBank) {
        setBank('');
        setMapping(nextSource.inspection.mapping);
        setError('Не удалось определить банк. Выберите его вручную.');
        return;
      }
      const nextMapping = await resolveMapping(nextSource, nextBank);
      setMapping(nextMapping);
      setBank(nextBank);
      const nextAccountName =
        !accountName || accountName.includes('· Основной')
          ? `${bankNames[nextBank]} · Основной`
          : accountName;
      setAccountName(nextAccountName);
      rebuildPreview(nextSource, nextBank, nextMapping, nextAccountName);
    } catch (cause) {
      setSource(null);
      const readError = describeStatementReadError(cause, file.name);
      setError(readError.message);
      setReloadSuggested(readError.reloadSuggested);
    } finally {
      setReading(false);
      setPdfProgress(null);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  async function changeBank(nextBank: BankCode | '') {
    setBank(nextBank);
    setPreview(null);
    const nextAccountName =
      nextBank && (!accountName || accountName.includes('· Основной'))
        ? `${bankNames[nextBank]} · Основной`
        : accountName;
    setAccountName(nextAccountName);
    if (!source || !nextBank) return;
    setReading(true);
    const nextMapping = await resolveMapping(source, nextBank);
    setMapping(nextMapping);
    rebuildPreview(source, nextBank, nextMapping, nextAccountName);
    setReading(false);
  }

  function changeMapping(key: ImportColumnKey, value: string) {
    const nextMapping = { ...mapping };
    if (value === '') delete nextMapping[key];
    else nextMapping[key] = Number(value);
    setMapping(nextMapping);
    if (source && bank) rebuildPreview(source, bank, nextMapping, accountName);
  }

  function updateRow(id: string, changes: Partial<ParsedImportRow>) {
    if (changes.category !== undefined) {
      const row = preview?.rows.find((item) => item.id === id);
      const merchant = row?.merchant.trim() ?? '';
      const direction = row && row.amount >= 0 ? 'income' : 'expense';
      const alreadyCovered = categoryRules.some(
        (rule) =>
          rule.isActive &&
          rule.field === 'merchant' &&
          (rule.direction === 'both' || rule.direction === direction) &&
          rule.value.toLocaleLowerCase('ru') ===
            merchant.toLocaleLowerCase('ru') &&
          rule.targetCategory === changes.category,
      );
      setRuleSuggestion(
        row && changes.category !== row.category && merchant && !alreadyCovered
          ? { merchant, category: changes.category, direction }
          : null,
      );
      setRuleMessage('');
    }
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

  async function saveSuggestedRule() {
    if (!ruleSuggestion || savingRule) return;
    setSavingRule(true);
    try {
      const saved = await createRule(
        'merchant',
        ruleSuggestion.merchant,
        ruleSuggestion.category,
        ruleSuggestion.direction,
      );
      if (saved) {
        setRuleSuggestion(null);
        setRuleMessage('Правило сохранено для следующих импортов.');
      }
    } finally {
      setSavingRule(false);
    }
  }

  function selectImportable(selected: boolean) {
    setPreview((current) =>
      current
        ? {
            ...current,
            rows: current.rows.map((row) =>
              row.status === 'new'
                ? { ...row, selected }
                : row.status === 'review'
                  ? { ...row, selected: false }
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
        accountName:
          accounts.find(
            (account) =>
              account.bank === bankNames[bank] &&
              account.name.toLocaleLowerCase('ru') ===
                accountName.trim().toLocaleLowerCase('ru'),
          )?.name ?? accountName.trim(),
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
    setRuleSuggestion(null);
    setRuleMessage('');
    setResult(null);
    setError('');
    setReloadSuggested(false);
    setPdfReviewConfirmed(false);
    setMapping({});
    setBalance('');
    setVisibleRows(30);
    setShowOnlyAttention(false);
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
              disabled={saving || reading}
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
            getAriaValueText={() => `${progress}%`}
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
                      ? pdfProgress
                        ? `Читаем PDF: ${pdfProgress.current} из ${pdfProgress.total}`
                        : 'Читаем выписку…'
                      : source
                        ? source.fileName
                        : 'Выбрать выписку'}
                  </strong>
                  <span className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
                    CSV, XLSX или PDF до 50 МБ. Файл разбирается прямо на вашем
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
                    disabled={
                      reading ||
                      saving ||
                      categoriesLoading ||
                      Boolean(categoriesError)
                    }
                    onChange={(event: ChangeEvent<HTMLInputElement>) =>
                      void handleFile(event.target.files?.[0])
                    }
                  />
                </label>
                {categoriesError && (
                  <div
                    className="mt-3 flex flex-wrap items-center gap-3 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
                    role="alert"
                  >
                    <span>{categoriesError} Импорт временно недоступен.</span>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => void refreshCategories()}
                      className="min-h-11 cursor-pointer"
                    >
                      Повторить
                    </Button>
                  </div>
                )}
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
                      disabled={reading}
                      onChange={(event) =>
                        void changeBank(event.target.value as BankCode | '')
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
                      onChange={(event) => {
                        const nextAccountName = event.target.value;
                        setAccountName(nextAccountName);
                        if (source && bank) {
                          rebuildPreview(
                            source,
                            bank,
                            mapping,
                            nextAccountName,
                          );
                        }
                      }}
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
                  {reloadSuggested && (
                    <Button
                      type="button"
                      variant="outline"
                      className="mt-3 min-h-11 cursor-pointer"
                      onClick={() => window.location.reload()}
                    >
                      <RotateCcw aria-hidden="true" />
                      Обновить приложение
                    </Button>
                  )}
                </div>
              </div>
            )}

            {preview && !result && (
              <>
                {preview.pdfDiagnostics && (
                  <PdfDiagnosticsPanel diagnostics={preview.pdfDiagnostics} />
                )}
                {pdfNeedsReview && (
                  <div
                    aria-live="polite"
                    className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm leading-relaxed text-amber-800 dark:text-amber-200"
                  >
                    <p className="font-semibold">PDF распознан частично</p>
                    {Boolean(preview.pdfUnrecognizedLineCount) && (
                      <p className="mt-1">
                        Текстовых фрагментов без даты и суммы:{' '}
                        {preview.pdfUnrecognizedLineCount}. Они могли быть
                        служебным текстом или продолжением операции и не
                        включены в импорт.
                      </p>
                    )}
                    {preview.counts.error > 0 && (
                      <p className="mt-1">
                        Строк с неполными данными: {preview.counts.error}. Они
                        отмечены как ошибки и не будут сохранены.
                      </p>
                    )}
                    <p className="mt-1">
                      Сверьте число операций и итоговые суммы с выпиской; при
                      расхождении используйте CSV или XLSX.
                    </p>
                  </div>
                )}
                <PreviewList
                  preview={preview}
                  categories={categories}
                  rowsToSave={rowsToSave.length}
                  visibleRows={visibleRows}
                  showOnlyAttention={showOnlyAttention}
                  onShowMore={() => setVisibleRows((current) => current + 30)}
                  onToggleAttention={() => {
                    setShowOnlyAttention((current) => !current);
                    setVisibleRows(30);
                  }}
                  onUpdateRow={updateRow}
                  onSelectAll={selectImportable}
                />
                {ruleSuggestion && (
                  <div className="rounded-2xl border border-primary/20 bg-primary/[.06] p-4">
                    <p className="text-sm font-medium">
                      Всегда относить операции «{ruleSuggestion.merchant}» к
                      категории «{ruleSuggestion.category}»?
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Текущая строка уже изменена. Правило применится к
                      следующим импортам.
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button
                        type="button"
                        disabled={savingRule}
                        onClick={() => void saveSuggestedRule()}
                        className="min-h-11 cursor-pointer"
                      >
                        Создать правило
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => setRuleSuggestion(null)}
                        className="min-h-11 cursor-pointer"
                      >
                        Не сейчас
                      </Button>
                    </div>
                  </div>
                )}
                {ruleMessage && (
                  <output className="block rounded-2xl bg-emerald-500/10 p-4 text-sm text-emerald-700 dark:text-emerald-300">
                    {ruleMessage}
                  </output>
                )}
              </>
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
              {preview && (
                <div className="mt-5 border-t pt-5">
                  <p className="text-sm font-semibold">
                    Итоги выбранных операций
                  </p>
                  <dl className="mt-3 space-y-3 text-sm">
                    <div className="flex items-start justify-between gap-3">
                      <dt className="text-muted-foreground">Банк</dt>
                      <dd className="text-right font-medium">
                        {bank ? bankNames[bank] : 'Не выбран'}
                      </dd>
                    </div>
                    <div className="flex items-start justify-between gap-3">
                      <dt className="text-muted-foreground">Период</dt>
                      <dd className="text-right font-medium">
                        {previewSummary.period}
                      </dd>
                    </div>
                    <div className="flex items-start justify-between gap-3">
                      <dt className="text-muted-foreground">Доходы</dt>
                      <dd className="font-semibold text-emerald-700 dark:text-emerald-300">
                        {formatRubles(previewSummary.income)}
                      </dd>
                    </div>
                    <div className="flex items-start justify-between gap-3">
                      <dt className="text-muted-foreground">Расходы</dt>
                      <dd className="font-semibold">
                        {formatRubles(previewSummary.expenses)}
                      </dd>
                    </div>
                    {previewSummary.transferCount > 0 && (
                      <div className="flex items-start justify-between gap-3">
                        <dt className="text-muted-foreground">Свои переводы</dt>
                        <dd className="font-medium">
                          {previewSummary.transferCount} · вне итогов
                        </dd>
                      </div>
                    )}
                  </dl>
                </div>
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
                {pdfNeedsReview && (
                  <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-xl border border-amber-500/30 p-3 text-sm leading-relaxed">
                    <input
                      type="checkbox"
                      checked={pdfReviewConfirmed}
                      onChange={(event) =>
                        setPdfReviewConfirmed(event.target.checked)
                      }
                      className="mt-1 size-5 shrink-0 cursor-pointer accent-primary"
                    />
                    Я сверила количество операций и суммы с PDF-выпиской
                  </label>
                )}
                <Button
                  className="mt-5 min-h-12 w-full cursor-pointer text-base"
                  disabled={
                    saving ||
                    categoriesLoading ||
                    Boolean(categoriesError) ||
                    !rowsToSave.length ||
                    !accountName.trim() ||
                    !bank ||
                    balanceIsInvalid ||
                    (pdfNeedsReview && !pdfReviewConfirmed)
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

function formatFullDate(date: string) {
  const [year, month, day] = date.split('-');
  return `${day}.${month}.${year}`;
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

function PdfDiagnosticsPanel({
  diagnostics,
}: {
  diagnostics: NonNullable<StatementPreview['pdfDiagnostics']>;
}) {
  const reliable = diagnostics.confidence === 'high';
  return (
    <section
      className={`rounded-2xl border p-4 ${
        reliable
          ? 'border-emerald-500/30 bg-emerald-500/[.08]'
          : 'border-amber-500/30 bg-amber-500/10'
      }`}
      aria-live="polite"
    >
      <div className="flex items-start gap-3">
        {reliable ? (
          <CheckCircle2
            className="mt-0.5 size-5 shrink-0 text-emerald-600 dark:text-emerald-400"
            aria-hidden="true"
          />
        ) : (
          <AlertCircle
            className="mt-0.5 size-5 shrink-0 text-amber-700 dark:text-amber-300"
            aria-hidden="true"
          />
        )}
        <div className="min-w-0 flex-1">
          <p className="font-semibold">
            {reliable
              ? 'PDF проверен автоматически'
              : 'Нужна точечная проверка'}
          </p>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
            {diagnostics.templateLabel} · найдено{' '}
            {diagnostics.recognizedRowCount} операций
          </p>
          <dl className="mt-3 grid gap-2 sm:grid-cols-2">
            {diagnostics.checks.map((check) => (
              <div
                key={check.id}
                className="flex min-h-11 items-center justify-between gap-3 rounded-xl bg-background/75 px-3 py-2 text-sm"
              >
                <dt className="min-w-0 text-muted-foreground">{check.label}</dt>
                <dd className="shrink-0 text-right font-medium tabular-nums">
                  {check.status === 'passed'
                    ? 'Совпало'
                    : check.status === 'unavailable'
                      ? 'Нет итога'
                      : `${formatRubles(check.actual ?? 0)} / ${formatRubles(check.expected ?? 0)}`}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </section>
  );
}

function PreviewList({
  preview,
  categories,
  rowsToSave,
  visibleRows,
  showOnlyAttention,
  onShowMore,
  onToggleAttention,
  onUpdateRow,
  onSelectAll,
}: {
  preview: StatementPreview;
  categories: FinanceCategory[];
  rowsToSave: number;
  visibleRows: number;
  showOnlyAttention: boolean;
  onShowMore: () => void;
  onToggleAttention: () => void;
  onUpdateRow: (id: string, changes: Partial<ParsedImportRow>) => void;
  onSelectAll: (selected: boolean) => void;
}) {
  const attentionRows = preview.rows.filter(
    (row) => row.status === 'review' || row.status === 'error',
  );
  const displayedRows = showOnlyAttention ? attentionRows : preview.rows;
  return (
    <div className="surface-card overflow-hidden rounded-3xl border">
      <div className="flex flex-col gap-3 border-b p-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div>
          <h3 className="font-semibold">Операции к импорту</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {showOnlyAttention
              ? `${attentionRows.length} требуют внимания`
              : `${preview.rows.length} строк`}{' '}
            · выбрано {rowsToSave}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {attentionRows.length > 0 && (
            <Button
              variant="outline"
              className="min-h-12 cursor-pointer"
              onClick={onToggleAttention}
            >
              {showOnlyAttention
                ? `Показать все ${preview.rows.length}`
                : `Только проверить ${attentionRows.length}`}
            </Button>
          )}
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
        {displayedRows.slice(0, visibleRows).map((row) => (
          <ImportRowCard
            key={row.id}
            row={row}
            categories={categories}
            onUpdate={onUpdateRow}
          />
        ))}
      </div>
      {visibleRows < displayedRows.length && (
        <div className="border-t p-4 text-center">
          <Button
            variant="outline"
            className="min-h-12 cursor-pointer"
            onClick={onShowMore}
          >
            Показать ещё {Math.min(30, displayedRows.length - visibleRows)}
          </Button>
        </div>
      )}
    </div>
  );
}

function ImportRowCard({
  row,
  categories,
  onUpdate,
}: {
  row: ParsedImportRow;
  categories: FinanceCategory[];
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
                    ...categoriesForAmount(categories, row.amount)
                      .map((item) => item.name)
                      .filter((name) => name !== row.category),
                  ].map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
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
          ? 'Все выбранные операции уже сохранены; дубли не добавлены.'
          : `Новых операций: ${result.insertedCount}${result.duplicateCount ? `, пропущено дублей: ${result.duplicateCount}` : ''}.`}
      </p>
      {dataMode === 'demo' && (
        <p className="mx-auto mt-4 max-w-md rounded-2xl bg-primary/[.07] p-4 text-sm leading-relaxed">
          В деморежиме импорт сохранён только в браузере этого устройства. После
          подключения Supabase данные будут доступны после входа.
        </p>
      )}
      <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
        <Link
          href="/transactions"
          className={buttonVariants({
            className: 'min-h-12 cursor-pointer px-5',
          })}
        >
          Посмотреть операции
        </Link>
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
