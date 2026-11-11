import 'server-only';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const assets = {
  'manifest.webmanifest':'application/manifest+json',
  'offline.html':'text/html; charset=utf-8',
  'icon-192.png':'image/png',
  'icon-512.png':'image/png',
  'maskable-512.png':'image/png',
  'apple-icon.png':'image/png',
} as const;

export async function pwaAsset(asset:string) {
  if (!Object.hasOwn(assets,asset)) return new Response(null,{status:404});
  const data=await readFile(join(process.cwd(),'prototype','pwa',asset));
  return new Response(Uint8Array.from(data),{headers:{'Content-Type':assets[asset as keyof typeof assets]}});
}

export async function pwaWorker() {
  const data=await readFile(join(process.cwd(),'prototype','sw.js'));
  return new Response(Uint8Array.from(data),{headers:{'Content-Type':'text/javascript; charset=utf-8','Service-Worker-Allowed':'/'}});
}
