// Local dev server mirroring vercel.json's rewrites. Usage: npx tsx scripts/dev-server.mjs [port]
import { createServer } from 'node:http';
import { GET as contributions } from '../api/github/contributions.ts';
import { GET as profile } from '../api/github/profile.ts';
import { GET as repos } from '../api/github/repos.ts';
import { GET as npmStats } from '../api/npm/stats.ts';

const PORT = Number(process.argv[2] ?? 8787);

const route = (pathname) => {
  let match = pathname.match(/^\/github\/([^/]+)\/(contributions|profile|repos)$/);
  if (match) return { handler: { contributions, profile, repos }[match[2]], user: match[1] };
  match = pathname.match(/^\/npm\/([^/]+)$/);
  if (match) return { handler: npmStats, user: match[1] };
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
