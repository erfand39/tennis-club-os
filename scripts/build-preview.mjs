import { cp, mkdir, readdir, rm } from 'node:fs/promises';

const source = new URL('../prototype/', import.meta.url);
const target = new URL('../dist/', import.meta.url);

await rm(target, { recursive: true, force: true });
await mkdir(target, { recursive: true });
for (const entry of await readdir(source)) {
  await cp(new URL(entry, source), new URL(entry, target), { recursive: true });
}
