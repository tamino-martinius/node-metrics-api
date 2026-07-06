import type { GithubUser, GitlabUser, NpmStats } from 'metrics-api-server';

export type { GithubUser, GitlabUser, NpmStats };

export const DEFAULT_BASE_URL = 'https://metrics-api.tamino.dev';

export type MetricsApiErrorKind = 'bad-request' | 'not-found' | 'upstream' | 'network';

export class MetricsApiError extends Error {
  constructor(
    readonly kind: MetricsApiErrorKind,
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'MetricsApiError';
  }
}

export interface MetricsApiClientOptions {
  /** Base URL of a hosted metrics-api-server; defaults to the reference deployment. */
  baseUrl?: string;
  fetch?: typeof fetch;
}

export class MetricsApiClient {
  readonly #baseUrl: string;
  readonly #fetch: typeof fetch;

  constructor(options: MetricsApiClientOptions = {}) {
    this.#baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
    this.#fetch = options.fetch ?? globalThis.fetch.bind(globalThis);
  }

  async #get<T>(path: string, params: Record<string, string> = {}, token?: string): Promise<T> {
    const query = new URLSearchParams(params).toString();
    const url = `${this.#baseUrl}${path}${query ? `?${query}` : ''}`;
    const init = token ? { headers: { authorization: `Bearer ${token}` } } : undefined;
    let response: Response;
    try {
      response = await this.#fetch(url, init);
    } catch (error) {
      throw new MetricsApiError('network', 0, `request failed: ${String(error)}`);
    }
    if (!response.ok) {
      const kind: MetricsApiErrorKind =
        response.status === 404 ? 'not-found' : response.status === 400 ? 'bad-request' : 'upstream';
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      throw new MetricsApiError(kind, response.status, body.error ?? `request failed with ${response.status}`);
    }
    return response.json() as Promise<T>;
  }

  github(
    user: string,
    options: { years?: 'all' | 'last' | number[]; token?: string; lifetime?: boolean } = {},
  ): Promise<GithubUser> {
    const params: Record<string, string> = {};
    if (options.years && options.years !== 'all') {
      params.y = Array.isArray(options.years) ? options.years.join(',') : options.years;
    }
    if (options.lifetime) params.lifetime = '1';
    return this.#get(`/github/${encodeURIComponent(user)}`, params, options.token);
  }

  gitlab(user: string, options: { token?: string } = {}): Promise<GitlabUser> {
    return this.#get(`/gitlab/${encodeURIComponent(user)}`, {}, options.token);
  }

  npmStats(user: string, options: { months?: number } = {}): Promise<NpmStats> {
    const params: Record<string, string> = {};
    if (options.months !== undefined) params.months = String(options.months);
    return this.#get(`/npm/${encodeURIComponent(user)}`, params);
  }
}
