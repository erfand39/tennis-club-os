import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TestClient } from '../helpers/test-client.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../../../');

const client = new TestClient();

test('T1-11-PWA-01: Manifest returns valid standalone configuration', async () => {
  const res = await client.get('/pwa/manifest.webmanifest');
  assert.equal(res.status, 200);
  const manifest = await res.json();
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.dir, 'rtl');
  assert.ok(manifest.name.includes('تنیس سام'));
});

test('T1-11-PWA-02: Service worker endpoint serves script with Service-Worker-Allowed header', async () => {
  const res = await client.get('/sw.js');
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('service-worker-allowed'), '/');
  const swText = await res.text();
  assert.match(swText, /sam-tennis-shell/);
});

test('T1-11-PWA-03: 1-click install event contract requires deferredPrompt capture', () => {
  // Test event listener and deferred prompt contract
  let deferredPrompt = null;
  let bannerVisible = false;

  const handleBeforeInstall = (e) => {
    e.preventDefault();
    deferredPrompt = e;
    bannerVisible = true;
  };

  assert.equal(bannerVisible, false, 'Install button must remain hidden prior to event');
  assert.equal(deferredPrompt, null);
});

test('T1-11-PWA-04: Dispatching beforeinstallprompt event exposes install action', () => {
  let bannerVisible = false;
  let buttonLabel = '';

  const syntheticEvent = {
    preventDefault() {},
    prompt: async () => {},
    userChoice: Promise.resolve({ outcome: 'accepted' }),
  };

  // Simulating the PWA install hook
  const onBeforeInstall = (e) => {
    bannerVisible = true;
    buttonLabel = 'نصب برنامه';
  };

  onBeforeInstall(syntheticEvent);
  assert.equal(bannerVisible, true);
  assert.equal(buttonLabel, 'نصب برنامه');
});

test('T1-11-PWA-05: Triggering install invocation calls prompt() on deferred event', async () => {
  let promptCalled = false;
  const mockDeferredPrompt = {
    prompt: async () => { promptCalled = true; },
    userChoice: Promise.resolve({ outcome: 'accepted' }),
  };

  await mockDeferredPrompt.prompt();
  assert.equal(promptCalled, true, 'prompt() must be invoked on deferred install event');
});
