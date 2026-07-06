# node-metrics-api

Scrapes public GitHub profile pages, pulls public X (Twitter) profiles via X's own guest-token
flow, and aggregates npm registry APIs into clean JSON — no token or auth required for the base
data. Optional GitHub GraphQL enrichment can layer in extra fields (see below). Deployed as Vercel
functions at https://metrics-api.tamino.dev.

Two packages:

- **`metrics-api-server`** — the scrapers/aggregators plus a small Web-standard handler factory
  (`Request` in, `Response` out) that the Vercel functions wrap.
- **`metrics-api-client`** — a typed fetch wrapper for calling a hosted `metrics-api-server`
  (the reference deployment by default, or your own fork).

## Endpoints

| Endpoint | Returns |
| --- | --- |
| `GET /github/:user?y=all\|last\|2024,2025` | `{ profile, repos, contributions, warnings? }` in one response |
| `GET /twitter/:user` | `{ profile }` — X profile with follower/following/tweet counts and account age |
| `GET /npm/:user?months=12` | packages with publish history + windowed daily downloads |

Notes on the data:

- `profile` has name, bio, avatar, follower/following counts, and organizations; `repos` is public
  repos with stars, forks, language, and fork status; `contributions` has per-day counts/levels
  plus totals per year.
- `?y=` selects which contribution years are returned: `all` (default — every year GitHub has a
  contribution graph for), `last` (the rolling last-12-months view GitHub shows on profile pages
  instead of a calendar year), or `2024,2025` for specific years.
- `profile` follower/following counts are exact below 1000; at or above 1000 they're approximate
  because GitHub itself renders them abbreviated (e.g. "1.2k").
- `warnings` is present only when part of the response is degraded — e.g. `repos` or
  `contributions` failed to scrape, or GraphQL enrichment (below) was unavailable/rate-limited. The
  rest of the response is still returned; a warning never fails the whole request.
- `npm` `?months=` (1–17, default 12) windows the **downloads** series only; npm's public download
  stats start 2015-01-10, so the window is clamped to that floor. Publish history
  (`versionsPerDate` / `versionsPerHour`) is always full-history, unaffected by `months`.

Example:

```bash
curl https://metrics-api.tamino.dev/github/tamino-martinius
curl https://metrics-api.tamino.dev/twitter/TaminoMartinius
curl https://metrics-api.tamino.dev/npm/tamino-martinius?months=6
```

### GraphQL enrichment (optional)

The base response above comes entirely from scraping public GitHub pages — no token required. On
top of that, `/github/:user` can layer in two optional, best-effort GraphQL enrichment streams:

- **Server-side (`GITHUB_TOKEN`)** — if the deployment has a `GITHUB_TOKEN` env var set, every
  request (even anonymous ones) is enriched with public data from GitHub's GraphQL API:
  `profile.accountCreatedAt`, `profile.location`, and per-repo `defaultBranchCommits`, `createdAt`,
  `pushedAt`. This uses the deployment's own token, so it's shared across all callers and subject
  to that single token's GitHub API rate limit; responses stay cacheable
  (`public, s-maxage=3600, stale-while-revalidate=86400`) since no caller secret is involved. If
  the token is unset, rejected, or currently rate-limited, this enrichment is silently skipped and
  a `warnings` entry (e.g. `"enrichment: rate limited"`) is added instead of failing the request.
- **Caller-side (`Authorization: Bearer <pat>`)** — send your own GitHub personal access token in
  the `Authorization` header to additionally pull *private* contribution data (using your token's
  own budget, not the server's): `contributions.byType` (`commits`, `pullRequests`, `reviews`,
  `issues`) and `contributions.privateLastYear`. Add `?lifetime=1` to also compute
  `contributions.lifetimeTotal` (summed across every year since account creation — this issues one
  extra GraphQL query per year, so only request it when you need it). Authenticated responses are
  never cached (`private, no-store`) and the token is never logged; an invalid caller token
  returns `401`.

Both streams degrade gracefully: if GraphQL enrichment fails for any reason, you still get the
full scraped `profile`/`repos`/`contributions` payload, just without the extra fields, plus a
`warnings` entry explaining what was skipped.

Every response — enriched or not — carries `access-control-allow-origin: *` and
`vary: Authorization`, and `OPTIONS` preflight requests are answered with
`access-control-allow-headers: authorization` so browsers can send the `Authorization` header
cross-origin.

### X (Twitter)

`GET /twitter/:user` returns `{ profile }` for a public X profile: `id` (stable numeric id),
`name`, `username`, `bio`, `avatarUrl`, `bannerUrl`, `url`, `website` (the linked site, expanded
from the `t.co` wrapper), `location`, `createdAt` (ISO), `followerCount`, `followingCount`,
`tweetCount`, `likeCount`, `mediaCount`, `listedCount`, and `verified` (X "blue" verification).

There is no official-API key or login involved. Like x.com's own logged-out web client, the server
activates a short-lived **guest token** (`POST /1.1/guest/activate.json`) and then calls the public
`UserByScreenName` GraphQL endpoint with that token plus X's public web bearer token. Both are
values x.com ships to every anonymous visitor — no secret is stored, so responses stay publicly
cacheable just like the GitHub/npm ones.

Because this rides X's private web endpoints, it has two moving parts that X can change without
notice: the `UserByScreenName` **query id** (rotated on web-app redeploys) and its required
**feature flags**. Both live as constants in `packages/metrics-api-server/src/twitter/fetch.ts`;
when X changes them the request starts failing and the **nightly smoke test** (`pnpm test:live`)
flags it so the constants can be refreshed. X may also rate-limit or block requests coming from
datacenter IP ranges (e.g. some serverless/CI hosts); if that shows up in production, route the
outbound `fetch` through a proxy — the `fetchFn` is injectable, so it drops in without touching the
parsing logic.

## Caching

Anonymous requests and requests enriched only via the server's `GITHUB_TOKEN` are edge-cached for
1 hour with a 24-hour stale-while-revalidate window
(`cache-control: public, s-maxage=3600, stale-while-revalidate=86400`), so repeated requests for
the same user are cheap and don't hammer GitHub/npm. Requests carrying a caller `Authorization`
header are never cached (`private, no-store`), since the response contains that caller's private
data. A "user not found" (404) is cached for 5 minutes (`public, s-maxage=300`); validation errors
(400) and upstream scrape failures (502) are never cached (`no-store`). Every response also
carries `access-control-allow-origin: *` and `vary: Authorization`, so the endpoints can be called
directly from browsers and shared caches don't mix up anonymous and authenticated responses.

## Self-hosting

The scrapers have no required server-side secrets, so anyone can run their own instance:

1. Fork this repo.
2. Import the fork as a new Vercel project (Framework Preset: Other — `vercel.json` already
   drives the install/build commands and clean-URL rewrites).
3. Optionally attach a custom domain in Vercel project settings.
4. Optionally set a `GITHUB_TOKEN` env var in the Vercel project to enable the server-side GraphQL
   enrichment described above.
5. Point `metrics-api-client` at it:

   ```ts
   const api = new MetricsApiClient({ baseUrl: 'https://your-fork.vercel.app' });
   ```

See `packages/metrics-api-server/README.md` for the underlying functions if you want to embed the
scrapers directly instead of calling over HTTP.

## Workspace layout

```
api/                         Vercel functions (thin wrappers around metrics-api-server)
  github/user.ts
  twitter/user.ts
  npm/stats.ts
packages/
  metrics-api-server/        scrapers, npm aggregator, handler factory
  metrics-api-client/        typed HTTP client
scripts/
  update-fixtures.mjs        refresh the committed real-markup test fixtures
.github/workflows/
  ci.yml                     lint + build + typecheck + test + release-script tests, on push/PR
  nightly-smoke.yml          live canary against real GitHub/npm
  release.yml                manual dispatch release flow
vercel.json                  install/build commands + clean-URL rewrites
```

## Dev commands

```bash
pnpm install                        # install workspace deps
pnpm run ci                             # lint + build + typecheck + test (what CI runs)
pnpm test:live                      # live suite against real github.com/npm
node scripts/update-fixtures.mjs [user]   # refresh committed HTML fixtures (default user: tamino-martinius)
pnpm test:release                   # unit tests for the release-workflow scripts
```
