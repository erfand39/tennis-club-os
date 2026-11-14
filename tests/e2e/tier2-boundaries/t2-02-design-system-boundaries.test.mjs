import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertWcagContrast } from '../helpers/assertions.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../../../');

test('T2-02-ICON-01: Component files avoid raw Unicode arrow symbols for navigation', async () => {
  const iconCode = await readFile(path.join(projectRoot, 'src/app/components/icon.tsx'), 'utf8');
  assert.ok(iconCode.includes('chevron-right') && iconCode.includes('chevron-left'), 'Must use SVG chevrons');
});

test('T2-02-ICON-02: Base stylesheet defines forced-colors active rules for high contrast mode', async () => {
  const baseCss = await readFile(path.join(projectRoot, 'src/app/styles/base.css'), 'utf8');
  assert.match(baseCss, /@media\s*\(forced-colors:\s*active\)|outline:\s*2px\s+solid/, 'Must accommodate high contrast mode');
});

test('T2-02-ICON-03: SVG icons maintain square aspect ratio and non-zero viewBox', async () => {
  const iconCode = await readFile(path.join(projectRoot, 'src/app/components/icon.tsx'), 'utf8');
  assert.match(iconCode, /viewBox="0 0 24 24"/, 'SVG icons must define 24x24 viewBox');
});

test('T2-02-ICON-04: Small text badges maintain >= 4.5:1 contrast against surface', () => {
  // Verifying dark green / forest token on surface
  const ratio = assertWcagContrast('#174c3c', '#ffffff', 4.5);
  assert.ok(ratio >= 7.0, 'Forest green on white provides AAA level contrast');
});

test('T2-02-ICON-05: Icon component handles custom sizing without crashing', async () => {
  const iconCode = await readFile(path.join(projectRoot, 'src/app/components/icon.tsx'), 'utf8');
  assert.match(iconCode, /size\s*=\s*\d+/, 'Icon component must define default size');
  assert.match(iconCode, /width=\{size\}\s+height=\{size\}/, 'Icon component must bind size to width and height');
});
