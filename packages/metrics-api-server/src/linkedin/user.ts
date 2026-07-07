import type { FetchFn, LinkedinUser } from '../types.js';
import { fetchLinkedinHtml } from './fetch.js';
import { parseLinkedinProfile } from './profile.js';

export interface GetLinkedinUserOptions {
  fetchFn?: FetchFn;
}

export async function getLinkedinUser(user: string, opts: GetLinkedinUserOptions = {}): Promise<LinkedinUser> {
  const { fetchFn = fetch } = opts;
  const html = await fetchLinkedinHtml(user, { fetchFn });
  return { profile: parseLinkedinProfile(html, user) };
}
