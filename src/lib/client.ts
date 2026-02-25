import { generateStaffJwt, parseStaffAccessToken } from './auth.js';
import { ExitCode, GhstError, mapHttpStatusToExitCode } from './errors.js';

export interface GhostClientConfig {
  url: string;
  staffToken?: string;
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
type ResponseType = 'json' | 'text' | 'buffer';

export interface GhostResponseWithMeta<T> {
  data: T;
  status: number;
  headers: Record<string, string>;
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

function isFormDataBody(value: unknown): value is FormData {
  return typeof FormData !== 'undefined' && value instanceof FormData;
}

function isTierNotFoundAnomaly(
  status: number,
  endpointPath: string,
  payload: GhostApiErrorPayload | null,
): boolean {
  if (status !== 500 || !/^\/tiers\/[^/]+\/$/.test(endpointPath)) {
    return false;
  }

  const context = payload?.errors?.[0]?.context ?? '';
  return (
    context.includes('Cannot read properties of null') ||
    context.includes('Cannot set properties of null')
  );
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
  private readonly staffToken?: string;
  private readonly contentKey?: string;
  private readonly version: string;

  constructor(config: GhostClientConfig) {
    if (!config.staffToken && !config.contentKey) {
      throw new GhstError('Ghost client requires a staff access token or content key.', {
        exitCode: ExitCode.USAGE_ERROR,
        code: 'USAGE_ERROR',
      });
    }

    if (config.staffToken) {
      parseStaffAccessToken(config.staffToken);
    }

    this.url = config.url.replace(/\/$/, '');
    this.staffToken = config.staffToken;
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
      responseType?: ResponseType;
      includeMeta: true;
    },
  ): Promise<GhostResponseWithMeta<T>>;
  private async request<T>(
    method: string,
    endpointPath: string,
    options?: {
      params?: Record<string, string | number | boolean | undefined>;
      body?: unknown;
      source?: 'html';
      api?: RequestApi;
      responseType?: ResponseType;
      includeMeta?: false | undefined;
    },
  ): Promise<T>;
  private async request<T>(
    method: string,
    endpointPath: string,
    options: {
      params?: Record<string, string | number | boolean | undefined>;
      body?: unknown;
      source?: 'html';
      api?: RequestApi;
      responseType?: ResponseType;
      includeMeta?: boolean;
    } = {},
  ): Promise<T | GhostResponseWithMeta<T>> {
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
      };

      if (api === 'admin') {
        if (!this.staffToken) {
          throw new GhstError('Staff access token is required for this request.', {
            code: 'AUTH_REQUIRED',
            exitCode: ExitCode.AUTH_ERROR,
          });
        }

        const token = await generateStaffJwt(this.staffToken);
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

      let requestBody: string | FormData | undefined;
      if (options.body !== undefined) {
        if (isFormDataBody(options.body)) {
          requestBody = options.body;
        } else if (typeof options.body === 'string') {
          requestBody = options.body;
          headers['Content-Type'] = 'application/json';
        } else {
          requestBody = JSON.stringify(options.body);
          headers['Content-Type'] = 'application/json';
        }
      }

      let response: Response;
      try {
        response = await fetch(url.toString(), {
          method: upperMethod,
          headers,
          body: requestBody,
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
        const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';

        let payload: GhostApiErrorPayload | null = null;
        if (contentType.includes('application/json')) {
          try {
            payload = (await response.json()) as GhostApiErrorPayload;
          } catch {
            payload = null;
          }
        } else {
          const body = await response.text();
          try {
            payload = JSON.parse(body) as GhostApiErrorPayload;
          } catch {
            payload = null;
          }
        }

        if (isTierNotFoundAnomaly(response.status, endpointPath, payload)) {
          throw new GhostApiError(404, 'Tier not found', payload);
        }

        const ghostMessage =
          payload?.errors?.[0]?.message ?? `Ghost API request failed (${response.status})`;
        throw new GhostApiError(response.status, ghostMessage, payload);
      }

      const responseHeaders = Object.fromEntries(response.headers.entries());

      if (response.status === 204) {
        const empty = {} as T;
        if (options.includeMeta) {
          return {
            data: empty,
            status: response.status,
            headers: responseHeaders,
          };
        }

        return empty;
      }

      let data: T;
      if (options.responseType === 'text') {
        data = (await response.text()) as T;
      } else if (options.responseType === 'buffer') {
        data = Buffer.from(await response.arrayBuffer()) as T;
      } else {
        const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';
        if (!contentType.includes('application/json')) {
          data = (await response.text()) as T;
        } else {
          data = (await response.json()) as T;
        }
      }

      if (options.includeMeta) {
        return {
          data,
          status: response.status,
          headers: responseHeaders,
        };
      }

      return data;
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
    options: { api?: RequestApi; responseType?: ResponseType } = {},
  ): Promise<T> {
    const normalized = path.startsWith('/') ? path : `/${path}`;
    return (await this.request<T>(method.toUpperCase(), normalized, {
      body,
      params,
      api: options.api,
      responseType: options.responseType,
    })) as T;
  }

  async rawRequestWithMeta<T>(
    path: string,
    method = 'GET',
    body?: unknown,
    params?: Record<string, string | number | boolean | undefined>,
    options: { api?: RequestApi; responseType?: ResponseType } = {},
  ): Promise<GhostResponseWithMeta<T>> {
    const normalized = path.startsWith('/') ? path : `/${path}`;
    return (await this.request<T>(method.toUpperCase(), normalized, {
      body,
      params,
      api: options.api,
      responseType: options.responseType,
      includeMeta: true,
    })) as GhostResponseWithMeta<T>;
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

    copy: (id: string) => this.request<Record<string, unknown>>('POST', `/posts/${id}/copy/`),

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

    copy: (id: string) => this.request<Record<string, unknown>>('POST', `/pages/${id}/copy/`),

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

  members = {
    browse: (params?: Record<string, string | number | boolean | undefined>) =>
      this.request<GhostPaginatedResponse>('GET', '/members/', { params }),

    read: (id: string, params?: Record<string, string | number | boolean | undefined>) =>
      this.request<Record<string, unknown>>('GET', `/members/${id}/`, { params }),

    add: (
      member: Record<string, unknown>,
      params?: Record<string, string | number | boolean | undefined>,
    ) =>
      this.request<Record<string, unknown>>('POST', '/members/', {
        body: { members: [member] },
        params,
      }),

    edit: (id: string, member: Record<string, unknown>) =>
      this.request<Record<string, unknown>>('PUT', `/members/${id}/`, {
        body: { members: [member] },
      }),

    delete: (id: string, params?: Record<string, string | number | boolean | undefined>) =>
      this.request<Record<string, never>>('DELETE', `/members/${id}/`, { params }),

    bulkDestroy: (params: Record<string, string | number | boolean | undefined>) =>
      this.request<Record<string, unknown>>('DELETE', '/members/', { params }),

    bulkEdit: (
      bulk: Record<string, unknown>,
      params?: Record<string, string | number | boolean | undefined>,
    ) =>
      this.request<Record<string, unknown>>('PUT', '/members/bulk/', {
        body: { bulk },
        params,
      }),

    exportCsv: (params?: Record<string, string | number | boolean | undefined>) =>
      this.request<string>('GET', '/members/upload/', {
        params,
        responseType: 'text',
      }),

    importCsv: (
      formData: FormData,
      params?: Record<string, string | number | boolean | undefined>,
    ) =>
      this.request<Record<string, unknown>>('POST', '/members/upload/', {
        body: formData,
        params,
      }),
  };

  newsletters = {
    browse: (params?: Record<string, string | number | boolean | undefined>) =>
      this.request<GhostPaginatedResponse>('GET', '/newsletters/', { params }),

    read: (id: string, params?: Record<string, string | number | boolean | undefined>) =>
      this.request<Record<string, unknown>>('GET', `/newsletters/${id}/`, { params }),

    add: (
      newsletter: Record<string, unknown>,
      params?: Record<string, string | number | boolean | undefined>,
    ) =>
      this.request<Record<string, unknown>>('POST', '/newsletters/', {
        body: { newsletters: [newsletter] },
        params,
      }),

    edit: (
      id: string,
      newsletter: Record<string, unknown>,
      params?: Record<string, string | number | boolean | undefined>,
    ) =>
      this.request<Record<string, unknown>>('PUT', `/newsletters/${id}/`, {
        body: { newsletters: [newsletter] },
        params,
      }),
  };

  tiers = {
    browse: (params?: Record<string, string | number | boolean | undefined>) =>
      this.request<GhostPaginatedResponse>('GET', '/tiers/', { params }),

    read: (id: string, params?: Record<string, string | number | boolean | undefined>) =>
      this.request<Record<string, unknown>>('GET', `/tiers/${id}/`, { params }),

    add: (tier: Record<string, unknown>) =>
      this.request<Record<string, unknown>>('POST', '/tiers/', {
        body: { tiers: [tier] },
      }),

    edit: (id: string, tier: Record<string, unknown>) =>
      this.request<Record<string, unknown>>('PUT', `/tiers/${id}/`, {
        body: { tiers: [tier] },
      }),
  };

  offers = {
    browse: (params?: Record<string, string | number | boolean | undefined>) =>
      this.request<GhostPaginatedResponse>('GET', '/offers/', { params }),

    read: (id: string) => this.request<Record<string, unknown>>('GET', `/offers/${id}/`),

    add: (offer: Record<string, unknown>) =>
      this.request<Record<string, unknown>>('POST', '/offers/', {
        body: { offers: [offer] },
      }),

    edit: (id: string, offer: Record<string, unknown>) =>
      this.request<Record<string, unknown>>('PUT', `/offers/${id}/`, {
        body: { offers: [offer] },
      }),
  };

  labels = {
    browse: (params?: Record<string, string | number | boolean | undefined>) =>
      this.request<GhostPaginatedResponse>('GET', '/labels/', { params }),

    read: (
      idOrSlug: string,
      options: {
        bySlug?: boolean;
        params?: Record<string, string | number | boolean | undefined>;
      } = {},
    ) => {
      if (options.bySlug) {
        return this.request<Record<string, unknown>>('GET', `/labels/slug/${idOrSlug}/`, {
          params: options.params,
        });
      }

      return this.request<Record<string, unknown>>('GET', `/labels/${idOrSlug}/`, {
        params: options.params,
      });
    },

    add: (label: Record<string, unknown>) =>
      this.request<Record<string, unknown>>('POST', '/labels/', {
        body: { labels: [label] },
      }),

    edit: (id: string, label: Record<string, unknown>) =>
      this.request<Record<string, unknown>>('PUT', `/labels/${id}/`, {
        body: { labels: [label] },
      }),

    delete: (id: string) => this.request<Record<string, never>>('DELETE', `/labels/${id}/`),
  };

  users = {
    browse: (params?: Record<string, string | number | boolean | undefined>) =>
      this.request<GhostPaginatedResponse>('GET', '/users/', { params }),

    read: (
      idOrSlugOrEmail: string,
      options: {
        bySlug?: boolean;
        byEmail?: boolean;
        params?: Record<string, string | number | boolean | undefined>;
      } = {},
    ) => {
      if (options.bySlug) {
        return this.request<Record<string, unknown>>('GET', `/users/slug/${idOrSlugOrEmail}/`, {
          params: options.params,
        });
      }

      if (options.byEmail) {
        return this.request<Record<string, unknown>>('GET', `/users/email/${idOrSlugOrEmail}/`, {
          params: options.params,
        });
      }

      return this.request<Record<string, unknown>>('GET', `/users/${idOrSlugOrEmail}/`, {
        params: options.params,
      });
    },

    me: (params?: Record<string, string | number | boolean | undefined>) =>
      this.request<Record<string, unknown>>('GET', '/users/me/', { params }),
  };

  webhooks = {
    add: (webhook: Record<string, unknown>) =>
      this.request<Record<string, unknown>>('POST', '/webhooks/', {
        body: { webhooks: [webhook] },
      }),

    edit: (id: string, webhook: Record<string, unknown>) =>
      this.request<Record<string, unknown>>('PUT', `/webhooks/${id}/`, {
        body: { webhooks: [webhook] },
      }),

    delete: (id: string) => this.request<Record<string, never>>('DELETE', `/webhooks/${id}/`),
  };

  images = {
    upload: (formData: FormData) =>
      this.request<Record<string, unknown>>('POST', '/images/upload/', {
        body: formData,
      }),
  };

  themes = {
    browse: () => this.request<Record<string, unknown>>('GET', '/themes/'),

    readActive: () => this.request<Record<string, unknown>>('GET', '/themes/active/'),

    upload: (formData: FormData) =>
      this.request<Record<string, unknown>>('POST', '/themes/upload/', {
        body: formData,
      }),

    activate: (name: string) =>
      this.request<Record<string, unknown>>('PUT', `/themes/${name}/activate/`, {
        body: {},
      }),
  };

  settings = {
    browse: (params?: Record<string, string | number | boolean | undefined>) =>
      this.request<Record<string, unknown>>('GET', '/settings/', { params }),

    edit: (settings: Array<Record<string, unknown>>) =>
      this.request<Record<string, unknown>>('PUT', '/settings/', {
        body: { settings },
      }),
  };

  db = {
    export: (params?: Record<string, string | number | boolean | undefined>) =>
      this.request<Buffer>('GET', '/db/', {
        params,
        responseType: 'buffer',
      }),

    import: (formData: FormData) =>
      this.request<Record<string, unknown>>('POST', '/db/', {
        body: formData,
      }),
  };
}
