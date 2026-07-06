import { describe, expect, it } from 'vitest';
import { buildLifetimeQuery, buildMainQuery, normalizeMain, sumLifetime } from '../github/graphql.js';

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
