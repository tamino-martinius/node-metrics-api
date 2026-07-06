import { ScrapeError, UserNotFoundError } from '../errors.js';
import type { FetchFn } from '../types.js';

// x.com serves crawler user-agents a reduced og-card without the JSON-LD, so present as a real
// browser to get the full server-rendered profile page.
const BROWSER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

/** Fetches the server-rendered profile HTML for a handle (which embeds the schema.org JSON-LD). */
export async function fetchTwitterHtml(user: string, { fetchFn = fetch }: { fetchFn?: FetchFn } = {}): Promise<string> {
  const url = `https://x.com/${user}`;
  const response = await fetchFn(url, {
    headers: { 'user-agent': BROWSER_UA, accept: 'text/html', 'accept-language': 'en-US,en;q=0.9' },
  });
  if (response.status === 404) throw new UserNotFoundError(user);
  if (!response.ok) throw new ScrapeError(`twitter returned ${response.status} for ${url}`);
  return response.text();
}
