import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../../../');

test('T2-01-TOOL-01: tsconfig.json enforces strict mode preventing untyped submissions', async () => {
  const tsconfigRaw = await readFile(path.join(projectRoot, 'tsconfig.json'), 'utf8');
  const tsconfig = JSON.parse(tsconfigRaw);
  assert.equal(tsconfig.compilerOptions.strict, true, 'tsconfig.json must enforce strict: true');
});

test('T2-01-TOOL-02: tsconfig.json specifies isolatedModules and moduleResolution bundler', async () => {
  const tsconfigRaw = await readFile(path.join(projectRoot, 'tsconfig.json'), 'utf8');
  const tsconfig = JSON.parse(tsconfigRaw);
  assert.equal(tsconfig.compilerOptions.isolatedModules, true);
  assert.equal(tsconfig.compilerOptions.moduleResolution, 'bundler');
});

test('T2-01-TOOL-03: Next.js tracing root restricts asset tracing to repository boundary', async () => {
  const configRaw = await readFile(path.join(projectRoot, 'next.config.mjs'), 'utf8');
  assert.match(configRaw, /outputFileTracingRoot:\s*path\.resolve\(import\.meta\.dirname\)/, 'Must restrict outputFileTracingRoot to project directory');
});

test('T2-01-TOOL-04: Static code audit verifies zero external CDN references in client source', async () => {
  const baseCss = await readFile(path.join(projectRoot, 'src/app/styles/base.css'), 'utf8');
  assert.doesNotMatch(baseCss, /https?:\/\/(?:fonts\.googleapis|cdn|cdnjs|unpkg)/, 'Stylesheets must not link to external CDNs');
});

test('T2-01-TOOL-05: Web fonts are served strictly from local assets with WOFF2 format', async () => {
  const baseCss = await readFile(path.join(projectRoot, 'src/app/styles/base.css'), 'utf8');
  assert.match(baseCss, /url\(['"]\.\/assets\/vazirmatn-[^'"]+\.woff2['"]\)/, 'Fonts must use local woff2 files');
});
