import { gitlabUserResponse } from 'metrics-api-server';

const handler = (request: Request): Promise<Response> =>
  gitlabUserResponse(request, { serverToken: process.env.GITLAB_TOKEN });

export const GET = handler;
export const OPTIONS = handler;
