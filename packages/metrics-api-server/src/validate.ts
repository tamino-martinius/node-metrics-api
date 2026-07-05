const GITHUB_USERNAME_RE = /^[a-zA-Z\d](?:[a-zA-Z\d]|-(?=[a-zA-Z\d])){0,38}$/;
const NPM_USERNAME_RE = /^[a-z\d](?:[a-z\d._-]*[a-z\d])?$/;

export const isValidGithubUsername = (user: string): boolean => GITHUB_USERNAME_RE.test(user) && !user.includes('--');

export const isValidNpmUsername = (user: string): boolean => user.length <= 64 && NPM_USERNAME_RE.test(user);
