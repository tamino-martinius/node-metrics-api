import { ScrapeError } from '../errors.js';
import { attr, decodeEntities, parseCount, squash } from '../html.js';
import type { FetchFn, GithubOrganization, GithubProfile } from '../types.js';
import { fetchGithubHtml } from './fetch.js';

const socialCount = (squashed: string, tab: 'followers' | 'following'): number => {
  const pattern = new RegExp(`tab=${tab}"[^>]*>(?:(?!</?a\\b).)*?<span class="text-bold[^"]*">([^<]+)</span>`);
  const match = squashed.match(pattern);
  return match ? parseCount(match[1]) : 0;
};

function parseOrganizations(squashed: string): GithubOrganization[] {
  const organizations: GithubOrganization[] = [];
  for (const match of squashed.matchAll(/<a\b[^>]*\bclass="[^"]*avatar-group-item[^"]*"[^>]*>\s*<img\b[^>]*>/g)) {
    const [block] = match;
    if (attr(block, 'data-hovercard-type') !== 'organization') continue;
    const href = attr(block, 'href');
    const img = block.match(/<img\b[^>]*>/);
    const src = img ? attr(img[0], 'src') : null;
    if (!href || !src) continue;
    organizations.push({
      name: href.replace(/^\//, ''),
      avatarUrl: decodeEntities(src),
      url: `https://github.com${href}`,
    });
  }
  return organizations;
}

export function parseProfileHtml(html: string, username: string): GithubProfile {
  const squashed = squash(html);
  const avatar = squashed.match(/<meta property="og:image" content="([^"]*)"/);
  if (!avatar) throw new ScrapeError('profile avatar (og:image) not found — GitHub markup may have changed');
  const name = squashed.match(/<span class="p-name[^"]*"[^>]*>([^<]*)<\/span>/);
  const bio = squashed.match(/class="p-note[^"]*"[^>]*\bdata-bio-text="([^"]*)"/);

  return {
    name: decodeEntities(name?.[1] ?? '').trim() || username,
    username,
    bio: decodeEntities(bio?.[1] ?? '').trim(),
    avatarUrl: decodeEntities(avatar[1]),
    url: `https://github.com/${username}`,
    followerCount: socialCount(squashed, 'followers'),
    followingCount: socialCount(squashed, 'following'),
    organizations: parseOrganizations(squashed),
  };
}

export async function scrapeGithubProfile(
  user: string,
  { fetchFn = fetch }: { fetchFn?: FetchFn } = {},
): Promise<GithubProfile> {
  const html = await fetchGithubHtml(`https://github.com/${user}`, user, fetchFn);
  return parseProfileHtml(html, user);
}
