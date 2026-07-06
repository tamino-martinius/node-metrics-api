import { describe, expect, it } from 'vitest';
import { ScrapeError, UserNotFoundError } from '../errors.js';
import { getTwitterUser } from '../twitter/user.js';

const RESULT = {
  rest_id: '1',
  legacy: {
    screen_name: 'jack',
    name: 'Jack',
    created_at: 'Thu Jan 24 18:06:50 +0000 2013',
    followers_count: 42,
  },
};

interface RoutingOpts {
  activateStatus?: number;
  graphqlStatus?: number;
  graphqlBody?: unknown;
}

// Route by URL: the 1.1 guest-token activation POST vs the GraphQL UserByScreenName GET.
function routingFetch(opts: RoutingOpts = {}) {
  const calls: Array<{ url: string; headers: Headers; method: string }> = [];
  const fetchFn = (async (url: string | URL, init?: RequestInit) => {
    const u = String(url);
    calls.push({ url: u, headers: new Headers(init?.headers), method: init?.method ?? 'GET' });
    if (u.includes('/guest/activate.json')) {
      return new Response(JSON.stringify({ guest_token: 'GT123' }), { status: opts.activateStatus ?? 200 });
    }
    const body = opts.graphqlBody ?? { data: { user: { result: RESULT } } };
    return new Response(JSON.stringify(body), { status: opts.graphqlStatus ?? 200 });
  }) as unknown as typeof fetch;
  return { calls, fetchFn };
}

describe('getTwitterUser', () => {
  it('activates a guest token, fetches, and returns the parsed profile', async () => {
    const { calls, fetchFn } = routingFetch();
    const out = await getTwitterUser('jack', { fetchFn });
    expect(out.profile.username).toBe('jack');
    expect(out.profile.followerCount).toBe(42);
    expect(calls[0].url).toContain('/guest/activate.json');
    expect(calls[0].method).toBe('POST');
    expect(calls[1].url).toContain('/UserByScreenName');
    expect(calls[1].headers.get('x-guest-token')).toBe('GT123');
    expect(calls[1].headers.get('authorization')).toMatch(/^Bearer /);
  });

  it('throws UserNotFoundError when the user node has no result', async () => {
    const { fetchFn } = routingFetch({ graphqlBody: { data: { user: {} } } });
    await expect(getTwitterUser('ghost', { fetchFn })).rejects.toBeInstanceOf(UserNotFoundError);
  });

  it('throws ScrapeError when the graphql request fails', async () => {
    const { fetchFn } = routingFetch({ graphqlStatus: 429 });
    await expect(getTwitterUser('jack', { fetchFn })).rejects.toBeInstanceOf(ScrapeError);
  });

  it('throws ScrapeError when guest activation fails', async () => {
    const { fetchFn } = routingFetch({ activateStatus: 403 });
    await expect(getTwitterUser('jack', { fetchFn })).rejects.toBeInstanceOf(ScrapeError);
  });
});
