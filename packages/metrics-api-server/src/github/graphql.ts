import { GithubRateLimitError, GithubTokenError, ScrapeError } from '../errors.js';
import type { FetchFn, GithubByType, GithubGraphqlData } from '../types.js';

const GITHUB_GRAPHQL = 'https://api.github.com/graphql';
const RATE_LIMIT = 'rateLimit { cost remaining }';

export interface GithubGraphqlOptions {
  token: string;
  includeContributions?: boolean;
  includeLifetime?: boolean;
  fetchFn?: FetchFn;
  now?: Date;
}

export function buildMainQuery(includeContributions: boolean): string {
  const contributions = includeContributions
    ? `contributionsCollection {
        totalCommitContributions
        totalPullRequestContributions
        totalPullRequestReviewContributions
        totalIssueContributions
        restrictedContributionsCount
      }`
    : '';
  return `query ($login: String!) {
    ${RATE_LIMIT}
    user(login: $login) {
      createdAt
      location
      ${contributions}
      repositories(first: 100, privacy: PUBLIC, ownerAffiliations: OWNER, isFork: false, orderBy: { field: PUSHED_AT, direction: DESC }) {
        nodes {
          name
          createdAt
          pushedAt
          defaultBranchRef { target { ... on Commit { history { totalCount } } } }
        }
      }
    }
  }`;
}

// biome-ignore lint/suspicious/noExplicitAny: GraphQL responses are dynamically shaped
type Json = any;

export function normalizeMain(data: Json): Omit<GithubGraphqlData, 'lifetimeTotal'> {
  const user = data?.user;
  if (!user || typeof user.createdAt !== 'string') {
    throw new ScrapeError('github graphql: user node missing createdAt — schema/response may have changed');
  }
  const repos = (user.repositories?.nodes ?? []).map((node: Json) => ({
    name: node.name as string,
    defaultBranchCommits: (node.defaultBranchRef?.target?.history?.totalCount ?? null) as number | null,
    createdAt: node.createdAt as string,
    pushedAt: node.pushedAt as string,
  }));
  const cc = user.contributionsCollection;
  const out: Omit<GithubGraphqlData, 'lifetimeTotal'> = {
    accountCreatedAt: user.createdAt,
    location: (user.location ?? null) as string | null,
    repos,
    rateLimit: { cost: data.rateLimit?.cost ?? 0, remaining: data.rateLimit?.remaining ?? 0 },
  };
  if (cc) {
    const byType: GithubByType = {
      commits: cc.totalCommitContributions ?? 0,
      pullRequests: cc.totalPullRequestContributions ?? 0,
      reviews: cc.totalPullRequestReviewContributions ?? 0,
      issues: cc.totalIssueContributions ?? 0,
    };
    out.byType = byType;
    out.privateLastYear = cc.restrictedContributionsCount ?? 0;
  }
  return out;
}

export function buildLifetimeQuery(startYear: number, endYear: number): string {
  const aliases: string[] = [];
  for (let y = startYear; y <= endYear; y++) {
    aliases.push(
      `y${y}: contributionsCollection(from: "${y}-01-01T00:00:00Z", to: "${y}-12-31T23:59:59Z") {
        totalCommitContributions totalPullRequestContributions totalPullRequestReviewContributions totalIssueContributions restrictedContributionsCount
      }`,
    );
  }
  return `query ($login: String!) { ${RATE_LIMIT} user(login: $login) { ${aliases.join('\n')} } }`;
}

export function sumLifetime(data: Json, startYear: number, endYear: number): number {
  let total = 0;
  for (let y = startYear; y <= endYear; y++) {
    const c = data?.user?.[`y${y}`];
    if (!c) continue;
    total +=
      (c.totalCommitContributions ?? 0) +
      (c.totalPullRequestContributions ?? 0) +
      (c.totalPullRequestReviewContributions ?? 0) +
      (c.totalIssueContributions ?? 0) +
      (c.restrictedContributionsCount ?? 0);
  }
  return total;
}

async function postGraphql(query: string, login: string, token: string, fetchFn: FetchFn): Promise<Json> {
  const response = await fetchFn(GITHUB_GRAPHQL, {
    method: 'POST',
    headers: {
      authorization: `bearer ${token}`,
      'content-type': 'application/json',
      'user-agent': 'metrics-api (+https://github.com/tamino-martinius/node-metrics-api)',
    },
    body: JSON.stringify({ query, variables: { login } }),
  });
  if (response.status === 401 || response.status === 403) {
    // 401 bad creds; 403 is used by GitHub for secondary rate limits.
    if (response.status === 401) throw new GithubTokenError();
    throw new GithubRateLimitError();
  }
  const body = (await response.json()) as Json;
  if (Array.isArray(body.errors) && body.errors.length > 0) {
    const types = body.errors.map((e: Json) => e.type);
    if (types.includes('RATE_LIMITED')) throw new GithubRateLimitError();
    throw new ScrapeError(`github graphql error: ${body.errors[0]?.message ?? 'unknown'}`);
  }
  return body.data;
}

export async function fetchGithubGraphql(user: string, opts: GithubGraphqlOptions): Promise<GithubGraphqlData | null> {
  const { token, includeContributions = false, includeLifetime = false, fetchFn = fetch, now = new Date() } = opts;
  const mainData = await postGraphql(buildMainQuery(includeContributions), user, token, fetchFn);
  if (!mainData?.user) return null;
  const result: GithubGraphqlData = normalizeMain(mainData);
  if (includeLifetime) {
    const startYear = new Date(result.accountCreatedAt).getUTCFullYear();
    const endYear = now.getUTCFullYear();
    const lifeData = await postGraphql(buildLifetimeQuery(startYear, endYear), user, token, fetchFn);
    result.lifetimeTotal = sumLifetime(lifeData, startYear, endYear);
  }
  return result;
}
