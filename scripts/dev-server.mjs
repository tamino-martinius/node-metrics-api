// Local dev server mirroring vercel.json's rewrites. Usage: npx tsx scripts/dev-server.mjs [port]
import { createServer } from 'node:http';
import { GET as githubUser } from '../api/github/user.ts';
import { GET as gitlabUser } from '../api/gitlab/user.ts';
import { GET as linkedinUser } from '../api/linkedin/user.ts';
import { GET as npmStats } from '../api/npm/stats.ts';
import { GET as twitterUser } from '../api/twitter/user.ts';

const PORT = Number(process.argv[2] ?? 8787);

const routes = [
  [/^\/github\/([^/]+)$/, githubUser],
  [/^\/gitlab\/([^/]+)$/, gitlabUser],
  [/^\/twitter\/([^/]+)$/, twitterUser],
  [/^\/linkedin\/([^/]+)$/, linkedinUser],
  [/^\/npm\/([^/]+)$/, npmStats],
];

const route = (pathname) => {
  for (const [pattern, handler] of routes) {
    const match = pathname.match(pattern);
    if (match) return { handler, user: match[1] };
  }
  return null;
};

createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const matched = route(url.pathname);
  if (!matched) {
    res.writeHead(404, { 'content-type': 'application/json' }).end('{"error":"not found"}');
    return;
  }
  url.searchParams.set('user', decodeURIComponent(matched.user));
  const response = await matched.handler(new Request(url));
  res.writeHead(response.status, Object.fromEntries(response.headers));
  res.end(Buffer.from(await response.arrayBuffer()));
}).listen(PORT, () => console.log(`metrics-api dev server on http://localhost:${PORT}`));
