import { describe, expect, it } from 'vitest';
import { isValidGithubUsername, isValidNpmUsername } from '../validate.js';

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
