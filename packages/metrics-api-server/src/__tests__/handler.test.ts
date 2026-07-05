import { describe, expect, it, vi } from 'vitest';
import { ScrapeError, UserNotFoundError } from '../errors.js';
import { createUserHandler, parseMonths, parseYears } from '../handler.js';
import { isValidGithubUsername } from '../validate.js';

const request = (qs: string): Request => new Request(`https://metrics-api.tamino.dev/api/x?${qs}`);

describe('createUserHandler', () => {
  it('returns JSON with cache and CORS headers on success', async () => {
    const handler = createUserHandler(async ({ user }) => ({ hello: user }), isValidGithubUsername);
    const response = await handler(request('user=octocat'));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ hello: 'octocat' });
    expect(response.headers.get('access-control-allow-origin')).toBe('*');
    expect(response.headers.get('cache-control')).toBe('public, s-maxage=3600, stale-while-revalidate=86400');
    expect(response.headers.get('content-type')).toContain('application/json');
  });

  it('rejects invalid usernames with 400', async () => {
    const handler = createUserHandler(async () => ({}), isValidGithubUsername);
    expect((await handler(request('user=bad//name'))).status).toBe(400);
    expect((await handler(request(''))).status).toBe(400);
  });

  it('maps UserNotFoundError to 404 with short cache', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const handler = createUserHandler(async ({ user }) => {
      throw new UserNotFoundError(user);
    }, isValidGithubUsername);
    const response = await handler(request('user=ghost'));
    expect(response.status).toBe(404);
    expect(response.headers.get('cache-control')).toBe('public, s-maxage=300');
    expect(errorSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it('maps ScrapeError to 502 uncached and unknown errors to 500', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const scrape = createUserHandler(async () => {
      throw new ScrapeError('markup changed');
    }, isValidGithubUsername);
    const scrapeResponse = await scrape(request('user=octocat'));
    expect(scrapeResponse.status).toBe(502);
    expect(scrapeResponse.headers.get('cache-control')).toBe('no-store');

    const boom = createUserHandler(async () => {
      throw new Error('boom');
    }, isValidGithubUsername);
    expect((await boom(request('user=octocat'))).status).toBe(500);
    expect(errorSpy).toHaveBeenCalledTimes(2);
    errorSpy.mockRestore();
  });
});

describe('query parsing', () => {
  const url = (qs: string): URL => new URL(`https://x/?${qs}`);
  it('parses y', () => {
    expect(parseYears(url(''))).toBe('all');
    expect(parseYears(url('y=all'))).toBe('all');
    expect(parseYears(url('y=last'))).toBe('last');
    expect(parseYears(url('y=2016,2017'))).toEqual([2016, 2017]);
    expect(parseYears(url('y=junk'))).toBe('all');
  });
  it('dedupes and caps year lists', () => {
    expect(parseYears(url('y=2024,2024,2025'))).toEqual([2024, 2025]);
    const many = Array.from({ length: 40 }, (_x, i) => 2030 + i).join(',');
    expect(parseYears(url(`y=${many}`))).toHaveLength(30);
  });
  it('parses months clamped to 1..17', () => {
    expect(parseMonths(url(''))).toBe(12);
    expect(parseMonths(url('months=6'))).toBe(6);
    expect(parseMonths(url('months=99'))).toBe(12);
    expect(parseMonths(url('months=abc'))).toBe(12);
  });
});
