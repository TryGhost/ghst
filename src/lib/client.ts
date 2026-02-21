import { generateAdminToken, parseAdminApiKey } from './auth.js';
import { ExitCode, GhstError, mapHttpStatusToExitCode } from './errors.js';

export interface GhostClientConfig {
  url: string;
  key?: string;
  contentKey?: string;
  version?: string;
}

export interface GhostApiErrorPayload {
  errors?: Array<{ message?: string; context?: string; type?: string }>;
  [key: string]: unknown;
}

export interface GhostPaginatedResponse extends Record<string, unknown> {
  meta?: Record<string, unknown>;
}

type RequestApi = 'admin' | 'content';

export class GhostApiError extends GhstError {
  readonly payload: GhostApiErrorPayload | null;

  constructor(status: number, message: string, payload: GhostApiErrorPayload | null) {
    super(message, {
      exitCode: mapHttpStatusToExitCode(status),
      status,
      code: 'GHOST_API_ERROR',
      details: payload,
    });
    this.payload = payload;
  }
}

function isReadMethod(method: string): boolean {
  const normalized = method.toUpperCase();
  return normalized === 'GET' || normalized === 'HEAD';
}

function getRetryDelay(attempt: number): number {
  if (process.env.VITEST) {
    return 0;
  }

  return 1000 * 2 ** attempt;
}

async function wait(ms: number): Promise<void> {
  if (ms <= 0) {
    return;
  }

  await new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

export class GhostClient {
  private readonly url: string;
  private readonly key?: string;
  private readonly contentKey?: string;
  private readonly version: string;

  constructor(config: GhostClientConfig) {
    if (!config.key && !config.contentKey) {
      throw new GhstError('Ghost client requires an admin key or content key.', {
        exitCode: ExitCode.USAGE_ERROR,
        code: 'USAGE_ERROR',
      });
    }

    if (config.key) {
      parseAdminApiKey(config.key);
    }

    this.url = config.url.replace(/\/$/, '');
    this.key = config.key;
    this.contentKey = config.contentKey;
    this.version = config.version ?? 'v6.0';
  }

  private async request<T>(
    method: string,
    endpointPath: string,
    options: {
      params?: Record<string, string | number | boolean | undefined>;
      body?: unknown;
      source?: 'html';
      api?: RequestApi;
    } = {},
  ): Promise<T> {
    const api = options.api ?? 'admin';
    const upperMethod = method.toUpperCase();
    const maxNetworkRetries = isReadMethod(upperMethod) ? 1 : 0;
    let networkRetryCount = 0;
    let rateRetryCount = 0;

    while (true) {
      const url = new URL(`/ghost/api/${api}${endpointPath}`, this.url);

      if (options.params) {
        for (const [key, value] of Object.entries(options.params)) {
          if (value !== undefined) {
            url.searchParams.set(key, String(value));
          }
        }
      }

      if (options.source) {
        url.searchParams.set('source', options.source);
      }

      const headers: Record<string, string> = {
        'Accept-Version': this.version,
        'Content-Type': 'application/json',
      };

      if (api === 'admin') {
        if (!this.key) {
          throw new GhstError('Admin API key is required for this request.', {
            code: 'AUTH_REQUIRED',
            exitCode: ExitCode.AUTH_ERROR,
          });
        }

        const token = await generateAdminToken(this.key);
        headers.Authorization = `Ghost ${token}`;
      } else {
        if (!this.contentKey) {
          throw new GhstError('GHOST_CONTENT_API_KEY is required for --content-api requests.', {
            code: 'AUTH_REQUIRED',
            exitCode: ExitCode.AUTH_ERROR,
          });
        }

        url.searchParams.set('key', this.contentKey);
      }

      let response: Response;
      try {
        response = await fetch(url.toString(), {
          method: upperMethod,
          headers,
          body: options.body ? JSON.stringify(options.body) : undefined,
        });
      } catch (error) {
        if (networkRetryCount < maxNetworkRetries) {
          networkRetryCount += 1;
          continue;
        }

        throw new GhstError(`Network request failed: ${(error as Error).message}`, {
          code: 'NETWORK_ERROR',
          exitCode: ExitCode.GENERAL_ERROR,
        });
      }

      if (response.status === 429 && rateRetryCount < 3) {
        const delay = getRetryDelay(rateRetryCount);
        rateRetryCount += 1;
        await wait(delay);
        continue;
      }

      if (!response.ok) {
        let payload: GhostApiErrorPayload | null = null;
        try {
          payload = (await response.json()) as GhostApiErrorPayload;
        } catch {
          payload = null;
        }

        const ghostMessage =
          payload?.errors?.[0]?.message ?? `Ghost API request failed (${response.status})`;
        throw new GhostApiError(response.status, ghostMessage, payload);
      }

      if (response.status === 204) {
        return {} as T;
      }

      return (await response.json()) as T;
    }
  }

  async siteInfo(): Promise<Record<string, unknown>> {
    return this.request<Record<string, unknown>>('GET', '/site/');
  }

  async rawRequest<T>(
    path: string,
    method = 'GET',
    body?: unknown,
    params?: Record<string, string | number | boolean | undefined>,
    options: { api?: RequestApi } = {},
  ): Promise<T> {
    const normalized = path.startsWith('/') ? path : `/${path}`;
    return this.request<T>(method.toUpperCase(), normalized, {
      body,
      params,
      api: options.api,
    });
  }

  posts = {
    browse: (params?: Record<string, string | number | boolean | undefined>) =>
      this.request<GhostPaginatedResponse>('GET', '/posts/', { params }),

    read: (
      idOrSlug: string,
      options: {
        bySlug?: boolean;
        params?: Record<string, string | number | boolean | undefined>;
      } = {},
    ) => {
      if (options.bySlug) {
        return this.request<Record<string, unknown>>('GET', `/posts/slug/${idOrSlug}/`, {
          params: options.params,
        });
      }

      return this.request<Record<string, unknown>>('GET', `/posts/${idOrSlug}/`, {
        params: options.params,
      });
    },

    add: (post: Record<string, unknown>, source?: 'html') =>
      this.request<Record<string, unknown>>('POST', '/posts/', {
        body: { posts: [post] },
        source,
      }),

    edit: (id: string, post: Record<string, unknown>, source?: 'html') =>
      this.request<Record<string, unknown>>('PUT', `/posts/${id}/`, {
        body: { posts: [post] },
        source,
      }),

    delete: (id: string) => this.request<Record<string, never>>('DELETE', `/posts/${id}/`),
  };

  pages = {
    browse: (params?: Record<string, string | number | boolean | undefined>) =>
      this.request<GhostPaginatedResponse>('GET', '/pages/', { params }),

    read: (
      idOrSlug: string,
      options: {
        bySlug?: boolean;
        params?: Record<string, string | number | boolean | undefined>;
      } = {},
    ) => {
      if (options.bySlug) {
        return this.request<Record<string, unknown>>('GET', `/pages/slug/${idOrSlug}/`, {
          params: options.params,
        });
      }

      return this.request<Record<string, unknown>>('GET', `/pages/${idOrSlug}/`, {
        params: options.params,
      });
    },

    add: (page: Record<string, unknown>, source?: 'html') =>
      this.request<Record<string, unknown>>('POST', '/pages/', {
        body: { pages: [page] },
        source,
      }),

    edit: (id: string, page: Record<string, unknown>, source?: 'html') =>
      this.request<Record<string, unknown>>('PUT', `/pages/${id}/`, {
        body: { pages: [page] },
        source,
      }),

    delete: (id: string) => this.request<Record<string, never>>('DELETE', `/pages/${id}/`),
  };

  tags = {
    browse: (params?: Record<string, string | number | boolean | undefined>) =>
      this.request<GhostPaginatedResponse>('GET', '/tags/', { params }),

    read: (
      idOrSlug: string,
      options: {
        bySlug?: boolean;
        params?: Record<string, string | number | boolean | undefined>;
      } = {},
    ) => {
      if (options.bySlug) {
        return this.request<Record<string, unknown>>('GET', `/tags/slug/${idOrSlug}/`, {
          params: options.params,
        });
      }

      return this.request<Record<string, unknown>>('GET', `/tags/${idOrSlug}/`, {
        params: options.params,
      });
    },

    add: (tag: Record<string, unknown>) =>
      this.request<Record<string, unknown>>('POST', '/tags/', {
        body: { tags: [tag] },
      }),

    edit: (id: string, tag: Record<string, unknown>) =>
      this.request<Record<string, unknown>>('PUT', `/tags/${id}/`, {
        body: { tags: [tag] },
      }),

    delete: (id: string) => this.request<Record<string, never>>('DELETE', `/tags/${id}/`),
  };
}
