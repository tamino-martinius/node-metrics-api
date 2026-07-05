import { ScrapeError, UserNotFoundError } from '../errors.js';
import type { FetchFn } from '../types.js';

const HEADERS = {
  accept: 'text/html',
  'accept-language': 'en-US,en;q=0.9',
  'user-agent': 'metrics-api (+https://github.com/tamino-martinius/node-metrics-api)',
  'x-requested-with': 'XMLHttpRequest',
};

export async function fetchGithubHtml(url: string, user: string, fetchFn: FetchFn): Promise<string> {
  const response = await fetchFn(url, { headers: { ...HEADERS, referer: `https://github.com/${user}` } });
  if (response.status === 404) throw new UserNotFoundError(user);
  if (!response.ok) throw new ScrapeError(`github returned ${response.status} for ${url}`);
  return response.text();
}
