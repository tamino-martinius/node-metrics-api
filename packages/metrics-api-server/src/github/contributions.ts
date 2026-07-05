import { ScrapeError } from '../errors.js';
import { attr } from '../html.js';
import type { ContributionDay, ContributionLevel, FetchFn, GithubContributions } from '../types.js';
import { fetchGithubHtml } from './fetch.js';

export function parseContributionsHtml(html: string): ContributionDay[] {
  const counts = new Map<string, number>();
  for (const match of html.matchAll(/<tool-tip\b[^>]*\bfor="([^"]+)"[^>]*>\s*(No|[\d,]+) contributions?/g)) {
    counts.set(match[1], match[2] === 'No' ? 0 : Number.parseInt(match[2].replace(/,/g, ''), 10));
  }
  const days: ContributionDay[] = [];
  for (const match of html.matchAll(/<td\b[^>]*\bdata-date="[^"]*"[^>]*>/g)) {
    const tag = match[0];
    const date = attr(tag, 'data-date');
    const level = attr(tag, 'data-level');
    const id = attr(tag, 'id');
    if (!date || level === null || !id) {
      throw new ScrapeError('contribution cell is missing data-date/data-level/id — GitHub markup may have changed');
    }
    days.push({ date, count: counts.get(id) ?? 0, level: Number(level) as ContributionLevel });
  }
  if (days.length === 0) {
    throw new ScrapeError('no contribution cells found — GitHub markup may have changed');
  }
  return days.sort((a, b) => a.date.localeCompare(b.date));
}

export function parseYearLinks(html: string): number[] {
  const years = [...html.matchAll(/\bid="year-link-(\d{4})"/g)].map((match) => Number(match[1]));
  if (years.length === 0) throw new ScrapeError('no year links found — GitHub markup may have changed');
  return [...new Set(years)].sort((a, b) => a - b);
}

export async function fetchAvailableYears(user: string, fetchFn: FetchFn = fetch): Promise<number[]> {
  const html = await fetchGithubHtml(`https://github.com/${user}?tab=contributions`, user, fetchFn);
  return parseYearLinks(html);
}

const sumCounts = (days: ContributionDay[]): number => days.reduce((sum, day) => sum + day.count, 0);

export interface ContributionsOptions {
  years?: 'all' | 'last' | number[];
  fetchFn?: FetchFn;
}

export async function scrapeGithubContributions(
  user: string,
  { years = 'all', fetchFn = fetch }: ContributionsOptions = {},
): Promise<GithubContributions> {
  if (years === 'last') {
    const html = await fetchGithubHtml(`https://github.com/users/${user}/contributions`, user, fetchFn);
    const days = parseContributionsHtml(html);
    return { total: { lastYear: sumCounts(days) }, contributions: days };
  }

  const yearList = years === 'all' ? await fetchAvailableYears(user, fetchFn) : years;
  const perYear = await Promise.all(
    yearList.map(async (year) => {
      const url = `https://github.com/users/${user}/contributions?from=${year}-01-01&to=${year}-12-31`;
      const html = await fetchGithubHtml(url, user, fetchFn);
      // The year view can include padding cells from neighboring years — drop them.
      return parseContributionsHtml(html).filter((day) => day.date.startsWith(`${year}-`));
    }),
  );

  return {
    total: Object.fromEntries(yearList.map((year, i) => [String(year), sumCounts(perYear[i])])),
    contributions: perYear.flat().sort((a, b) => a.date.localeCompare(b.date)),
  };
}
