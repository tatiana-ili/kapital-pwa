'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CircleDollarSign, LockKeyhole, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [client] = useState(createSupabaseBrowserClient);

  async function signIn(event: React.SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!client) return;
    setLoading(true);
    setError('');
    const { error: authError } = await client.auth.signInWithPassword({
      email,
      password,
    });
    if (authError) {
      setError('Не удалось войти. Проверьте почту и пароль.');
      setLoading(false);
      return;
    }
    router.replace('/');
    router.refresh();
  }

  return (
    <main className="grid min-h-dvh bg-background lg:grid-cols-[1.05fr_.95fr]">
      <section className="hidden balance-card relative overflow-hidden p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="flex items-center gap-3">
          <span className="grid size-11 place-items-center rounded-2xl bg-white/14">
            <CircleDollarSign className="size-6" aria-hidden="true" />
          </span>
          <strong className="text-xl">Капитал</strong>
        </div>
        <div className="max-w-xl">
          <p className="text-sm font-semibold uppercase tracking-[.15em] text-blue-200">
            Личные финансы
          </p>
          <h1 className="mt-4 text-5xl font-semibold leading-[1.08] tracking-[-.055em]">
            Все счета.
            <br />
            Одна понятная картина.
          </h1>
          <p className="mt-5 max-w-md text-lg leading-relaxed text-blue-100">
            Выписки остаются под вашим контролем. Приложение не подключается к
            банкам и не умеет выполнять платежи.
          </p>
        </div>
        <div className="flex items-center gap-3 text-sm text-blue-100">
          <ShieldCheck className="size-5" aria-hidden="true" />
          Доступ к данным ограничен вашей Supabase-сессией
        </div>
      </section>
      <section className="flex items-center justify-center p-5 sm:p-10">
        <div className="w-full max-w-md">
          <div className="mb-9 lg:hidden">
            <span className="grid size-12 place-items-center rounded-2xl bg-primary text-primary-foreground">
              <CircleDollarSign className="size-6" aria-hidden="true" />
            </span>
            <h1 className="mt-5 text-3xl font-semibold tracking-[-.04em]">
              Капитал
            </h1>
            <p className="mt-2 text-muted-foreground">
              Ваши финансы в одном месте
            </p>
          </div>
          <div className="surface-card rounded-[28px] border p-5 sm:p-8">
            <div className="grid size-11 place-items-center rounded-2xl bg-primary/12 text-primary">
              <LockKeyhole className="size-5" aria-hidden="true" />
            </div>
            <h2 className="mt-5 text-2xl font-semibold tracking-tight">Вход</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Используйте учётную запись приложения — не логин и не пароль от
              банка.
            </p>
            {client ? (
              <form className="mt-7 space-y-5" onSubmit={signIn}>
                <div>
                  <label
                    htmlFor="email"
                    className="mb-2 block text-sm font-medium"
                  >
                    Электронная почта
                  </label>
                  <Input
                    id="email"
                    className="h-12 text-base md:text-base"
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    aria-describedby={error ? 'login-error' : undefined}
                    required
                  />
                </div>
                <div>
                  <label
                    htmlFor="password"
                    className="mb-2 block text-sm font-medium"
                  >
                    Пароль приложения
                  </label>
                  <Input
                    id="password"
                    className="h-12 text-base md:text-base"
                    type="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    aria-describedby={error ? 'login-error' : undefined}
                    required
                  />
                </div>
                {error && (
                  <p
                    id="login-error"
                    className="rounded-xl bg-destructive/10 px-3 py-3 text-sm text-destructive"
                    role="alert"
                  >
                    {error}
                  </p>
                )}
                <Button
                  className="min-h-12 w-full text-base"
                  type="submit"
                  disabled={loading}
                >
                  {loading ? 'Входим…' : 'Войти'}
                </Button>
              </form>
            ) : (
              <div className="mt-7 rounded-2xl bg-muted p-4">
                <p className="font-medium">Сейчас включён демо-режим</p>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                  Добавьте публичные Supabase URL и anon key в `.env.local`,
                  чтобы включить авторизацию.
                </p>
                <Button
                  className="mt-4 min-h-11 w-full"
                  onClick={() => router.push('/')}
                >
                  Открыть демо
                </Button>
              </div>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
