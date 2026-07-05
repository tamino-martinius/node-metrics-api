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
