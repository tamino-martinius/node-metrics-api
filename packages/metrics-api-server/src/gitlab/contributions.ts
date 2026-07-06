import { GitlabApiError } from '../errors.js';
import type { ContributionDay, ContributionLevel, FetchFn, GitlabContributions } from '../types.js';

export function bucketLevel(count: number): ContributionLevel {
  if (count <= 0) return 0;
  if (count <= 2) return 1;
  if (count <= 5) return 2;
  if (count <= 9) return 3;
  return 4;
}

export const CALENDAR_URL = (user: string): string =>
  `https://gitlab.com/users/${encodeURIComponent(user)}/calendar.json`;

export async function fetchGitlabContributions(
  user: string,
  { fetchFn = fetch }: { fetchFn?: FetchFn } = {},
): Promise<GitlabContributions> {
  const response = await fetchFn(CALENDAR_URL(user), { headers: { accept: 'application/json' } });
  if (!response.ok) throw new GitlabApiError(`gitlab calendar returned ${response.status} for ${user}`);
  const raw = (await response.json()) as Record<string, number>;
  const contributions: ContributionDay[] = Object.entries(raw)
    .map(([date, count]) => ({ date, count, level: bucketLevel(count) }))
    .sort((a, b) => a.date.localeCompare(b.date));
  const lastYear = contributions.reduce((sum, day) => sum + day.count, 0);
  return { total: { lastYear }, contributions };
}
