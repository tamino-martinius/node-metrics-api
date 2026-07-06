import { describe, expect, it } from 'vitest';
import { GitlabTokenError } from '../errors.js';
import { getGitlabUser } from '../gitlab/user.js';

// Routes every GitLab endpoint used by the orchestrator. `opts` toggles failures.
function routingFetch(opts: { projectsStatus?: number; eventsStatus?: number; detailStatus?: number } = {}) {
  return (async (url: string) => {
    const u = String(url);
    if (u.includes('/users?username=ghost')) return new Response('[]', { status: 200 });
    if (u.includes('/users?username=')) {
      return new Response(JSON.stringify([{ id: 1, name: 'U', username: 'u', avatar_url: 'a', web_url: 'w' }]), {
        status: 200,
      });
    }
    if (/\/users\/1\/followers/.test(u)) return new Response('[]', { status: 200, headers: { 'x-total': '3' } });
    if (/\/users\/1\/following/.test(u)) return new Response('[]', { status: 200, headers: { 'x-total': '1' } });
    if (/\/users\/1\/events/.test(u)) {
      if (opts.eventsStatus) return new Response('[]', { status: opts.eventsStatus });
      const page = new URL(u).searchParams.get('page');
      const body = page === '1' ? [{ action_name: 'pushed to', target_type: null }] : [];
      return new Response(JSON.stringify(body), { status: 200, headers: { 'x-total-pages': '1' } });
    }
    if (/\/users\/1\/projects/.test(u)) {
      if (opts.projectsStatus) return new Response('[]', { status: opts.projectsStatus });
      return new Response(
        JSON.stringify([
          { id: 5, name: 'p', web_url: 'wp', description: 'd', star_count: 1, forks_count: 0, visibility: 'public' },
        ]),
        { status: 200 },
      );
    }
    if (/\/users\/1(\?|$)/.test(u)) {
      if (opts.detailStatus) return new Response('{}', { status: opts.detailStatus });
      return new Response(JSON.stringify({ bio: 'b', location: 'L', created_at: 'c' }), { status: 200 });
    }
    if (/\/projects\/5\/languages/.test(u)) return new Response(JSON.stringify({ TS: 100 }), { status: 200 });
    if (/\/projects\/5\?/.test(u))
      return new Response(JSON.stringify({ statistics: { commit_count: 7 } }), { status: 200 });
    if (u.endsWith('/calendar.json')) return new Response(JSON.stringify({ '2025-07-06': 3 }), { status: 200 });
    return new Response('{}', { status: 404 });
  }) as unknown as typeof fetch;
}

describe('getGitlabUser', () => {
  it('anonymous: public projects, empty counts, no byType, no enrichment', async () => {
    const out = await getGitlabUser('u', { fetchFn: routingFetch() });
    expect(out.profile.username).toBe('u');
    expect(out.profile.accountCreatedAt).toBeUndefined();
    expect(out.profile.followerCount).toBe(0);
    expect(out.projects[0].language).toBeNull();
    expect(out.contributions.total).toEqual({ lastYear: 3 });
    expect(out.contributions.byType).toBeUndefined();
    expect(out.warnings).toBeUndefined();
  });

  it('server token: rich profile, counts, languages, byType', async () => {
    const out = await getGitlabUser('u', { serverToken: 'srv', fetchFn: routingFetch() });
    expect(out.profile.accountCreatedAt).toBe('c');
    expect(out.profile.followerCount).toBe(3);
    expect(out.projects[0].language).toBe('TS');
    expect(out.projects[0].defaultBranchCommits).toBe(7);
    expect(out.contributions.byType).toEqual({ pushes: 1, mergeRequests: 0, issues: 0, comments: 0 });
  });

  it('rethrows GitlabTokenError when a caller token is rejected on projects', async () => {
    await expect(
      getGitlabUser('u', { callerToken: 'bad', fetchFn: routingFetch({ projectsStatus: 401 }) }),
    ).rejects.toBeInstanceOf(GitlabTokenError);
  });

  it('server token rejected on projects degrades to a warning', async () => {
    const out = await getGitlabUser('u', { serverToken: 'srv', fetchFn: routingFetch({ projectsStatus: 401 }) });
    expect(out.projects).toEqual([]);
    expect(out.warnings).toContain('projects: unavailable');
  });

  it('server token: profile enrichment rejection falls back to base profile with a warning', async () => {
    const out = await getGitlabUser('u', { serverToken: 'srv', fetchFn: routingFetch({ detailStatus: 401 }) });
    expect(out.profile.username).toBe('u');
    expect(out.profile.accountCreatedAt).toBeUndefined();
    expect(out.profile.followerCount).toBe(0);
    expect(out.warnings).toContain('profile enrichment: unavailable');
  });

  it('rethrows GitlabTokenError when a caller token is rejected on events (byType)', async () => {
    await expect(
      getGitlabUser('u', { callerToken: 'bad', fetchFn: routingFetch({ eventsStatus: 401 }) }),
    ).rejects.toBeInstanceOf(GitlabTokenError);
  });
});
