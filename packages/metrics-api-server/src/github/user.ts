// UserNotFoundError is thrown from inside the profile scraper; we only rethrow profileR.reason, so it is not imported here.
import { GithubRateLimitError, GithubTokenError } from '../errors.js';
import type {
  FetchFn,
  GithubContributions,
  GithubGraphqlData,
  GithubProfile,
  GithubRepo,
  GithubUser,
} from '../types.js';
import { scrapeGithubContributions } from './contributions.js';
import { fetchGithubGraphql } from './graphql.js';
import { scrapeGithubProfile } from './profile.js';
import { scrapeGithubRepos } from './repos.js';

export function mergeGithubUser(
  profile: GithubProfile,
  repos: GithubRepo[],
  contributions: GithubContributions,
  gql: GithubGraphqlData | null,
): GithubUser {
  if (!gql) return { profile, repos, contributions };

  const mergedProfile: GithubProfile = { ...profile, accountCreatedAt: gql.accountCreatedAt, location: gql.location };

  const byName = new Map(gql.repos.map((r) => [r.name, r]));
  const mergedRepos = repos.map((repo) => {
    const extra = byName.get(repo.name);
    return extra
      ? {
          ...repo,
          defaultBranchCommits: extra.defaultBranchCommits,
          createdAt: extra.createdAt,
          pushedAt: extra.pushedAt,
        }
      : repo;
  });

  const mergedContributions: GithubContributions = { ...contributions };
  if (gql.byType) {
    mergedContributions.byType = gql.byType;
    mergedContributions.privateLastYear = gql.privateLastYear;
  }
  if (gql.lifetimeTotal !== undefined) mergedContributions.lifetimeTotal = gql.lifetimeTotal;

  return { profile: mergedProfile, repos: mergedRepos, contributions: mergedContributions };
}

export interface GetGithubUserOptions {
  years?: 'all' | 'last' | number[];
  serverToken?: string;
  callerToken?: string;
  lifetime?: boolean;
  fetchFn?: FetchFn;
  now?: Date;
}

export async function getGithubUser(user: string, opts: GetGithubUserOptions = {}): Promise<GithubUser> {
  const { years = 'all', serverToken, callerToken, lifetime = false, fetchFn = fetch, now } = opts;
  const token = callerToken ?? serverToken;
  const includeContributions = Boolean(callerToken);

  const [profileR, reposR, contribR, gqlR] = await Promise.allSettled([
    scrapeGithubProfile(user, { fetchFn }),
    scrapeGithubRepos(user, { fetchFn }),
    scrapeGithubContributions(user, { years, fetchFn }),
    token
      ? fetchGithubGraphql(user, {
          token,
          includeContributions,
          includeLifetime: includeContributions && lifetime,
          fetchFn,
          now,
        })
      : Promise.resolve(null),
  ]);

  if (profileR.status === 'rejected') throw profileR.reason; // UserNotFoundError -> 404, ScrapeError -> 502

  const warnings: string[] = [];
  let repos = [] as Awaited<ReturnType<typeof scrapeGithubRepos>>;
  if (reposR.status === 'fulfilled') repos = reposR.value;
  else warnings.push('repos: unavailable');

  let contributions: GithubContributions = { total: {}, contributions: [] };
  if (contribR.status === 'fulfilled') contributions = contribR.value;
  else warnings.push('contributions: unavailable');

  let gql: GithubGraphqlData | null = null;
  if (gqlR.status === 'fulfilled') gql = gqlR.value;
  else {
    const reason = gqlR.reason;
    if (reason instanceof GithubTokenError && callerToken) throw reason; // caller's bad token -> 401
    if (reason instanceof GithubRateLimitError) warnings.push('enrichment: rate limited');
    else warnings.push('enrichment: unavailable');
  }

  const merged = mergeGithubUser(profileR.value, repos, contributions, gql);
  if (warnings.length > 0) merged.warnings = warnings;
  return merged;
}
