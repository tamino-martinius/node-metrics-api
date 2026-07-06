import { githubUserResponse } from 'metrics-api-server';

const handler = (request: Request): Promise<Response> =>
  githubUserResponse(request, { serverToken: process.env.GITHUB_TOKEN });

export const GET = handler;
export const OPTIONS = handler;
