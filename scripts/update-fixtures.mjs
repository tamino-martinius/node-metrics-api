// Refresh the committed real-markup fixtures. Usage: node scripts/update-fixtures.mjs [github-user]
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const USER = process.argv[2] ?? 'tamino-martinius';
const DIR = join(dirname(fileURLToPath(import.meta.url)), '../packages/metrics-api-server/src/__tests__/fixtures');

const HEADERS = {
  accept: 'text/html',
  'accept-language': 'en-US,en;q=0.9',
  'user-agent': 'metrics-api fixtures (+https://github.com/tamino-martinius/node-metrics-api)',
};

// `x-requested-with: XMLHttpRequest` mirrors src/github/fetch.ts's per-request `xhr` option: GitHub requires
// it for the `?tab=contributions` year-list fragment, but it makes the plain profile URL return a Turbo
// fragment (no <head>/og:image/follower counts) instead of the full document, so it must stay off there.
const targets = [
  [`https://github.com/users/${USER}/contributions`, 'contributions-last.html', false],
  [`https://github.com/${USER}?tab=contributions`, 'contribution-years.html', true],
  [`https://github.com/${USER}`, 'profile.html', false],
  [`https://github.com/${USER}?page=1&tab=repositories`, 'repos-page-1.html', false],
];

await mkdir(DIR, { recursive: true });
for (const [url, file, xhr] of targets) {
  const headers = xhr ? { ...HEADERS, 'x-requested-with': 'XMLHttpRequest' } : HEADERS;
  const response = await fetch(url, { headers });
  if (!response.ok) throw new Error(`${response.status} for ${url}`);
  await writeFile(join(DIR, file), await response.text());
  console.log(`saved ${file}`);
}
