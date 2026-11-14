import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertWcagContrast, assertNoUnicodeGlyphs, assertSvgIcon } from '../helpers/assertions.mjs';
import { TestClient } from '../helpers/test-client.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../../../');

const client = new TestClient();

test('T1-02-ICON-01: Calendar header renders local SVG icon components instead of raw Unicode glyphs', async () => {
  const html = await client.getText('/club/org-test-123/calendar');
  assertNoUnicodeGlyphs(html);
  assertSvgIcon(html, 'chevron-right');
  assertSvgIcon(html, 'chevron-left');
});

test('T1-02-ICON-02: Navigation items render SVG icons with viewBox="0 0 24 24"', async () => {
  const html = await client.getText('/club/org-test-123');
  assertSvgIcon(html, 'court');
  assertSvgIcon(html, 'calendar');
  assertSvgIcon(html, 'credit-card');
  assert.match(html, /viewBox="0 0 24 24"/, 'SVG icons must define viewBox="0 0 24 24"');
});

test('T1-02-ICON-03: CSS color token --muted passes WCAG AA contrast ratio >= 4.5:1 against surface', async () => {
  const css = await readFile(path.join(projectRoot, 'src/app/styles/base.css'), 'utf8');
  const mutedMatch = css.match(/--muted:\s*(#[0-9a-fA-F]{3,6})/);
  assert.ok(mutedMatch, 'CSS must declare --muted color token');
  const mutedHex = mutedMatch[1];
  
  const surfaceMatch = css.match(/--surface:\s*(#[0-9a-fA-F]{3,6})/);
  const surfaceHex = surfaceMatch ? surfaceMatch[1] : '#ffffff';

  const ratio = assertWcagContrast(mutedHex, surfaceHex, 4.5);
  assert.ok(ratio >= 4.5, `--muted (${mutedHex}) contrast ${ratio.toFixed(2)} must be >= 4.5:1`);
});

test('T1-02-ICON-04: Keyboard focus indicators provide prominent >= 2px outline', async () => {
  const css = await readFile(path.join(projectRoot, 'src/app/styles/base.css'), 'utf8');
  assert.match(css, /:focus-visible/, 'CSS must declare :focus-visible');
  assert.match(css, /outline:\s*2px\s+solid/, 'Focus indicator must have at least 2px solid outline');
});

test('T1-02-ICON-05: Action buttons render local SVG icons with accessible labels', async () => {
  const html = await client.getText('/club/org-test-123/calendar');
  assert.match(html, /<button[^>]*aria-label="روز قبل"[^>]*><svg class="icon/);
  assert.match(html, /<button[^>]*aria-label="روز بعد"[^>]*><svg class="icon/);
});
