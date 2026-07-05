import { createUserHandler, isValidGithubUsername, scrapeGithubRepos } from 'metrics-api-server';

export const GET = createUserHandler(({ user }) => scrapeGithubRepos(user), isValidGithubUsername);
