import { createUserHandler, fetchNpmStats, isValidNpmUsername, parseMonths } from 'metrics-api-server';

export const GET = createUserHandler(
  ({ user, url }) => fetchNpmStats(user, { months: parseMonths(url) }),
  isValidNpmUsername,
);
