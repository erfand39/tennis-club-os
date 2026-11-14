export type Theme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'sam-club-theme';

export function isTheme(value: unknown): value is Theme {
  return value === 'light' || value === 'dark';
}

export function resolveTheme(stored: string | null | undefined, prefersDark: boolean): Theme {
  if (isTheme(stored)) return stored;
  return prefersDark ? 'dark' : 'light';
}

export function nextTheme(current: Theme): Theme {
  return current === 'dark' ? 'light' : 'dark';
}

export function themeButtonMeta(theme: Theme | null): {
  label: string;
  ariaLabel: string;
  pressed: boolean | undefined;
} {
  if (theme === 'dark') {
    return {
      label: 'حالت روشن',
      ariaLabel: 'تغییر تم به حالت روشن',
      pressed: true,
    };
  }
  if (theme === 'light') {
    return {
      label: 'حالت تاریک',
      ariaLabel: 'تغییر تم به حالت تاریک',
      pressed: false,
    };
  }
  return {
    label: 'تغییر تم',
    ariaLabel: 'تغییر تم روشن و تاریک',
    pressed: undefined,
  };
}

export const THEME_INIT_SCRIPT = `(() => {
  try {
    var stored = localStorage.getItem('${THEME_STORAGE_KEY}');
    var prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    var theme = stored === 'dark' || stored === 'light' ? stored : (prefersDark ? 'dark' : 'light');
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
  } catch (e) {}
})();`;
