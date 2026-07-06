import { GitlabApiError, GitlabRateLimitError, GitlabTokenError } from '../errors.js';
import type { FetchFn, GitlabByType } from '../types.js';
import { GITLAB_API } from './api.js';

export const MAX_PAGES = 5;

const USER_AGENT = 'metrics-api (+https://github.com/tamino-martinius/node-metrics-api)';

interface GitlabEvent {
  action_name: string;
  target_type: string | null;
}

function oneYearBefore(now: Date): string {
  const d = new Date(now);
  d.setUTCFullYear(d.getUTCFullYear() - 1);
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
}

async function fetchEventsPage(
  id: number,
  after: string,
  page: number,
  token: string,
  fetchFn: FetchFn,
): Promise<{ events: GitlabEvent[]; totalPages: number }> {
  const url = `${GITLAB_API}/users/${id}/events?after=${after}&per_page=100&page=${page}`;
  const response = await fetchFn(url, {
    headers: { accept: 'application/json', 'user-agent': USER_AGENT, 'private-token': token },
  });
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) throw new GitlabTokenError();
    if (response.status === 429) throw new GitlabRateLimitError();
    throw new GitlabApiError(`gitlab events returned ${response.status}`);
  }
  const events = (await response.json()) as GitlabEvent[];
  return { events, totalPages: Number(response.headers.get('x-total-pages') ?? 1) };
}

function tally(events: GitlabEvent[]): GitlabByType {
  const byType: GitlabByType = { pushes: 0, mergeRequests: 0, issues: 0, comments: 0 };
  for (const e of events) {
    if (e.action_name === 'pushed to' || e.action_name === 'pushed new') byType.pushes++;
    else if (e.target_type === 'MergeRequest') byType.mergeRequests++;
    else if (e.target_type === 'Issue') byType.issues++;
    else if (e.action_name === 'commented on') byType.comments++;
  }
  return byType;
}

export async function fetchGitlabByType(
  id: number,
  { token, fetchFn = fetch, now = new Date() }: { token: string; fetchFn?: FetchFn; now?: Date },
): Promise<{ byType: GitlabByType; truncated: boolean }> {
  const after = oneYearBefore(now);
  const first = await fetchEventsPage(id, after, 1, token, fetchFn);
  const lastPage = Math.min(first.totalPages, MAX_PAGES);
  const rest = await Promise.all(
    Array.from({ length: Math.max(0, lastPage - 1) }, (_v, i) =>
      fetchEventsPage(id, after, i + 2, token, fetchFn).then((r) => r.events),
    ),
  );
  const all = [...first.events, ...rest.flat()];
  return { byType: tally(all), truncated: first.totalPages > MAX_PAGES };
}
