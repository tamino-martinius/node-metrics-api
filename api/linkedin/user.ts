import { createUserHandler, getLinkedinUser, isValidLinkedinUsername } from 'metrics-api-server';

export const GET = createUserHandler(({ user }) => getLinkedinUser(user), isValidLinkedinUsername);
