import { describe, expect, it } from 'vitest';
import { isValidGithubUsername, isValidGitlabUsername, isValidNpmUsername } from '../validate.js';

describe('isValidGithubUsername', () => {
  it('accepts normal usernames', () => {
    expect(isValidGithubUsername('slavadev')).toBe(true);
    expect(isValidGithubUsername('tamino-martinius')).toBe(true);
    expect(isValidGithubUsername('a')).toBe(true);
  });
  it('rejects invalid usernames', () => {
    expect(isValidGithubUsername('')).toBe(false);
    expect(isValidGithubUsername('-leading')).toBe(false);
    expect(isValidGithubUsername('trailing-')).toBe(false);
    expect(isValidGithubUsername('double--dash')).toBe(false);
    expect(isValidGithubUsername('a'.repeat(40))).toBe(false);
    expect(isValidGithubUsername('has/slash')).toBe(false);
    expect(isValidGithubUsername('has space')).toBe(false);
  });
});

describe('isValidNpmUsername', () => {
  it('accepts npm usernames', () => {
    expect(isValidNpmUsername('tamino-martinius')).toBe(true);
    expect(isValidNpmUsername('a.b_c-d')).toBe(true);
  });
  it('rejects invalid npm usernames', () => {
    expect(isValidNpmUsername('')).toBe(false);
    expect(isValidNpmUsername('UPPER')).toBe(false);
    expect(isValidNpmUsername('.leading')).toBe(false);
    expect(isValidNpmUsername('a'.repeat(65))).toBe(false);
  });
});

describe('isValidGitlabUsername', () => {
  it('accepts gitlab usernames', () => {
    expect(isValidGitlabUsername('tamino-martinius')).toBe(true);
    expect(isValidGitlabUsername('stanhu')).toBe(true);
    expect(isValidGitlabUsername('a.b_c-d')).toBe(true);
    expect(isValidGitlabUsername('a')).toBe(true);
  });
  it('rejects invalid gitlab usernames', () => {
    expect(isValidGitlabUsername('')).toBe(false);
    expect(isValidGitlabUsername('.leading')).toBe(false);
    expect(isValidGitlabUsername('trailing.')).toBe(false);
    expect(isValidGitlabUsername('has/slash')).toBe(false);
    expect(isValidGitlabUsername('has space')).toBe(false);
    expect(isValidGitlabUsername('ends.git')).toBe(false);
    expect(isValidGitlabUsername('feed.atom')).toBe(false);
    expect(isValidGitlabUsername('a'.repeat(256))).toBe(false);
  });
});
