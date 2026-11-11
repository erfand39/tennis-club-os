// Remove only data written by the retired preview on this hosted origin.
try {
  localStorage.removeItem('tennis-club-os-preview-v1');
  localStorage.removeItem('sam-demo-notice-read');
} catch {
  // Browser storage can be disabled.
}

const oldWorker = new URL('/sw.js', location.origin).href;
navigator.serviceWorker?.getRegistration('/').then(registration => {
  const worker = registration?.active ?? registration?.waiting ?? registration?.installing;
  if (worker?.scriptURL === oldWorker) return registration.unregister();
}).catch(() => {});
window.caches?.keys().then(keys => Promise.all(
  keys.filter(key => key.startsWith('sam-tennis-shell-')).map(key => caches.delete(key))
)).catch(() => {});
