import { ScrapeError } from '../errors.js';
import type { FetchFn, NpmPackageDetails, NpmPackageStats, NpmStats } from '../types.js';

const NPM_EPOCH = '2015-01-10';
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
const BULK_LIMIT = 128;
// ms between paced scoped-package download requests.
const DEFAULT_SPACING_MS = 500;
// base ms for 429 exponential backoff (doubles per retry attempt).
const DEFAULT_BACKOFF_BASE_MS = 5_000;
// total ms of 429-backoff sleeping allowed per fetchNpmStats call before aborting; stays
// well under the live suite's 480s testTimeout.
const DEFAULT_RATE_LIMIT_BUDGET_MS = 240_000;

const dateKey = (date: Date): string => date.toISOString().slice(0, 10);

export function downloadWindow(now: Date, months: number): { start: string; end: string } {
  const end = new Date(now);
  end.setUTCDate(end.getUTCDate() - 1); // download data lags a day
  const start = new Date(end);
  const day = start.getUTCDate();
  start.setUTCDate(1);
  start.setUTCMonth(start.getUTCMonth() - months);
  const lastDay = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0)).getUTCDate();
  start.setUTCDate(Math.min(day, lastDay));
  const startKey = dateKey(start) < NPM_EPOCH ? NPM_EPOCH : dateKey(start);
  return { start: startKey, end: dateKey(end) };
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** Shared mutable tracker so serial requests within one fetchNpmStats call share a rate-limit budget. */
interface RateLimitBudget {
  totalMs: number;
  remainingMs: number;
}

async function fetchJson<T>(
  url: string,
  fetchFn: FetchFn,
  budget: RateLimitBudget,
  backoffBaseMs: number,
  retriesLeft = 5,
): Promise<T | null> {
  const response = await fetchFn(url);
  if (response.status === 404) return null;
  if (response.status === 429 && retriesLeft > 0) {
    // api.npmjs.org's downloads endpoint enforces a tight sliding-window limit per IP;
    // a real cooldown (not a quick doubling backoff) is needed for the window to clear.
    const delay = backoffBaseMs * 2 ** (5 - retriesLeft);
    if (delay > budget.remainingMs) {
      throw new ScrapeError(`npm rate limit backoff exceeded the ${budget.totalMs}ms budget while fetching ${url}`);
    }
    budget.remainingMs -= delay;
    await sleep(delay);
    return fetchJson<T>(url, fetchFn, budget, backoffBaseMs, retriesLeft - 1);
  }
  if (!response.ok) throw new ScrapeError(`npm returned ${response.status} for ${url}`);
  return (await response.json()) as T;
}

interface SearchObject {
  package: { name: string; links?: NpmPackageDetails['links'] };
}

async function searchPackages(
  user: string,
  fetchFn: FetchFn,
  budget: RateLimitBudget,
  backoffBaseMs: number,
): Promise<SearchObject[]> {
  const objects: SearchObject[] = [];
  for (let from = 0; from < 1000; from += 250) {
    const url = `https://registry.npmjs.org/-/v1/search?text=${encodeURIComponent(`maintainer:${user}`)}&size=250&from=${from}`;
    const page = await fetchJson<{ objects: SearchObject[] }>(url, fetchFn, budget, backoffBaseMs);
    if (!page) break;
    objects.push(...page.objects);
    if (page.objects.length < 250) break;
  }
  return objects;
}

interface RegistryDoc {
  name: string;
  description?: string;
  license?: string | { type?: string };
  keywords?: string[];
  homepage?: string;
  bugs?: { url?: string } | string;
  repository?: { url?: string } | string;
  'dist-tags'?: Record<string, string>;
  time?: Record<string, string>;
}

const cleanRepoUrl = (repo: RegistryDoc['repository']): string | undefined => {
  const url = typeof repo === 'string' ? repo : repo?.url;
  return url?.replace(/^git\+/, '').replace(/\.git$/, '');
};

interface VersionTimes {
  versionsPerDate: Record<string, number>;
  versionsPerHour: Record<string, number>;
}

function versionTimes(time: Record<string, string> = {}): VersionTimes {
  const versionsPerDate: Record<string, number> = {};
  const versionsPerHour: Record<string, number> = {};
  for (const [key, iso] of Object.entries(time)) {
    if (key === 'created' || key === 'modified' || key === 'unpublished') continue;
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) continue;
    const day = dateKey(date);
    const hour = `${WEEKDAYS[date.getUTCDay()]}, ${String(date.getUTCHours()).padStart(2, '0')}`;
    versionsPerDate[day] = (versionsPerDate[day] ?? 0) + 1;
    versionsPerHour[hour] = (versionsPerHour[hour] ?? 0) + 1;
  }
  return { versionsPerDate, versionsPerHour };
}

type DownloadRange = { downloads?: Array<{ day: string; downloads: number }> } | null;

async function fetchDownloads(
  names: string[],
  window: { start: string; end: string },
  fetchFn: FetchFn,
  budget: RateLimitBudget,
  backoffBaseMs: number,
  spacingMs: number,
): Promise<Record<string, Record<string, number>>> {
  const result: Record<string, Record<string, number>> = {};
  const toMap = (range: DownloadRange): Record<string, number> => {
    const map: Record<string, number> = {};
    for (const entry of range?.downloads ?? []) {
      if (entry.downloads > 0) map[entry.day] = entry.downloads;
    }
    return map;
  };

  const scoped = names.filter((name) => name.startsWith('@'));
  const unscoped = names.filter((name) => !name.startsWith('@'));

  for (let i = 0; i < unscoped.length; i += BULK_LIMIT) {
    const chunk = unscoped.slice(i, i + BULK_LIMIT);
    const url = `https://api.npmjs.org/downloads/range/${window.start}:${window.end}/${chunk.join(',')}`;
    if (chunk.length === 1) {
      result[chunk[0]] = toMap(await fetchJson<DownloadRange>(url, fetchFn, budget, backoffBaseMs));
    } else {
      const bulk = await fetchJson<Record<string, DownloadRange>>(url, fetchFn, budget, backoffBaseMs);
      for (const name of chunk) result[name] = toMap(bulk?.[name] ?? null);
    }
  }
  // Scoped packages can't be bulk-queried (npm rejects them in the comma-list form). Any
  // concurrency beyond 1 reliably trips api.npmjs.org's per-IP rate limit for a maintainer
  // with 100+ scoped packages, so fetch them strictly one at a time with a small pacing
  // delay between requests; fetchJson's retry/backoff absorbs any remaining transient 429s.
  for (const name of scoped) {
    const url = `https://api.npmjs.org/downloads/range/${window.start}:${window.end}/${name}`;
    result[name] = toMap(await fetchJson<DownloadRange>(url, fetchFn, budget, backoffBaseMs));
    if (spacingMs > 0) await sleep(spacingMs);
  }
  return result;
}

export interface NpmStatsOptions {
  months?: number;
  fetchFn?: FetchFn;
  now?: Date;
  /** ms between paced scoped-package download requests (default 500) */
  spacingMs?: number;
  /** base ms for 429 exponential backoff (default 5_000; doubles per attempt) */
  backoffBaseMs?: number;
  /** total ms of 429-backoff sleeping allowed per fetchNpmStats call before aborting (default 240_000) */
  rateLimitBudgetMs?: number;
}

export async function fetchNpmStats(
  user: string,
  {
    months = 12,
    fetchFn = fetch,
    now = new Date(),
    spacingMs = DEFAULT_SPACING_MS,
    backoffBaseMs = DEFAULT_BACKOFF_BASE_MS,
    rateLimitBudgetMs = DEFAULT_RATE_LIMIT_BUDGET_MS,
  }: NpmStatsOptions = {},
): Promise<NpmStats> {
  const budget: RateLimitBudget = { totalMs: rateLimitBudgetMs, remainingMs: rateLimitBudgetMs };
  const found = await searchPackages(user, fetchFn, budget, backoffBaseMs);
  if (found.length === 0) {
    return { user: { username: user, versionsPerDate: {}, versionsPerHour: {} }, packages: [] };
  }

  const window = downloadWindow(now, Math.min(months, 17));
  const names = found.map((object) => object.package.name);
  const [docs, downloads] = await Promise.all([
    Promise.all(
      names.map((name) =>
        fetchJson<RegistryDoc>(
          `https://registry.npmjs.org/${name.replace('/', '%2F')}`,
          fetchFn,
          budget,
          backoffBaseMs,
        ),
      ),
    ),
    fetchDownloads(names, window, fetchFn, budget, backoffBaseMs, spacingMs),
  ]);

  const userVersions: VersionTimes = { versionsPerDate: {}, versionsPerHour: {} };
  const packages: NpmPackageStats[] = found.map((object, i) => {
    const doc = docs[i];
    const times = versionTimes(doc?.time);
    for (const [day, count] of Object.entries(times.versionsPerDate)) {
      userVersions.versionsPerDate[day] = (userVersions.versionsPerDate[day] ?? 0) + count;
    }
    for (const [hour, count] of Object.entries(times.versionsPerHour)) {
      userVersions.versionsPerHour[hour] = (userVersions.versionsPerHour[hour] ?? 0) + count;
    }
    const bugs = typeof doc?.bugs === 'string' ? doc.bugs : doc?.bugs?.url;
    const details: NpmPackageDetails = {
      name: object.package.name,
      description: doc?.description ?? '',
      latestVersion: doc?.['dist-tags']?.latest ?? '',
      license: typeof doc?.license === 'string' ? doc.license : (doc?.license?.type ?? ''),
      keywords: doc?.keywords ?? [],
      links: {
        npm: object.package.links?.npm ?? `https://www.npmjs.com/package/${object.package.name}`,
        ...(doc?.homepage ? { homepage: doc.homepage } : {}),
        ...(cleanRepoUrl(doc?.repository) ? { repository: cleanRepoUrl(doc?.repository) } : {}),
        ...(bugs ? { bugs } : {}),
      },
    };
    return {
      details,
      downloadsPerDate: downloads[object.package.name] ?? {},
      versionsPerDate: times.versionsPerDate,
      versionsPerHour: times.versionsPerHour,
    };
  });

  return { user: { username: user, ...userVersions }, packages };
}
