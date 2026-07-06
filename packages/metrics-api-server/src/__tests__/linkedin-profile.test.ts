import { describe, expect, it } from 'vitest';
import { UserNotFoundError } from '../errors.js';
import { parseLinkedinProfile } from '../linkedin/profile.js';

// LinkedIn server-renders the public profile as a schema.org JSON-LD @graph whose Person node
// holds the profile. Past employers come back masked with asterisks for logged-out viewers.
const PROFILE_HTML = `<!DOCTYPE html><html><head>
<script type="application/ld+json">{"@context":"https://schema.org","@graph":[
{"@type":"WebPage","url":"https://www.linkedin.com/in/tamino-martinius"},
{"@type":"Person","name":"Tamino Martinius","description":"Backend loves Frontend","url":"https://de.linkedin.com/in/tamino-martinius/en","sameAs":"https://de.linkedin.com/in/tamino-martinius/en","address":{"@type":"PostalAddress","addressCountry":"DE","addressLocality":"Berlin Metropolitan Area"},"image":{"@type":"ImageObject","contentUrl":"https://static.licdn.com/aero-v1/sc/h/abc"},"interactionStatistic":{"@type":"InteractionCounter","interactionType":"https://schema.org/FollowAction","name":"Follows","userInteractionCount":845},"knowsLanguage":[{"@type":"Language","name":"German"},{"@type":"Language","name":"English"},{"@type":"Language","name":"French"}],"worksFor":[{"@type":"Organization","name":"ServiceNow","url":"https://www.linkedin.com/company/servicenow"},{"@type":"Organization","name":"**********"}],"alumniOf":[{"@type":"EducationalOrganization","name":"Philipps-Universität Marburg","url":"https://de.linkedin.com/school/x/","member":{"@type":"OrganizationRole","startDate":2004,"endDate":2015}}]}
]}</script>
</head><body></body></html>`;

describe('parseLinkedinProfile', () => {
  it('maps the Person node from the JSON-LD @graph', () => {
    expect(parseLinkedinProfile(PROFILE_HTML, 'tamino-martinius')).toEqual({
      username: 'tamino-martinius',
      name: 'Tamino Martinius',
      headline: 'Backend loves Frontend',
      avatarUrl: 'https://static.licdn.com/aero-v1/sc/h/abc',
      url: 'https://www.linkedin.com/in/tamino-martinius',
      location: 'Berlin Metropolitan Area',
      countryCode: 'DE',
      followerCount: 845,
      languages: ['German', 'English', 'French'],
      companies: ['ServiceNow'], // masked past employers dropped
      education: [{ name: 'Philipps-Universität Marburg', startYear: 2004, endYear: 2015 }],
      posts: [],
      projects: [],
      articles: [],
    });
  });

  it('tolerates a minimal Person (no address/stats/langs/orgs/education)', () => {
    const minimal = `<html><head>
<script type="application/ld+json">{"@graph":[{"@type":"Person","name":"Jane Doe"}]}</script>
</head></html>`;
    expect(parseLinkedinProfile(minimal, 'jane-doe')).toEqual({
      username: 'jane-doe',
      name: 'Jane Doe',
      headline: '',
      avatarUrl: null,
      url: 'https://www.linkedin.com/in/jane-doe',
      location: null,
      countryCode: null,
      followerCount: null,
      languages: [],
      companies: [],
      education: [],
      posts: [],
      projects: [],
      articles: [],
    });
  });

  it('extracts posts, projects and articles from the other @graph nodes', () => {
    const html = `<html><head>
<script type="application/ld+json">{"@graph":[
{"@type":"Person","name":"Tamino Martinius"},
{"@type":"DiscussionForumPosting","text":"Hello world post","url":"https://www.linkedin.com/posts/tamino_x-activity-123","datePublished":"2026-06-18T15:20:37.570Z","interactionStatistic":{"@type":"InteractionCounter","interactionType":"http://schema.org/LikeAction","userInteractionCount":21}},
{"@type":"PublicationIssue","name":"UI Snippet","description":"Menu animations","url":"https://www.linkedin.com/redir/redirect?url=https%3A%2F%2Fgithub%2Ecom%2Ftamino%2Fui&urlhash=zzz"},
{"@type":"Article","headline":"Golden age","url":"https://www.linkedin.com/pulse/golden-age","datePublished":"2026-06-07T21:12:07.000+00:00","interactionStatistic":{"interactionType":"http://schema.org/LikeAction","userInteractionCount":7623},"image":{"@type":"ImageObject","contentUrl":"https://media.licdn.com/img.jpg"}}
]}</script>
</head></html>`;
    const profile = parseLinkedinProfile(html, 'tamino-martinius');
    expect(profile.posts).toEqual([
      {
        text: 'Hello world post',
        url: 'https://www.linkedin.com/posts/tamino_x-activity-123',
        publishedAt: '2026-06-18T15:20:37.570Z',
        likeCount: 21,
      },
    ]);
    expect(profile.projects).toEqual([
      { name: 'UI Snippet', url: 'https://github.com/tamino/ui', description: 'Menu animations' },
    ]);
    expect(profile.articles).toEqual([
      {
        headline: 'Golden age',
        url: 'https://www.linkedin.com/pulse/golden-age',
        publishedAt: '2026-06-07T21:12:07.000+00:00',
        likeCount: 7623,
        imageUrl: 'https://media.licdn.com/img.jpg',
      },
    ]);
  });

  it('throws UserNotFoundError when there is no Person node', () => {
    const noPerson = `<html><head>
<script type="application/ld+json">{"@graph":[{"@type":"WebPage","url":"https://www.linkedin.com/"}]}</script>
</head></html>`;
    expect(() => parseLinkedinProfile(noPerson, 'ghost')).toThrow(UserNotFoundError);
  });
});
