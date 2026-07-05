# metrics-api-server

Scrapes public GitHub profile pages (contributions, profile, repos) and aggregates npm registry
APIs into clean JSON, plus a small Web-standard handler factory for exposing them as HTTP
endpoints (used by this repo's `api/*.ts` Vercel functions). No GitHub token, no npm token — only
public HTML/JSON that anyone's browser can already see.

```bash
npm install metrics-api-server
```

## Scrapers

### `scrapeGithubProfile(user, options?)`

Name, bio, avatar, follower/following counts, and organizations from `github.com/:user`.

```ts
import { scrapeGithubProfile } from 'metrics-api-server';

const profile = await scrapeGithubProfile('octocat');
// { name, username, bio, avatarUrl, url, followerCount, followingCount, organizations }
```

### `scrapeGithubContributions(user, options?)`

Per-day contribution counts/levels plus totals per year. `options.years` accepts `'all'` (every
year GitHub has a graph for — the default), `'last'` (the rolling last-12-months view GitHub shows
on profile pages), or an explicit `number[]` of calendar years.

```ts
import { scrapeGithubContributions } from 'metrics-api-server';

const { total, contributions } = await scrapeGithubContributions('octocat', { years: [2024, 2025] });
```

### `scrapeGithubRepos(user, options?)`

Public repositories with stars, forks, language, and fork status. Paginates GitHub's repo listing
automatically; `options.maxPages` caps how many pages it will follow (default 10).

```ts
import { scrapeGithubRepos } from 'metrics-api-server';

const repos = await scrapeGithubRepos('octocat');
```

### `fetchNpmStats(user, options?)`

Aggregates every package a user maintains (via the npm registry search API) into publish history
(full history, always) and daily download counts windowed by `options.months` (1–17, default 12;
clamped to npm's public download-stats floor of 2015-01-10).

```ts
import { fetchNpmStats } from 'metrics-api-server';

const stats = await fetchNpmStats('sindresorhus', { months: 6 });
```

### `createUserHandler(fn, validateUser)`

Wraps a scraper call into a Web-standard `(Request) => Promise<Response>` handler: validates the
`user` query param, maps thrown errors to status codes, and sets the response `cache-control`
header. This is what each function in this repo's `api/` directory uses.

```ts
import { createUserHandler, isValidGithubUsername, scrapeGithubProfile } from 'metrics-api-server';

export const GET = createUserHandler(({ user }) => scrapeGithubProfile(user), isValidGithubUsername);
```

Response shape:

- `200` — scraper result as JSON, `cache-control: public, s-maxage=3600, stale-while-revalidate=86400`.
- `400` — invalid username, `no-store`.
- `404` — `UserNotFoundError` (GitHub returned 404 for the profile), `public, s-maxage=300`.
- `502` — `ScrapeError` (upstream markup/response didn't match what the scraper expects), `no-store`.
- `500` — anything else, `no-store`.

`parseYears(url)` and `parseMonths(url)` parse the `y` and `months` query params the same way the
Vercel functions do, if you're building your own handler around these scrapers.

## Errors

- **`UserNotFoundError`** — thrown when GitHub responds 404 for a profile URL. Distinct from
  `ScrapeError` so callers/handlers can tell "this user doesn't exist" apart from "GitHub changed
  something and we can't parse the page."
- **`ScrapeError`** — thrown whenever an upstream response doesn't look like what the regex-based
  parser expects (missing expected markup, unexpected HTTP status, unparseable count, etc.). All
  scraping here is regex-based, not a full HTML parser or headless browser — deliberately, to stay
  dependency-free and fast — which means a GitHub or npm markup change can surface as a
  `ScrapeError` instead of silently wrong data. The nightly live canary (see root README) exists to
  catch that quickly; `scripts/update-fixtures.mjs` refreshes the committed test fixtures once a
  fix ships.

## Injectable `fetchFn`

Every scraper accepts an optional `fetchFn` (default: global `fetch`) matching the standard
`fetch` signature. Tests use it to serve committed HTML/JSON fixtures instead of hitting the
network; it's also useful for adding retries, logging, or a custom user-agent in your own
deployment.

```ts
import { scrapeGithubProfile } from 'metrics-api-server';

const profile = await scrapeGithubProfile('octocat', {
  fetchFn: (input, init) => fetch(input, { ...init, headers: { ...init?.headers, 'x-my-header': '1' } }),
});
```

`fetchNpmStats` additionally accepts `spacingMs`, `backoffBaseMs`, and `rateLimitBudgetMs` to tune
pacing/backoff against npm's per-IP rate limits on the downloads endpoint (see source comments in
`src/npm/stats.ts` for why scoped packages are fetched one at a time).

## Testing

```bash
pnpm test        # fixture-based unit tests (fast, deterministic, what CI runs)
pnpm test:live   # live suite against real github.com and npm — see root README's canary section
```
