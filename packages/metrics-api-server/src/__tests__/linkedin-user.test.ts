import { describe, expect, it } from 'vitest';
import { ScrapeError, UserNotFoundError } from '../errors.js';
import { getLinkedinUser } from '../linkedin/user.js';

const PROFILE_HTML = `<html><head>
<script type="application/ld+json">{"@graph":[{"@type":"Person","name":"Jane Doe","interactionStatistic":{"interactionType":"https://schema.org/FollowAction","userInteractionCount":500}}]}</script>
</head></html>`;

function recordingFetch(opts: { status?: number; body?: string } = {}) {
  const status = opts.status ?? 200;
  const body = opts.body ?? PROFILE_HTML;
  const calls: Array<{ url: string; headers: Headers }> = [];
  const fetchFn = (async (url: string | URL, init?: RequestInit) => {
    calls.push({ url: String(url), headers: new Headers(init?.headers) });
    // Hand-rolled response: the Response constructor rejects non-standard statuses like LinkedIn's 999.
    return { status, ok: status >= 200 && status < 300, text: async () => body };
  }) as unknown as typeof fetch;
  return { calls, fetchFn };
}

describe('getLinkedinUser', () => {
  it('fetches the www profile once (browser UA, English) and returns the parsed profile', async () => {
    const { calls, fetchFn } = recordingFetch();
    const out = await getLinkedinUser('jane-doe', { fetchFn });
    expect(out.profile.name).toBe('Jane Doe');
    expect(out.profile.followerCount).toBe(500);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('https://www.linkedin.com/in/jane-doe');
    expect(calls[0].headers.get('user-agent')).toMatch(/Mozilla/);
    expect(calls[0].headers.get('accept-language')).toMatch(/en/);
  });

  it('throws UserNotFoundError on a 200 page without a Person node', async () => {
    const { fetchFn } = recordingFetch({ body: '<html><head></head><body>nope</body></html>' });
    await expect(getLinkedinUser('ghost', { fetchFn })).rejects.toBeInstanceOf(UserNotFoundError);
  });

  it('throws UserNotFoundError on a 404 status', async () => {
    const { fetchFn } = recordingFetch({ status: 404, body: '' });
    await expect(getLinkedinUser('ghost', { fetchFn })).rejects.toBeInstanceOf(UserNotFoundError);
  });

  it('throws ScrapeError on a 999 (LinkedIn block/rate-limit)', async () => {
    const { fetchFn } = recordingFetch({ status: 999, body: '' });
    await expect(getLinkedinUser('jane-doe', { fetchFn })).rejects.toBeInstanceOf(ScrapeError);
  });

  it('throws ScrapeError on an upstream error status', async () => {
    const { fetchFn } = recordingFetch({ status: 503, body: 'busy' });
    await expect(getLinkedinUser('jane-doe', { fetchFn })).rejects.toBeInstanceOf(ScrapeError);
  });
});
