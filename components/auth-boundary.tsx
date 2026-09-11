'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { CircleDollarSign } from 'lucide-react';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';

export function AuthBoundary({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [client] = useState(createSupabaseBrowserClient);
  const [checking, setChecking] = useState(Boolean(client));
  const isLogin = pathname === '/login';

  useEffect(() => {
    if (!client) return;
    let active = true;
    void client.auth
      .getSession()
      .then(({ data }) => {
        if (!active) return;
        if (data.session && isLogin) router.replace('/');
        if (!data.session && !isLogin) router.replace('/login');
        setChecking(false);
      })
      .catch(() => {
        if (!active) return;
        if (!isLogin) router.replace('/login');
        setChecking(false);
      });
    const { data: subscription } = client.auth.onAuthStateChange(
      (_event, session) => {
        if (session && isLogin) router.replace('/');
        if (!session && !isLogin) router.replace('/login');
      },
    );
    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, [client, isLogin, router]);

  if (!client || !checking) return children;
  return (
    <main
      className="grid min-h-dvh place-items-center bg-background p-6"
      aria-live="polite"
    >
      <div className="text-center">
        <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-primary text-primary-foreground">
          <CircleDollarSign className="size-6" aria-hidden="true" />
        </span>
        <p className="mt-4 font-medium">Проверяем защищённую сессию…</p>
      </div>
    </main>
  );
}
