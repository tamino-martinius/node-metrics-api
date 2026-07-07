import {
  GithubTokenError,
  GitlabApiError,
  GitlabRateLimitError,
  GitlabTokenError,
  ScrapeError,
  UserNotFoundError,
} from './errors.js';
import { getGithubUser } from './github/user.js';
import { getGitlabUser } from './gitlab/user.js';
import type { FetchFn } from './types.js';
import { isValidGithubUsername, isValidGitlabUsername } from './validate.js';

const json = (data: unknown, status: number, cacheControl: string): Response =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'access-control-allow-origin': '*',
      'cache-control': cacheControl,
    },
  });

export interface HandlerContext {
  user: string;
  url: URL;
}

export function createUserHandler<T>(
  fn: (ctx: HandlerContext) => Promise<T>,
  validateUser: (user: string) => boolean,
): (request: Request) => Promise<Response> {
  return async (request) => {
    const url = new URL(request.url);
    const user = url.searchParams.get('user') ?? '';
    if (!validateUser(user)) return json({ error: 'invalid username' }, 400, 'no-store');
    try {
      return json(await fn({ user, url }), 200, 'public, s-maxage=3600, stale-while-revalidate=86400');
    } catch (error) {
      if (error instanceof UserNotFoundError) return json({ error: error.message }, 404, 'public, s-maxage=300');
      console.error('[metrics-api]', error);
      if (error instanceof ScrapeError) return json({ error: error.message }, 502, 'no-store');
      return json({ error: 'internal error' }, 500, 'no-store');
    }
  };
}

export function parseYears(url: URL): 'all' | 'last' | number[] {
  const y = url.searchParams.get('y');
  if (!y || y === 'all') return 'all';
  if (y === 'last') return 'last';
  const years = y
    .split(',')
    .map(Number)
    .filter((year) => Number.isInteger(year) && year >= 2005 && year <= 2100);
  const unique = [...new Set(years)].slice(0, 30);
  return unique.length > 0 ? unique : 'all';
}

export function parseMonths(url: URL): number {
  const months = Number(url.searchParams.get('months') ?? '12');
  return Number.isInteger(months) && months >= 1 && months <= 17 ? months : 12;
}

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, OPTIONS',
  'access-control-allow-headers': 'authorization',
  'access-control-max-age': '86400',
  vary: 'Authorization',
};

export function parseBearer(header: string | null): string | undefined {
  const match = header?.match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : undefined;
}

export function parseLifetime(url: URL): boolean {
  return url.searchParams.get('lifetime') === '1';
}

const respond = (data: unknown, status: number, cacheControl: string, extra: Record<string, string> = {}): Response =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'access-control-allow-origin': '*',
      'cache-control': cacheControl,
      ...extra,
    },
  });

export async function githubUserResponse(
  request: Request,
  { serverToken, fetchFn = fetch, now }: { serverToken?: string; fetchFn?: FetchFn; now?: Date } = {},
): Promise<Response> {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });

  const url = new URL(request.url);
  const user = url.searchParams.get('user') ?? '';
  const vary = { vary: 'Authorization' };
  if (!isValidGithubUsername(user)) return respond({ error: 'invalid username' }, 400, 'no-store', vary);

  const callerToken = parseBearer(request.headers.get('authorization'));
  try {
    const result = await getGithubUser(user, {
      years: parseYears(url),
      serverToken,
      callerToken,
      lifetime: parseLifetime(url),
      fetchFn,
      now,
    });
    const cacheControl = callerToken ? 'private, no-store' : 'public, s-maxage=3600, stale-while-revalidate=86400';
    return respond(result, 200, cacheControl, vary);
  } catch (error) {
    if (error instanceof UserNotFoundError) return respond({ error: error.message }, 404, 'public, s-maxage=300', vary);
    if (error instanceof GithubTokenError)
      return respond({ error: 'github token was rejected' }, 401, 'no-store', vary);
    // Log the error only — never the request headers/token.
    console.error('[metrics-api]', error);
    if (error instanceof ScrapeError) return respond({ error: error.message }, 502, 'no-store', vary);
    return respond({ error: 'internal error' }, 500, 'no-store', vary);
  }
}

export async function gitlabUserResponse(
  request: Request,
  { serverToken, fetchFn = fetch, now }: { serverToken?: string; fetchFn?: FetchFn; now?: Date } = {},
): Promise<Response> {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });

  const url = new URL(request.url);
  const user = url.searchParams.get('user') ?? '';
  const vary = { vary: 'Authorization' };
  if (!isValidGitlabUsername(user)) return respond({ error: 'invalid username' }, 400, 'no-store', vary);

  const callerToken = parseBearer(request.headers.get('authorization'));
  try {
    const result = await getGitlabUser(user, { serverToken, callerToken, fetchFn, now });
    const cacheControl = callerToken ? 'private, no-store' : 'public, s-maxage=3600, stale-while-revalidate=86400';
    return respond(result, 200, cacheControl, vary);
  } catch (error) {
    if (error instanceof UserNotFoundError) return respond({ error: error.message }, 404, 'public, s-maxage=300', vary);
    if (error instanceof GitlabTokenError)
      return respond({ error: 'gitlab token was rejected' }, 401, 'no-store', vary);
    if (error instanceof GitlabRateLimitError) return respond({ error: 'gitlab rate limited' }, 429, 'no-store', vary);
    // Log the error only — never the request headers/token.
    console.error('[metrics-api]', error);
    if (error instanceof GitlabApiError) return respond({ error: error.message }, 502, 'no-store', vary);
    return respond({ error: 'internal error' }, 500, 'no-store', vary);
  }
}
