import { describe, expect, it } from 'vitest';
import { GithubRateLimitError, GithubTokenError, GitlabApiError, GitlabRateLimitError, GitlabTokenError } from '../errors.js';

describe('github graphql errors', () => {
  it('GithubTokenError has name and default message', () => {
    const e = new GithubTokenError();
    expect(e).toBeInstanceOf(Error);
    expect(e.name).toBe('GithubTokenError');
    expect(e.message).toMatch(/token/i);
  });
  it('GithubRateLimitError has name and default message', () => {
    const e = new GithubRateLimitError();
    expect(e.name).toBe('GithubRateLimitError');
    expect(e.message).toMatch(/rate limit/i);
  });
});

describe('gitlab error classes', () => {
  it('set names and are Error instances', () => {
    expect(new GitlabTokenError().name).toBe('GitlabTokenError');
    expect(new GitlabRateLimitError().name).toBe('GitlabRateLimitError');
    expect(new GitlabApiError('boom')).toBeInstanceOf(Error);
    expect(new GitlabApiError('boom').message).toBe('boom');
  });
});
