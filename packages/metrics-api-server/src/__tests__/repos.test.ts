import { describe, expect, it } from 'vitest';
import { parseReposHtml, scrapeGithubRepos } from '../github/repos.js';

const PAGE_1 = `<div id="user-repositories-list"><ul>
<li><a href="/octocat/hello-world" itemprop="name codeRepository" > hello-world </a>
<p class="col-9 d-inline-block color-fg-muted mb-2" itemprop="description"> My first repo &amp; friends </p>
<span itemprop="programmingLanguage">TypeScript</span>
<a class="Link--muted" href="/octocat/hello-world/stargazers"> <svg aria-label="star"><path d="M8"></path></svg> 1.5k </a>
<a class="Link--muted" href="/octocat/hello-world/forks"> <svg aria-label="fork"><path d="M5"></path></svg> 12 </a>
</li>
<li><a href="/octocat/forked-thing" itemprop="name codeRepository" > forked-thing </a>
<span>Forked from <a href="/upstream/thing">upstream/thing</a></span>
</li>
</ul>
<a class="next_page" rel="next" href="/octocat?page=2&amp;tab=repositories">Next</a></div>`;

const PAGE_2 = `<div id="user-repositories-list"><ul>
<li><a href="/octocat/solo" itemprop="name codeRepository" > solo </a></li>
</ul></div>`;

describe('parseReposHtml', () => {
  it('parses repos with counts, language, fork flag and pagination', () => {
    const { repos, hasNextPage } = parseReposHtml(PAGE_1);
    expect(hasNextPage).toBe(true);
    expect(repos).toEqual([
      {
        name: 'hello-world',
        url: 'https://github.com/octocat/hello-world',
        description: 'My first repo & friends',
        language: 'TypeScript',
        stargazerCount: 1500,
        forkCount: 12,
        isFork: false,
      },
      {
        name: 'forked-thing',
        url: 'https://github.com/octocat/forked-thing',
        description: '',
        language: null,
        stargazerCount: 0,
        forkCount: 0,
        isFork: true,
      },
    ]);
  });

  it('returns empty list without next page for a repo-less page', () => {
    expect(parseReposHtml('<div id="user-repositories-list"></div>')).toEqual({ repos: [], hasNextPage: false });
  });
});

describe('scrapeGithubRepos', () => {
  it('follows pagination', async () => {
    const fetchFn = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('page=2')) return new Response(PAGE_2, { status: 200 });
      return new Response(PAGE_1, { status: 200 });
    }) as typeof fetch;
    const repos = await scrapeGithubRepos('octocat', { fetchFn });
    expect(repos.map((r) => r.name)).toEqual(['hello-world', 'forked-thing', 'solo']);
  });
});
