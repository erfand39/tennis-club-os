import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import nextConfig from '../next.config.mjs';

test('Feature 1: package.json has type: module and lint script', async () => {
  const pkgRaw = await readFile(new URL('../package.json', import.meta.url), 'utf8');
  const pkg = JSON.parse(pkgRaw);
  assert.equal(pkg.type, 'module', 'package.json must specify "type": "module"');
  assert.equal(pkg.scripts?.lint, 'tsc --noEmit', 'package.json must contain lint script');
});

test('Feature 1: next.config.mjs configures outputFileTracingRoot and static caching headers', async () => {
  assert.ok(nextConfig.outputFileTracingRoot, 'outputFileTracingRoot must be defined');
  assert.match(nextConfig.outputFileTracingRoot, /tennis-club-os/);

  const headers = await nextConfig.headers();
  const staticRule = headers.find(h => h.source && h.source.includes('woff2'));
  assert.ok(staticRule, 'Static caching rule for woff2/webp/svg must exist');
  
  const cacheControl = staticRule.headers.find(h => h.key.toLowerCase() === 'cache-control');
  assert.ok(cacheControl, 'Cache-Control header must be defined');
  assert.match(cacheControl.value, /public/);
  assert.match(cacheControl.value, /max-age=31536000/);
  assert.match(cacheControl.value, /immutable/);
});

test('Feature 2: base.css defines WCAG AA compliant --muted token and focus rings', async () => {
  const css = await readFile(new URL('../src/app/styles/base.css', import.meta.url), 'utf8');
  
  // --muted contrast check
  assert.match(css, /--muted:\s*#3f5348;/, '--muted must be darkened to #3f5348');
  assert.doesNotMatch(css, /--muted:\s*#53695d;/, 'old --muted value must not be present');

  // Focus visible check
  assert.match(css, /:focus-visible/, 'CSS must declare :focus-visible ring');
  assert.match(css, /outline:\s*2px\s+solid\s+var\(--focus\)/, 'Focus ring must have 2px solid outline');
});

test('Feature 2: icon.tsx implements all 15 required icons and conforms to interface contract', async () => {
  const code = await readFile(new URL('../src/app/components/icon.tsx', import.meta.url), 'utf8');
  
  const requiredIcons = [
    'calendar',
    'court',
    'clock',
    'user',
    'users',
    'credit-card',
    'dollar',
    'bell',
    'chevron-right',
    'chevron-left',
    'check',
    'close',
    'alert',
    'trash',
    'menu',
  ];

  for (const name of requiredIcons) {
    assert.match(code, new RegExp(`['"]${name}['"]`), `icon.tsx must include icon '${name}'`);
    assert.match(code, new RegExp(`case\\s+['"]${name}['"]:`), `renderIconPaths must handle '${name}'`);
  }

  assert.match(code, /export\s+type\s+IconName/, 'icon.tsx must export IconName');
  assert.match(code, /export\s+interface\s+IconProps/, 'icon.tsx must export IconProps');
  assert.match(code, /export\s+function\s+Icon/, 'icon.tsx must export Icon function');
});

test('Feature 3: confirm-dialog.tsx implements ConfirmDialog with Persian defaults and accessible dialog semantics', async () => {
  const code = await readFile(new URL('../src/app/components/confirm-dialog.tsx', import.meta.url), 'utf8');
  
  assert.match(code, /export\s+interface\s+ConfirmDialogProps/, 'Must export ConfirmDialogProps');
  assert.match(code, /export\s+function\s+ConfirmDialog/, 'Must export ConfirmDialog');
  assert.match(code, /role="dialog"/, 'Must use role="dialog"');
  assert.match(code, /aria-modal="true"/, 'Must set aria-modal="true"');
  assert.match(code, /aria-labelledby=/, 'Must set aria-labelledby');
  assert.match(code, /['"]تایید['"]/, 'Default confirmLabel must be Persian "تایید"');
  assert.match(code, /['"]انصراف['"]/, 'Default cancelLabel must be Persian "انصراف"');
  assert.match(code, /Escape/, 'Must handle Escape key');
  assert.match(code, /dialogRef/, 'Must reference dialog DOM element');
});

test('Feature 3: modal.tsx exports accessible Modal and re-exports ConfirmDialog', async () => {
  const code = await readFile(new URL('../src/app/components/modal.tsx', import.meta.url), 'utf8');
  
  assert.match(code, /export\s+function\s+Modal/, 'Must export Modal');
  assert.match(code, /export\s+\{\s*ConfirmDialog\s*\}\s+from\s+['"]\.\/confirm-dialog['"]/, 'Must re-export ConfirmDialog');
  assert.match(code, /role="dialog"/, 'Must use role="dialog"');
  assert.match(code, /aria-modal="true"/, 'Must set aria-modal="true"');
});

test('Feature 4: bottom-nav.tsx implements modern mobile bottom navigation bar and accessible drawer', async () => {
  const code = await readFile(new URL('../src/app/components/bottom-nav.tsx', import.meta.url), 'utf8');

  assert.match(code, /export\s+function\s+BottomNav/, 'Must export BottomNav');
  assert.match(code, /['"]تقویم['"]/, 'Must contain Calendar item');
  assert.match(code, /['"]کلاس‌ها['"]/, 'Must contain Classes item');
  assert.match(code, /['"]امور مالی['"]/, 'Must contain Finance item');
  assert.match(code, /['"]امکانات\/اعضا['"]/, 'Must contain Resources item');
  assert.match(code, /بیشتر/, 'Must contain More item');
  assert.match(code, /['"]calendar['"]/, 'Must use calendar icon');
  assert.match(code, /['"]clock['"]/, 'Must use clock icon');
  assert.match(code, /['"]credit-card['"]/, 'Must use credit-card icon');
  assert.match(code, /['"]court['"]/, 'Must use court icon');
  assert.match(code, /['"]menu['"]/, 'Must use menu icon');
  assert.match(code, /role="dialog"/, 'Drawer must have role="dialog"');
  assert.match(code, /aria-modal="true"/, 'Drawer must have aria-modal="true"');
  assert.match(code, /Escape/, 'Drawer must handle Escape key');
});

test('Feature 4: club layout.tsx renders mobile header, desktop sidebar, and BottomNav', async () => {
  const code = await readFile(new URL('../src/app/club/[org]/layout.tsx', import.meta.url), 'utf8');

  assert.match(code, /className="mobile-header"/, 'Must include mobile header');
  assert.match(code, /className="mobile-branch-badge"/, 'Must include active branch badge');
  assert.match(code, /className="mobile-pwa-badge"/, 'Must include PWA status indicator');
  assert.match(code, /className="local-sidebar"/, 'Must preserve desktop sidebar');
  assert.match(code, /<BottomNav/, 'Must render BottomNav');
});

test('Feature 4: club.css styles modern mobile shell on <=840px and preserves desktop', async () => {
  const css = await readFile(new URL('../src/app/styles/club.css', import.meta.url), 'utf8');

  // Desktop hiding
  assert.match(css, /\.mobile-header[^{]*\{[^}]*display:\s*none/s, 'Desktop must hide mobile-header');
  assert.match(css, /\.mobile-bottom-nav[^{]*\{[^}]*display:\s*none/s, 'Desktop must hide mobile-bottom-nav');

  // Mobile layout
  assert.match(css, /@media\s*\(max-width:\s*840px\)/, 'Must have @media (max-width: 840px)');
  assert.match(css, /\.local-sidebar\s*\{[^}]*display:\s*none\s*!important;/, 'Sidebar must be hidden on mobile');
  assert.match(css, /\.local-content\s*\{[^}]*padding-bottom:\s*calc\(/, 'Main content must have adequate mobile bottom padding');
  assert.match(css, /\.mobile-header\s*\{[^}]*position:\s*sticky;/, 'Mobile header must be sticky');
  assert.match(css, /\.mobile-bottom-nav\s*\{[^}]*position:\s*fixed;/, 'Bottom nav must be fixed');
});

test('Feature 5: club.css and reports.css fix mobile form grid and 44px touch targets', async () => {
  const clubCss = await readFile(new URL('../src/app/styles/club.css', import.meta.url), 'utf8');
  const reportsCss = await readFile(new URL('../src/app/styles/reports.css', import.meta.url), 'utf8');

  // Form grid 1-column collapse on <=630px
  assert.match(clubCss, /\.resource-form-grid\s*\{[^}]*grid-template-columns:\s*1fr;/, 'Form grid must collapse to 1fr on mobile');

  // Calendar arrow 44px min touch target
  assert.match(clubCss, /\.calendar-arrow\s*\{[^}]*min-width:\s*44px;[^}]*min-height:\s*44px;/s, 'Calendar arrow must have min 44x44px touch target on mobile');

  // Reports tabs min-height 44px
  assert.match(reportsCss, /\.report-scopes a,\s*\.report-table-tabs a\s*\{[^}]*min-height:\s*44px;/s, 'Report tabs must have min 44px height');

  // Metric card links touch padding
  assert.match(reportsCss, /\.report-metric a\s*\{[^}]*min-height:\s*44px;[^}]*min-width:\s*44px;/s, 'Report metric links must have min 44x44px touch padding');
});

test('Feature 6: RTL directional chevron inversion and logical CSS properties', async () => {
  const filesToCheck = [
    '../src/app/club/[org]/calendar/[booking]/page.tsx',
    '../src/app/club/[org]/classes/[session]/page.tsx',
    '../src/app/club/[org]/resources/[kind]/[id]/page.tsx',
    '../src/app/club/[org]/finance/[invoice]/page.tsx',
    '../src/app/club/[org]/finance/operations/page.tsx',
  ];

  for (const relPath of filesToCheck) {
    const code = await readFile(new URL(relPath, import.meta.url), 'utf8');
    assert.match(code, /› بازگشت/, `${relPath} must use right-pointing chevron '› بازگشت'`);
    assert.doesNotMatch(code, /‹ بازگشت/, `${relPath} must not use left-pointing chevron '‹ بازگشت'`);
  }

  const clubCss = await readFile(new URL('../src/app/styles/club.css', import.meta.url), 'utf8');
  assert.match(clubCss, /\.member-row summary small\s*\{[^}]*text-align:\s*start;/s, 'Member row small must use logical text-align: start');
  assert.doesNotMatch(clubCss, /\.member-row summary small\s*\{[^}]*text-align:\s*right;/s, 'Member row small must not use physical text-align: right');
  assert.match(clubCss, /background-position:[^;]*inline-start/, 'Hero background must use logical inline-start position');
});
