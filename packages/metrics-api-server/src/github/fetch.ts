import { ScrapeError, UserNotFoundError } from '../errors.js';
import type { FetchFn } from '../types.js';

const HEADERS = {
  accept: 'text/html',
  'accept-language': 'en-US,en;q=0.9',
  'user-agent': 'metrics-api (+https://github.com/tamino-martinius/node-metrics-api)',
};

export interface FetchGithubHtmlOptions {
  /**
   * GitHub serves a Turbo/PJAX fragment (missing <head>, og:image, follower counts, ...) instead of a
   * full document when `x-requested-with: XMLHttpRequest` is sent to the plain profile URL — but the
   * `?tab=contributions` year-list endpoint requires that same header to include the year links at all.
   * Callers opt in per-request instead of sending it globally.
   */
  xhr?: boolean;
}

export async function fetchGithubHtml(
  url: string,
  user: string,
  fetchFn: FetchFn,
  { xhr = false }: FetchGithubHtmlOptions = {},
): Promise<string> {
  const headers = {
    ...HEADERS,
    referer: `https://github.com/${user}`,
    ...(xhr ? { 'x-requested-with': 'XMLHttpRequest' } : {}),
  };
  const response = await fetchFn(url, { headers });
  if (response.status === 404) throw new UserNotFoundError(user);
  if (!response.ok) throw new ScrapeError(`github returned ${response.status} for ${url}`);
  return response.text();
}
