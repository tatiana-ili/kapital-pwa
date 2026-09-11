import Link from 'next/link';
import { ArrowDownRight, ArrowUpRight, ChevronRight, Plus, TrendingUp } from 'lucide-react';

import { AppShell } from '@/components/app-shell';
import { Button } from '@/components/ui/button';

const banks = [
  { name: 'Т-Банк', short: 'Т', balance: '210 000 ₽', tone: 'bg-[#ffd84d] text-[#201c00]' },
  { name: 'Сбер', short: 'С', balance: '350 000 ₽', tone: 'bg-[#21a038] text-white' },
  { name: 'Яндекс', short: 'Я', balance: '75 400 ₽', tone: 'bg-[#ff3b30] text-white' },
  { name: 'Ozon', short: 'O', balance: '200 000 ₽', tone: 'bg-[#2563eb] text-white' },
];

const recent = [
  { day: 'Сегодня', merchant: 'ВкусВилл', category: 'Продукты', amount: '−3 420 ₽', icon: 'В' },
  { day: 'Сегодня', merchant: 'Яндекс Такси', category: 'Такси', amount: '−1 890 ₽', icon: 'Я' },
  { day: 'Вчера', merchant: 'Зарплата', category: 'Доход', amount: '+235 000 ₽', icon: 'З', income: true },
];

export default function Home() {
  return (
    <AppShell>
      <div className="space-y-6 lg:space-y-8">
        <section className="balance-card relative overflow-hidden rounded-[28px] p-6 text-white shadow-[0_24px_70px_rgba(37,99,235,0.22)] sm:p-8">
          <div className="relative z-10">
            <div className="flex items-center justify-between gap-4">
              <p className="text-sm font-medium text-blue-100">Общий капитал</p>
              <span className="inline-flex items-center gap-1 rounded-full bg-white/12 px-2.5 py-1 text-xs font-semibold text-blue-50">
                <TrendingUp className="size-3.5" aria-hidden="true" />6,8% за месяц
              </span>
            </div>
            <p className="mt-3 text-[clamp(2.25rem,8vw,4.5rem)] font-semibold leading-none tracking-[-0.055em] tabular-nums">835 400 ₽</p>
            <div className="mt-7 flex items-end justify-between gap-5">
              <div><p className="text-xs text-blue-200">Изменение за месяц</p><p className="mt-1 text-base font-semibold tabular-nums">+53 240 ₽</p></div>
              <svg className="h-14 w-32 overflow-visible sm:w-48" viewBox="0 0 190 56" aria-label="Капитал растёт">
                <title>Капитал растёт</title>
                <defs><linearGradient id="spark-fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="white" stopOpacity=".3" /><stop offset="1" stopColor="white" stopOpacity="0" /></linearGradient></defs>
                <path d="M0 49 C18 48 22 35 38 38 S62 49 76 31 S102 39 118 22 S146 30 160 15 S178 11 190 4 V56 H0Z" fill="url(#spark-fill)" />
                <path d="M0 49 C18 48 22 35 38 38 S62 49 76 31 S102 39 118 22 S146 30 160 15 S178 11 190 4" fill="none" stroke="white" strokeLinecap="round" strokeWidth="3" />
              </svg>
            </div>
          </div>
        </section>

        <section aria-labelledby="accounts-title">
          <div className="mb-3 flex items-center justify-between">
            <h2 id="accounts-title" className="text-lg font-semibold tracking-tight">Счета</h2>
            <Button variant="ghost" size="sm" className="min-h-11 px-3 text-primary" disabled><Plus aria-hidden="true" /> Добавить</Button>
          </div>
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            {banks.map((bank) => (
              <article key={bank.name} className="surface-card rounded-2xl border p-4">
                <div className={`grid size-9 place-items-center rounded-xl text-sm font-bold ${bank.tone}`}>{bank.short}</div>
                <p className="mt-4 text-sm text-muted-foreground">{bank.name}</p>
                <p className="mt-1 text-lg font-semibold tracking-tight tabular-nums">{bank.balance}</p>
              </article>
            ))}
          </div>
        </section>

        <section aria-labelledby="month-title">
          <div className="mb-3 flex items-end justify-between gap-4">
            <div><h2 id="month-title" className="text-lg font-semibold tracking-tight">Сентябрь</h2><p className="text-sm text-muted-foreground">1–11 сентября</p></div>
            <span className="text-sm font-medium text-muted-foreground">11 дней</span>
          </div>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Metric label="Доходы" value="250 000 ₽" icon={<ArrowDownRight />} tone="income" />
            <Metric label="Расходы" value="170 000 ₽" icon={<ArrowUpRight />} tone="expense" />
            <Metric label="Остаток" value="+80 000 ₽" icon={<ArrowDownRight />} tone="income" />
            <Metric label="Накоплено" value="32%" icon={<TrendingUp />} tone="primary" />
          </div>
        </section>

        <section className="grid gap-4 xl:grid-cols-[1.1fr_.9fr]">
          <article className="surface-card rounded-3xl border p-5 sm:p-6">
            <div className="flex items-center justify-between">
              <div><h2 className="text-lg font-semibold tracking-tight">Расходы по категориям</h2><p className="mt-1 text-sm text-muted-foreground">Без переводов между своими счетами</p></div>
              <Button variant="ghost" size="icon-lg" aria-label="Открыть аналитику" disabled><ChevronRight aria-hidden="true" /></Button>
            </div>
            <div className="mt-6 flex flex-col items-center gap-7 sm:flex-row sm:justify-around">
              <div className="donut relative grid size-44 shrink-0 place-items-center rounded-full"><div className="grid size-28 place-items-center rounded-full bg-card text-center"><div><p className="text-xs text-muted-foreground">Всего</p><p className="mt-1 font-semibold tabular-nums">170 000 ₽</p></div></div></div>
              <div className="w-full space-y-3">
                <CategoryDot color="bg-[#2563eb]" name="Жильё" value="65 000 ₽" />
                <CategoryDot color="bg-[#7c3aed]" name="Маркетплейсы" value="37 980 ₽" />
                <CategoryDot color="bg-[#0ea5a4]" name="Продукты" value="24 180 ₽" />
                <CategoryDot color="bg-[#f59e0b]" name="Остальное" value="42 840 ₽" />
              </div>
            </div>
          </article>

          <article className="surface-card rounded-3xl border p-5 sm:p-6">
            <div className="flex items-center justify-between gap-4"><h2 className="text-lg font-semibold tracking-tight">Последние операции</h2><Link className="focus-ring min-h-11 rounded-xl px-3 py-3 text-sm font-semibold text-primary transition-colors hover:bg-primary/8" href="/transactions">Все</Link></div>
            <div className="mt-2 divide-y divide-border">
              {recent.map((item) => (
                <div key={`${item.day}-${item.merchant}`} className="flex min-h-[76px] items-center gap-3 py-3">
                  <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-muted text-sm font-bold text-muted-foreground">{item.icon}</span>
                  <div className="min-w-0 flex-1"><p className="truncate font-medium">{item.merchant}</p><p className="mt-0.5 truncate text-sm text-muted-foreground">{item.day} · {item.category}</p></div>
                  <p className={`shrink-0 text-sm font-semibold tabular-nums ${item.income ? 'text-emerald-600 dark:text-emerald-400' : ''}`}>{item.amount}</p>
                </div>
              ))}
            </div>
          </article>
        </section>
      </div>
    </AppShell>
  );
}

function Metric({ label, value, icon, tone }: { label: string; value: string; icon: React.ReactNode; tone: 'income' | 'expense' | 'primary' }) {
  const tones = { income: 'bg-emerald-500/12 text-emerald-600 dark:text-emerald-400', expense: 'bg-rose-500/12 text-rose-600 dark:text-rose-400', primary: 'bg-primary/12 text-primary' };
  return <article className="surface-card rounded-2xl border p-4"><div className={`grid size-9 place-items-center rounded-xl [&_svg]:size-4 ${tones[tone]}`}>{icon}</div><p className="mt-4 text-sm text-muted-foreground">{label}</p><p className="mt-1 text-[clamp(1.15rem,5vw,1.5rem)] font-semibold tracking-tight tabular-nums">{value}</p></article>;
}

function CategoryDot({ color, name, value }: { color: string; name: string; value: string }) {
  return <div className="flex items-center gap-3 text-sm"><span className={`size-2.5 rounded-full ${color}`} aria-hidden="true" /><span className="flex-1 text-muted-foreground">{name}</span><span className="font-medium tabular-nums">{value}</span></div>;
}
