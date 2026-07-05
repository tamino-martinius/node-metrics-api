import { describe, expect, it } from 'vitest';
import { parseProfileHtml } from '../github/profile.js';

const PROFILE_HTML = `<html><head>
<meta property="og:image" content="https://avatars.githubusercontent.com/u/12345?v=4">
</head><body>
<span class="p-name vcard-fullname d-block overflow-hidden" itemprop="name">
  Octo Cat
</span>
<span class="p-nickname vcard-username d-block" itemprop="additionalName">octocat</span>
<div class="p-note user-profile-bio js-user-profile-bio f4" data-bio-text="Builds &quot;things&quot; @github"><div>Builds "things"</div></div>
<a href="https://github.com/octocat?tab=followers"><svg height="16"></svg> <span class="text-bold color-fg-default">1.2k</span> followers</a>
<a href="https://github.com/octocat?tab=following"><svg height="16"></svg> <span class="text-bold color-fg-default">7</span> following</a>
<a class="avatar-group-item" data-hovercard-type="organization" href="/github"><img src="https://avatars.githubusercontent.com/u/9919?s=64&amp;v=4" alt="@github"></a>
</body></html>`;

describe('parseProfileHtml', () => {
  it('parses the full profile', () => {
    expect(parseProfileHtml(PROFILE_HTML, 'octocat')).toEqual({
      name: 'Octo Cat',
      username: 'octocat',
      bio: 'Builds "things" @github',
      avatarUrl: 'https://avatars.githubusercontent.com/u/12345?v=4',
      url: 'https://github.com/octocat',
      followerCount: 1200,
      followingCount: 7,
      organizations: [
        { name: 'github', avatarUrl: 'https://avatars.githubusercontent.com/u/9919?s=64&v=4', url: 'https://github.com/github' },
      ],
    });
  });

  it('falls back to username when the display name is empty, tolerates missing bio/orgs/counts', () => {
    const minimal = `<html><head><meta property="og:image" content="https://avatars.githubusercontent.com/u/1?v=4"></head>
      <body><span class="p-name vcard-fullname d-block" itemprop="name"> </span></body></html>`;
    expect(parseProfileHtml(minimal, 'ghost')).toEqual({
      name: 'ghost',
      username: 'ghost',
      bio: '',
      avatarUrl: 'https://avatars.githubusercontent.com/u/1?v=4',
      url: 'https://github.com/ghost',
      followerCount: 0,
      followingCount: 0,
      organizations: [],
    });
  });

  it('throws when the avatar anchor is missing', () => {
    expect(() => parseProfileHtml('<html><body>broken</body></html>', 'x')).toThrow(/markup/);
  });
});
