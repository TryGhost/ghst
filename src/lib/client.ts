import { generateAdminToken, parseAdminApiKey } from './auth.js';
import { ExitCode, GhstError, mapHttpStatusToExitCode } from './errors.js';

export interface GhostClientConfig {
  url: string;
  key: string;
  version?: string;
}

export interface GhostApiErrorPayload {
  errors?: Array<{ message?: string; context?: string; type?: string }>;
  [key: string]: unknown;
}

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

export class GhostClient {
  private readonly url: string;
  private readonly key: string;
  private readonly version: string;

  constructor(config: GhostClientConfig) {
    parseAdminApiKey(config.key);
    this.url = config.url.replace(/\/$/, '');
    this.key = config.key;
    this.version = config.version ?? 'v6.0';
  }

  private async request<T>(
    method: string,
    endpointPath: string,
    options: {
      params?: Record<string, string | number | boolean | undefined>;
      body?: unknown;
      source?: 'html';
    } = {},
  ): Promise<T> {
    const token = await generateAdminToken(this.key);
    const url = new URL(`/ghost/api/admin${endpointPath}`, this.url);

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

    let response: Response;
    try {
      response = await fetch(url.toString(), {
        method,
        headers: {
          Authorization: `Ghost ${token}`,
          'Accept-Version': this.version,
          'Content-Type': 'application/json',
        },
        body: options.body ? JSON.stringify(options.body) : undefined,
      });
    } catch (error) {
      throw new GhstError(`Network request failed: ${(error as Error).message}`, {
        code: 'NETWORK_ERROR',
        exitCode: ExitCode.GENERAL_ERROR,
      });
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

  async siteInfo(): Promise<Record<string, unknown>> {
    return this.request<Record<string, unknown>>('GET', '/site/');
  }

  async rawRequest<T>(
    path: string,
    method = 'GET',
    body?: unknown,
    params?: Record<string, string | number | boolean | undefined>,
  ): Promise<T> {
    const normalized = path.startsWith('/') ? path : `/${path}`;
    return this.request<T>(method.toUpperCase(), normalized, {
      body,
      params,
    });
  }

  posts = {
    browse: (params?: Record<string, string | number | boolean | undefined>) =>
      this.request<Record<string, unknown>>('GET', '/posts/', { params }),

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
    browse: () => this.request<Record<string, unknown>>('GET', '/pages/'),
    read: (id: string) => this.request<Record<string, unknown>>('GET', `/pages/${id}/`),
  };

  tags = {
    browse: () => this.request<Record<string, unknown>>('GET', '/tags/'),
    read: (id: string) => this.request<Record<string, unknown>>('GET', `/tags/${id}/`),
  };
}
