import { createUserHandler, isValidGithubUsername, parseYears, scrapeGithubContributions } from 'metrics-api-server';

export const GET = createUserHandler(
  ({ user, url }) => scrapeGithubContributions(user, { years: parseYears(url) }),
  isValidGithubUsername,
);
