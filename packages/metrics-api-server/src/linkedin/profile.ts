import { UserNotFoundError } from '../errors.js';
import type { LinkedinEducation, LinkedinProfile } from '../types.js';

// biome-ignore lint/suspicious/noExplicitAny: JSON-LD is dynamically shaped
type Json = any;

const LD_JSON_RE = /<script type="application\/ld\+json">(.*?)<\/script>/gs;

// LinkedIn masks fields it won't show logged-out viewers with runs of asterisks (e.g. "*******").
const isMasked = (value: string): boolean => /^[\s*]+$/.test(value);

const names = (list: unknown): string[] =>
  (Array.isArray(list) ? list : [])
    .map((item: Json) => (typeof item === 'string' ? item : item?.name))
    .filter((name: unknown): name is string => typeof name === 'string' && name.trim() !== '' && !isMasked(name));

function findPerson(html: string): Json | undefined {
  for (const [, raw] of html.matchAll(LD_JSON_RE)) {
    let data: Json;
    try {
      data = JSON.parse(raw);
    } catch {
      continue;
    }
    const nodes: Json[] = Array.isArray(data) ? data : Array.isArray(data['@graph']) ? data['@graph'] : [data];
    const person = nodes.find((node) => node?.['@type'] === 'Person');
    if (person) return person;
  }
  return undefined;
}

const followerCount = (person: Json): number | null => {
  const stats: Json[] = Array.isArray(person.interactionStatistic)
    ? person.interactionStatistic
    : person.interactionStatistic
      ? [person.interactionStatistic]
      : [];
  for (const stat of stats) {
    const type = typeof stat.interactionType === 'object' ? stat.interactionType?.['@type'] : stat.interactionType;
    if (typeof type === 'string' && type.endsWith('FollowAction')) return Number(stat.userInteractionCount) || 0;
  }
  return null;
};

const education = (person: Json): LinkedinEducation[] =>
  (Array.isArray(person.alumniOf) ? person.alumniOf : [])
    .filter((org: Json) => typeof org?.name === 'string' && !isMasked(org.name))
    .map((org: Json) => ({
      name: org.name as string,
      startYear: typeof org.member?.startDate === 'number' ? org.member.startDate : null,
      endYear: typeof org.member?.endDate === 'number' ? org.member.endDate : null,
    }));

/**
 * Parses the Person node from LinkedIn's server-rendered schema.org JSON-LD @graph. A profile that
 * is missing or blocked has no Person node, which is treated as "not found".
 */
export function parseLinkedinProfile(html: string, username: string): LinkedinProfile {
  const person = findPerson(html);
  if (!person) throw new UserNotFoundError(username);

  return {
    username,
    name: (person.name ?? '').trim(),
    headline: person.description ?? '',
    avatarUrl: person.image?.contentUrl ?? null,
    url: `https://www.linkedin.com/in/${username}`,
    location: person.address?.addressLocality ?? null,
    countryCode: person.address?.addressCountry ?? null,
    followerCount: followerCount(person),
    languages: names(person.knowsLanguage),
    companies: names(person.worksFor),
    education: education(person),
  };
}
