import { UserNotFoundError } from '../errors.js';
import type { FetchFn, GitlabProfile } from '../types.js';
import { gitlabApiCount, gitlabApiFetch } from './api.js';

interface GitlabUserListEntry {
  id: number;
  name: string;
  username: string;
  avatar_url: string | null;
  web_url: string;
}

interface GitlabUserDetail {
  bio?: string | null;
  location?: string | null;
  created_at?: string;
  job_title?: string | null;
  organization?: string | null;
}

export async function resolveGitlabUser(
  user: string,
  { fetchFn = fetch }: { fetchFn?: FetchFn } = {},
): Promise<{ id: number; profile: GitlabProfile }> {
  const list = await gitlabApiFetch<GitlabUserListEntry[]>(`/users?username=${encodeURIComponent(user)}`, { fetchFn });
  const entry = list[0];
  if (!entry) throw new UserNotFoundError(user);
  return {
    id: entry.id,
    profile: {
      name: entry.name,
      username: entry.username,
      bio: '',
      avatarUrl: entry.avatar_url ?? '',
      url: entry.web_url,
      followerCount: 0,
      followingCount: 0,
    },
  };
}

export async function enrichGitlabProfile(
  id: number,
  base: GitlabProfile,
  { token, fetchFn = fetch }: { token: string; fetchFn?: FetchFn },
): Promise<GitlabProfile> {
  const [detail, followerCount, followingCount] = await Promise.all([
    gitlabApiFetch<GitlabUserDetail>(`/users/${id}`, { token, fetchFn }),
    gitlabApiCount(`/users/${id}/followers?per_page=1`, { token, fetchFn }),
    gitlabApiCount(`/users/${id}/following?per_page=1`, { token, fetchFn }),
  ]);
  return {
    ...base,
    bio: detail.bio ?? '',
    location: detail.location ?? null,
    accountCreatedAt: detail.created_at,
    jobTitle: detail.job_title ?? '',
    organization: detail.organization ?? '',
    followerCount,
    followingCount,
  };
}
