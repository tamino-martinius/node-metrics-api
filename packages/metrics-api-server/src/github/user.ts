import type { GithubContributions, GithubGraphqlData, GithubProfile, GithubRepo, GithubUser } from '../types.js';

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
