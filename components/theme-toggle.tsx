'use client';

import { Moon, Sun } from 'lucide-react';
import { useEffect } from 'react';
import {
  applyThemePreference,
  readThemePreference,
  saveThemePreference,
  THEME_EVENT,
} from '@/lib/theme-preference';

export function ThemeToggle() {
  useEffect(() => {
    const sync = () => applyThemePreference(readThemePreference());
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    sync();
    media.addEventListener('change', sync);
    window.addEventListener(THEME_EVENT, sync);
    return () => {
      media.removeEventListener('change', sync);
      window.removeEventListener(THEME_EVENT, sync);
    };
  }, []);

  function toggle() {
    const next = document.documentElement.classList.contains('dark')
      ? 'light'
      : 'dark';
    saveThemePreference(next);
  }

  return (
    <button
      type="button"
      onClick={toggle}
      className="focus-ring grid size-11 cursor-pointer place-items-center rounded-xl text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      aria-label="Переключить цветовую тему"
    >
      <Moon className="size-5 dark:hidden" aria-hidden="true" />
      <Sun className="hidden size-5 dark:block" aria-hidden="true" />
    </button>
  );
}
