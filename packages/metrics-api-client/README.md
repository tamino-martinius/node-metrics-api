# metrics-api-client

Typed fetch wrapper for a hosted `metrics-api-server` — by default the reference deployment at
https://metrics-api.tamino.dev, or any self-hosted fork (see the root README's Self-hosting
section).

```bash
npm install metrics-api-client
```

## Usage

```ts
import { MetricsApiClient } from 'metrics-api-client';

const api = new MetricsApiClient(); // default: https://metrics-api.tamino.dev
// const api = new MetricsApiClient({ baseUrl: 'https://your-fork.vercel.app' });

const user = await api.github('octocat');
// { profile, repos, contributions, warnings? }
```

Other methods:

```ts
const gitlab = await api.gitlab('tamino-martinius');           // { profile, projects, contributions }
const twitter = await api.twitter('TaminoMartinius');          // { profile }
const linkedin = await api.linkedin('tamino-martinius');       // { profile }
const npmStats = await api.npmStats('octocat', { months: 6 }); // 1–17, default 12
```

### `github(user, options?)`

Returns a `GithubUser`: `{ profile, repos, contributions, warnings? }`. `options`:

```ts
{
  years?: 'all' | 'last' | number[]; // default 'all' — mirrors the server's `y` query param
  token?: string;                    // your own GitHub PAT — sent as `Authorization: Bearer`
  lifetime?: boolean;                // with `token`, also request contributions.lifetimeTotal
}
```

- Without `token`, you get the base scraped profile/repos/contributions, plus any public GraphQL
  enrichment the server adds via its own `GITHUB_TOKEN` (`profile.accountCreatedAt`,
  `profile.location`, per-repo `defaultBranchCommits`/`createdAt`/`pushedAt`) — best-effort, may be
  absent if the server has no token or is rate-limited (see `warnings`).
- With `token`, your PAT is sent as `Authorization: Bearer <token>` and the response additionally
  includes `contributions.byType` (`commits`, `pullRequests`, `reviews`, `issues`) and
  `contributions.privateLastYear`, computed from *your* token's access — the request is never
  cached server-side. Add `lifetime: true` to also get `contributions.lifetimeTotal`.

```ts
const enriched = await api.github('octocat', { years: [2024, 2025], token: myPat, lifetime: true });
```

### `gitlab(user, options?)`

Returns a `GitlabUser`: `{ profile, projects, contributions, warnings? }`. Pass `{ token }` to send
your own GitLab personal access token as `Authorization: Bearer <token>`, which enriches
follower/following counts and adds `contributions.byType`; without it those are omitted (GitLab
requires a token for follower data).

```ts
const gl = await api.gitlab('tamino-martinius', { token: myGitlabPat });
```

### `twitter(user)`

Returns a `TwitterUser`: `{ profile }` for a public X profile — id, name, bio, follower/following/
tweet counts, and account age. No token or options.

### `linkedin(user)`

Returns a `LinkedinUser`: `{ profile }` for a public LinkedIn profile — headline, location,
followers, languages, employer, education, plus recent posts/projects/articles. `user` is the
`/in/<slug>` vanity name. No token or options.

## Options

```ts
new MetricsApiClient({
  baseUrl?: string;      // default: https://metrics-api.tamino.dev
  fetch?: typeof fetch;  // default: globalThis.fetch — override for retries, logging, custom runtimes, tests
});
```

## Errors

Failed requests throw `MetricsApiError`, which carries a machine-readable `kind` and the HTTP
`status` alongside the message:

```ts
import { MetricsApiClient, MetricsApiError } from 'metrics-api-client';

const api = new MetricsApiClient();
try {
  await api.github('this-user-does-not-exist-hopefully');
} catch (error) {
  if (error instanceof MetricsApiError) {
    console.log(error.kind, error.status, error.message);
    // 'not-found' 404 'user not found: this-user-does-not-exist-hopefully'
  }
}
```

`kind` is one of:

| Kind | HTTP status | Meaning |
| --- | --- | --- |
| `bad-request` | 400 | invalid username |
| `not-found` | 404 | GitHub/npm has no such user |
| `upstream` | other non-2xx (incl. 401 for a rejected `token`) | server-side scrape/aggregation failure, or GitHub rejected the caller's token |
| `network` | — (status `0`) | the request itself failed (offline, DNS, CORS, etc.) |

## Types

`GithubUser`, `GitlabUser`, `TwitterUser`, `LinkedinUser`, and `NpmStats` are re-exported from
`metrics-api-server` so consumers don't need a direct dependency on that package just for types.
`GithubUser` includes the nested `profile`, `repos[]`, and `contributions` (with optional `byType`)
shapes described above.
