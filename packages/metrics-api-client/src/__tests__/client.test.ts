import { describe, expect, it } from 'vitest';
import { DEFAULT_BASE_URL, MetricsApiClient, MetricsApiError } from '../index.js';

const recordingFetch = (status = 200, body: unknown = { ok: true }): { calls: string[]; fetch: typeof fetch } => {
  const calls: string[] = [];
  const fetchFn = (async (input: RequestInfo | URL) => {
    calls.push(String(input));
    return new Response(JSON.stringify(body), { status });
  }) as typeof fetch;
  return { calls, fetch: fetchFn };
};

describe('MetricsApiClient', () => {
  it('uses the default base url', () => {
    expect(DEFAULT_BASE_URL).toBe('https://metrics-api.tamino.dev');
  });

  it('builds URLs for every endpoint', async () => {
    const { calls, fetch } = recordingFetch();
    const client = new MetricsApiClient({ fetch });
    await client.githubContributions('octocat');
    await client.githubContributions('octocat', { years: [2016, 2017] });
    await client.githubContributions('octocat', { years: 'last' });
    await client.githubProfile('octocat');
    await client.githubRepos('octocat');
    await client.npmStats('octocat', { months: 6 });
    expect(calls).toEqual([
      'https://metrics-api.tamino.dev/github/octocat/contributions',
      'https://metrics-api.tamino.dev/github/octocat/contributions?y=2016%2C2017',
      'https://metrics-api.tamino.dev/github/octocat/contributions?y=last',
      'https://metrics-api.tamino.dev/github/octocat/profile',
      'https://metrics-api.tamino.dev/github/octocat/repos',
      'https://metrics-api.tamino.dev/npm/octocat?months=6',
    ]);
  });

  it('strips trailing slash from a custom baseUrl', async () => {
    const { calls, fetch } = recordingFetch();
    const client = new MetricsApiClient({ baseUrl: 'https://my-fork.vercel.app/', fetch });
    await client.githubProfile('me');
    expect(calls[0]).toBe('https://my-fork.vercel.app/github/me/profile');
  });

  it('maps response codes to MetricsApiError kinds', async () => {
    for (const [status, kind] of [
      [400, 'bad-request'],
      [404, 'not-found'],
      [502, 'upstream'],
    ] as const) {
      const { fetch } = recordingFetch(status, { error: 'nope' });
      const client = new MetricsApiClient({ fetch });
      const error = await client.githubProfile('x').catch((e: unknown) => e);
      expect(error).toBeInstanceOf(MetricsApiError);
      expect((error as MetricsApiError).kind).toBe(kind);
      expect((error as MetricsApiError).status).toBe(status);
    }
  });

  it('wraps network failures', async () => {
    const failingFetch = (async () => {
      throw new TypeError('fetch failed');
    }) as typeof fetch;
    const client = new MetricsApiClient({ fetch: failingFetch });
    const error = await client.githubProfile('x').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(MetricsApiError);
    expect((error as MetricsApiError).kind).toBe('network');
  });
});
