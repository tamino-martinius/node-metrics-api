import type { FetchFn, TwitterUser } from '../types.js';
import { fetchTwitterHtml } from './fetch.js';
import { parseTwitterProfile } from './profile.js';

export interface GetTwitterUserOptions {
  fetchFn?: FetchFn;
}

export async function getTwitterUser(user: string, opts: GetTwitterUserOptions = {}): Promise<TwitterUser> {
  const { fetchFn = fetch } = opts;
  const html = await fetchTwitterHtml(user, { fetchFn });
  return { profile: parseTwitterProfile(html, user) };
}
