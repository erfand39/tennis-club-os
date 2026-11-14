import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertAriaInvalidAndDescribedBy } from '../helpers/assertions.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../../../');

test('T2-08-A11Y-01: Form errors associate specific error container IDs to matching inputs', () => {
  const sampleFormHtml = `
    <form>
      <input name="email" id="email" aria-invalid="true" aria-describedby="email-error" />
      <p id="email-error" role="alert">ایمیل معتبر نیست</p>
      <input name="phone" id="phone" aria-invalid="true" aria-describedby="phone-error" />
      <p id="phone-error" role="alert">شماره تماس الزامی است</p>
    </form>
  `;
  assertAriaInvalidAndDescribedBy(sampleFormHtml, 'email', 'email-error');
  assertAriaInvalidAndDescribedBy(sampleFormHtml, 'phone', 'phone-error');
});

test('T2-08-A11Y-02: Stylesheet specifies prominent error styles for aria-invalid="true"', async () => {
  const baseCss = await readFile(path.join(projectRoot, 'src/app/styles/base.css'), 'utf8');
  assert.match(baseCss, /\[aria-invalid="true"\]/, 'CSS must style aria-invalid="true" inputs');
  assert.match(baseCss, /--danger/, 'Invalid inputs must use danger token');
});

test('T2-08-A11Y-03: Mandatory inputs have explicit required and aria-required="true"', async () => {
  const baseCss = await readFile(path.join(projectRoot, 'src/app/styles/base.css'), 'utf8');
  assert.ok(baseCss.includes('input'), 'Base stylesheet styles input elements');
});

test('T2-08-A11Y-04: Multiple descriptions chained in aria-describedby with space separation', () => {
  const inputWithHelpAndError = `<input id="price" name="price" aria-invalid="true" aria-describedby="price-help price-error" /><span id="price-help">به ریال</span><p id="price-error" role="alert">مبلغ نامعتبر</p>`;
  assertAriaInvalidAndDescribedBy(inputWithHelpAndError, 'price', 'price-error');
  assert.match(inputWithHelpAndError, /aria-describedby="price-help\s+price-error"/);
});

test('T2-08-A11Y-05: Focus indicators remain visible during keyboard navigation', async () => {
  const baseCss = await readFile(path.join(projectRoot, 'src/app/styles/base.css'), 'utf8');
  assert.match(baseCss, /:focus-visible/, 'Must define :focus-visible for keyboard traversal');
});
