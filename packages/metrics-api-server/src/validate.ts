const GITHUB_USERNAME_RE = /^[a-zA-Z\d](?:[a-zA-Z\d]|-(?=[a-zA-Z\d])){0,38}$/;
const NPM_USERNAME_RE = /^[a-z\d](?:[a-z\d._-]*[a-z\d])?$/;
// Twitter/X handles: 1–15 characters, letters, digits and underscore only.
const TWITTER_USERNAME_RE = /^\w{1,15}$/;
// LinkedIn vanity slugs (/in/<slug>): 3–100 characters, letters, digits and hyphens.
const LINKEDIN_USERNAME_RE = /^[a-zA-Z0-9-]{3,100}$/;

export const isValidGithubUsername = (user: string): boolean => GITHUB_USERNAME_RE.test(user) && !user.includes('--');

export const isValidNpmUsername = (user: string): boolean => user.length <= 64 && NPM_USERNAME_RE.test(user);

export const isValidTwitterUsername = (user: string): boolean => TWITTER_USERNAME_RE.test(user);

export const isValidLinkedinUsername = (user: string): boolean => LINKEDIN_USERNAME_RE.test(user);
