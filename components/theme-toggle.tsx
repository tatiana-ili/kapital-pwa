'use client';
import { Moon, Sun } from 'lucide-react';
import { useEffect } from 'react';

export function ThemeToggle() {
  useEffect(() => { const saved = localStorage.getItem('kapital-theme'); const next = saved ? saved === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches; document.documentElement.classList.toggle('dark', next); }, []);
  function toggle() { const next = !document.documentElement.classList.contains('dark'); document.documentElement.classList.toggle('dark', next); localStorage.setItem('kapital-theme', next ? 'dark' : 'light'); }
  return <button type="button" onClick={toggle} className="focus-ring grid size-11 cursor-pointer place-items-center rounded-xl text-muted-foreground transition-colors hover:bg-muted hover:text-foreground" aria-label="Переключить цветовую тему"><Moon className="size-5 dark:hidden" aria-hidden="true" /><Sun className="hidden size-5 dark:block" aria-hidden="true" /></button>;
}
