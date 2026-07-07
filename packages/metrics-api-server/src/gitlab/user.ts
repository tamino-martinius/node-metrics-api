import { GitlabTokenError } from '../errors.js';
import type { FetchFn, GitlabContributions, GitlabProfile, GitlabProject, GitlabUser } from '../types.js';
import { fetchGitlabContributions } from './contributions.js';
import { fetchGitlabByType } from './events.js';
import { enrichGitlabProfile, resolveGitlabUser } from './profile.js';
import { fetchGitlabProjects } from './projects.js';

export interface GetGitlabUserOptions {
  serverToken?: string;
  callerToken?: string;
  fetchFn?: FetchFn;
  now?: Date;
}

// A rejected enrichment call rethrows only when the caller supplied a token that GitLab rejected.
function rethrowIfCallerToken(reason: unknown, callerToken: string | undefined): void {
  if (callerToken && reason instanceof GitlabTokenError) throw reason;
}

export async function getGitlabUser(user: string, opts: GetGitlabUserOptions = {}): Promise<GitlabUser> {
  const { serverToken, callerToken, fetchFn = fetch, now } = opts;
  const token = callerToken ?? serverToken;

  // Primary lookup is anonymous; UserNotFoundError / GitlabApiError propagate to the handler.
  const { id, profile: base } = await resolveGitlabUser(user, { fetchFn });

  const [profileR, projectsR, contribR, byTypeR] = await Promise.allSettled([
    token ? enrichGitlabProfile(id, base, { token, fetchFn }) : Promise.resolve(base),
    fetchGitlabProjects(id, { token, fetchFn }),
    fetchGitlabContributions(user, { fetchFn }),
    token ? fetchGitlabByType(id, { token, fetchFn, now }) : Promise.resolve(null),
  ]);

  const warnings: string[] = [];

  let profile: GitlabProfile = base;
  if (profileR.status === 'fulfilled') profile = profileR.value;
  else {
    rethrowIfCallerToken(profileR.reason, callerToken);
    warnings.push('profile enrichment: unavailable');
  }

  let projects: GitlabProject[] = [];
  if (projectsR.status === 'fulfilled') projects = projectsR.value;
  else {
    rethrowIfCallerToken(projectsR.reason, callerToken);
    warnings.push('projects: unavailable');
  }

  let contributions: GitlabContributions = { total: {}, contributions: [] };
  if (contribR.status === 'fulfilled') contributions = contribR.value;
  else warnings.push('contributions: unavailable');

  if (byTypeR.status === 'fulfilled') {
    if (byTypeR.value) {
      contributions.byType = byTypeR.value.byType;
      if (byTypeR.value.truncated) warnings.push('contributions: byType approximate');
    }
  } else {
    rethrowIfCallerToken(byTypeR.reason, callerToken);
    warnings.push('enrichment: unavailable');
  }

  const result: GitlabUser = { profile, projects, contributions };
  if (warnings.length > 0) result.warnings = warnings;
  return result;
}
