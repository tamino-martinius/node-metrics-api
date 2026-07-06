import { describe, expect, it, vi } from 'vitest';
import { gitlabUserResponse } from '../handler.js';

function routingFetch(opts: { projectsStatus?: number } = {}) {
  return (async (url: string) => {
    const u = String(url);
    if (u.includes('/users?username=')) {
      return new Response(JSON.stringify([{ id: 1, name: 'U', username: 'u', avatar_url: 'a', web_url: 'w' }]), {
        status: 200,
      });
    }
    if (/\/users\/1\/followers/.test(u)) return new Response('[]', { status: 200, headers: { 'x-total': '3' } });
    if (/\/users\/1\/following/.test(u)) return new Response('[]', { status: 200, headers: { 'x-total': '1' } });
    if (/\/users\/1\/events/.test(u)) {
      if (opts.projectsStatus) return new Response('[]', { status: 401 });
      const page = new URL(u).searchParams.get('page');
      return new Response(JSON.stringify(page === '1' ? [{ action_name: 'pushed to', target_type: null }] : []), {
        status: 200,
        headers: { 'x-total-pages': '1' },
      });
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
    if (/\/users\/1(\?|$)/.test(u)) return new Response(JSON.stringify({ bio: 'b', created_at: 'c' }), { status: 200 });
    if (/\/projects\/5\/languages/.test(u)) return new Response(JSON.stringify({ TS: 100 }), { status: 200 });
    if (/\/projects\/5\?/.test(u))
      return new Response(JSON.stringify({ statistics: { commit_count: 7 } }), { status: 200 });
    if (u.endsWith('/calendar.json')) return new Response(JSON.stringify({ '2025-07-06': 3 }), { status: 200 });
    return new Response('{}', { status: 404 });
  }) as unknown as typeof fetch;
}

const req = (qs: string, headers?: Record<string, string>, method = 'GET') =>
  new Request(`https://metrics-api.tamino.dev/api/gitlab/user?${qs}`, { method, headers });

describe('gitlabUserResponse', () => {
  it('anonymous: public cache + Vary, no enrichment', async () => {
    const res = await gitlabUserResponse(req('user=u'), { fetchFn: routingFetch() });
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('public, s-maxage=3600, stale-while-revalidate=86400');
    expect(res.headers.get('vary')).toBe('Authorization');
    expect((await res.json()).profile.accountCreatedAt).toBeUndefined();
  });

  it('server token: enrichment present, still cached', async () => {
    const res = await gitlabUserResponse(req('user=u'), { serverToken: 'srv', fetchFn: routingFetch() });
    expect(res.headers.get('cache-control')).toBe('public, s-maxage=3600, stale-while-revalidate=86400');
    expect((await res.json()).profile.accountCreatedAt).toBe('c');
  });

  it('caller token: no-store', async () => {
    const res = await gitlabUserResponse(req('user=u', { authorization: 'Bearer tok' }), { fetchFn: routingFetch() });
    expect(res.headers.get('cache-control')).toBe('private, no-store');
  });

  it('OPTIONS preflight → 204 advertising Authorization', async () => {
    const res = await gitlabUserResponse(req('user=u', {}, 'OPTIONS'));
    expect(res.status).toBe(204);
    expect(res.headers.get('access-control-allow-headers')?.toLowerCase()).toContain('authorization');
    expect(res.headers.get('vary')).toBe('Authorization');
  });

  it('invalid username → 400 no-store', async () => {
    const res = await gitlabUserResponse(req('user=has/slash'), { fetchFn: routingFetch() });
    expect(res.status).toBe(400);
    expect(res.headers.get('cache-control')).toBe('no-store');
  });

  it('bad caller token → 401 and token never logged', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await gitlabUserResponse(req('user=u', { authorization: 'Bearer s3cr3t-token' }), {
      fetchFn: routingFetch({ projectsStatus: 401 }),
    });
    expect(res.status).toBe(401);
    expect(res.headers.get('cache-control')).toBe('no-store');
    const logged = errorSpy.mock.calls.flat().map(String).join(' ');
    expect(logged).not.toContain('s3cr3t-token');
    errorSpy.mockRestore();
  });
});
