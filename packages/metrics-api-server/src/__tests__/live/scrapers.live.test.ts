import { describe, expect, it } from 'vitest';
import { fetchAvailableYears, scrapeGithubContributions } from '../../github/contributions.js';
import { scrapeGithubProfile } from '../../github/profile.js';
import { scrapeGithubRepos } from '../../github/repos.js';
import { fetchNpmStats } from '../../npm/stats.js';
import { getTwitterUser } from '../../twitter/user.js';

const USER = process.env.SMOKE_USER ?? 'tamino-martinius';
// Twitter handles differ from the github/npm username, so it has its own override.
const TWITTER_USER = process.env.SMOKE_TWITTER_USER ?? 'TaminoMartinius';

describe(`live scraping for ${USER}`, () => {
  it('contributions: rolling year has >= 365 valid days with a positive total', async () => {
    const { total, contributions } = await scrapeGithubContributions(USER, { years: 'last' });
    expect(contributions.length).toBeGreaterThanOrEqual(365);
    for (const day of contributions) {
      expect(day.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(day.level).toBeGreaterThanOrEqual(0);
      expect(day.level).toBeLessThanOrEqual(4);
    }
    expect(total.lastYear).toBeGreaterThan(0);
  });

  it('year links include the current year', async () => {
    const years = await fetchAvailableYears(USER);
    expect(years).toContain(new Date().getUTCFullYear());
  });

  it('profile: name, avatar and positive follower count', async () => {
    const profile = await scrapeGithubProfile(USER);
    expect(profile.name.length).toBeGreaterThan(0);
    expect(profile.avatarUrl).toContain('avatars.githubusercontent.com');
    expect(profile.followerCount).toBeGreaterThan(0);
  });

  it('repos: at least one repo with numeric stars and a language', async () => {
    const repos = await scrapeGithubRepos(USER);
    expect(repos.length).toBeGreaterThanOrEqual(1);
    for (const repo of repos) expect(Number.isInteger(repo.stargazerCount)).toBe(true);
    expect(repos.some((repo) => repo.language !== null)).toBe(true);
  });

  it('twitter: guest-token flow returns a profile with counts (guards query-id/schema drift)', async () => {
    const { profile } = await getTwitterUser(TWITTER_USER);
    expect(profile.username.toLowerCase()).toBe(TWITTER_USER.toLowerCase());
    expect(profile.name.length).toBeGreaterThan(0);
    expect(profile.followerCount).toBeGreaterThan(0);
    expect(profile.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('npm: packages exist with publish history and windowed downloads', async () => {
    const stats = await fetchNpmStats(USER);
    expect(stats.packages.length).toBeGreaterThanOrEqual(1);
    expect(Object.keys(stats.user.versionsPerDate).length).toBeGreaterThan(0);
    const totalDownloads = stats.packages
      .flatMap((pkg) => Object.values(pkg.downloadsPerDate))
      .reduce((sum, count) => sum + count, 0);
    expect(totalDownloads).toBeGreaterThan(0);
  });
});
