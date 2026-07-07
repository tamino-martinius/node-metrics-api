import { GitlabApiError, GitlabRateLimitError, GitlabTokenError } from '../errors.js';
import type { FetchFn } from '../types.js';

export const GITLAB_API = 'https://gitlab.com/api/v4';

const USER_AGENT = 'metrics-api (+https://github.com/tamino-martinius/node-metrics-api)';

export interface GitlabApiOptions {
  token?: string;
  fetchFn?: FetchFn;
}

function headers(token?: string): Record<string, string> {
  const h: Record<string, string> = { accept: 'application/json', 'user-agent': USER_AGENT };
  if (token) h['private-token'] = token;
  return h;
}

function throwForStatus(status: number, path: string): never {
  if (status === 401 || status === 403) throw new GitlabTokenError();
  if (status === 429) throw new GitlabRateLimitError();
  throw new GitlabApiError(`gitlab returned ${status} for ${path}`);
}

export async function gitlabApiFetch<T>(path: string, { token, fetchFn = fetch }: GitlabApiOptions = {}): Promise<T> {
  const response = await fetchFn(`${GITLAB_API}${path}`, { headers: headers(token) });
  if (!response.ok) throwForStatus(response.status, path);
  return response.json() as Promise<T>;
}

export async function gitlabApiCount(path: string, { token, fetchFn = fetch }: GitlabApiOptions = {}): Promise<number> {
  const response = await fetchFn(`${GITLAB_API}${path}`, { headers: headers(token) });
  if (!response.ok) throwForStatus(response.status, path);
  return Number(response.headers.get('x-total') ?? 0);
}
