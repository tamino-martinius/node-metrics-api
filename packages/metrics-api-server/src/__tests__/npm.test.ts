import { describe, expect, it } from 'vitest';
import { downloadWindow, fetchNpmStats } from '../npm/stats.js';

const NOW = new Date('2026-07-04T10:00:00Z');

const SEARCH_RESULT = {
  total: 2,
  objects: [
    { package: { name: 'alpha', links: { npm: 'https://www.npmjs.com/package/alpha' } } },
    { package: { name: '@scope/beta', links: { npm: 'https://www.npmjs.com/package/@scope/beta' } } },
  ],
};

const ALPHA_DOC = {
  name: 'alpha',
  description: 'Alpha package',
  license: 'MIT',
  keywords: ['a'],
  'dist-tags': { latest: '2.0.0' },
  homepage: 'https://example.com',
  bugs: { url: 'https://github.com/x/alpha/issues' },
  repository: { url: 'git+https://github.com/x/alpha.git' },
  time: {
    created: '2023-05-10T12:34:56.000Z',
    modified: '2024-01-02T08:00:00.000Z',
    '1.0.0': '2023-05-10T12:34:56.000Z',
    '1.1.0': '2023-05-10T18:00:00.000Z',
    '2.0.0': '2024-01-02T08:00:00.000Z',
  },
};

const BETA_DOC = {
  name: '@scope/beta',
  'dist-tags': { latest: '0.1.0' },
  time: { created: '2024-06-01T00:30:00.000Z', modified: '2024-06-01T00:30:00.000Z', '0.1.0': '2024-06-01T00:30:00.000Z' },
};

const routes: Record<string, unknown> = {
  'https://registry.npmjs.org/-/v1/search?text=maintainer%3Aoctocat&size=250&from=0': SEARCH_RESULT,
  'https://registry.npmjs.org/alpha': ALPHA_DOC,
  'https://registry.npmjs.org/@scope%2Fbeta': BETA_DOC,
  // A single-package request returns npm's SINGLE shape (bulk keyed shape only for comma lists).
  'https://api.npmjs.org/downloads/range/2025-07-03:2026-07-03/alpha': {
    package: 'alpha',
    downloads: [{ day: '2026-06-01', downloads: 10 }, { day: '2026-06-02', downloads: 0 }],
  },
  'https://api.npmjs.org/downloads/range/2025-07-03:2026-07-03/@scope/beta': {
    downloads: [{ day: '2026-06-01', downloads: 3 }],
  },
};

const stubFetch = (async (input: RequestInfo | URL) => {
  const url = String(input);
  const body = routes[url];
  if (body === undefined) throw new Error(`unexpected fetch: ${url}`);
  return new Response(JSON.stringify(body), { status: 200 });
}) as typeof fetch;

describe('downloadWindow', () => {
  it('spans the requested months ending yesterday (UTC)', () => {
    expect(downloadWindow(NOW, 12)).toEqual({ start: '2025-07-03', end: '2026-07-03' });
  });
  it('clamps to the npm epoch', () => {
    expect(downloadWindow(new Date('2015-03-01T00:00:00Z'), 12).start).toBe('2015-01-10');
  });
});

describe('fetchNpmStats', () => {
  it('aggregates packages, versions and downloads', async () => {
    const stats = await fetchNpmStats('octocat', { fetchFn: stubFetch, now: NOW });
    expect(stats.user.username).toBe('octocat');
    expect(stats.packages).toHaveLength(2);

    const alpha = stats.packages.find((p) => p.details.name === 'alpha');
    expect(alpha?.details).toEqual({
      name: 'alpha',
      description: 'Alpha package',
      latestVersion: '2.0.0',
      license: 'MIT',
      keywords: ['a'],
      links: {
        npm: 'https://www.npmjs.com/package/alpha',
        homepage: 'https://example.com',
        repository: 'https://github.com/x/alpha',
        bugs: 'https://github.com/x/alpha/issues',
      },
    });
    // 2023-05-10 was a Wednesday; 2024-01-02 a Tuesday (UTC).
    expect(alpha?.versionsPerDate).toEqual({ '2023-05-10': 2, '2024-01-02': 1 });
    expect(alpha?.versionsPerHour).toEqual({ 'Wed, 12': 1, 'Wed, 18': 1, 'Tue, 08': 1 });
    expect(alpha?.downloadsPerDate).toEqual({ '2026-06-01': 10 }); // zero days dropped

    const beta = stats.packages.find((p) => p.details.name === '@scope/beta');
    expect(beta?.downloadsPerDate).toEqual({ '2026-06-01': 3 });

    expect(stats.user.versionsPerDate).toEqual({ '2023-05-10': 2, '2024-01-02': 1, '2024-06-01': 1 });
  });

  it('returns empty stats for a maintainer without packages', async () => {
    const emptyFetch = (async () =>
      new Response(JSON.stringify({ total: 0, objects: [] }), { status: 200 })) as typeof fetch;
    const stats = await fetchNpmStats('nobody', { fetchFn: emptyFetch, now: NOW });
    expect(stats).toEqual({ user: { username: 'nobody', versionsPerDate: {}, versionsPerHour: {} }, packages: [] });
  });
});
