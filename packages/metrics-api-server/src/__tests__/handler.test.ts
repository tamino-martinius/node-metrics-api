import { describe, expect, it, vi } from 'vitest';
import { ScrapeError, UserNotFoundError } from '../errors.js';
import {
  createUserHandler,
  githubUserResponse,
  parseBearer,
  parseLifetime,
  parseMonths,
  parseYears,
} from '../handler.js';
import { isValidGithubUsername } from '../validate.js';

const request = (qs: string): Request => new Request(`https://metrics-api.tamino.dev/api/x?${qs}`);

describe('createUserHandler', () => {
  it('returns JSON with cache and CORS headers on success', async () => {
    const handler = createUserHandler(async ({ user }) => ({ hello: user }), isValidGithubUsername);
    const response = await handler(request('user=octocat'));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ hello: 'octocat' });
    expect(response.headers.get('access-control-allow-origin')).toBe('*');
    expect(response.headers.get('cache-control')).toBe('public, s-maxage=3600, stale-while-revalidate=86400');
    expect(response.headers.get('content-type')).toContain('application/json');
  });

  it('rejects invalid usernames with 400', async () => {
    const handler = createUserHandler(async () => ({}), isValidGithubUsername);
    expect((await handler(request('user=bad//name'))).status).toBe(400);
    expect((await handler(request(''))).status).toBe(400);
  });

  it('maps UserNotFoundError to 404 with short cache', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const handler = createUserHandler(async ({ user }) => {
      throw new UserNotFoundError(user);
    }, isValidGithubUsername);
    const response = await handler(request('user=ghost'));
    expect(response.status).toBe(404);
    expect(response.headers.get('cache-control')).toBe('public, s-maxage=300');
    expect(errorSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it('maps ScrapeError to 502 uncached and unknown errors to 500', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const scrape = createUserHandler(async () => {
      throw new ScrapeError('markup changed');
    }, isValidGithubUsername);
    const scrapeResponse = await scrape(request('user=octocat'));
    expect(scrapeResponse.status).toBe(502);
    expect(scrapeResponse.headers.get('cache-control')).toBe('no-store');

    const boom = createUserHandler(async () => {
      throw new Error('boom');
    }, isValidGithubUsername);
    expect((await boom(request('user=octocat'))).status).toBe(500);
    expect(errorSpy).toHaveBeenCalledTimes(2);
    errorSpy.mockRestore();
  });
});

describe('query parsing', () => {
  const url = (qs: string): URL => new URL(`https://x/?${qs}`);
  it('parses y', () => {
    expect(parseYears(url(''))).toBe('all');
    expect(parseYears(url('y=all'))).toBe('all');
    expect(parseYears(url('y=last'))).toBe('last');
    expect(parseYears(url('y=2016,2017'))).toEqual([2016, 2017]);
    expect(parseYears(url('y=junk'))).toBe('all');
  });
  it('dedupes and caps year lists', () => {
    expect(parseYears(url('y=2024,2024,2025'))).toEqual([2024, 2025]);
    const many = Array.from({ length: 40 }, (_x, i) => 2030 + i).join(',');
    expect(parseYears(url(`y=${many}`))).toHaveLength(30);
  });
  it('parses months clamped to 1..17', () => {
    expect(parseMonths(url(''))).toBe(12);
    expect(parseMonths(url('months=6'))).toBe(6);
    expect(parseMonths(url('months=99'))).toBe(12);
    expect(parseMonths(url('months=abc'))).toBe(12);
  });
});

// Minimal routing fetch reused from the user tests' style.
function routingFetch(graphql?: { status?: number; body: unknown }) {
  return (async (url: string, _init?: RequestInit) => {
    const u = String(url);
    if (u === 'https://api.github.com/graphql') {
      const g = graphql ?? {
        body: {
          data: {
            rateLimit: { cost: 1, remaining: 1 },
            user: { createdAt: '2012-01-01T00:00:00Z', location: 'Z', repositories: { nodes: [] } },
          },
        },
      };
      return new Response(JSON.stringify(g.body), { status: g.status ?? 200 });
    }
    if (u.includes('tab=repositories') || u.includes('?page=')) return new Response('<div></div>', { status: 200 });
    if (u.includes('/contributions')) {
      return new Response(
        '<td data-date="2024-01-01" data-level="0" id="c1"></td><tool-tip for="c1">No contributions</tool-tip>',
        { status: 200 },
      );
    }
    return new Response('<html><head><meta property="og:image" content="https://a/x.png"></head><body></body></html>', {
      status: 200,
    });
  }) as unknown as typeof fetch;
}
const req = (qs: string, headers?: Record<string, string>, method = 'GET') =>
  new Request(`https://metrics-api.tamino.dev/api/github/user?${qs}`, { method, headers });

describe('parseBearer / parseLifetime', () => {
  it('extracts a bearer token case-insensitively', () => {
    expect(parseBearer('Bearer abc')).toBe('abc');
    expect(parseBearer('bearer xyz')).toBe('xyz');
    expect(parseBearer(null)).toBeUndefined();
    expect(parseBearer('Basic zzz')).toBeUndefined();
  });
  it('parses lifetime flag', () => {
    expect(parseLifetime(new URL('https://x/?lifetime=1'))).toBe(true);
    expect(parseLifetime(new URL('https://x/?lifetime=0'))).toBe(false);
    expect(parseLifetime(new URL('https://x/'))).toBe(false);
  });
});

describe('githubUserResponse', () => {
  it('anonymous request: public cache + Vary, no enrichment without server token', async () => {
    const res = await githubUserResponse(req('user=octo&y=last'), { fetchFn: routingFetch() });
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('public, s-maxage=3600, stale-while-revalidate=86400');
    expect(res.headers.get('vary')).toBe('Authorization');
    const body = await res.json();
    expect(body.profile.accountCreatedAt).toBeUndefined();
  });

  it('server token present: public enrichment, still cached', async () => {
    const res = await githubUserResponse(req('user=octo&y=last'), { serverToken: 'srv', fetchFn: routingFetch() });
    expect(res.headers.get('cache-control')).toBe('public, s-maxage=3600, stale-while-revalidate=86400');
    expect((await res.json()).profile.accountCreatedAt).toBe('2012-01-01T00:00:00Z');
  });

  it('authed request: no-store, private fields present', async () => {
    const graphql = {
      body: {
        data: {
          rateLimit: { cost: 1, remaining: 1 },
          user: {
            createdAt: '2012-01-01T00:00:00Z',
            location: 'Z',
            repositories: { nodes: [] },
            contributionsCollection: {
              totalCommitContributions: 4,
              totalPullRequestContributions: 0,
              totalPullRequestReviewContributions: 0,
              totalIssueContributions: 0,
              restrictedContributionsCount: 2,
            },
          },
        },
      },
    };
    const res = await githubUserResponse(req('user=octo&y=last', { authorization: 'Bearer tok' }), {
      fetchFn: routingFetch(graphql),
    });
    expect(res.headers.get('cache-control')).toBe('private, no-store');
    expect((await res.json()).contributions.byType).toEqual({ commits: 4, pullRequests: 0, reviews: 0, issues: 0 });
  });

  it('OPTIONS preflight advertises Authorization header', async () => {
    const res = await githubUserResponse(req('user=octo', {}, 'OPTIONS'));
    expect(res.status).toBe(204);
    expect(res.headers.get('access-control-allow-methods')).toContain('GET');
    expect(res.headers.get('access-control-allow-headers')?.toLowerCase()).toContain('authorization');
  });

  it('invalid username -> 400 no-store', async () => {
    const res = await githubUserResponse(req('user=bad//name'), { fetchFn: routingFetch() });
    expect(res.status).toBe(400);
    expect(res.headers.get('cache-control')).toBe('no-store');
  });

  it('bad caller token -> 401, and the token never appears in logs', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await githubUserResponse(req('user=octo', { authorization: 'Bearer s3cr3t-token' }), {
      fetchFn: routingFetch({ status: 401, body: { message: 'Bad credentials' } }),
    });
    expect(res.status).toBe(401);
    expect(res.headers.get('cache-control')).toBe('no-store');
    const logged = errorSpy.mock.calls.flat().map(String).join(' ');
    expect(logged).not.toContain('s3cr3t-token');
    errorSpy.mockRestore();
  });
});
