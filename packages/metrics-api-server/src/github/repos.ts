import { decodeEntities, parseCount, squash } from '../html.js';
import type { FetchFn, GithubRepo } from '../types.js';
import { fetchGithubHtml } from './fetch.js';

const countIn = (chunk: string, kind: 'stargazers' | 'forks'): number => {
  const match = chunk.match(new RegExp(`/${kind}"[^>]*>.*?</svg>\\s*([\\d.,kKmM]+)\\s*</a>`));
  return match ? parseCount(match[1]) : 0;
};

export function parseReposHtml(html: string): { repos: GithubRepo[]; hasNextPage: boolean } {
  const squashed = squash(html);
  const chunks = squashed.split(/(?=<a href="[^"]+" itemprop="name codeRepository")/).slice(1);
  const repos = chunks.map((chunk) => {
    const head = chunk.match(/^<a href="\/([^"/]+)\/([^"]+)" itemprop="name codeRepository"/);
    if (!head) throw new Error('unreachable: chunk starts with the split anchor');
    const [, owner, name] = head;
    const description = chunk.match(/itemprop="description"[^>]*>\s*(.*?)\s*</);
    const language = chunk.match(/<span itemprop="programmingLanguage">([^<]*)<\/span>/);
    return {
      name,
      url: `https://github.com/${owner}/${name}`,
      description: decodeEntities(description?.[1] ?? ''),
      language: language ? language[1] : null,
      stargazerCount: countIn(chunk, 'stargazers'),
      forkCount: countIn(chunk, 'forks'),
      isFork: chunk.includes('Forked from'),
    };
  });
  return { repos, hasNextPage: /<a class="next_page"/.test(squashed) };
}

export async function scrapeGithubRepos(
  user: string,
  { fetchFn = fetch, maxPages = 10 }: { fetchFn?: FetchFn; maxPages?: number } = {},
): Promise<GithubRepo[]> {
  const repos: GithubRepo[] = [];
  for (let page = 1; page <= maxPages; page++) {
    const url = `https://github.com/${user}?page=${page}&tab=repositories`;
    const { repos: pageRepos, hasNextPage } = parseReposHtml(await fetchGithubHtml(url, user, fetchFn));
    repos.push(...pageRepos);
    if (!hasNextPage) break;
  }
  return repos;
}
