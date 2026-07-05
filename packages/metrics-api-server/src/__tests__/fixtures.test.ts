import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseContributionsHtml, parseYearLinks } from '../github/contributions.js';
import { parseProfileHtml } from '../github/profile.js';
import { parseReposHtml } from '../github/repos.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const fixture = (name: string): string => readFileSync(join(__dirname, 'fixtures', name), 'utf8');

describe('real GitHub markup', () => {
  it('parses the rolling contributions calendar', () => {
    const days = parseContributionsHtml(fixture('contributions-last.html'));
    expect(days.length).toBeGreaterThanOrEqual(300);
    for (const day of days) {
      expect(day.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(day.level).toBeGreaterThanOrEqual(0);
      expect(day.level).toBeLessThanOrEqual(4);
      expect(Number.isInteger(day.count)).toBe(true);
    }
    expect(days.reduce((sum, day) => sum + day.count, 0)).toBeGreaterThan(0);
  });

  it('parses year links', () => {
    const years = parseYearLinks(fixture('contribution-years.html'));
    expect(years.length).toBeGreaterThanOrEqual(2);
    for (const year of years) expect(year).toBeGreaterThanOrEqual(2008);
  });

  it('parses the profile', () => {
    const profile = parseProfileHtml(fixture('profile.html'), 'tamino-martinius');
    expect(profile.name.length).toBeGreaterThan(0);
    expect(profile.avatarUrl).toContain('avatars.githubusercontent.com');
    expect(profile.followerCount).toBeGreaterThan(0);
    expect(profile.followingCount).toBeGreaterThan(0);
  });

  it('parses the repos page', () => {
    const { repos } = parseReposHtml(fixture('repos-page-1.html'));
    expect(repos.length).toBeGreaterThanOrEqual(5);
    expect(repos.some((repo) => repo.language !== null)).toBe(true);
    expect(repos.some((repo) => repo.stargazerCount > 0)).toBe(true);
    for (const repo of repos) expect(repo.url).toMatch(/^https:\/\/github\.com\//);
  });
});
