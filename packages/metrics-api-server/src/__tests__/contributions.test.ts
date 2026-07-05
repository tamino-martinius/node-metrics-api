import { describe, expect, it } from 'vitest';
import { UserNotFoundError } from '../errors.js';
import { parseContributionsHtml, parseYearLinks, scrapeGithubContributions } from '../github/contributions.js';

// Attribute order intentionally varies per cell — GitHub does not guarantee order.
const CALENDAR_HTML = `
<div class="js-yearly-contributions"><table><tbody>
<tr><td tabindex="0" style="width: 10px" data-date="2024-03-01" id="contribution-day-component-0-0" data-level="0" class="ContributionCalendar-day"></td></tr>
<tr><td data-date="2024-03-02" id="contribution-day-component-0-1" data-level="2" class="ContributionCalendar-day"></td></tr>
<tr><td data-level="4" id="contribution-day-component-0-2" data-date="2024-03-03" class="ContributionCalendar-day"></td></tr>
</tbody></table>
<tool-tip for="contribution-day-component-0-0" class="sr-only">No contributions on March 1st.</tool-tip>
<tool-tip for="contribution-day-component-0-1" class="sr-only">5 contributions on March 2nd.</tool-tip>
<tool-tip for="contribution-day-component-0-2" class="sr-only">1,024 contributions on March 3rd.</tool-tip>
</div>`;

describe('parseContributionsHtml', () => {
  it('parses day cells with counts from tooltips', () => {
    expect(parseContributionsHtml(CALENDAR_HTML)).toEqual([
      { date: '2024-03-01', count: 0, level: 0 },
      { date: '2024-03-02', count: 5, level: 2 },
      { date: '2024-03-03', count: 1024, level: 4 },
    ]);
  });
  it('throws when no cells are present', () => {
    expect(() => parseContributionsHtml('<html><body>nope</body></html>')).toThrow(/markup/);
  });
});

describe('parseYearLinks', () => {
  it('extracts sorted unique years', () => {
    const html = '<a id="year-link-2026">2026</a><a id="year-link-2024">2024</a><a id="year-link-2026">2026</a>';
    expect(parseYearLinks(html)).toEqual([2024, 2026]);
  });
  it('throws when none found', () => {
    expect(() => parseYearLinks('<html></html>')).toThrow(/markup/);
  });
});

const stubFetch = (routes: Record<string, string | number>): typeof fetch =>
  (async (input: RequestInfo | URL) => {
    const url = String(input);
    const hit = Object.entries(routes).find(([prefix]) => url.startsWith(prefix));
    if (!hit) throw new Error(`unexpected fetch: ${url}`);
    const body = hit[1];
    if (typeof body === 'number') return new Response('', { status: body });
    return new Response(body, { status: 200 });
  }) as typeof fetch;

describe('scrapeGithubContributions', () => {
  it('scrapes explicit years, filters foreign dates, sums totals', async () => {
    const fetchFn = stubFetch({
      'https://github.com/users/octocat/contributions?from=2024-01-01&to=2024-12-31':
        CALENDAR_HTML.replace('2024-03-01', '2023-12-31'), // foreign-year cell must be dropped
    });
    const result = await scrapeGithubContributions('octocat', { years: [2024], fetchFn });
    expect(result.total).toEqual({ '2024': 1029 });
    expect(result.contributions.map((d) => d.date)).toEqual(['2024-03-02', '2024-03-03']);
  });

  it("scrapes 'last' from the rolling endpoint", async () => {
    const fetchFn = stubFetch({ 'https://github.com/users/octocat/contributions': CALENDAR_HTML });
    const result = await scrapeGithubContributions('octocat', { years: 'last', fetchFn });
    expect(result.total).toEqual({ lastYear: 1029 });
    expect(result.contributions).toHaveLength(3);
  });

  it("discovers years for 'all'", async () => {
    const fetchFn = stubFetch({
      'https://github.com/octocat?tab=contributions': '<a id="year-link-2024">2024</a>',
      'https://github.com/users/octocat/contributions?from=2024-01-01&to=2024-12-31': CALENDAR_HTML,
    });
    const result = await scrapeGithubContributions('octocat', { fetchFn });
    expect(result.total).toEqual({ '2024': 1029 });
  });

  it('maps 404 to UserNotFoundError', async () => {
    const fetchFn = stubFetch({ 'https://github.com/users/ghost-x/contributions': 404 });
    await expect(scrapeGithubContributions('ghost-x', { years: 'last', fetchFn })).rejects.toBeInstanceOf(
      UserNotFoundError,
    );
  });
});
