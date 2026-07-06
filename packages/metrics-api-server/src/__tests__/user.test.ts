import { describe, expect, it } from 'vitest';
import { GithubTokenError } from '../errors.js';
import { getGithubUser, mergeGithubUser } from '../github/user.js';
import type { GithubContributions, GithubGraphqlData, GithubProfile, GithubRepo } from '../types.js';

const profile: GithubProfile = {
  name: 'Octo',
  username: 'octo',
  bio: '',
  avatarUrl: 'a',
  url: 'u',
  followerCount: 1,
  followingCount: 2,
  organizations: [],
};
const repos: GithubRepo[] = [
  { name: 'a', url: 'ua', description: '', language: 'TS', stargazerCount: 3, forkCount: 0, isFork: false },
  { name: 'b', url: 'ub', description: '', language: null, stargazerCount: 0, forkCount: 0, isFork: false },
];
const contributions: GithubContributions = { total: { '2024': 5 }, contributions: [] };

describe('mergeGithubUser', () => {
  it('returns the scraped base unchanged when gql is null', () => {
    const out = mergeGithubUser(profile, repos, contributions, null);
    expect(out).toEqual({ profile, repos, contributions });
    expect(out.profile.accountCreatedAt).toBeUndefined();
  });

  it('layers public gql fields onto profile and matching repos by name', () => {
    const gql: GithubGraphqlData = {
      accountCreatedAt: '2012-12-23T20:56:28Z',
      location: 'Dessau',
      repos: [{ name: 'a', defaultBranchCommits: 492, createdAt: 'ca', pushedAt: 'pa' }],
      rateLimit: { cost: 1, remaining: 1 },
    };
    const out = mergeGithubUser(profile, repos, contributions, gql);
    expect(out.profile.accountCreatedAt).toBe('2012-12-23T20:56:28Z');
    expect(out.profile.location).toBe('Dessau');
    expect(out.repos[0]).toMatchObject({ name: 'a', defaultBranchCommits: 492, createdAt: 'ca', pushedAt: 'pa' });
    expect(out.repos[1].defaultBranchCommits).toBeUndefined(); // no gql match for 'b'
  });

  it('layers private contribution fields when present', () => {
    const gql: GithubGraphqlData = {
      accountCreatedAt: 'c',
      location: null,
      repos: [],
      rateLimit: { cost: 1, remaining: 1 },
      byType: { commits: 10, pullRequests: 2, reviews: 1, issues: 0 },
      privateLastYear: 99,
      lifetimeTotal: 1234,
    };
    const out = mergeGithubUser(profile, repos, contributions, gql);
    expect(out.contributions.byType).toEqual({ commits: 10, pullRequests: 2, reviews: 1, issues: 0 });
    expect(out.contributions.privateLastYear).toBe(99);
    expect(out.contributions.lifetimeTotal).toBe(1234);
  });
});

// Route by URL: github.com HTML scrapes vs api.github.com/graphql POST.
function routingFetch(opts: { reposFail?: boolean; graphql?: { status?: number; body: unknown } }) {
  return (async (url: string, _init?: RequestInit) => {
    const u = String(url);
    if (u === 'https://api.github.com/graphql') {
      const g = opts.graphql ?? {
        body: {
          data: {
            rateLimit: { cost: 1, remaining: 1 },
            user: { createdAt: '2012-01-01T00:00:00Z', location: 'Z', repositories: { nodes: [] } },
          },
        },
      };
      return new Response(JSON.stringify(g.body), { status: g.status ?? 200 });
    }
    if (u.includes('?page=') && opts.reposFail) return new Response('nope', { status: 500 });
    if (u.includes('tab=repositories') || u.includes('?page=')) {
      return new Response('<div><a class="next_page"></a></div>', { status: 200 }); // no repo chunks -> []
    }
    if (u.includes('/contributions')) {
      return new Response(
        '<td data-date="2024-01-01" data-level="0" id="c1"></td><tool-tip for="c1">No contributions</tool-tip>',
        { status: 200 },
      );
    }
    // profile
    return new Response('<html><head><meta property="og:image" content="https://a/x.png"></head><body></body></html>', {
      status: 200,
    });
  }) as unknown as typeof fetch;
}

describe('getGithubUser', () => {
  it('returns scraped-only data when no token is provided', async () => {
    const out = await getGithubUser('octo', { years: 'last', fetchFn: routingFetch({}) });
    expect(out.profile.username).toBe('octo');
    expect(out.profile.accountCreatedAt).toBeUndefined();
    expect(out.warnings).toBeUndefined();
  });

  it('adds public gql fields with a server token (no contributionsCollection)', async () => {
    const out = await getGithubUser('octo', { years: 'last', serverToken: 'srv', fetchFn: routingFetch({}) });
    expect(out.profile.accountCreatedAt).toBe('2012-01-01T00:00:00Z');
    expect(out.contributions.byType).toBeUndefined();
  });

  it('adds private fields with a caller token', async () => {
    const graphql = {
      body: {
        data: {
          rateLimit: { cost: 1, remaining: 1 },
          user: {
            createdAt: '2012-01-01T00:00:00Z',
            location: 'Z',
            repositories: { nodes: [] },
            contributionsCollection: {
              totalCommitContributions: 7,
              totalPullRequestContributions: 0,
              totalPullRequestReviewContributions: 0,
              totalIssueContributions: 0,
              restrictedContributionsCount: 3,
            },
          },
        },
      },
    };
    const out = await getGithubUser('octo', { years: 'last', callerToken: 'me', fetchFn: routingFetch({ graphql }) });
    expect(out.contributions.byType).toEqual({ commits: 7, pullRequests: 0, reviews: 0, issues: 0 });
    expect(out.contributions.privateLastYear).toBe(3);
  });

  it('degrades with a warning when the graphql call rate-limits (server token)', async () => {
    const graphql = { body: { errors: [{ type: 'RATE_LIMITED', message: 'x' }] } };
    const out = await getGithubUser('octo', { years: 'last', serverToken: 'srv', fetchFn: routingFetch({ graphql }) });
    expect(out.profile.accountCreatedAt).toBeUndefined();
    expect(out.warnings).toContain('enrichment: rate limited');
  });

  it('rethrows GithubTokenError when the caller supplied the (bad) token', async () => {
    const graphql = { status: 401, body: { message: 'Bad credentials' } };
    await expect(
      getGithubUser('octo', { years: 'last', callerToken: 'bad', fetchFn: routingFetch({ graphql }) }),
    ).rejects.toBeInstanceOf(GithubTokenError);
  });

  it('degrades repos to [] with a warning when the repos scrape fails', async () => {
    const out = await getGithubUser('octo', { years: 'last', fetchFn: routingFetch({ reposFail: true }) });
    expect(out.repos).toEqual([]);
    expect(out.warnings).toContain('repos: unavailable');
  });
});
