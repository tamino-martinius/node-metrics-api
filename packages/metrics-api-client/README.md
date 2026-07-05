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

const profile = await api.githubProfile('octocat');
const contributions = await api.githubContributions('octocat', { years: 'all' });
```

Other methods:

```ts
const repos = await api.githubRepos('octocat');
const npmStats = await api.npmStats('octocat', { months: 6 }); // 1–17, default 12
```

`githubContributions`'s `years` option accepts `'all'` (default), `'last'` (rolling last 12
months), or a `number[]` of calendar years — mirroring the server's `y` query param.

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
  await api.githubProfile('this-user-does-not-exist-hopefully');
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
| `upstream` | other non-2xx | server-side scrape/aggregation failure |
| `network` | — (status `0`) | the request itself failed (offline, DNS, CORS, etc.) |

## Types

`GithubContributions`, `GithubProfile`, `GithubRepo`, and `NpmStats` are re-exported from
`metrics-api-server` so consumers don't need a direct dependency on that package just for types.
