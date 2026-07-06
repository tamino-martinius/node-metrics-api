import { describe, expect, it } from 'vitest';
import { GithubRateLimitError, GithubTokenError } from '../errors.js';
import {
  buildLifetimeQuery,
  buildMainQuery,
  fetchGithubGraphql,
  normalizeMain,
  sumLifetime,
} from '../github/graphql.js';

const mainData = {
  rateLimit: {
    cost: 1,
    remaining: 4999,
  },
  user: {
    createdAt: '2012-12-23T20:56:28Z',
    location: 'Dessau, Germany',
    repositories: {
      nodes: [
        {
          name: 'a',
          createdAt: '2018-07-15T00:00:00Z',
          pushedAt: '2026-07-06T00:00:00Z',
          defaultBranchRef: {
            target: {
              history: {
                totalCount: 492,
              },
            },
          },
        },
        {
          name: 'empty-repo',
          createdAt: '2020-01-01T00:00:00Z',
          pushedAt: '2020-01-01T00:00:00Z',
          defaultBranchRef: null,
        },
      ],
    },
    contributionsCollection: {
      totalCommitContributions: 1302,
      totalPullRequestContributions: 223,
      totalPullRequestReviewContributions: 0,
      totalIssueContributions: 1,
      restrictedContributionsCount: 11725,
    },
  },
};

describe('buildMainQuery', () => {
  it('includes contributionsCollection only when asked', () => {
    expect(buildMainQuery(false)).not.toContain('contributionsCollection');
    expect(buildMainQuery(true)).toContain('contributionsCollection');
    expect(buildMainQuery(false)).toContain('history { totalCount }');
    expect(buildMainQuery(false)).toContain('privacy: PUBLIC');
  });
});

describe('normalizeMain', () => {
  it('maps public fields and per-repo commit totals, null history -> null', () => {
    const out = normalizeMain(mainData);
    expect(out.accountCreatedAt).toBe('2012-12-23T20:56:28Z');
    expect(out.location).toBe('Dessau, Germany');
    expect(out.repos).toEqual([
      {
        name: 'a',
        defaultBranchCommits: 492,
        createdAt: '2018-07-15T00:00:00Z',
        pushedAt: '2026-07-06T00:00:00Z',
      },
      {
        name: 'empty-repo',
        defaultBranchCommits: null,
        createdAt: '2020-01-01T00:00:00Z',
        pushedAt: '2020-01-01T00:00:00Z',
      },
    ]);
    expect(out.rateLimit).toEqual({ cost: 1, remaining: 4999 });
  });
  it('extracts byType + privateLastYear when contributionsCollection present', () => {
    const out = normalizeMain(mainData);
    expect(out.byType).toEqual({ commits: 1302, pullRequests: 223, reviews: 0, issues: 1 });
    expect(out.privateLastYear).toBe(11725);
  });
  it('omits byType when contributionsCollection absent', () => {
    const noContrib = { ...mainData, user: { ...mainData.user, contributionsCollection: undefined } };
    const out = normalizeMain(noContrib);
    expect(out.byType).toBeUndefined();
    expect(out.privateLastYear).toBeUndefined();
  });
  it('throws ScrapeError when user node is missing createdAt', () => {
    expect(() => normalizeMain({ rateLimit: { cost: 1, remaining: 1 }, user: {} })).toThrow(/graphql/i);
  });
});

describe('lifetime', () => {
  it('builds one aliased contributionsCollection per year', () => {
    const q = buildLifetimeQuery(2012, 2014);
    expect(q).toContain('y2012: contributionsCollection(from: "2012-01-01T00:00:00Z"');
    expect(q).toContain('y2014: contributionsCollection(from: "2014-01-01T00:00:00Z"');
  });
  it('sums commits+prs+reviews+issues+restricted across years', () => {
    const data = {
      user: {
        y2012: {
          totalCommitContributions: 1,
          totalPullRequestContributions: 0,
          totalPullRequestReviewContributions: 0,
          totalIssueContributions: 0,
          restrictedContributionsCount: 0,
        },
        y2013: {
          totalCommitContributions: 10,
          totalPullRequestContributions: 2,
          totalPullRequestReviewContributions: 1,
          totalIssueContributions: 3,
          restrictedContributionsCount: 4,
        },
      },
    };
    expect(sumLifetime(data, 2012, 2013)).toBe(1 + (10 + 2 + 1 + 3 + 4));
  });
});

// fetchFn that returns queued responses and records Authorization header + posted body
function mockGraphql(responses: Array<{ status?: number; body: unknown }>) {
  const calls: Array<{ auth: string | null; query: string }> = [];
  let i = 0;
  const fetchFn = (async (_url: string, init?: RequestInit) => {
    const auth = new Headers(init?.headers).get('authorization');
    calls.push({
      auth,
      query: JSON.parse(String(init?.body)).query,
    });
    const r = responses[Math.min(i, responses.length - 1)];
    i++;
    return new Response(JSON.stringify(r.body), {
      status: r.status ?? 200,
    });
  }) as unknown as typeof fetch;
  return { calls, fetchFn };
}

const okMain = {
  data: {
    rateLimit: { cost: 1, remaining: 10 },
    user: {
      createdAt: '2012-12-23T20:56:28Z',
      location: 'X',
      repositories: { nodes: [] },
    },
  },
};

describe('fetchGithubGraphql', () => {
  it('sends bearer token and returns normalized data', async () => {
    const { calls, fetchFn } = mockGraphql([{ body: okMain }]);
    const out = await fetchGithubGraphql('octocat', { token: 't0ken', fetchFn });
    expect(calls[0].auth).toBe('bearer t0ken');
    expect(calls[0].query).not.toContain('contributionsCollection');
    expect(out?.accountCreatedAt).toBe('2012-12-23T20:56:28Z');
    expect(out?.byType).toBeUndefined();
  });

  it('adds a second lifetime call and totals it', async () => {
    const okCreated = {
      data: {
        rateLimit: { cost: 1, remaining: 9 },
        user: {
          createdAt: '2011-06-01T00:00:00Z',
          location: null,
          repositories: { nodes: [] },
          contributionsCollection: {
            totalCommitContributions: 5,
            totalPullRequestContributions: 0,
            totalPullRequestReviewContributions: 0,
            totalIssueContributions: 0,
            restrictedContributionsCount: 0,
          },
        },
      },
    };
    const lifetime = {
      data: {
        rateLimit: { cost: 1, remaining: 8 },
        user: {
          y2011: {
            totalCommitContributions: 2,
            totalPullRequestContributions: 0,
            totalPullRequestReviewContributions: 0,
            totalIssueContributions: 0,
            restrictedContributionsCount: 0,
          },
          y2012: {
            totalCommitContributions: 3,
            totalPullRequestContributions: 1,
            totalPullRequestReviewContributions: 0,
            totalIssueContributions: 0,
            restrictedContributionsCount: 0,
          },
        },
      },
    };
    const { calls, fetchFn } = mockGraphql([{ body: okCreated }, { body: lifetime }]);
    const out = await fetchGithubGraphql('octocat', {
      token: 't',
      fetchFn,
      includeContributions: true,
      includeLifetime: true,
      now: new Date('2012-07-06T00:00:00Z'),
    });
    expect(calls).toHaveLength(2);
    expect(calls[0].query).toContain('contributionsCollection');
    expect(out?.byType).toEqual({ commits: 5, pullRequests: 0, reviews: 0, issues: 0 });
    expect(out?.lifetimeTotal).toBe(2 + (3 + 1));
  });

  it('throws GithubTokenError on HTTP 401', async () => {
    const { fetchFn } = mockGraphql([{ status: 401, body: { message: 'Bad credentials' } }]);
    await expect(fetchGithubGraphql('octocat', { token: 'bad', fetchFn })).rejects.toBeInstanceOf(GithubTokenError);
  });

  it('throws GithubRateLimitError on RATE_LIMITED errors', async () => {
    const { fetchFn } = mockGraphql([
      {
        body: {
          errors: [
            {
              type: 'RATE_LIMITED',
              message: 'API rate limit exceeded',
            },
          ],
        },
      },
    ]);
    await expect(fetchGithubGraphql('octocat', { token: 't', fetchFn })).rejects.toBeInstanceOf(GithubRateLimitError);
  });

  it('returns null when the user node is absent (unknown login)', async () => {
    const { fetchFn } = mockGraphql([{ body: { data: { rateLimit: { cost: 1, remaining: 1 }, user: null } } }]);
    expect(await fetchGithubGraphql('nobody', { token: 't', fetchFn })).toBeNull();
  });
});
