import { ScrapeError, UserNotFoundError } from './errors.js';

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
