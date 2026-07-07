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

  it('builds URLs and headers for the github endpoint', async () => {
    const { calls, fetch } = recordingFetch();
    const client = new MetricsApiClient({ fetch });
    await client.github('octocat');
    await client.github('octocat', { years: [2016, 2017] });
    await client.github('octocat', { years: 'last', lifetime: true });
    await client.npmStats('octocat', { months: 6 });
    expect(calls).toEqual([
      'https://metrics-api.tamino.dev/github/octocat',
      'https://metrics-api.tamino.dev/github/octocat?y=2016%2C2017',
      'https://metrics-api.tamino.dev/github/octocat?y=last&lifetime=1',
      'https://metrics-api.tamino.dev/npm/octocat?months=6',
    ]);
  });

  it('builds the twitter endpoint URL', async () => {
    const { calls, fetch } = recordingFetch();
    const client = new MetricsApiClient({ fetch });
    await client.twitter('jack');
    expect(calls).toEqual(['https://metrics-api.tamino.dev/twitter/jack']);
  });

  it('sends the caller token as a bearer Authorization header', async () => {
    const seen: Array<string | null> = [];
    const fetchFn = (async (_url: RequestInfo | URL, init?: RequestInit) => {
      seen.push(new Headers(init?.headers).get('authorization'));
      return new Response('{}', { status: 200 });
    }) as typeof fetch;
    const client = new MetricsApiClient({ fetch: fetchFn });
    await client.github('octocat', { token: 'ghp_x' });
    await client.github('octocat');
    expect(seen).toEqual(['Bearer ghp_x', null]);
  });

  it('strips trailing slash from a custom baseUrl', async () => {
    const { calls, fetch } = recordingFetch();
    const client = new MetricsApiClient({ baseUrl: 'https://my-fork.vercel.app/', fetch });
    await client.github('me');
    expect(calls[0]).toBe('https://my-fork.vercel.app/github/me');
  });

  it('maps response codes to MetricsApiError kinds', async () => {
    for (const [status, kind] of [
      [400, 'bad-request'],
      [404, 'not-found'],
      [502, 'upstream'],
    ] as const) {
      const { fetch } = recordingFetch(status, { error: 'nope' });
      const client = new MetricsApiClient({ fetch });
      const error = await client.github('x').catch((e: unknown) => e);
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
    const error = await client.github('x').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(MetricsApiError);
    expect((error as MetricsApiError).kind).toBe('network');
  });

  it('builds the gitlab URL and sends the caller token', async () => {
    const seen: Array<string | null> = [];
    const calls: string[] = [];
    const fetchFn = (async (url: RequestInfo | URL, init?: RequestInit) => {
      calls.push(String(url));
      seen.push(new Headers(init?.headers).get('authorization'));
      return new Response('{}', { status: 200 });
    }) as typeof fetch;
    const client = new MetricsApiClient({ fetch: fetchFn });
    await client.gitlab('tamino-martinius');
    await client.gitlab('tamino-martinius', { token: 'glpat_x' });
    expect(calls).toEqual([
      'https://metrics-api.tamino.dev/gitlab/tamino-martinius',
      'https://metrics-api.tamino.dev/gitlab/tamino-martinius',
    ]);
    expect(seen).toEqual([null, 'Bearer glpat_x']);
  });
});
