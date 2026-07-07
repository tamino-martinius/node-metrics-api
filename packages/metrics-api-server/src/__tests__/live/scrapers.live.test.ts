import { describe, expect, it } from 'vitest';
import { ScrapeError, UserNotFoundError } from '../../errors.js';
import { fetchAvailableYears, scrapeGithubContributions } from '../../github/contributions.js';
import { scrapeGithubProfile } from '../../github/profile.js';
import { scrapeGithubRepos } from '../../github/repos.js';
import { getLinkedinUser } from '../../linkedin/user.js';
import { fetchNpmStats } from '../../npm/stats.js';
import { getTwitterUser } from '../../twitter/user.js';

const USER = process.env.SMOKE_USER ?? 'tamino-martinius';
// Twitter handles differ from the github/npm username, so it has its own override.
const TWITTER_USER = process.env.SMOKE_TWITTER_USER ?? 'TaminoMartinius';
const LINKEDIN_USER = process.env.SMOKE_LINKEDIN_USER ?? 'tamino-martinius';

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

  it('twitter: JSON-LD scrape returns a profile with counts (guards x.com HTML/JSON-LD drift)', async () => {
    const { profile } = await getTwitterUser(TWITTER_USER);
    expect(profile.username.toLowerCase()).toBe(TWITTER_USER.toLowerCase());
    expect(profile.name.length).toBeGreaterThan(0);
    expect(profile.followerCount).toBeGreaterThan(0);
    expect(profile.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('linkedin: JSON-LD scrape returns a profile when reachable (guards structure; tolerates 999 block)', async () => {
    // LinkedIn aggressively blocks datacenter/CI IPs (HTTP 999 -> ScrapeError, or an authwall with
    // no Person node -> UserNotFoundError). Those two are indistinguishable from a genuine markup
    // change from CI, so treat an unreachable profile as a skip rather than a nightly failure. When
    // LinkedIn does serve the page, the structure is still asserted.
    let profile: Awaited<ReturnType<typeof getLinkedinUser>>['profile'];
    try {
      ({ profile } = await getLinkedinUser(LINKEDIN_USER));
    } catch (error) {
      if (error instanceof ScrapeError || error instanceof UserNotFoundError) {
        console.warn(`linkedin smoke skipped (likely IP-blocked): ${(error as Error).message}`);
        return;
      }
      throw error;
    }
    expect(profile.name.length).toBeGreaterThan(0);
    expect(profile.url).toBe(`https://www.linkedin.com/in/${LINKEDIN_USER}`);
    expect(profile.followerCount === null || profile.followerCount > 0).toBe(true);
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
