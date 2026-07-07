import { describe, expect, it } from 'vitest';
import { GitlabApiError, GitlabRateLimitError, GitlabTokenError } from '../errors.js';
import { GITLAB_API, gitlabApiCount, gitlabApiFetch } from '../gitlab/api.js';

const resp = (body: unknown, init?: ResponseInit) => new Response(JSON.stringify(body), init);

describe('gitlabApiFetch', () => {
  it('GETs the api base and parses JSON', async () => {
    let seenUrl = '';
    let seenToken: string | null = null;
    const fetchFn = (async (url: string, init?: RequestInit) => {
      seenUrl = String(url);
      seenToken = new Headers(init?.headers).get('private-token');
      return resp([{ id: 1 }], { status: 200 });
    }) as unknown as typeof fetch;
    const out = await gitlabApiFetch<Array<{ id: number }>>('/users?username=x', { token: 't', fetchFn });
    expect(seenUrl).toBe(`${GITLAB_API}/users?username=x`);
    expect(seenToken).toBe('t');
    expect(out).toEqual([{ id: 1 }]);
  });

  it('omits the PRIVATE-TOKEN header when no token', async () => {
    let seenToken: string | null = 'unset';
    const fetchFn = (async (_url: string, init?: RequestInit) => {
      seenToken = new Headers(init?.headers).get('private-token');
      return resp({}, { status: 200 });
    }) as unknown as typeof fetch;
    await gitlabApiFetch('/x', { fetchFn });
    expect(seenToken).toBeNull();
  });

  it('maps 401/403 to GitlabTokenError, 429 to rate limit, others to GitlabApiError', async () => {
    const make = (status: number) =>
      gitlabApiFetch('/x', { token: 't', fetchFn: (async () => resp({}, { status })) as unknown as typeof fetch });
    await expect(make(401)).rejects.toBeInstanceOf(GitlabTokenError);
    await expect(make(403)).rejects.toBeInstanceOf(GitlabTokenError);
    await expect(make(429)).rejects.toBeInstanceOf(GitlabRateLimitError);
    await expect(make(500)).rejects.toBeInstanceOf(GitlabApiError);
  });
});

describe('gitlabApiCount', () => {
  it('reads the x-total header', async () => {
    const fetchFn = (async () =>
      new Response('[]', { status: 200, headers: { 'x-total': '105' } })) as unknown as typeof fetch;
    expect(await gitlabApiCount('/users/1/followers?per_page=1', { token: 't', fetchFn })).toBe(105);
  });
  it('returns 0 when x-total absent', async () => {
    const fetchFn = (async () => new Response('[]', { status: 200 })) as unknown as typeof fetch;
    expect(await gitlabApiCount('/users/1/following?per_page=1', { token: 't', fetchFn })).toBe(0);
  });
});
