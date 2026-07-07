import { UserNotFoundError } from '../errors.js';
import type { TwitterProfile } from '../types.js';

// biome-ignore lint/suspicious/noExplicitAny: JSON-LD is dynamically shaped
type Json = any;

const LD_JSON_RE = /<script type="application\/ld\+json"[^>]*>(.*?)<\/script>/gs;

const interactionCount = (person: Json, action: string): number => {
  const stats: Json[] = Array.isArray(person.interactionStatistic) ? person.interactionStatistic : [];
  for (const stat of stats) {
    const type = typeof stat.interactionType === 'object' ? stat.interactionType?.['@type'] : stat.interactionType;
    if (typeof type === 'string' && type.endsWith(action)) return Number(stat.userInteractionCount) || 0;
  }
  return 0;
};

/**
 * Parses the schema.org JSON-LD that x.com server-renders for a plain browser GET. The profile
 * lives in a ProfilePage block whose `mainEntity` is the Person. A nonexistent handle still
 * returns HTTP 200 but omits that block, so its absence means "not found".
 */
export function parseTwitterProfile(html: string, username: string): TwitterProfile {
  let person: Json | undefined;
  let dateCreated = '';
  for (const [, raw] of html.matchAll(LD_JSON_RE)) {
    let data: Json;
    try {
      data = JSON.parse(raw);
    } catch {
      continue;
    }
    if (data?.['@type'] === 'ProfilePage' && data.mainEntity) {
      person = data.mainEntity;
      dateCreated = typeof data.dateCreated === 'string' ? data.dateCreated : '';
      break;
    }
  }
  if (!person) throw new UserNotFoundError(username);

  const handle = typeof person.additionalName === 'string' ? person.additionalName : username;
  const sameAs = person.sameAs;
  const website = typeof sameAs === 'string' ? sameAs : Array.isArray(sameAs) ? (sameAs[0] ?? null) : null;
  const bannerMatch = html.match(/profile_banners\/\d+\/\d+/);

  return {
    id: String(person.identifier ?? ''),
    name: (person.name ?? '').trim() || handle,
    username: handle,
    bio: person.description ?? '',
    avatarUrl: person.image?.contentUrl ?? '',
    bannerUrl: bannerMatch ? `https://pbs.twimg.com/${bannerMatch[0]}` : null,
    url: typeof person.url === 'string' ? person.url : `https://x.com/${handle}`,
    website,
    location: person.homeLocation?.name ?? '',
    createdAt: dateCreated,
    followerCount: interactionCount(person, 'FollowAction'),
    followingCount: interactionCount(person, 'SubscribeAction'),
    tweetCount: interactionCount(person, 'WriteAction'),
  };
}
