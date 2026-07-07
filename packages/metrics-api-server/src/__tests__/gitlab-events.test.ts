import { describe, expect, it } from 'vitest';
import { fetchGitlabByType } from '../gitlab/events.js';

const events = [
  { action_name: 'pushed to', target_type: null },
  { action_name: 'pushed new', target_type: null },
  { action_name: 'opened', target_type: 'MergeRequest' },
  { action_name: 'closed', target_type: 'MergeRequest' },
  { action_name: 'opened', target_type: 'Issue' },
  { action_name: 'commented on', target_type: 'DiffNote' },
  { action_name: 'joined', target_type: null }, // ignored
];

function routingFetch(totalPages: string) {
  return (async (url: string) => {
    const u = String(url);
    const page = new URL(u).searchParams.get('page');
    const body = page === '1' ? events : [];
    return new Response(JSON.stringify(body), { status: 200, headers: { 'x-total-pages': totalPages } });
  }) as unknown as typeof fetch;
}

describe('fetchGitlabByType', () => {
  it('tallies events by action_name and target_type', async () => {
    const out = await fetchGitlabByType(1, {
      token: 't',
      now: new Date('2026-07-06T00:00:00Z'),
      fetchFn: routingFetch('1'),
    });
    expect(out.byType).toEqual({ pushes: 2, mergeRequests: 2, issues: 1, comments: 1 });
    expect(out.truncated).toBe(false);
  });

  it('flags truncation when total pages exceed the cap', async () => {
    const out = await fetchGitlabByType(1, {
      token: 't',
      now: new Date('2026-07-06T00:00:00Z'),
      fetchFn: routingFetch('9'),
    });
    expect(out.truncated).toBe(true);
  });
});
