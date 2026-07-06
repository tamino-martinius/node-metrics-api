import { ScrapeError } from '../errors.js';
import type { TwitterProfile } from '../types.js';

// biome-ignore lint/suspicious/noExplicitAny: GraphQL responses are dynamically shaped
type Json = any;

/** Maps a `data.user.result` node from X's GraphQL UserByScreenName endpoint into a TwitterProfile. */
export function parseTwitterProfile(result: Json): TwitterProfile {
  const legacy = result?.legacy;
  if (!legacy || typeof legacy.screen_name !== 'string') {
    throw new ScrapeError('twitter: user.result.legacy missing screen_name — GraphQL schema/response may have changed');
  }

  const screenName = legacy.screen_name as string;
  const createdAt = legacy.created_at ? new Date(legacy.created_at).toISOString() : '';
  const website = legacy.entities?.url?.urls?.[0]?.expanded_url ?? null;

  return {
    id: String(result.rest_id ?? ''),
    name: (legacy.name ?? '').trim() || screenName,
    username: screenName,
    bio: legacy.description ?? '',
    avatarUrl: legacy.profile_image_url_https ?? '',
    bannerUrl: legacy.profile_banner_url ?? null,
    url: `https://x.com/${screenName}`,
    website,
    location: legacy.location ?? '',
    createdAt,
    followerCount: legacy.followers_count ?? 0,
    followingCount: legacy.friends_count ?? 0,
    tweetCount: legacy.statuses_count ?? 0,
    likeCount: legacy.favourites_count ?? 0,
    mediaCount: legacy.media_count ?? 0,
    listedCount: legacy.listed_count ?? 0,
    verified: Boolean(result.is_blue_verified ?? legacy.verified ?? false),
  };
}
