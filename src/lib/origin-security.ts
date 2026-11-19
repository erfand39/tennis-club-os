/**
 * Pure origin validation and redirect-path sanitization helpers.
 * No server-only imports so Node unit tests can import this file directly.
 */

export function safeRedirectPath(path: string): string {
  if (!path || /[\r\n\0\\]/.test(path)) return '/';
  if (!path.startsWith('/') || path.startsWith('//')) return '/';
  return path;
}

export function resolveExpectedOrigin(
  requestUrl: string,
  hostHeader: string | null,
  configuredOrigin?: string,
): string {
  if (configuredOrigin) {
    return new URL(configuredOrigin).origin;
  }
  const url = new URL(requestUrl);
  const host = (hostHeader ?? '').trim();
  if (host && !/[\s/\\?#@]/.test(host)) {
    try {
      return new URL(`${url.protocol}//${host}`).origin;
    } catch {
      return url.origin;
    }
  }
  return url.origin;
}

export function isTrustedPostOrigin(params: {
  expectedOrigin: string;
  originHeader: string | null;
  hostHeader: string | null;
  secFetchSite: string | null;
  hasConfiguredOrigin: boolean;
}): boolean {
  const { expectedOrigin, originHeader, hostHeader, secFetchSite, hasConfiguredOrigin } = params;
  if (originHeader === expectedOrigin) return true;
  if (!hasConfiguredOrigin && !originHeader && secFetchSite === 'same-origin') return true;
  if (originHeader !== 'null') return false;

  // Safari can serialize an opaque document origin as "null" on form navigation.
  // Accept it only when Fetch Metadata confirms same-origin and Host matches this install.
  return secFetchSite === 'same-origin' && hostHeader === new URL(expectedOrigin).host;
}
