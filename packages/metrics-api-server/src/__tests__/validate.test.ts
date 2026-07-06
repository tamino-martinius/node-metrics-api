import { describe, expect, it } from 'vitest';
import {
  isValidGithubUsername,
  isValidLinkedinUsername,
  isValidNpmUsername,
  isValidTwitterUsername,
} from '../validate.js';

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

describe('isValidTwitterUsername', () => {
  it('accepts twitter handles', () => {
    expect(isValidTwitterUsername('jack')).toBe(true);
    expect(isValidTwitterUsername('TaminoMartinius')).toBe(true); // 15 chars, the max
    expect(isValidTwitterUsername('a')).toBe(true);
    expect(isValidTwitterUsername('with_underscore')).toBe(true);
    expect(isValidTwitterUsername('digits123')).toBe(true);
  });
  it('rejects invalid twitter handles', () => {
    expect(isValidTwitterUsername('')).toBe(false);
    expect(isValidTwitterUsername('a'.repeat(16))).toBe(false); // over 15 chars
    expect(isValidTwitterUsername('has-dash')).toBe(false);
    expect(isValidTwitterUsername('has.dot')).toBe(false);
    expect(isValidTwitterUsername('has space')).toBe(false);
    expect(isValidTwitterUsername('@handle')).toBe(false);
  });
});

describe('isValidLinkedinUsername', () => {
  it('accepts LinkedIn vanity slugs', () => {
    expect(isValidLinkedinUsername('tamino-martinius')).toBe(true);
    expect(isValidLinkedinUsername('williamhgates')).toBe(true);
    expect(isValidLinkedinUsername('tamino-martinius-0a1b2c3d')).toBe(true);
    expect(isValidLinkedinUsername('abc')).toBe(true); // 3-char minimum
  });
  it('rejects invalid LinkedIn slugs', () => {
    expect(isValidLinkedinUsername('')).toBe(false);
    expect(isValidLinkedinUsername('ab')).toBe(false); // too short
    expect(isValidLinkedinUsername('a'.repeat(101))).toBe(false); // too long
    expect(isValidLinkedinUsername('has space')).toBe(false);
    expect(isValidLinkedinUsername('has/slash')).toBe(false);
    expect(isValidLinkedinUsername('has.dot')).toBe(false);
    expect(isValidLinkedinUsername('in/tamino')).toBe(false);
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
