import { ScrapeError, UserNotFoundError } from '../errors.js';
import type { FetchFn } from '../types.js';

// LinkedIn serves non-browser user-agents an authwall, so present as a real browser. Requesting
// English keeps field values (languages, locality) in English rather than the request's geo locale.
const BROWSER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

/** Fetches the server-rendered public profile HTML for a vanity slug (embeds the schema.org JSON-LD). */
export async function fetchLinkedinHtml(
  user: string,
  { fetchFn = fetch }: { fetchFn?: FetchFn } = {},
): Promise<string> {
  const url = `https://www.linkedin.com/in/${user}`;
  const response = await fetchFn(url, {
    headers: { 'user-agent': BROWSER_UA, accept: 'text/html', 'accept-language': 'en-US,en;q=0.9' },
  });
  if (response.status === 404) throw new UserNotFoundError(user);
  // 999 is LinkedIn's catch-all anti-bot/rate-limit status (also returned to blocked datacenter IPs);
  // it's ambiguous between "blocked" and "no such profile", so surface it as an upstream failure.
  if (response.status === 999) throw new ScrapeError('linkedin returned 999 (rate-limited or profile unavailable)');
  if (!response.ok) throw new ScrapeError(`linkedin returned ${response.status} for ${url}`);
  return response.text();
}
