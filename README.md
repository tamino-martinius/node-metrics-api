# node-metrics-api

Scrapes public GitHub profile data and aggregates npm registry stats into clean JSON.
Packages: `metrics-api-server` (scrapers) and `metrics-api-client` (typed wrapper).
Deployed at https://metrics-api.tamino.dev via Vercel.

## Deployment (owner steps)

1. vercel.com → Add New Project → import `tamino-martinius/node-metrics-api` (defaults; vercel.json drives install/build).
2. Project → Settings → Domains → add `metrics-api.tamino.dev`.
3. DNS: CNAME `metrics-api` → `cname.vercel-dns.com`.
4. Verify: `curl https://metrics-api.tamino.dev/github/tamino-martinius/profile`.
