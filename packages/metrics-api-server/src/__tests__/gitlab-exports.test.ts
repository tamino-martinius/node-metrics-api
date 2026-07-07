import { describe, expect, it } from 'vitest';
import * as pkg from '../index.js';

describe('package exports', () => {
  it('re-exports the gitlab entry points from the package root', () => {
    expect(typeof pkg.gitlabUserResponse).toBe('function');
    expect(typeof pkg.getGitlabUser).toBe('function');
    expect(typeof pkg.fetchGitlabContributions).toBe('function');
    expect(typeof pkg.isValidGitlabUsername).toBe('function');
  });
});
