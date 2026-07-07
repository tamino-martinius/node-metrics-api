import { describe, expect, it } from 'vitest';
import { UserNotFoundError } from '../errors.js';
import { enrichGitlabProfile, resolveGitlabUser } from '../gitlab/profile.js';
import type { GitlabProfile } from '../types.js';

function routingFetch() {
  return (async (url: string) => {
    const u = String(url);
    if (u.includes('/users?username=ghost')) return new Response('[]', { status: 200 });
    if (u.includes('/users?username=')) {
      return new Response(
        JSON.stringify([
          {
            id: 64248,
            name: 'Stan Hu',
            username: 'stanhu',
            avatar_url: 'https://a/x',
            web_url: 'https://gitlab.com/stanhu',
          },
        ]),
        { status: 200 },
      );
    }
    if (/\/users\/64248\/followers/.test(u)) return new Response('[]', { status: 200, headers: { 'x-total': '105' } });
    if (/\/users\/64248\/following/.test(u)) return new Response('[]', { status: 200, headers: { 'x-total': '7' } });
    if (/\/users\/64248(\?|$)/.test(u)) {
      return new Response(
        JSON.stringify({
          bio: 'hi',
          location: 'SF',
          created_at: '2013-01-02T00:00:00Z',
          job_title: 'Engineer',
          organization: 'GitLab',
        }),
        { status: 200 },
      );
    }
    return new Response('{}', { status: 404 });
  }) as unknown as typeof fetch;
}

describe('resolveGitlabUser', () => {
  it('resolves id + base profile from the list endpoint', async () => {
    const { id, profile } = await resolveGitlabUser('stanhu', { fetchFn: routingFetch() });
    expect(id).toBe(64248);
    expect(profile).toEqual({
      name: 'Stan Hu',
      username: 'stanhu',
      bio: '',
      avatarUrl: 'https://a/x',
      url: 'https://gitlab.com/stanhu',
      followerCount: 0,
      followingCount: 0,
    });
  });

  it('throws UserNotFoundError on empty result', async () => {
    await expect(resolveGitlabUser('ghost', { fetchFn: routingFetch() })).rejects.toBeInstanceOf(UserNotFoundError);
  });
});

describe('enrichGitlabProfile', () => {
  it('merges rich fields and follower/following counts', async () => {
    const base: GitlabProfile = {
      name: 'Stan Hu',
      username: 'stanhu',
      bio: '',
      avatarUrl: 'https://a/x',
      url: 'https://gitlab.com/stanhu',
      followerCount: 0,
      followingCount: 0,
    };
    const out = await enrichGitlabProfile(64248, base, { token: 't', fetchFn: routingFetch() });
    expect(out).toMatchObject({
      bio: 'hi',
      location: 'SF',
      accountCreatedAt: '2013-01-02T00:00:00Z',
      jobTitle: 'Engineer',
      organization: 'GitLab',
      followerCount: 105,
      followingCount: 7,
    });
  });
});
