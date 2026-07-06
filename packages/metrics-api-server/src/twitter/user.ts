import type { FetchFn, TwitterUser } from '../types.js';
import { fetchTwitterUserRaw } from './fetch.js';
import { parseTwitterProfile } from './profile.js';

export interface GetTwitterUserOptions {
  fetchFn?: FetchFn;
}

export async function getTwitterUser(user: string, opts: GetTwitterUserOptions = {}): Promise<TwitterUser> {
  const { fetchFn = fetch } = opts;
  const result = await fetchTwitterUserRaw(user, { fetchFn });
  return { profile: parseTwitterProfile(result) };
}
