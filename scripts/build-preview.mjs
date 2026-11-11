import { cp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { previewSidebar } from '../prototype/preview-nav.mjs';

const source = new URL('../prototype/', import.meta.url);
const target = new URL('../dist/', import.meta.url);
const sidebar = '<!-- preview-sidebar -->';

await rm(target, { recursive: true, force: true });
await mkdir(target, { recursive: true });
for (const entry of await readdir(source)) {
  const input = new URL(entry, source);
  const output = new URL(entry, target);
  if (entry.endsWith('.html')) {
    const html = await readFile(input, 'utf8');
    const section = entry === 'index.html' ? 'dashboard' : entry.slice(0, -5);
    if (!html.includes(sidebar)) throw new Error(`Missing club sidebar in ${entry}`);
    await writeFile(output, html.replace(sidebar, () => previewSidebar(section)));
  } else {
    await cp(input, output, { recursive: true });
  }
}
