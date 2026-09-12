export type ThemePreference = 'light' | 'dark' | 'system';

const THEME_KEY = 'kapital-theme';
export const THEME_EVENT = 'kapital:theme-changed';

export function readThemePreference(): ThemePreference {
  if (typeof window === 'undefined') return 'system';
  const saved = window.localStorage.getItem(THEME_KEY);
  return saved === 'light' || saved === 'dark' ? saved : 'system';
}

export function applyThemePreference(preference: ThemePreference) {
  if (typeof window === 'undefined') return;
  const dark =
    preference === 'dark' ||
    (preference === 'system' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', dark);
}

export function saveThemePreference(preference: ThemePreference) {
  if (typeof window === 'undefined') return;
  if (preference === 'system') window.localStorage.removeItem(THEME_KEY);
  else window.localStorage.setItem(THEME_KEY, preference);
  applyThemePreference(preference);
  window.dispatchEvent(new Event(THEME_EVENT));
}
