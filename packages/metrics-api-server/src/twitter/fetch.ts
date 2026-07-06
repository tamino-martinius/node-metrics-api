import { ScrapeError, UserNotFoundError } from '../errors.js';
import type { FetchFn } from '../types.js';

// The public web-app bearer token x.com itself uses for logged-out/guest requests. Not a secret —
// it is identical for every visitor and ships in the site's JS. X rotates it very rarely; the
// nightly smoke test guards against that.
const BEARER = 'AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs=1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA';

// Persisted-query id for the UserByScreenName GraphQL operation. X rotates these whenever it
// redeploys its web client; when it changes the request 404s and the nightly smoke test catches
// it. Refresh from the current x.com JS bundle when that happens.
const USER_BY_SCREEN_NAME_QUERY_ID = 'G3KGOASz96M-Qu0nwmGXNg';

const GUEST_ACTIVATE_URL = 'https://api.twitter.com/1.1/guest/activate.json';
const GRAPHQL_BASE = 'https://api.twitter.com/graphql';

// X rejects requests from non-browser user-agents, so present as a real browser.
const BROWSER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// Feature flags UserByScreenName expects. X occasionally adds required flags; a missing one makes
// the request 400 (again, caught by the nightly smoke test).
const FEATURES = {
  hidden_profile_likes_enabled: true,
  hidden_profile_subscriptions_enabled: true,
  responsive_web_graphql_exclude_directive_enabled: true,
  verified_phone_label_enabled: false,
  subscriptions_verification_info_is_identity_verified_enabled: true,
  subscriptions_verification_info_verified_since_enabled: true,
  highlights_tweets_tab_ui_enabled: true,
  responsive_web_twitter_article_notes_tab_enabled: true,
  creator_subscriptions_tweet_preview_api_enabled: true,
  responsive_web_graphql_skip_user_profile_image_extensions_enabled: false,
  responsive_web_graphql_timeline_navigation_enabled: true,
};

// biome-ignore lint/suspicious/noExplicitAny: GraphQL responses are dynamically shaped
type Json = any;

/** Requests a short-lived guest token from X's activation endpoint. */
export async function activateGuestToken(fetchFn: FetchFn): Promise<string> {
  const response = await fetchFn(GUEST_ACTIVATE_URL, {
    method: 'POST',
    headers: { authorization: `Bearer ${BEARER}`, 'user-agent': BROWSER_UA },
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new ScrapeError(
      `twitter guest activation failed: ${response.status}${detail ? `: ${detail.slice(0, 200)}` : ''}`,
    );
  }
  const body = (await response.json()) as { guest_token?: string };
  if (!body.guest_token) throw new ScrapeError('twitter guest activation returned no token');
  return body.guest_token;
}

export interface FetchTwitterUserOptions {
  /** Reuse an existing guest token; a fresh one is activated when omitted. */
  guestToken?: string;
  fetchFn?: FetchFn;
}

/** Fetches the raw `data.user.result` node for a handle via the guest-authed GraphQL endpoint. */
export async function fetchTwitterUserRaw(user: string, opts: FetchTwitterUserOptions = {}): Promise<Json> {
  const { fetchFn = fetch } = opts;
  const guestToken = opts.guestToken ?? (await activateGuestToken(fetchFn));

  const params = new URLSearchParams({
    variables: JSON.stringify({ screen_name: user, withSafetyModeUserFields: true }),
    features: JSON.stringify(FEATURES),
  });
  const url = `${GRAPHQL_BASE}/${USER_BY_SCREEN_NAME_QUERY_ID}/UserByScreenName?${params}`;

  const response = await fetchFn(url, {
    headers: { authorization: `Bearer ${BEARER}`, 'x-guest-token': guestToken, 'user-agent': BROWSER_UA },
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new ScrapeError(
      `twitter returned ${response.status} for UserByScreenName${detail ? `: ${detail.slice(0, 300)}` : ''}`,
    );
  }

  const body = (await response.json()) as Json;
  const result = body?.data?.user?.result;
  if (!result || result.__typename === 'UserUnavailable') throw new UserNotFoundError(user);
  return result;
}
