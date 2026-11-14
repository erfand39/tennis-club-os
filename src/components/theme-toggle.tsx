'use client';

import { useSyncExternalStore } from 'react';
import { AnimatePresence, MotionConfig, motion } from 'motion/react';
import { Moon, Sun } from 'lucide-react';
import {
  THEME_STORAGE_KEY,
  type Theme,
  isTheme,
  nextTheme,
  resolveTheme,
  themeButtonMeta,
} from '@/lib/theme';

const THEME_CHANGE_EVENT = 'sam-theme-change';

function readThemeFromEnvironment(): Theme {
  if (typeof document === 'undefined') return 'light';
  const docTheme = document.documentElement.dataset.theme;
  if (isTheme(docTheme)) return docTheme;
  let stored: string | null = null;
  try {
    stored = window.localStorage.getItem(THEME_STORAGE_KEY);
  } catch {
    stored = null;
  }
  const prefersDark =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-color-scheme: dark)').matches;
  return resolveTheme(stored, prefersDark);
}

function applyThemeToDocument(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
}

function subscribeTheme(onStoreChange: () => void) {
  if (typeof window === 'undefined') return () => {};
  const handleStorage = (event: StorageEvent) => {
    if (event.key === THEME_STORAGE_KEY && isTheme(event.newValue)) {
      applyThemeToDocument(event.newValue);
      onStoreChange();
    }
  };
  const handleCustom = () => onStoreChange();
  const media = typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  const handleMedia = (event: MediaQueryListEvent) => {
    let stored: string | null = null;
    try {
      stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    } catch {
      stored = null;
    }
    if (!isTheme(stored)) {
      applyThemeToDocument(event.matches ? 'dark' : 'light');
      onStoreChange();
    }
  };

  window.addEventListener('storage', handleStorage);
  window.addEventListener(THEME_CHANGE_EVENT, handleCustom);
  media?.addEventListener('change', handleMedia);
  return () => {
    window.removeEventListener('storage', handleStorage);
    window.removeEventListener(THEME_CHANGE_EVENT, handleCustom);
    media?.removeEventListener('change', handleMedia);
  };
}

export function ThemeToggle() {
  const theme = useSyncExternalStore<Theme | null>(
    subscribeTheme,
    readThemeFromEnvironment,
    () => null,
  );

  const meta = themeButtonMeta(theme);

  function handleToggle() {
    const current = theme ?? readThemeFromEnvironment();
    const target = nextTheme(current);
    applyThemeToDocument(target);
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, target);
    } catch {
      // Ignore storage failures in restricted browsing contexts.
    }
    window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
  }

  return (
    <MotionConfig reducedMotion="user">
      <button
        type="button"
        className="button subtle theme-toggle"
        onClick={handleToggle}
        aria-pressed={meta.pressed}
        aria-label={meta.ariaLabel}
        data-theme-state={theme ?? 'pending'}
      >
        <span className="theme-toggle-icon" aria-hidden="true">
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={theme ?? 'light'}
              initial={{ opacity: 0, rotate: -35, scale: 0.78 }}
              animate={{ opacity: 1, rotate: 0, scale: 1 }}
              exit={{ opacity: 0, rotate: 35, scale: 0.78 }}
              transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
              style={{ display: 'inline-flex' }}
            >
              {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
            </motion.span>
          </AnimatePresence>
        </span>
        <span className="theme-toggle-label">{meta.label}</span>
      </button>
    </MotionConfig>
  );
}
