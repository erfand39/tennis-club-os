import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertNoUnicodeGlyphs, assertRtlRoot } from '../helpers/assertions.mjs';
import { TestClient } from '../helpers/test-client.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../../../');

const client = new TestClient();

test('T1-06-RTL-01: Calendar booking detail renders right-pointing chevron › بازگشت به تقویم', async () => {
  const html = await client.getText('/club/org-test-123/calendar/b-past-1');
  assertNoUnicodeGlyphs(html);
  assert.match(html, /›\s*بازگشت به تقویم/);
});

test('T1-06-RTL-02: Class session detail renders right-pointing chevron › بازگشت به کلاس‌ها', async () => {
  const html = await client.getText('/club/org-test-123/classes/session-1');
  assertNoUnicodeGlyphs(html);
  assert.match(html, /›\s*بازگشت به کلاس‌ها/);
});

test('T1-06-RTL-03: Finance invoice detail renders right-pointing chevron › بازگشت به امور مالی', async () => {
  const html = await client.getText('/club/org-test-123/finance/inv-1');
  assertNoUnicodeGlyphs(html);
  assert.match(html, /›\s*بازگشت به امور مالی/);
});

test('T1-06-RTL-04: CSS utilizes logical text-align: start instead of physical right', async () => {
  const cssReports = await readFile(path.join(projectRoot, 'src/app/styles/reports.css'), 'utf8');
  assert.match(cssReports, /text-align:\s*start;/, 'Reports CSS must utilize logical text-align: start');
});

test('T1-06-RTL-05: Document root <html> specifies dir="rtl" and lang="fa"', async () => {
  const html = await client.getText('/');
  assertRtlRoot(html);
});
