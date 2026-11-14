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

test('T2-06-RTL-01: Detail page back navigation adopts inverted RTL chevron ›', async () => {
  const html = await client.getText('/club/org-test-123/calendar/b-past-1');
  assert.match(html, /›\s*بازگشت/);
  assert.doesNotMatch(html, /‹\s*بازگشت/);
});

test('T2-06-RTL-02: Mixed Persian-Latin strings use bdi or dir="ltr" isolates', async () => {
  const html = await client.getText('/club/org-test-123/calendar/b-past-1');
  assert.match(html, /<bdi\s+dir=["']ltr["']>/, 'IDs and Latin codes in RTL text must be wrapped in <bdi dir="ltr">');
});

test('T2-06-RTL-03: Layout grids use logical start/end positioning', async () => {
  const baseCss = await readFile(path.join(projectRoot, 'src/app/styles/base.css'), 'utf8');
  assert.match(baseCss, /inset-inline-start:/, 'Elevated cards must use logical inset-inline-start');
});

test('T2-06-RTL-04: Numeric tabular data columns utilize text-align: end', async () => {
  const baseCss = await readFile(path.join(projectRoot, 'src/app/styles/base.css'), 'utf8');
  assert.match(baseCss, /text-align:\s*end;/, 'Numeric details must align to text-align: end');
});

test('T2-06-RTL-05: Form and button layouts use flex and grid gap for bidirectional spacing', async () => {
  const baseCss = await readFile(path.join(projectRoot, 'src/app/styles/base.css'), 'utf8');
  assert.match(baseCss, /\.button[^{]*\{[\s\S]*gap:/, 'Buttons must use gap instead of directional margins');
});
