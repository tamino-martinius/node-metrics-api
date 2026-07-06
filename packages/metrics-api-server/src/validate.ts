const GITHUB_USERNAME_RE = /^[a-zA-Z\d](?:[a-zA-Z\d]|-(?=[a-zA-Z\d])){0,38}$/;
const NPM_USERNAME_RE = /^[a-z\d](?:[a-z\d._-]*[a-z\d])?$/;
const GITLAB_USERNAME_RE = /^[a-zA-Z\d](?:[a-zA-Z\d._-]{0,253}[a-zA-Z\d])?$/;

export const isValidGithubUsername = (user: string): boolean => GITHUB_USERNAME_RE.test(user) && !user.includes('--');

export const isValidNpmUsername = (user: string): boolean => user.length <= 64 && NPM_USERNAME_RE.test(user);

export const isValidGitlabUsername = (user: string): boolean =>
  user.length <= 255 && GITLAB_USERNAME_RE.test(user) && !/\.(git|atom)$/i.test(user);
