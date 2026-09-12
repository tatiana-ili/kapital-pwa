'use client';

import Link from 'next/link';
import {
  CalendarClock,
  ChevronRight,
  FileUp,
  Goal,
  Settings2,
  Sparkles,
  Tags,
} from 'lucide-react';
import { AppShell } from '@/components/app-shell';

const available = [
  {
    href: '/import',
    label: 'Импорт выписки',
    description: 'Добавить операции из банковского файла',
    icon: FileUp,
  },
  {
    href: '/categories',
    label: 'Категории и правила',
    description: 'Настроить названия и автоматическую категоризацию',
    icon: Tags,
  },
  {
    href: '/subscriptions',
    label: 'Подписки',
    description: 'Регулярные платежи и прогноз расходов',
    icon: CalendarClock,
  },
  {
    href: '/goals',
    label: 'Финансовые цели',
    description: 'План накоплений и прогресс по каждой цели',
    icon: Goal,
  },
  {
    href: '/settings',
    label: 'Настройки',
    description: 'Тема, режим данных и учётная запись',
    icon: Settings2,
  },
];

export default function MorePage() {
  return (
    <AppShell>
      <section className="mx-auto max-w-3xl space-y-6">
        <div>
          <p className="text-sm font-medium text-primary">Настройки финансов</p>
          <h2 className="mt-1 text-3xl font-semibold tracking-[-.04em]">Ещё</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Импортируйте выписки, настраивайте категории и следите за
            регулярными платежами и целями.
          </p>
        </div>
        <div className="surface-card overflow-hidden rounded-3xl border">
          {available.map(({ href, label, description, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className="focus-ring flex min-h-[88px] items-center gap-4 border-b px-5 py-4 transition-colors last:border-b-0 hover:bg-muted/60"
            >
              <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary">
                <Icon className="size-5" aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1">
                <strong className="block text-sm sm:text-base">{label}</strong>
                <span className="mt-1 block text-xs leading-relaxed text-muted-foreground sm:text-sm">
                  {description}
                </span>
              </span>
              <ChevronRight
                className="size-5 shrink-0 text-muted-foreground"
                aria-hidden="true"
              />
            </Link>
          ))}
        </div>
        <div className="rounded-3xl border border-dashed p-5 text-sm text-muted-foreground">
          <div className="flex items-center gap-2 font-medium text-foreground">
            <Sparkles className="size-5" aria-hidden="true" /> Следующие этапы
          </div>
          <p className="mt-2 leading-relaxed">
            AI-ассистент запланирован на следующий этап.
          </p>
        </div>
      </section>
    </AppShell>
  );
}
