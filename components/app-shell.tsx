'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  BarChart3,
  CircleDollarSign,
  LayoutDashboard,
  List,
  LogOut,
  Menu,
  PiggyBank,
  Search,
} from 'lucide-react';
import { useState } from 'react';
import { ThemeToggle } from '@/components/theme-toggle';
import {
  createSupabaseBrowserClient,
  isSupabaseConfigured,
} from '@/lib/supabase/browser';
import { cn } from '@/lib/utils';

const nav = [
  { href: '/', label: 'Главная', icon: LayoutDashboard, enabled: true },
  { href: '/transactions', label: 'Операции', icon: List, enabled: true },
  { href: '/analytics', label: 'Аналитика', icon: BarChart3, enabled: true },
  { href: '/budget', label: 'Бюджет', icon: PiggyBank, enabled: false },
  { href: '/more', label: 'Ещё', icon: Menu, enabled: true },
];

function isNavActive(pathname: string, href: string) {
  if (href === '/') return pathname === '/';
  if (href === '/more') {
    return ['/more', '/import', '/categories'].some((path) =>
      pathname.startsWith(path),
    );
  }
  return pathname.startsWith(href);
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [client] = useState(createSupabaseBrowserClient);
  const [signingOut, setSigningOut] = useState(false);
  const supabaseConfigured = isSupabaseConfigured();

  async function signOut() {
    if (!client || signingOut) return;
    setSigningOut(true);
    await client.auth.signOut();
    router.replace('/login');
    router.refresh();
  }
  return (
    <div className="min-h-dvh bg-background">
      <a
        href="#main-content"
        className="sr-only z-[100] rounded-md bg-primary px-4 py-2 text-primary-foreground focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
      >
        К содержанию
      </a>
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[248px] border-r border-sidebar-border bg-sidebar px-4 py-6 lg:block">
        <Link
          href="/"
          className="focus-ring flex min-h-12 items-center gap-3 rounded-2xl px-3"
        >
          <span className="grid size-10 place-items-center rounded-2xl bg-primary text-primary-foreground">
            <CircleDollarSign className="size-5" aria-hidden="true" />
          </span>
          <span>
            <strong className="block text-lg leading-none tracking-tight">
              Капитал
            </strong>
            <span className="mt-1 block text-xs text-muted-foreground">
              Личные финансы
            </span>
          </span>
        </Link>
        <nav className="mt-9 space-y-1" aria-label="Основная навигация">
          {nav.map(({ href, label, icon: Icon, enabled }) => {
            const active = isNavActive(pathname, href);
            if (!enabled)
              return (
                <span
                  key={href}
                  aria-disabled="true"
                  title="Будет добавлено на следующем этапе"
                  className="flex min-h-12 items-center gap-3 rounded-xl px-3 text-sm font-medium text-muted-foreground/55"
                >
                  <Icon
                    className="size-5"
                    strokeWidth={1.8}
                    aria-hidden="true"
                  />
                  {label}
                </span>
              );
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'focus-ring flex min-h-12 items-center gap-3 rounded-xl px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
                  active && 'bg-primary/10 text-primary',
                )}
              >
                <Icon className="size-5" strokeWidth={1.8} aria-hidden="true" />
                {label}
              </Link>
            );
          })}
        </nav>
        <div className="absolute inset-x-4 bottom-6 rounded-2xl border border-sidebar-border bg-background/70 p-4">
          <p className="text-xs font-semibold uppercase tracking-[.12em] text-muted-foreground">
            Данные
          </p>
          <p className="mt-2 text-sm font-medium">
            {supabaseConfigured ? 'Защищено Supabase' : 'Демо-режим'}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            {supabaseConfigured
              ? 'Доступ только после авторизации.'
              : 'Подключите Supabase через переменные окружения.'}
          </p>
        </div>
      </aside>
      <div className="lg:pl-[248px]">
        <header className="sticky top-0 z-30 border-b border-border/80 bg-background/88 backdrop-blur-xl">
          <div className="mx-auto flex h-16 max-w-[1320px] items-center justify-between px-4 sm:px-6 lg:h-20 lg:px-8">
            <div>
              <p className="text-sm text-muted-foreground">Добрый день</p>
              <h1 className="text-lg font-semibold tracking-tight sm:text-xl">
                Мои финансы
              </h1>
            </div>
            <div className="flex items-center gap-2">
              <button
                className="focus-ring grid size-11 place-items-center rounded-xl text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                aria-label="Поиск"
                disabled
              >
                <Search className="size-5" aria-hidden="true" />
              </button>
              <ThemeToggle />
              {supabaseConfigured ? (
                <button
                  type="button"
                  onClick={() => void signOut()}
                  disabled={signingOut}
                  className="focus-ring grid size-11 cursor-pointer place-items-center rounded-xl text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-wait disabled:opacity-60"
                  aria-label="Выйти из приложения"
                  title="Выйти"
                >
                  <LogOut className="size-5" aria-hidden="true" />
                </button>
              ) : (
                <span
                  className="ml-1 grid size-10 place-items-center rounded-full bg-primary text-sm font-bold text-primary-foreground"
                  aria-label="Деморежим"
                >
                  Д
                </span>
              )}
            </div>
          </div>
        </header>
        <main
          id="main-content"
          className="mx-auto max-w-[1320px] px-4 pb-[calc(6.5rem+env(safe-area-inset-bottom))] pt-5 sm:px-6 lg:px-8 lg:pb-10 lg:pt-8"
        >
          {children}
        </main>
      </div>
      <nav
        className="fixed inset-x-0 bottom-0 z-50 border-t border-border/80 bg-background/92 px-2 pb-[max(.4rem,env(safe-area-inset-bottom))] pt-1.5 backdrop-blur-xl lg:hidden"
        aria-label="Мобильная навигация"
      >
        <div className="mx-auto grid max-w-lg grid-cols-5">
          {nav.map(({ href, label, icon: Icon, enabled }) => {
            const active = isNavActive(pathname, href);
            if (!enabled)
              return (
                <span
                  key={href}
                  aria-disabled="true"
                  className="flex min-h-[56px] flex-col items-center justify-center gap-1 rounded-xl text-[.7rem] font-medium text-muted-foreground/50"
                >
                  <span className="grid h-7 w-12 place-items-center rounded-full">
                    <Icon
                      className="size-5"
                      strokeWidth={1.8}
                      aria-hidden="true"
                    />
                  </span>
                  {label}
                </span>
              );
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'focus-ring flex min-h-[56px] flex-col items-center justify-center gap-1 rounded-xl text-[.7rem] font-medium text-muted-foreground transition-colors',
                  active && 'text-primary',
                )}
              >
                <span
                  className={cn(
                    'grid h-7 w-12 place-items-center rounded-full transition-colors',
                    active && 'bg-primary/12',
                  )}
                >
                  <Icon
                    className="size-5"
                    strokeWidth={active ? 2.2 : 1.8}
                    aria-hidden="true"
                  />
                </span>
                {label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
