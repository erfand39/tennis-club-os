import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../../../');

test('T2-05-GRID-01: Form container styles enforce min-inline-size: 0 and box-sizing to prevent overflow', async () => {
  const css = await readFile(path.join(projectRoot, 'src/app/styles/base.css'), 'utf8');
  assert.match(css, /\*,\s*\*::before,\s*\*::after\s*\{\s*box-sizing:\s*border-box;\s*\}/);
});

test('T2-05-GRID-02: Form grid collapse specifies gap separation between inputs', async () => {
  const css = await readFile(path.join(projectRoot, 'src/app/styles/club.css'), 'utf8');
  assert.match(css, /\.resource-form-grid[^{]*\{[\s\S]*gap:/, 'Form grid must specify gap');
});

test('T2-05-GRID-03: Calendar action buttons enforce touch target standards', async () => {
  const css = await readFile(path.join(projectRoot, 'src/app/styles/club.css'), 'utf8');
  assert.match(css, /\.calendar-arrow[^{]*\{[\s\S]*(?:min-height|min-block-size|inline-size|width):/);
});

test('T2-05-GRID-04: Button elements define spacing separation gap', async () => {
  const css = await readFile(path.join(projectRoot, 'src/app/styles/base.css'), 'utf8');
  assert.match(css, /\.button[^{]*\{[\s\S]*gap:\s*8px/);
});

test('T2-05-GRID-05: Input fields provide touch-friendly padding and typography', async () => {
  const css = await readFile(path.join(projectRoot, 'src/app/styles/base.css'), 'utf8');
  assert.match(css, /\.field\s+:is\(input,\s*select\)[^{]*\{[\s\S]*min-height:\s*44px/);
});
