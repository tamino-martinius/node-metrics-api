import { describe, expect, it } from 'vitest';
import { parseTwitterProfile } from '../twitter/profile.js';

// Shape mirrors a real `data.user.result` node from X's GraphQL UserByScreenName endpoint.
const RESULT = {
  __typename: 'User',
  rest_id: '1117398733',
  is_blue_verified: true,
  legacy: {
    name: 'Tamino Martinius',
    screen_name: 'TaminoMartinius',
    description: 'I speak code as Staff Engineer @ServiceNow',
    location: 'Berlin, Germany',
    url: 'https://t.co/VvlBxrNbNw',
    entities: {
      url: {
        urls: [{ display_url: 'tamino.dev', expanded_url: 'https://tamino.dev', url: 'https://t.co/VvlBxrNbNw' }],
      },
    },
    followers_count: 986,
    friends_count: 21,
    statuses_count: 122,
    favourites_count: 141,
    media_count: 45,
    listed_count: 34,
    created_at: 'Thu Jan 24 18:06:50 +0000 2013',
    verified: false,
    profile_image_url_https: 'https://pbs.twimg.com/profile_images/2041964587000406017/xzAbL8ph_normal.jpg',
    profile_banner_url: 'https://pbs.twimg.com/profile_banners/1117398733/1670663894',
  },
};

describe('parseTwitterProfile', () => {
  it('maps a full GraphQL user.result to a profile', () => {
    expect(parseTwitterProfile(RESULT)).toEqual({
      id: '1117398733',
      name: 'Tamino Martinius',
      username: 'TaminoMartinius',
      bio: 'I speak code as Staff Engineer @ServiceNow',
      avatarUrl: 'https://pbs.twimg.com/profile_images/2041964587000406017/xzAbL8ph_normal.jpg',
      bannerUrl: 'https://pbs.twimg.com/profile_banners/1117398733/1670663894',
      url: 'https://x.com/TaminoMartinius',
      website: 'https://tamino.dev',
      location: 'Berlin, Germany',
      createdAt: '2013-01-24T18:06:50.000Z',
      followerCount: 986,
      followingCount: 21,
      tweetCount: 122,
      likeCount: 141,
      mediaCount: 45,
      listedCount: 34,
      verified: true,
    });
  });

  it('falls back to screen_name and tolerates missing website/banner/counts', () => {
    const minimal = {
      rest_id: '5',
      legacy: { screen_name: 'ghost', name: '  ', created_at: 'Thu Jan 24 18:06:50 +0000 2013' },
    };
    expect(parseTwitterProfile(minimal)).toEqual({
      id: '5',
      name: 'ghost',
      username: 'ghost',
      bio: '',
      avatarUrl: '',
      bannerUrl: null,
      url: 'https://x.com/ghost',
      website: null,
      location: '',
      createdAt: '2013-01-24T18:06:50.000Z',
      followerCount: 0,
      followingCount: 0,
      tweetCount: 0,
      likeCount: 0,
      mediaCount: 0,
      listedCount: 0,
      verified: false,
    });
  });

  it('throws when the legacy object is missing', () => {
    expect(() => parseTwitterProfile({ rest_id: '1' })).toThrow(/schema/);
  });
});
