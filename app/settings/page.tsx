'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import {
  Database,
  LockKeyhole,
  LogOut,
  Monitor,
  Moon,
  Settings2,
  Sun,
} from 'lucide-react';
import { AppShell } from '@/components/app-shell';
import { Button } from '@/components/ui/button';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';
import {
  readThemePreference,
  saveThemePreference,
  THEME_EVENT,
  type ThemePreference,
} from '@/lib/theme-preference';

const themes = [
  { value: 'system', label: 'Как на устройстве', icon: Monitor },
  { value: 'light', label: 'Светлая', icon: Sun },
  { value: 'dark', label: 'Тёмная', icon: Moon },
] as const;

function subscribeTheme(callback: () => void) {
  window.addEventListener(THEME_EVENT, callback);
  window.addEventListener('storage', callback);
  return () => {
    window.removeEventListener(THEME_EVENT, callback);
    window.removeEventListener('storage', callback);
  };
}

export default function SettingsPage() {
  const router = useRouter();
  const [client] = useState(createSupabaseBrowserClient);
  const theme = useSyncExternalStore(
    subscribeTheme,
    readThemePreference,
    () => 'system',
  );
  const [email, setEmail] = useState('');
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!client) return;
    let active = true;
    void client.auth.getUser().then(({ data }) => {
      if (active) setEmail(data.user?.email ?? '');
    });
    return () => {
      active = false;
    };
  }, [client]);

  function changeTheme(value: ThemePreference) {
    saveThemePreference(value);
  }

  async function signOut() {
    if (!client || signingOut) return;
    setSigningOut(true);
    setError('');
    const { error: authError } = await client.auth.signOut();
    if (authError) {
      setError('Не удалось выйти. Проверьте соединение и повторите попытку.');
      setSigningOut(false);
      return;
    }
    router.replace('/login');
    router.refresh();
  }

  return (
    <AppShell>
      <section className="mx-auto max-w-3xl space-y-5">
        <header className="flex items-start gap-3">
          <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary">
            <Settings2 className="size-6" aria-hidden="true" />
          </span>
          <div>
            <h2 className="text-3xl font-semibold tracking-[-.04em]">
              Настройки
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Вид приложения и источник ваших данных.
            </p>
          </div>
        </header>

        <section
          className="surface-card rounded-3xl border p-5 sm:p-6"
          aria-labelledby="appearance-title"
        >
          <h3 id="appearance-title" className="text-lg font-semibold">
            Цветовая тема
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Настройка сохраняется на этом устройстве.
          </p>
          <fieldset className="mt-4 grid gap-2 sm:grid-cols-3">
            <legend className="sr-only">Выбор цветовой темы</legend>
            {themes.map(({ value, label, icon: Icon }) => (
              <button
                key={value}
                type="button"
                onClick={() => changeTheme(value)}
                aria-pressed={theme === value}
                className={`focus-ring flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border px-4 text-left text-sm font-medium transition-colors ${theme === value ? 'border-primary bg-primary/10 text-primary' : 'hover:bg-muted'}`}
              >
                <Icon className="size-5" aria-hidden="true" />
                {label}
              </button>
            ))}
          </fieldset>
        </section>

        <section
          className="surface-card rounded-3xl border p-5 sm:p-6"
          aria-labelledby="data-title"
        >
          <div className="flex items-center gap-2">
            <Database className="size-5 text-primary" aria-hidden="true" />
            <h3 id="data-title" className="text-lg font-semibold">
              Источник данных
            </h3>
          </div>
          <p className="mt-3 font-medium">
            {client ? 'Защищённая база Supabase' : 'Демонстрационный режим'}
          </p>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
            {client
              ? 'Операции, категории и планы сохраняются в вашем профиле. Доступ к ним требует входа в приложение.'
              : 'Примеры операций встроены в приложение. Импортированные выписки и изменения хранятся только в этом браузере и не синхронизируются с другими устройствами.'}
          </p>
        </section>

        <section
          className="surface-card rounded-3xl border p-5 sm:p-6"
          aria-labelledby="security-title"
        >
          <div className="flex items-center gap-2">
            <LockKeyhole className="size-5 text-primary" aria-hidden="true" />
            <h3 id="security-title" className="text-lg font-semibold">
              Доступ
            </h3>
          </div>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            Приложение не подключается к банкам и не запрашивает банковские
            пароли или SMS-коды. Выписки загружаются только вами.
          </p>
          {client && (
            <div className="mt-5 border-t pt-5">
              {email && (
                <p className="mb-3 break-all text-sm">
                  Вы вошли как <strong>{email}</strong>
                </p>
              )}
              <Button
                type="button"
                variant="outline"
                onClick={() => void signOut()}
                disabled={signingOut}
                className="min-h-11 cursor-pointer"
              >
                <LogOut className="size-4" aria-hidden="true" />
                {signingOut ? 'Выходим…' : 'Выйти из приложения'}
              </Button>
              {error && (
                <p role="alert" className="mt-3 text-sm text-destructive">
                  {error}
                </p>
              )}
            </div>
          )}
        </section>
      </section>
    </AppShell>
  );
}
