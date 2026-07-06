import { describe, expect, it } from 'vitest';
import { bucketLevel, fetchGitlabContributions } from '../gitlab/contributions.js';

const cal = (body: unknown) => (async () => new Response(JSON.stringify(body), { status: 200 })) as unknown as typeof fetch;

describe('bucketLevel', () => {
  it('buckets counts into levels 0..4', () => {
    expect([0, 1, 2, 3, 5, 6, 9, 10, 50].map(bucketLevel)).toEqual([0, 1, 1, 2, 2, 3, 3, 4, 4]);
  });
});

describe('fetchGitlabContributions', () => {
  it('maps calendar.json to sorted ContributionDays with levels and lastYear total', async () => {
    const out = await fetchGitlabContributions('stanhu', {
      fetchFn: cal({ '2025-07-08': 5, '2025-07-06': 0, '2025-07-07': 12 }),
    });
    expect(out.contributions).toEqual([
      { date: '2025-07-06', count: 0, level: 0 },
      { date: '2025-07-07', count: 12, level: 4 },
      { date: '2025-07-08', count: 5, level: 2 },
    ]);
    expect(out.total).toEqual({ lastYear: 17 });
    expect(out.byType).toBeUndefined();
  });

  it('returns empty structure for an empty calendar (private/no public activity)', async () => {
    const out = await fetchGitlabContributions('tamino-martinius', { fetchFn: cal({}) });
    expect(out).toEqual({ total: { lastYear: 0 }, contributions: [] });
  });
});
