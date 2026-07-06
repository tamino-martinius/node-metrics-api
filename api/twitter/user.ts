import { createUserHandler, getTwitterUser, isValidTwitterUsername } from 'metrics-api-server';

export const GET = createUserHandler(({ user }) => getTwitterUser(user), isValidTwitterUsername);
