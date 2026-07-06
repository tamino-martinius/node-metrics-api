# metrics-api-server

Scrapes public GitHub profile pages (contributions, profile, repos) and aggregates npm registry
APIs into clean JSON, plus a small Web-standard handler factory for exposing them as HTTP
endpoints (used by this repo's `api/*.ts` Vercel functions). No token is required — the scrapers
work off public HTML/JSON that anyone's browser can already see. Optionally, a server-side
`GITHUB_TOKEN` or a caller-supplied `Authorization` header can layer in extra data from GitHub's
GraphQL API (see `getGithubUser` below).

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
header. This is what the `/npm/:user` function in this repo's `api/` directory uses. Every
response also carries `access-control-allow-origin: *`, so the endpoints can be called directly
from browsers.

```ts
import { createUserHandler, fetchNpmStats, isValidNpmUsername, parseMonths } from 'metrics-api-server';

export const GET = createUserHandler(
  ({ user, url }) => fetchNpmStats(user, { months: parseMonths(url) }),
  isValidNpmUsername,
);
```

Response shape:

- `200` — scraper result as JSON, `cache-control: public, s-maxage=3600, stale-while-revalidate=86400`.
- `400` — invalid username, `no-store`.
- `404` — `UserNotFoundError` (GitHub returned 404 for the profile), `public, s-maxage=300`.
- `502` — `ScrapeError` (upstream markup/response didn't match what the scraper expects), `no-store`.
- `500` — anything else, `no-store`.

`parseYears(url)` and `parseMonths(url)` parse the `y` and `months` query params the same way the
Vercel functions do, if you're building your own handler around these scrapers.

### `getGithubUser(user, options?)` / `githubUserResponse(request, options?)`

The GitHub side of the API is a single consolidated call rather than three separate scrapers.
`getGithubUser` runs `scrapeGithubProfile`, `scrapeGithubRepos`, and `scrapeGithubContributions` in
parallel via `Promise.allSettled` and merges them into one `GithubUser` (`{ profile, repos,
contributions, warnings? }`); if any individual scrape fails, its section is omitted/empty and a
`warnings` string is added instead of failing the whole call.

```ts
import { getGithubUser } from 'metrics-api-server';

const user = await getGithubUser('octocat', {
  years: 'all', // 'all' | 'last' | number[], default 'all'
  serverToken: process.env.GITHUB_TOKEN, // optional — enables public GraphQL enrichment
  callerToken: undefined, // optional — a caller's own GitHub PAT, enables private enrichment
  lifetime: false, // with callerToken, also compute contributions.lifetimeTotal
});
```

When a token is available (`callerToken` takes priority over `serverToken`), `getGithubUser` also
calls `fetchGithubGraphql` and layers the result onto the scraped base via the pure
`mergeGithubUser(profile, repos, contributions, gql)` function:

- `serverToken` (public GraphQL only) adds `profile.accountCreatedAt`, `profile.location`, and
  per-repo `defaultBranchCommits`/`createdAt`/`pushedAt`.
- `callerToken` (public + private GraphQL) additionally adds `contributions.byType` (`commits`,
  `pullRequests`, `reviews`, `issues`) and `contributions.privateLastYear`, plus
  `contributions.lifetimeTotal` when `lifetime: true`.

If GraphQL enrichment throws, `getGithubUser` degrades gracefully rather than failing the request:
a `GithubRateLimitError` becomes a `"enrichment: rate limited"` warning, any other enrichment
failure becomes `"enrichment: unavailable"` — **except** a `GithubTokenError` from a `callerToken`,
which is rethrown so the caller finds out their own token was rejected.

`githubUserResponse(request, { serverToken?, fetchFn?, now? })` wraps `getGithubUser` into a
Web-standard `(Request) => Promise<Response>` handler — this is what `api/github/user.ts` uses. It
reads the `user` path/query param, `?y=`/`?lifetime=1` query params, and a caller
`Authorization: Bearer <token>` header; handles `OPTIONS` preflight; and sets response headers:

- `200` — the merged `GithubUser` as JSON. `cache-control` is
  `public, s-maxage=3600, stale-while-revalidate=86400` for anonymous/server-token-only responses,
  or `private, no-store` when the caller sent their own token. Always includes
  `vary: Authorization` and `access-control-allow-origin: *`.
- `400` — invalid username, `no-store`.
- `404` — `UserNotFoundError`, `public, s-maxage=300`.
- `401` — the caller's own token was rejected (`GithubTokenError`), `no-store`.
- `502` — `ScrapeError`, `no-store`.
- `500` — anything else, `no-store`.

### `fetchGithubGraphql(user, options)`

Low-level GraphQL client behind the enrichment streams above — exported for callers who want to
drive it directly. Takes a `token`, and optional `includeContributions`/`includeLifetime` flags,
and returns a `GithubGraphqlData` (or `null` if GitHub has no such user). Classifies failures into
`GithubTokenError` (bad/rejected token, HTTP 401) and `GithubRateLimitError` (secondary rate limit
or a GraphQL `RATE_LIMITED` error) so callers can distinguish "your token is bad" from "try again
later."

## Errors

- **`UserNotFoundError`** — thrown when GitHub responds 404 for a profile URL. Distinct from
  `ScrapeError` so callers/handlers can tell "this user doesn't exist" apart from "GitHub changed
  something and we can't parse the page."
- **`ScrapeError`** — thrown whenever an upstream response doesn't look like what the regex-based
  parser expects (missing expected markup, unexpected HTTP status, unparseable count, etc.). All
  scraping here is regex-based, not a full HTML parser or headless browser — deliberately, to stay
  dependency-free and fast — which means a GitHub or npm markup change can surface as a
  `ScrapeError` instead of silently wrong data. The nightly live canary exists to catch that
  quickly; `scripts/update-fixtures.mjs` refreshes the committed test fixtures once a fix ships.
- **`GithubTokenError`** — thrown by `fetchGithubGraphql` when GitHub rejects a token (HTTP 401).
  `getGithubUser` swallows this into a warning for a `serverToken`, but rethrows it when it came
  from a `callerToken` so `githubUserResponse` can surface it as a `401`.
- **`GithubRateLimitError`** — thrown by `fetchGithubGraphql` on a GitHub secondary rate limit
  (HTTP 403) or a GraphQL `RATE_LIMITED` error. `getGithubUser` always turns this into an
  `"enrichment: rate limited"` warning rather than failing the request, regardless of which token
  triggered it.

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
pnpm test:live   # live suite against real github.com and npm
```
