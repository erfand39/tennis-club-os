import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  THEME_INIT_SCRIPT,
  THEME_STORAGE_KEY,
  isTheme,
  nextTheme,
  resolveTheme,
  themeButtonMeta,
} from '../src/lib/theme.ts';

test('isTheme accepts only light and dark values', () => {
  assert.equal(isTheme('light'), true);
  assert.equal(isTheme('dark'), true);
  assert.equal(isTheme('auto'), false);
  assert.equal(isTheme(null), false);
  assert.equal(isTheme(undefined), false);
});

test('resolveTheme respects stored theme and falls back to system preference', () => {
  assert.equal(resolveTheme('dark', false), 'dark');
  assert.equal(resolveTheme('light', true), 'light');
  assert.equal(resolveTheme(null, true), 'dark');
  assert.equal(resolveTheme(undefined, false), 'light');
  assert.equal(resolveTheme('invalid', true), 'dark');
});

test('nextTheme and themeButtonMeta flip states accurately', () => {
  assert.equal(nextTheme('light'), 'dark');
  assert.equal(nextTheme('dark'), 'light');

  assert.deepEqual(themeButtonMeta('light'), {
    label: 'حالت تاریک',
    ariaLabel: 'تغییر تم به حالت تاریک',
    pressed: false,
  });
  assert.deepEqual(themeButtonMeta('dark'), {
    label: 'حالت روشن',
    ariaLabel: 'تغییر تم به حالت روشن',
    pressed: true,
  });
  assert.deepEqual(themeButtonMeta(null), {
    label: 'تغییر تم',
    ariaLabel: 'تغییر تم روشن و تاریک',
    pressed: undefined,
  });
});

test('THEME_INIT_SCRIPT references storage key', () => {
  assert.ok(THEME_INIT_SCRIPT.includes(THEME_STORAGE_KEY));
});
