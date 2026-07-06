import type { FetchFn, GitlabProject } from '../types.js';
import { gitlabApiFetch } from './api.js';

export const TOP_N = 8;

interface GitlabProjectPayload {
  id: number;
  name: string;
  web_url: string;
  description: string | null;
  star_count: number;
  forks_count: number;
  visibility: 'public' | 'internal' | 'private';
  forked_from_project?: unknown;
  created_at?: string;
  last_activity_at?: string;
}

function toProject(p: GitlabProjectPayload): GitlabProject & { id: number } {
  return {
    id: p.id,
    name: p.name,
    url: p.web_url,
    description: p.description ?? '',
    language: null,
    stargazerCount: p.star_count,
    forkCount: p.forks_count,
    isFork: Boolean(p.forked_from_project),
    visibility: p.visibility,
    createdAt: p.created_at,
    lastActivityAt: p.last_activity_at,
  };
}

function primaryLanguage(langs: Record<string, number>): string | null {
  let best: string | null = null;
  let bestPct = -1;
  for (const [lang, pct] of Object.entries(langs)) {
    if (pct > bestPct) {
      best = lang;
      bestPct = pct;
    }
  }
  return best;
}

export async function fetchGitlabProjects(
  id: number,
  { token, fetchFn = fetch }: { token?: string; fetchFn?: FetchFn } = {},
): Promise<GitlabProject[]> {
  const payload = await gitlabApiFetch<GitlabProjectPayload[]>(
    `/users/${id}/projects?per_page=100&order_by=star_count&sort=desc`,
    { token, fetchFn },
  );
  const projects = payload.map(toProject);
  if (!token) return projects.map(({ id: _id, ...rest }) => rest);

  await Promise.all(
    projects.slice(0, TOP_N).map(async (project) => {
      try {
        const [langs, detail] = await Promise.all([
          gitlabApiFetch<Record<string, number>>(`/projects/${project.id}/languages`, { token, fetchFn }),
          gitlabApiFetch<{ statistics?: { commit_count?: number } }>(`/projects/${project.id}?statistics=true`, {
            token,
            fetchFn,
          }),
        ]);
        project.language = primaryLanguage(langs);
        project.defaultBranchCommits = detail.statistics?.commit_count ?? null;
      } catch {
        // A single project's enrichment (languages/statistics) failing (403/404/etc. for a
        // private/deleted project surfaced in a token-scoped list) must not take down the
        // whole list. Leave this project's language/defaultBranchCommits at their defaults.
        project.language = null;
        project.defaultBranchCommits = null;
      }
    }),
  );
  return projects.map(({ id: _id, ...rest }) => rest);
}
