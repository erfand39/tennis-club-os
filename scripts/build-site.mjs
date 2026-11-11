import { copyFile, cp, mkdir, rm } from 'node:fs/promises';

const dist = new URL('../dist/', import.meta.url);
await rm(dist, { recursive: true, force: true });
await cp(new URL('../site/', import.meta.url), dist, { recursive: true });
await mkdir(new URL('assets/', dist));
for (const asset of ['court-hero.webp', 'court-icon.svg', 'vazirmatn-arabic.woff2', 'vazirmatn-latin.woff2', 'OFL-Vazirmatn.txt']) {
  await copyFile(new URL('../src/app/styles/assets/' + asset, import.meta.url), new URL('assets/' + asset, dist));
}
