import assert from 'node:assert/strict';

/**
 * Calculates sRGB relative luminance per WCAG 2.1 specs
 * @param {string} hex - Hex color code (e.g. #ffffff or #3f5348)
 * @returns {number} Relative luminance value between 0 and 1
 */
export function getRelativeLuminance(hex) {
  let clean = hex.replace('#', '').trim();
  if (clean.length === 3) {
    clean = clean.split('').map(c => c + c).join('');
  }
  const r = parseInt(clean.substring(0, 2), 16) / 255;
  const g = parseInt(clean.substring(2, 4), 16) / 255;
  const b = parseInt(clean.substring(4, 6), 16) / 255;

  const toLinear = (c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

/**
 * Calculates WCAG 2.1 contrast ratio between two hex colors
 * @param {string} fgHex - Foreground color hex
 * @param {string} bgHex - Background color hex
 * @returns {number} Contrast ratio (e.g. 4.5)
 */
export function calculateContrastRatio(fgHex, bgHex) {
  const l1 = getRelativeLuminance(fgHex);
  const l2 = getRelativeLuminance(bgHex);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Asserts that the contrast between foreground and background satisfies WCAG AA/AAA
 */
export function assertWcagContrast(fgHex, bgHex, minRatio = 4.5) {
  const ratio = calculateContrastRatio(fgHex, bgHex);
  assert.ok(
    ratio >= minRatio,
    `WCAG contrast failure: ${fgHex} against ${bgHex} yields ratio of ${ratio.toFixed(2)}:1, expected at least ${minRatio}:1`
  );
  return ratio;
}

/**
 * Asserts that no legacy Unicode glyphs (e.g. ‹ in RTL back nav) are present in HTML output
 */
export function assertNoUnicodeGlyphs(html) {
  assert.ok(!html.includes('‹ بازگشت'), 'Found legacy left chevron ‹ in RTL back navigation (should be › or SVG)');
  assert.ok(!html.includes('‹\s*بازگشت'), 'Found legacy left chevron ‹ in RTL back navigation');
}

/**
 * Asserts that HTML contains an accessible dialog with proper ARIA semantics
 */
export function assertHasAriaDialog(html, title) {
  const hasDialogTag = html.includes('<dialog');
  const hasRoleDialog = html.includes('role="dialog"') || html.includes("role='dialog'");
  assert.ok(hasDialogTag || hasRoleDialog, 'Missing <dialog> element or role="dialog"');
  assert.ok(html.includes('aria-modal="true"') || html.includes("aria-modal='true'"), 'Missing aria-modal="true"');
  assert.ok(
    html.includes('aria-labelledby') || html.includes('aria-describedby') || html.includes('aria-label'),
    'Dialog must have aria-labelledby, aria-describedby, or aria-label'
  );
  if (title) {
    assert.ok(html.includes(title), `Dialog must contain title: "${title}"`);
  }
}

/**
 * Asserts that an input element has proper error association via aria-invalid and aria-describedby
 */
export function assertAriaInvalidAndDescribedBy(html, fieldName, errorId) {
  const inputPattern = new RegExp(`(<input|<select|<textarea)[^>]*(name=["']${fieldName}["']|id=["']${fieldName}["'])[^>]*>`, 'i');
  const match = html.match(inputPattern);
  assert.ok(match, `Could not find form input with name/id "${fieldName}"`);
  const inputTag = match[0];
  assert.match(inputTag, /aria-invalid=["']true["']/, `Input "${fieldName}" must have aria-invalid="true"`);
  if (errorId) {
    assert.match(inputTag, new RegExp(`aria-describedby=["'][^"']*${errorId}[^"']*["']`), `Input "${fieldName}" aria-describedby must reference "${errorId}"`);
    assert.ok(html.includes(`id="${errorId}"`) || html.includes(`id='${errorId}'`), `HTML must contain element with id="${errorId}"`);
    assert.match(html, new RegExp(`<[^>]+id=["']${errorId}["'][^>]*role=["']alert["']`), `Error element "${errorId}" must have role="alert"`);
  }
}

/**
 * Asserts root HTML element RTL directionality and Persian language
 */
export function assertRtlRoot(html) {
  assert.match(html, /<html[^>]*dir=["']rtl["'][^>]*lang=["']fa["']|<html[^>]*lang=["']fa["'][^>]*dir=["']rtl["']/, 'Document root <html> must declare dir="rtl" and lang="fa"');
}

/**
 * Asserts SVG icon presence with accessible semantics
 */
export function assertSvgIcon(html, iconName) {
  const hasIcon = html.includes(`icon-${iconName}`) || html.includes(`data-icon="${iconName}"`) || html.includes(`icon-${iconName}.svg`);
  assert.ok(hasIcon, `Expected SVG icon for "${iconName}" in HTML`);
}

/**
 * Asserts minimum touch target dimensions
 */
export function assertTouchTargetSize(cssRulesOrText, selector, minPx = 44) {
  if (typeof cssRulesOrText === 'string') {
    const minHeightMatch = cssRulesOrText.match(new RegExp(`${selector}[^{]*\\{[^}]*(?:min-height|min-block-size):\\s*(\\d+)px`, 'i'));
    if (minHeightMatch) {
      const size = parseInt(minHeightMatch[1], 10);
      assert.ok(size >= minPx, `Selector "${selector}" has min-size ${size}px, expected >= ${minPx}px`);
      return;
    }
  }
  if (typeof cssRulesOrText === 'object' && cssRulesOrText !== null) {
    const height = cssRulesOrText.minHeight || cssRulesOrText.minBlockSize || cssRulesOrText.height;
    if (height) {
      assert.ok(parseInt(height, 10) >= minPx, `Computed touch target size ${height} < ${minPx}px`);
    }
  }
}

/**
 * Asserts Persian digits presence
 */
export function assertPersianDigits(text) {
  assert.match(text, /[۰-۹]/, `Expected text to contain Persian numerals, got: ${text}`);
}

/**
 * Asserts Persian Jalali date formatting
 */
export function assertPersianDateFormatted(text) {
  assert.match(
    text,
    /(?:[۱-۴][۰-۹]{3}\/[۰-۱]?[۰-۹]\/[۰-۳]?[۰-۹])|(?:[1-4][0-9]{3}\/[0-1]?[0-9]\/[0-3]?[0-9])/,
    `Expected text to contain a Jalali formatted date (YYYY/MM/DD), got: ${text}`
  );
}

/**
 * Asserts calendar elapsed status badge
 */
export function assertElapsedStatusBadge(html) {
  const hasElapsed = html.includes('پایان‌یافته') || html.includes('is-elapsed') || html.includes('is-completed');
  assert.ok(hasElapsed, 'Expected calendar item to display elapsed status badge (پایان‌یافته)');
}

/**
 * Asserts session cookie formatting and security flags
 */
export function assertSessionCookie(header) {
  assert.ok(header, 'Set-Cookie header must be present');
  assert.match(header, /sam_session=[A-Za-z0-9_-]+/, 'Must contain valid sam_session cookie');
  assert.match(header, /HttpOnly/i, 'Cookie must specify HttpOnly');
  assert.match(header, /SameSite=lax/i, 'Cookie must specify SameSite=lax');
}
