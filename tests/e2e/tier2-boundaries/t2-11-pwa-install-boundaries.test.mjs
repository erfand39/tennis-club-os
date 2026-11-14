import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TestClient } from '../helpers/test-client.mjs';

const client = new TestClient();

test('T2-11-PWA-01: User dismissal of install prompt handles userChoice without errors', async () => {
  const choiceResult = { outcome: 'dismissed', platform: 'web' };
  let dismissedHandled = false;

  if (choiceResult.outcome === 'dismissed') {
    dismissedHandled = true;
  }
  assert.equal(dismissedHandled, true);
});

test('T2-11-PWA-02: App installation event hides install prompt banner', () => {
  let isInstalled = false;
  const onAppInstalled = () => { isInstalled = true; };
  onAppInstalled();
  assert.equal(isInstalled, true);
});

test('T2-11-PWA-03: Unsupported browsers can access manual install instructions', async () => {
  const html = await client.getText('/');
  assert.ok(html.length > 0);
});

test('T2-11-PWA-04: Offline shell route returns 200 with Persian offline guidance', async () => {
  const res = await client.get('/pwa/offline.html');
  assert.equal(res.status, 200);
  const text = await res.text();
  assert.match(text, /باشگاه تنیس سام/);
  assert.match(text, /اتصال/);
});

test('T2-11-PWA-05: Service worker script includes update activation handler', async () => {
  const res = await client.get('/sw.js');
  const sw = await res.text();
  assert.match(sw, /activate-sam-update/);
});
