import { describe, expect, it } from 'vitest';
import { ScrapeError, UserNotFoundError } from '../errors.js';
import { getTwitterUser } from '../twitter/user.js';

const PROFILE_HTML = `<html><head>
<script type="application/ld+json">{"@type":"ProfilePage","dateCreated":"2006-03-21T20:50:14.000Z","mainEntity":{"@type":"Person","additionalName":"jack","name":"jack","identifier":"12","description":"","image":{"contentUrl":"https://pbs.twimg.com/a.jpg"},"interactionStatistic":[{"interactionType":"https://schema.org/FollowAction","userInteractionCount":9665639}]}}</script>
</head></html>`;

function recordingFetch(opts: { status?: number; body?: string } = {}) {
  const calls: Array<{ url: string; headers: Headers }> = [];
  const fetchFn = (async (url: string | URL, init?: RequestInit) => {
    calls.push({ url: String(url), headers: new Headers(init?.headers) });
    return new Response(opts.body ?? PROFILE_HTML, { status: opts.status ?? 200 });
  }) as unknown as typeof fetch;
  return { calls, fetchFn };
}

describe('getTwitterUser', () => {
  it('fetches the profile HTML once (browser UA) and returns the parsed profile', async () => {
    const { calls, fetchFn } = recordingFetch();
    const out = await getTwitterUser('jack', { fetchFn });
    expect(out.profile.username).toBe('jack');
    expect(out.profile.followerCount).toBe(9665639);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('https://x.com/jack');
    expect(calls[0].headers.get('user-agent')).toMatch(/Mozilla/);
  });

  it('throws UserNotFoundError on a 200 page without ProfilePage JSON-LD', async () => {
    const { fetchFn } = recordingFetch({ body: '<html><head></head><body>nope</body></html>' });
    await expect(getTwitterUser('ghost', { fetchFn })).rejects.toBeInstanceOf(UserNotFoundError);
  });

  it('throws UserNotFoundError on a 404 status', async () => {
    const { fetchFn } = recordingFetch({ status: 404, body: '' });
    await expect(getTwitterUser('ghost', { fetchFn })).rejects.toBeInstanceOf(UserNotFoundError);
  });

  it('throws ScrapeError on an upstream error status', async () => {
    const { fetchFn } = recordingFetch({ status: 503, body: 'busy' });
    await expect(getTwitterUser('jack', { fetchFn })).rejects.toBeInstanceOf(ScrapeError);
  });
});
