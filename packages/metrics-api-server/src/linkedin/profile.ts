import { UserNotFoundError } from '../errors.js';
import type { LinkedinArticle, LinkedinEducation, LinkedinPost, LinkedinProfile, LinkedinProject } from '../types.js';

// biome-ignore lint/suspicious/noExplicitAny: JSON-LD is dynamically shaped
type Json = any;

const LD_JSON_RE = /<script type="application\/ld\+json">(.*?)<\/script>/gs;

// LinkedIn masks fields it won't show logged-out viewers with runs of asterisks (e.g. "*******").
const isMasked = (value: string): boolean => /^[\s*]+$/.test(value);

const names = (list: unknown): string[] =>
  (Array.isArray(list) ? list : [])
    .map((item: Json) => (typeof item === 'string' ? item : item?.name))
    .filter((name: unknown): name is string => typeof name === 'string' && name.trim() !== '' && !isMasked(name));

/** Flattens the JSON-LD nodes across every ld+json block (each is either a node, an array, or an @graph). */
function collectNodes(html: string): Json[] {
  const all: Json[] = [];
  for (const [, raw] of html.matchAll(LD_JSON_RE)) {
    let data: Json;
    try {
      data = JSON.parse(raw);
    } catch {
      continue;
    }
    all.push(...(Array.isArray(data) ? data : Array.isArray(data['@graph']) ? data['@graph'] : [data]));
  }
  return all;
}

/** Reads the count for a schema.org interaction type (e.g. FollowAction, LikeAction) off a node. */
const interactionCount = (node: Json, action: string): number | null => {
  const stats: Json[] = Array.isArray(node.interactionStatistic)
    ? node.interactionStatistic
    : node.interactionStatistic
      ? [node.interactionStatistic]
      : [];
  for (const stat of stats) {
    const type = typeof stat.interactionType === 'object' ? stat.interactionType?.['@type'] : stat.interactionType;
    if (typeof type === 'string' && type.endsWith(action)) return Number(stat.userInteractionCount) || 0;
  }
  return null;
};

// Project links are wrapped in a LinkedIn redirect (…/redir/redirect?url=<encoded>); unwrap to the target.
const unwrapUrl = (url: unknown): string | null => {
  if (typeof url !== 'string' || url === '') return null;
  try {
    const parsed = new URL(url);
    if (parsed.pathname.includes('/redir/redirect')) return parsed.searchParams.get('url') ?? url;
  } catch {
    // not a parseable absolute URL — return as-is below
  }
  return url;
};

const education = (person: Json): LinkedinEducation[] =>
  (Array.isArray(person.alumniOf) ? person.alumniOf : [])
    .filter((org: Json) => typeof org?.name === 'string' && !isMasked(org.name))
    .map((org: Json) => ({
      name: org.name as string,
      startYear: typeof org.member?.startDate === 'number' ? org.member.startDate : null,
      endYear: typeof org.member?.endDate === 'number' ? org.member.endDate : null,
    }));

const byType = (nodes: Json[], type: string): Json[] => nodes.filter((node) => node?.['@type'] === type);

const posts = (nodes: Json[]): LinkedinPost[] =>
  byType(nodes, 'DiscussionForumPosting').map((n) => ({
    text: n.text ?? '',
    url: n.url ?? '',
    publishedAt: n.datePublished ?? '',
    likeCount: interactionCount(n, 'LikeAction'),
  }));

const projects = (nodes: Json[]): LinkedinProject[] =>
  byType(nodes, 'PublicationIssue').map((n) => ({
    name: n.name ?? '',
    url: unwrapUrl(n.url),
    description: n.description ?? '',
  }));

const articles = (nodes: Json[]): LinkedinArticle[] =>
  byType(nodes, 'Article').map((n) => ({
    headline: n.headline ?? '',
    url: n.url ?? '',
    publishedAt: n.datePublished ?? '',
    likeCount: interactionCount(n, 'LikeAction'),
    imageUrl: n.image?.contentUrl ?? n.image?.url ?? null,
  }));

/**
 * Parses the Person node from LinkedIn's server-rendered schema.org JSON-LD @graph, plus the
 * activity nodes (posts, projects/publications, articles) that sit alongside it. A profile that is
 * missing or blocked has no Person node, which is treated as "not found".
 */
export function parseLinkedinProfile(html: string, username: string): LinkedinProfile {
  const nodes = collectNodes(html);
  const person = nodes.find((node) => node?.['@type'] === 'Person');
  if (!person) throw new UserNotFoundError(username);

  return {
    username,
    name: (person.name ?? '').trim(),
    headline: person.description ?? '',
    avatarUrl: person.image?.contentUrl ?? null,
    url: `https://www.linkedin.com/in/${username}`,
    location: person.address?.addressLocality ?? null,
    countryCode: person.address?.addressCountry ?? null,
    followerCount: interactionCount(person, 'FollowAction'),
    languages: names(person.knowsLanguage),
    companies: names(person.worksFor),
    education: education(person),
    posts: posts(nodes),
    projects: projects(nodes),
    articles: articles(nodes),
  };
}
