export class ScrapeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ScrapeError';
  }
}

export class UserNotFoundError extends Error {
  constructor(user: string) {
    super(`user not found: ${user}`);
    this.name = 'UserNotFoundError';
  }
}

export class GithubTokenError extends Error {
  constructor(message = 'github token was rejected') {
    super(message);
    this.name = 'GithubTokenError';
  }
}

export class GithubRateLimitError extends Error {
  constructor(message = 'github graphql rate limit exceeded') {
    super(message);
    this.name = 'GithubRateLimitError';
  }
}
