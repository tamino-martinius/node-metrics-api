import { describe, expect, it } from 'vitest';
import { UserNotFoundError } from '../errors.js';
import { parseTwitterProfile } from '../twitter/profile.js';

// x.com server-renders the profile as schema.org JSON-LD (a ProfilePage whose mainEntity is the
// Person) for a plain browser GET — no auth or guest token. This mirrors a real page's blocks.
const PROFILE_HTML = `<!DOCTYPE html><html><head>
<link rel="preload" as="image" href="https://pbs.twimg.com/profile_banners/1117398733/1670663894"/>
<title>Tamino Martinius (@TaminoMartinius) / X</title>
<script type="application/ld+json">{"@context":"https://schema.org","@type":"WebSite","url":"https://x.com/"}</script>
<script type="application/ld+json">{"@context":"http://schema.org","@type":"ProfilePage","dateCreated":"2013-01-24T18:06:50.000Z","mainEntity":{"@type":"Person","additionalName":"TaminoMartinius","description":"I speak code as Staff Engineer @ServiceNow","homeLocation":{"@type":"Place","name":"Berlin, Germany"},"identifier":"1117398733","image":{"@type":"ImageObject","contentUrl":"https://pbs.twimg.com/profile_images/2041964587000406017/xzAbL8ph_400x400.jpg"},"interactionStatistic":[{"@type":"InteractionCounter","interactionType":"https://schema.org/FollowAction","userInteractionCount":986},{"@type":"InteractionCounter","interactionType":"https://schema.org/SubscribeAction","userInteractionCount":21},{"@type":"InteractionCounter","interactionType":"https://schema.org/WriteAction","userInteractionCount":122}],"name":"Tamino Martinius","sameAs":"https://tamino.dev","url":"https://x.com/TaminoMartinius"}}</script>
</head><body></body></html>`;

describe('parseTwitterProfile', () => {
  it('maps the ProfilePage JSON-LD to a profile', () => {
    expect(parseTwitterProfile(PROFILE_HTML, 'TaminoMartinius')).toEqual({
      id: '1117398733',
      name: 'Tamino Martinius',
      username: 'TaminoMartinius',
      bio: 'I speak code as Staff Engineer @ServiceNow',
      avatarUrl: 'https://pbs.twimg.com/profile_images/2041964587000406017/xzAbL8ph_400x400.jpg',
      bannerUrl: 'https://pbs.twimg.com/profile_banners/1117398733/1670663894',
      url: 'https://x.com/TaminoMartinius',
      website: 'https://tamino.dev',
      location: 'Berlin, Germany',
      createdAt: '2013-01-24T18:06:50.000Z',
      followerCount: 986,
      followingCount: 21,
      tweetCount: 122,
    });
  });

  it('tolerates a missing website, banner and location', () => {
    const minimal = `<html><head>
<script type="application/ld+json">{"@type":"ProfilePage","dateCreated":"2006-03-21T20:50:14.000Z","mainEntity":{"@type":"Person","additionalName":"jack","name":"jack","identifier":"12","description":"","image":{"contentUrl":"https://pbs.twimg.com/a.jpg"},"interactionStatistic":[{"interactionType":"https://schema.org/FollowAction","userInteractionCount":9665639}]}}</script>
</head></html>`;
    expect(parseTwitterProfile(minimal, 'jack')).toEqual({
      id: '12',
      name: 'jack',
      username: 'jack',
      bio: '',
      avatarUrl: 'https://pbs.twimg.com/a.jpg',
      bannerUrl: null,
      url: 'https://x.com/jack',
      website: null,
      location: '',
      createdAt: '2006-03-21T20:50:14.000Z',
      followerCount: 9665639,
      followingCount: 0,
      tweetCount: 0,
    });
  });

  it('throws UserNotFoundError when the page has no ProfilePage JSON-LD', () => {
    // x.com returns HTTP 200 for nonexistent handles, just without the ProfilePage block.
    const notFound = `<html><head>
<script type="application/ld+json">{"@type":"WebSite","url":"https://x.com/"}</script>
</head><body></body></html>`;
    expect(() => parseTwitterProfile(notFound, 'ghost')).toThrow(UserNotFoundError);
  });
});
