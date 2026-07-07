import { describe, expect, it } from 'vitest';
import { fetchGitlabProjects } from '../gitlab/projects.js';

const projectsPayload = [
  {
    id: 10,
    name: 'alpha',
    web_url: 'https://gitlab.com/u/alpha',
    description: 'a',
    star_count: 9,
    forks_count: 2,
    visibility: 'public',
    created_at: '2019-01-01T00:00:00Z',
    last_activity_at: '2020-01-01T00:00:00Z',
  },
  {
    id: 11,
    name: 'beta',
    web_url: 'https://gitlab.com/u/beta',
    description: null,
    star_count: 0,
    forks_count: 0,
    visibility: 'private',
    forked_from_project: { id: 99 },
    created_at: '2018-01-01T00:00:00Z',
    last_activity_at: '2018-02-01T00:00:00Z',
  },
];

function routingFetch() {
  return (async (url: string) => {
    const u = String(url);
    if (/\/users\/1\/projects/.test(u)) return new Response(JSON.stringify(projectsPayload), { status: 200 });
    if (/\/projects\/10\/languages/.test(u))
      return new Response(JSON.stringify({ Ruby: 80.0, Shell: 20.0 }), { status: 200 });
    if (/\/projects\/11\/languages/.test(u)) return new Response(JSON.stringify({}), { status: 200 });
    if (/\/projects\/10\?/.test(u))
      return new Response(JSON.stringify({ statistics: { commit_count: 42 } }), { status: 200 });
    if (/\/projects\/11\?/.test(u))
      return new Response(JSON.stringify({ statistics: { commit_count: 3 } }), { status: 200 });
    return new Response('{}', { status: 404 });
  }) as unknown as typeof fetch;
}

describe('fetchGitlabProjects', () => {
  it('maps base fields without a token (no language/commits)', async () => {
    const projects = await fetchGitlabProjects(1, { fetchFn: routingFetch() });
    expect(projects[0]).toEqual({
      name: 'alpha',
      url: 'https://gitlab.com/u/alpha',
      description: 'a',
      language: null,
      stargazerCount: 9,
      forkCount: 2,
      isFork: false,
      visibility: 'public',
      createdAt: '2019-01-01T00:00:00Z',
      lastActivityAt: '2020-01-01T00:00:00Z',
    });
    expect(projects[1].isFork).toBe(true);
    expect(projects[1].description).toBe('');
    expect(projects[0].defaultBranchCommits).toBeUndefined();
  });

  it('enriches top-N with primary language and commit count when a token is present', async () => {
    const projects = await fetchGitlabProjects(1, { token: 't', fetchFn: routingFetch() });
    expect(projects[0].language).toBe('Ruby');
    expect(projects[0].defaultBranchCommits).toBe(42);
    expect(projects[1].language).toBeNull(); // empty languages map
    expect(projects[1].defaultBranchCommits).toBe(3);
  });

  it('isolates a single project enrichment failure without dropping the rest of the list', async () => {
    // 9 projects: exercises the TOP_N=8 slice cap (index 8 must never be enriched), and one of
    // the top-8 (id 13) fails its /languages call — that must not take down the other 7 or drop
    // any project from the returned list.
    const manyProjectsPayload = Array.from({ length: 9 }, (_v, i) => ({
      id: 10 + i,
      name: `project-${i}`,
      web_url: `https://gitlab.com/u/project-${i}`,
      description: null,
      star_count: 9 - i,
      forks_count: 0,
      visibility: 'public' as const,
      created_at: '2019-01-01T00:00:00Z',
      last_activity_at: '2020-01-01T00:00:00Z',
    }));

    const fetchFn = (async (url: string) => {
      const u = String(url);
      if (/\/users\/1\/projects/.test(u)) return new Response(JSON.stringify(manyProjectsPayload), { status: 200 });
      if (/\/projects\/13\/languages/.test(u)) return new Response('{}', { status: 403 });
      if (/\/projects\/\d+\/languages/.test(u)) return new Response(JSON.stringify({ Ruby: 100.0 }), { status: 200 });
      if (/\/projects\/\d+\?/.test(u))
        return new Response(JSON.stringify({ statistics: { commit_count: 7 } }), { status: 200 });
      return new Response('{}', { status: 404 });
    }) as unknown as typeof fetch;

    const projects = await fetchGitlabProjects(1, { token: 't', fetchFn });

    // Nothing dropped: all 9 projects are still present.
    expect(projects).toHaveLength(9);

    // The failing project (id 13 -> index 3) is isolated: null language/commits, not thrown away.
    const failed = projects[3];
    expect(failed.language).toBeNull();
    expect(failed.defaultBranchCommits).toBeNull();

    // The other top-8 projects still enriched successfully.
    for (const i of [0, 1, 2, 4, 5, 6, 7]) {
      expect(projects[i].language).toBe('Ruby');
      expect(projects[i].defaultBranchCommits).toBe(7);
    }

    // Beyond TOP_N=8 (index 8): never enriched at all.
    expect(projects[8].language).toBeNull();
    expect(projects[8].defaultBranchCommits).toBeUndefined();
  });
});
