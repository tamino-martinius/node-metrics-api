import { createUserHandler, isValidGithubUsername, scrapeGithubProfile } from 'metrics-api-server';

export const GET = createUserHandler(({ user }) => scrapeGithubProfile(user), isValidGithubUsername);
