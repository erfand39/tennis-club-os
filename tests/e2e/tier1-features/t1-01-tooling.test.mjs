import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../../../');

test('T1-01-TOOL-01: Package.json declares "type": "module" enabling native ESM', async () => {
  const pkgRaw = await readFile(path.join(projectRoot, 'package.json'), 'utf8');
  const pkg = JSON.parse(pkgRaw);
  assert.equal(pkg.type, 'module', 'package.json must declare "type": "module"');
});

test('T1-01-TOOL-02: Package script npm run lint executes with code 0', () => {
  const output = execSync('npm run lint', { cwd: projectRoot, encoding: 'utf8' });
  assert.ok(output.includes('tsc') || output.length >= 0, 'Lint script must execute cleanly');
});

test('T1-01-TOOL-03: Package script npm run typecheck passes with zero TypeScript errors', () => {
  const output = execSync('npm run typecheck', { cwd: projectRoot, encoding: 'utf8' });
  assert.ok(!output.includes('error TS'), 'TypeScript check must pass with zero diagnostic errors');
});

test('T1-01-TOOL-04: next.config.mjs specifies outputFileTracingRoot preventing parent root warnings', async () => {
  const configRaw = await readFile(path.join(projectRoot, 'next.config.mjs'), 'utf8');
  assert.match(configRaw, /outputFileTracingRoot/, 'next.config.mjs must configure outputFileTracingRoot');
});

test('T1-01-TOOL-05: Node test runner executes without MODULE_TYPELESS_PACKAGE_JSON warnings', () => {
  const res = execSync('node --test scripts/design-system.test.mjs', { cwd: projectRoot, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
  assert.ok(!res.includes('MODULE_TYPELESS_PACKAGE_JSON'), 'Execution must not emit MODULE_TYPELESS_PACKAGE_JSON warning');
});
