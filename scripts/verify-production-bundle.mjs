import { readdir, readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIST = fileURLToPath(new URL('../dist/', import.meta.url));
const TEXT_EXTENSIONS = new Set(['.html', '.js', '.css', '.json', '.map', '.txt']);
const FORBIDDEN_MARKERS = [
  'SAMPLE / UNVERIFIED DATA',
  'SAMPLE DATA — placeholder values',
  'sample-gmaw-',
  'Placeholder values for development only',
];

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(path)));
    else if (TEXT_EXTENSIONS.has(extname(entry.name))) files.push(path);
  }
  return files;
}

const files = await walk(DIST);
const violations = [];

for (const file of files) {
  const text = await readFile(file, 'utf8');
  for (const marker of FORBIDDEN_MARKERS) {
    if (text.includes(marker)) violations.push(`${file}: contains "${marker}"`);
  }
}

if (violations.length > 0) {
  console.error('Production bundle contains development/sample welding data:');
  for (const violation of violations) console.error(`- ${violation}`);
  process.exit(1);
}

console.log('Production bundle verified: no sample welding-data markers found.');
