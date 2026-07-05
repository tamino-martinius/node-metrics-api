# node-metrics-api

Scrapes public GitHub profile pages and aggregates npm registry APIs into clean JSON — no GitHub
token, no npm token, no auth of any kind. Deployed as Vercel functions at
https://metrics-api.tamino.dev.

Two packages:

- **`metrics-api-server`** — the scrapers/aggregators plus a small Web-standard handler factory
  (`Request` in, `Response` out) that the Vercel functions wrap.
- **`metrics-api-client`** — a typed fetch wrapper for calling a hosted `metrics-api-server`
  (the reference deployment by default, or your own fork).

## Endpoints

| Endpoint | Returns |
| --- | --- |
| `GET /github/:user/contributions?y=all\|last\|2024,2025` | per-day contribution counts + totals per year |
| `GET /github/:user/profile` | name, bio, avatar, follower/following counts, orgs |
| `GET /github/:user/repos` | public repos with stars, forks, language |
| `GET /npm/:user?months=12` | packages with publish history + windowed daily downloads |

Notes on the data:

- `contributions` defaults to `y=all` (every year GitHub has a contribution graph for); `y=last`
  returns the rolling last-12-months view GitHub shows on profile pages instead of a calendar
  year; `y=2024,2025` fetches specific years.
- `profile` follower/following counts are exact below 1000; at or above 1000 they're approximate
  because GitHub itself renders them abbreviated (e.g. "1.2k").
- `npm` `?months=` (1–17, default 12) windows the **downloads** series only; npm's public download
  stats start 2015-01-10, so the window is clamped to that floor. Publish history
  (`versionsPerDate` / `versionsPerHour`) is always full-history, unaffected by `months`.

Example:

```bash
curl https://metrics-api.tamino.dev/github/tamino-martinius/profile
curl https://metrics-api.tamino.dev/npm/tamino-martinius?months=6
```

## Caching

Successful responses are edge-cached for 1 hour with a 24-hour stale-while-revalidate window
(`cache-control: public, s-maxage=3600, stale-while-revalidate=86400`), so repeated requests for
the same user are cheap and don't hammer GitHub/npm. A "user not found" (404) is cached for 5
minutes (`public, s-maxage=300`); validation errors (400) and upstream scrape failures (502) are
never cached (`no-store`). Every response also carries `access-control-allow-origin: *`, so the
endpoints can be called directly from browsers.

## Self-hosting

The scrapers have no server-side secrets, so anyone can run their own instance:

1. Fork this repo.
2. Import the fork as a new Vercel project (Framework Preset: Other — `vercel.json` already
   drives the install/build commands and clean-URL rewrites).
3. Optionally attach a custom domain in Vercel project settings.
4. Point `metrics-api-client` at it:

   ```ts
   const api = new MetricsApiClient({ baseUrl: 'https://your-fork.vercel.app' });
   ```

See `packages/metrics-api-server/README.md` for the underlying functions if you want to embed the
scrapers directly instead of calling over HTTP.

## Workspace layout

```
api/                         Vercel functions (thin wrappers around metrics-api-server)
  github/contributions.ts
  github/profile.ts
  github/repos.ts
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
