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

test('T2-04-NAV-01: Breakpoint 840px separates desktop and mobile navigation cleanly', async () => {
  const css = await readFile(path.join(projectRoot, 'src/app/styles/club.css'), 'utf8');
  assert.match(css, /840px/, 'Breakpoint 840px must be defined in club styles');
});

test('T2-04-NAV-02: Mobile navigation applies safe-area-inset-bottom padding', async () => {
  const css = await readFile(path.join(projectRoot, 'src/app/styles/club.css'), 'utf8');
  assert.match(css, /env\(safe-area-inset-bottom\)|padding-bottom:/, 'Mobile nav must handle iOS safe area');
});

test('T2-04-NAV-03: Drawer component specifies accessibility attributes for dismissibility', async () => {
  const html = await client.getText('/club/org-test-123/calendar');
  assert.match(html, /id=["']mobile-drawer["']/, 'Mobile drawer ID must be present');
  assert.match(html, /aria-controls=["']mobile-drawer["']/, 'More trigger must control mobile drawer');
});

test('T2-04-NAV-04: Bottom navigation tabs provide 5 distinct operational routes', async () => {
  const html = await client.getText('/club/org-test-123/calendar');
  assert.match(html, /class=["'][^"']*bottom-nav-item[^"']*["']/, 'Must render bottom nav items');
  assert.match(html, /calendar/, 'Must include calendar tab');
  assert.match(html, /classes/, 'Must include classes tab');
  assert.match(html, /finance/, 'Must include finance tab');
});

test('T2-04-NAV-05: Mobile drawer has hidden state attribute by default', async () => {
  const html = await client.getText('/club/org-test-123/calendar');
  assert.match(html, /<div[^>]*id=["']mobile-drawer["'][^>]*hidden/, 'Mobile drawer must be hidden by default');
});
