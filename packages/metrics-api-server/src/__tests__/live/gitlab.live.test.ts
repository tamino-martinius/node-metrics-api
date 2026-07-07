import { describe, expect, it } from 'vitest';
import { getGitlabUser } from '../../gitlab/user.js';

const token = process.env.GITLAB_TOKEN;

describe('gitlab live (public)', () => {
  it('fetches a known public user with public projects + a populated calendar', async () => {
    const out = await getGitlabUser('stanhu');
    expect(out.profile.username).toBe('stanhu');
    expect(out.projects.length).toBeGreaterThan(0);
    expect(out.contributions.contributions.length).toBeGreaterThan(0);
    expect(out.contributions.total.lastYear).toBeGreaterThan(0);
  }, 30_000);
});

describe.runIf(Boolean(token))('gitlab live (token enrichment)', () => {
  it('enriches profile fields and follower counts with a server token', async () => {
    const out = await getGitlabUser('stanhu', { serverToken: token });
    expect(out.profile.accountCreatedAt).toBeTruthy();
    expect(out.profile.followerCount).toBeGreaterThan(0);
    expect(out.projects[0].language).not.toBeUndefined();
  }, 30_000);
});
