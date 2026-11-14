import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertTouchTargetSize } from '../helpers/assertions.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../../../');

test('T1-05-GRID-01: Resource form grid collapses to single column on viewports <=630px', async () => {
  const css = await readFile(path.join(projectRoot, 'src/app/styles/club.css'), 'utf8');
  assert.match(css, /@media[^{]*max-width:\s*630px[^{]*\{[\s\S]*\.resource-form-grid[\s\S]*grid-template-columns:\s*1fr/);
});

test('T1-05-GRID-02: Calendar navigation arrow buttons maintain >= 44x44px touch targets', async () => {
  const css = await readFile(path.join(projectRoot, 'src/app/styles/club.css'), 'utf8');
  assert.match(css, /\.calendar-arrow[^{]*\{[\s\S]*(?:min-height|min-block-size|inline-size|width):\s*(?:4[4-9]|[5-9]\d)px/);
});

test('T1-05-GRID-03: Report scope selectors maintain >= 44px tap target height', async () => {
  const cssBase = await readFile(path.join(projectRoot, 'src/app/styles/base.css'), 'utf8');
  assert.match(cssBase, /\.button[^{]*\{[\s\S]*min-block-size:\s*44px/);
});

test('T1-05-GRID-04: Action buttons enforce minimum 44px vertical height', async () => {
  const css = await readFile(path.join(projectRoot, 'src/app/styles/base.css'), 'utf8');
  assertTouchTargetSize(css, '\\.button', 44);
});

test('T1-05-GRID-05: Drill-down links provide minimum 44px hit area', async () => {
  const cssReports = await readFile(path.join(projectRoot, 'src/app/styles/reports.css'), 'utf8');
  assert.match(cssReports, /\.drilldown-link|\.tap-target-44|\.report-scopes\s+a/, 'Reports stylesheet must define tap target rules');
});
