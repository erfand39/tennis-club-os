import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TestClient } from '../helpers/test-client.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../../../');

const client = new TestClient();

test('T1-04-NAV-01: Mobile shell renders bottom-nav navigation with primary tabs', async () => {
  const html = await client.getText('/club/org-test-123');
  assert.match(html, /<nav[^>]*class=["'][^"']*bottom-nav[^"']*["'][^>]*aria-label=["']ناوبری سریع موبایل["']>/);
});

test('T1-04-NAV-02: Active page tab displays aria-current="page"', async () => {
  const html = await client.getText('/club/org-test-123/calendar');
  assert.match(html, /<a[^>]*href=["'][^"']*calendar["'][^>]*aria-current=["']page["']/);
});

test('T1-04-NAV-03: Mobile header renders compact bar with logo and title', async () => {
  const html = await client.getText('/club/org-test-123/calendar');
  assert.match(html, /<header[^>]*class=["'][^"']*mobile-header[^"']*["']>/);
  assert.match(html, /تنیس سام/);
});

test('T1-04-NAV-04: More tab references mobile drawer via aria-controls="mobile-drawer"', async () => {
  const html = await client.getText('/club/org-test-123/calendar');
  assert.match(html, /aria-controls=["']mobile-drawer["']/);
  assert.match(html, /id=["']mobile-drawer["']/);
});

test('T1-04-NAV-05: CSS hides bottom-nav on viewports above 840px breakpoint', async () => {
  const css = await readFile(path.join(projectRoot, 'src/app/styles/club.css'), 'utf8');
  assert.match(css, /@media\s*\(min-width:\s*841px\)|@media\s*\(max-width:\s*840px\)/, 'CSS must define 840px breakpoint for mobile nav');
});
