'use client';

import { useEffect, useMemo, useState } from 'react';
import { ArrowDownLeft, ArrowLeftRight, ArrowUpRight, Check, EyeOff, Search, SlidersHorizontal } from 'lucide-react';
import { AppShell } from '@/components/app-shell';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { demoTransactions, formatRubles, formatTransactionDate, type DemoTransaction } from '@/lib/demo-data';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';

const bankFilters = ['Все банки', 'Т-Банк', 'Сбер', 'Яндекс Банк', 'Ozon Банк'] as const;
const bankLabels = { tbank: 'Т-Банк', sber: 'Сбер', yandex: 'Яндекс Банк', ozon: 'Ozon Банк' } as const;

export default function TransactionsPage() {
  const [query, setQuery] = useState('');
  const [bank, setBank] = useState<(typeof bankFilters)[number]>('Все банки');
  const [selected, setSelected] = useState<DemoTransaction | null>(null);
  const [localTransactions, setLocalTransactions] = useState(demoTransactions);
  const [dataMode, setDataMode] = useState<'demo' | 'supabase'>('demo');

  useEffect(() => {
    const client = createSupabaseBrowserClient();
    if (!client) return;
    void client.from('transactions').select('id,bank,account_id,transaction_date,amount,currency,merchant,description,category,transaction_type,is_transfer,is_recurring,note,excluded_from_analytics').order('transaction_date', { ascending: false }).limit(500).then(({ data, error }) => {
      if (error || !data) return;
      setLocalTransactions(data.map((row) => ({
        id: row.id,
        date: row.transaction_date,
        merchant: row.merchant,
        description: row.description,
        category: row.category,
        bank: bankLabels[row.bank as keyof typeof bankLabels],
        accountId: row.account_id,
        amount: Number(row.amount),
        currency: (row.currency || 'RUB') as 'RUB',
        transactionType: row.transaction_type as DemoTransaction['transactionType'],
        isTransfer: row.is_transfer,
        isRecurring: row.is_recurring,
        note: row.note || undefined,
        excludedFromAnalytics: row.excluded_from_analytics,
      })));
      setDataMode('supabase');
    });
  }, []);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('ru');
    return localTransactions.filter((transaction) => {
      const bankMatches = bank === 'Все банки' || transaction.bank === bank;
      const textMatches = !normalized || [transaction.merchant, transaction.description, transaction.category, transaction.bank, String(Math.abs(transaction.amount))].some((value) => value.toLocaleLowerCase('ru').includes(normalized));
      return bankMatches && textMatches;
    });
  }, [bank, localTransactions, query]);

  const total = filtered.reduce((sum, transaction) => transaction.isTransfer ? sum : sum + transaction.amount, 0);

  function updateSelected(changes: Partial<DemoTransaction>) {
    if (!selected) return;
    const updated = { ...selected, ...changes };
    setSelected(updated);
    setLocalTransactions((current) => current.map((transaction) => transaction.id === updated.id ? updated : transaction));
  }

  return (
    <AppShell>
      <section className="space-y-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div><p className="text-sm font-medium text-primary">История</p><h2 className="mt-1 text-3xl font-semibold tracking-[-.04em]">Операции</h2><p className="mt-1 text-sm text-muted-foreground">{localTransactions.length} {dataMode === 'demo' ? 'демо-операций из четырёх банков' : 'операций в защищённой базе'}</p></div>
          <div className="surface-card rounded-2xl border px-4 py-3 sm:text-right"><p className="text-xs text-muted-foreground">Итого по выборке</p><p className={`mt-1 text-lg font-semibold tabular-nums ${total >= 0 ? 'text-emerald-600 dark:text-emerald-400' : ''}`}>{formatRubles(total)}</p></div>
        </div>

        <div className="surface-card rounded-3xl border p-3 sm:p-4">
          <div className="relative block">
            <label className="sr-only" htmlFor="transaction-search">Поиск по операциям</label>
            <Search className="pointer-events-none absolute left-3.5 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input id="transaction-search" value={query} onChange={(event) => setQuery(event.target.value)} className="h-12 rounded-2xl pl-11 pr-4 text-base md:text-base" placeholder="Merchant, категория или сумма" type="search" />
          </div>
          <div className="mt-3 flex gap-2 overflow-x-auto pb-1" aria-label="Фильтр по банку">
            {bankFilters.map((item) => <button key={item} type="button" onClick={() => setBank(item)} className={`focus-ring min-h-11 shrink-0 cursor-pointer rounded-xl px-4 text-sm font-medium transition-colors ${bank === item ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'}`}>{item}</button>)}
          </div>
        </div>

        <div className="surface-card overflow-hidden rounded-3xl border">
          <div className="flex items-center justify-between border-b px-4 py-3 sm:px-5"><p className="text-sm font-medium">Найдено: {filtered.length}</p><span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"><SlidersHorizontal className="size-3.5" aria-hidden="true" />Переводы исключены из итога</span></div>
          {filtered.length ? (
            <div className="divide-y divide-border">
              {filtered.map((transaction) => <TransactionRow key={transaction.id} transaction={transaction} onSelect={() => setSelected(transaction)} />)}
            </div>
          ) : (
            <div className="px-6 py-16 text-center"><Search className="mx-auto size-8 text-muted-foreground" aria-hidden="true" /><h3 className="mt-4 font-semibold">Ничего не найдено</h3><p className="mt-1 text-sm text-muted-foreground">Попробуйте другой запрос или выберите все банки.</p></div>
          )}
        </div>
      </section>

      <Sheet open={Boolean(selected)} onOpenChange={(open) => { if (!open) setSelected(null); }}>
        <SheetContent side="right" className="w-[min(92vw,430px)] sm:max-w-[430px]">
          {selected && <>
            <SheetHeader className="border-b px-5 pb-5 pt-6"><SheetTitle className="pr-10 text-xl">{selected.merchant}</SheetTitle><SheetDescription>{formatTransactionDate(selected.date)} · {selected.bank}</SheetDescription><p className={`pt-3 text-3xl font-semibold tracking-tight tabular-nums ${selected.amount > 0 ? 'text-emerald-600 dark:text-emerald-400' : ''}`}>{formatRubles(selected.amount)}</p></SheetHeader>
            <div className="flex-1 space-y-5 overflow-y-auto px-5 py-2">
              <Detail label="Категория"><select aria-label="Категория" value={selected.category} onChange={(event) => updateSelected({ category: event.target.value })} className="focus-ring min-h-11 w-full cursor-pointer rounded-xl border bg-background px-3 text-base"><option>{selected.category}</option><option>Продукты</option><option>Кафе и рестораны</option><option>Такси</option><option>Маркетплейсы</option><option>Прочее</option></select></Detail>
              <Detail label="Описание"><p>{selected.description}</p></Detail>
              <Detail label="Счёт"><p>{selected.accountId}</p></Detail>
              <div className="space-y-2">
                <button type="button" onClick={() => updateSelected({ isTransfer: !selected.isTransfer, transactionType: !selected.isTransfer ? 'transfer' : selected.amount > 0 ? 'income' : 'expense', excludedFromAnalytics: !selected.isTransfer })} className="focus-ring flex min-h-12 w-full cursor-pointer items-center gap-3 rounded-xl border px-3 text-left transition-colors hover:bg-muted"><ArrowLeftRight className="size-5 text-primary" aria-hidden="true" /><span className="flex-1 text-sm font-medium">Перевод между своими счетами</span>{selected.isTransfer && <Check className="size-4 text-emerald-500" aria-hidden="true" />}</button>
                <button type="button" onClick={() => updateSelected({ excludedFromAnalytics: !selected.excludedFromAnalytics })} className="focus-ring flex min-h-12 w-full cursor-pointer items-center gap-3 rounded-xl border px-3 text-left transition-colors hover:bg-muted"><EyeOff className="size-5 text-muted-foreground" aria-hidden="true" /><span className="flex-1 text-sm font-medium">Не учитывать в аналитике</span>{selected.excludedFromAnalytics && <Check className="size-4 text-emerald-500" aria-hidden="true" />}</button>
              </div>
              <p className="rounded-xl bg-muted px-3 py-3 text-xs leading-relaxed text-muted-foreground">Изменения сохраняются только в демо-сессии. После подключения Supabase они будут храниться в вашей защищённой базе.</p>
            </div>
            <SheetFooter className="border-t p-5"><Button className="min-h-12 w-full" onClick={() => setSelected(null)}>Готово</Button></SheetFooter>
          </>}
        </SheetContent>
      </Sheet>
    </AppShell>
  );
}

function TransactionRow({ transaction, onSelect }: { transaction: DemoTransaction; onSelect: () => void }) {
  const Icon = transaction.isTransfer ? ArrowLeftRight : transaction.amount > 0 ? ArrowDownLeft : ArrowUpRight;
  return <button type="button" onClick={onSelect} className="focus-ring flex min-h-[82px] w-full cursor-pointer items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/60 sm:px-5"><span className={`grid size-11 shrink-0 place-items-center rounded-2xl ${transaction.amount > 0 ? 'bg-emerald-500/12 text-emerald-600 dark:text-emerald-400' : transaction.isTransfer ? 'bg-primary/12 text-primary' : 'bg-muted text-muted-foreground'}`}><Icon className="size-5" aria-hidden="true" /></span><span className="min-w-0 flex-1"><span className="flex items-center gap-2"><strong className="truncate text-sm sm:text-base">{transaction.merchant}</strong>{transaction.isRecurring && <Badge variant="secondary" className="hidden sm:inline-flex">Регулярный</Badge>}</span><span className="mt-1 block truncate text-xs text-muted-foreground sm:text-sm">{formatTransactionDate(transaction.date)} · {transaction.category} · {transaction.bank}</span></span><span className={`shrink-0 text-sm font-semibold tabular-nums sm:text-base ${transaction.amount > 0 ? 'text-emerald-600 dark:text-emerald-400' : ''}`}>{formatRubles(transaction.amount)}</span></button>;
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) { return <div><p className="mb-2 text-xs font-semibold uppercase tracking-[.1em] text-muted-foreground">{label}</p>{children}</div>; }
