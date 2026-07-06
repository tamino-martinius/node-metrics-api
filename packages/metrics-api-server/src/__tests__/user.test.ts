import { describe, expect, it } from 'vitest';
import { mergeGithubUser } from '../github/user.js';
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
