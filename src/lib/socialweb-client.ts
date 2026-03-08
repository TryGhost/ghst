import fs from 'node:fs/promises';
import path from 'node:path';
import { GhostClient } from './client.js';
import { resolveConnectionConfig } from './config.js';
import { ExitCode, GhstError, mapHttpStatusToExitCode } from './errors.js';
import type { GlobalOptions } from './types.js';

const IMAGE_MIME_BY_EXT: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.avif': 'image/avif',
};

function inferImageMimeType(filePath: string): string {
  const extension = path.extname(filePath).toLowerCase();
  return IMAGE_MIME_BY_EXT[extension] ?? 'application/octet-stream';
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const parts = token.split('.');
  const payload = parts[1];
  if (!payload) {
    return null;
  }

  try {
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
    return JSON.parse(Buffer.from(padded, 'base64').toString('utf8')) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function createSocialWebError(status: number, message: string, details?: unknown): GhstError {
  return new GhstError(message, {
    code: status === 401 || status === 403 ? 'AUTH_ERROR' : 'SOCIALWEB_API_ERROR',
    exitCode: mapHttpStatusToExitCode(status),
    status,
    details,
  });
}

function isSocialWebAvailabilityReadPath(method: string, endpointPath: string): boolean {
  if (method !== 'GET') {
    return false;
  }

  return [
    '/.ghost/activitypub/v1/account/',
    '/.ghost/activitypub/v1/feed/',
    '/.ghost/activitypub/v1/notifications',
    '/.ghost/activitypub/v1/posts/',
    '/.ghost/activitypub/v1/blocks/',
  ].some((prefix) => endpointPath.startsWith(prefix));
}

export interface SocialWebIdentityInfo {
  token: string;
  claims: {
    sub: string | null;
    role: string | null;
    exp: number | null;
  };
}

const identityCache = new Map<string, Promise<SocialWebIdentityInfo>>();

export function resetSocialWebIdentityCacheForTests(): void {
  identityCache.clear();
}

export class SocialWebClient {
  private connectionPromise?: Promise<Awaited<ReturnType<typeof resolveConnectionConfig>>>;
  private ghostClientPromise?: Promise<GhostClient>;
  private activityPubBaseUrlPromise?: Promise<string>;
  private identityPromise?: Promise<SocialWebIdentityInfo>;

  constructor(private readonly global: GlobalOptions) {}

  private async getConnection() {
    if (!this.connectionPromise) {
      this.connectionPromise = resolveConnectionConfig(this.global);
    }

    return this.connectionPromise;
  }

  private async getGhostClient(): Promise<GhostClient> {
    if (!this.ghostClientPromise) {
      this.ghostClientPromise = this.getConnection().then(
        (connection) =>
          new GhostClient({
            url: connection.url,
            staffToken: connection.staffToken,
            version: connection.apiVersion,
          }),
      );
    }

    return this.ghostClientPromise;
  }

  private async getActivityPubBaseUrl(): Promise<string> {
    if (!this.activityPubBaseUrlPromise) {
      this.activityPubBaseUrlPromise = this.getGhostClient().then(async (ghostClient) => {
        const siteInfo = await ghostClient.siteInfo();
        const site = (siteInfo.site as Record<string, unknown> | undefined) ?? {};
        const siteUrl =
          typeof site.url === 'string' && site.url.trim().length > 0 ? site.url : null;
        const fallbackUrl = (await this.getConnection()).url;
        return (siteUrl ?? fallbackUrl).replace(/\/$/, '');
      });
    }

    return this.activityPubBaseUrlPromise;
  }

  async getIdentity(): Promise<SocialWebIdentityInfo> {
    if (!this.identityPromise) {
      this.identityPromise = (async () => {
        const connection = await this.getConnection();
        const cacheKey = `${connection.url}\0${connection.staffToken ?? ''}\0${connection.apiVersion ?? 'v6.0'}`;
        const cached = identityCache.get(cacheKey);
        if (cached) {
          return cached;
        }

        const promise = this.getGhostClient().then(async (ghostClient) => {
          let payload: Record<string, unknown>;
          try {
            payload = await ghostClient.rawRequest<Record<string, unknown>>('/identities/');
          } catch (error) {
            const normalized = error as { status?: number; payload?: unknown; message?: string };
            if (normalized.status === 403) {
              throw new GhstError(
                'Social web requires an Owner or Administrator staff token to bootstrap identity auth.',
                {
                  code: 'AUTH_ERROR',
                  exitCode: ExitCode.AUTH_ERROR,
                  status: 403,
                  details: normalized.payload,
                },
              );
            }

            throw error;
          }

          const identities = Array.isArray(payload.identities)
            ? (payload.identities as Array<Record<string, unknown>>)
            : [];
          const token =
            identities[0] && typeof identities[0].token === 'string' ? identities[0].token : '';
          if (!token) {
            throw new GhstError('Ghost did not return a usable identity token for social web.', {
              code: 'AUTH_ERROR',
              exitCode: ExitCode.AUTH_ERROR,
              details: payload,
            });
          }

          const decoded = decodeJwtPayload(token);
          return {
            token,
            claims: {
              sub: typeof decoded?.sub === 'string' ? decoded.sub : null,
              role: typeof decoded?.role === 'string' ? decoded.role : null,
              exp: typeof decoded?.exp === 'number' ? decoded.exp : null,
            },
          };
        });

        identityCache.set(cacheKey, promise);

        try {
          return await promise;
        } catch (error) {
          identityCache.delete(cacheKey);
          throw error;
        }
      })();
    }

    return this.identityPromise;
  }

  private async request<T>(
    method: string,
    endpointPath: string,
    options: {
      params?: Record<string, string | number | boolean | undefined>;
      body?: unknown;
      responseType?: 'json' | 'text';
      headers?: Record<string, string>;
    } = {},
  ): Promise<T> {
    const baseUrl = await this.getActivityPubBaseUrl();
    const identity = await this.getIdentity();
    const url = new URL(endpointPath.startsWith('/') ? endpointPath : `/${endpointPath}`, baseUrl);

    for (const [key, value] of Object.entries(options.params ?? {})) {
      if (value !== undefined && value !== null) {
        url.searchParams.set(key, String(value));
      }
    }

    const headers: Record<string, string> = {
      Accept: 'application/activity+json',
      Authorization: `Bearer ${identity.token}`,
      ...options.headers,
    };

    let body: string | FormData | undefined;
    if (options.body !== undefined) {
      if (typeof FormData !== 'undefined' && options.body instanceof FormData) {
        body = options.body;
      } else {
        headers['Content-Type'] = 'application/json';
        body = JSON.stringify(options.body);
      }
    }

    const response = await fetch(url.toString(), {
      method,
      headers,
      body,
    });

    if (!response.ok) {
      let details: unknown;
      let message = `Social web request failed (${response.status})`;
      const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';

      try {
        if (contentType.includes('application/json')) {
          details = (await response.json()) as unknown;
          const detailObject = details as { code?: string; message?: string; error?: string };
          if (typeof detailObject?.message === 'string' && detailObject.message.trim()) {
            message = detailObject.message;
          } else if (typeof detailObject?.error === 'string' && detailObject.error.trim()) {
            message = detailObject.error;
          }

          if (detailObject?.code === 'SITE_MISSING') {
            message = 'Social web is not enabled on this site.';
          }
        } else {
          const text = await response.text();
          details = text;
          if (text.trim()) {
            message = text.trim();
          }
        }
      } catch {
        details = undefined;
      }

      if (response.status === 404 && isSocialWebAvailabilityReadPath(method, endpointPath)) {
        throw new GhstError(
          'Social web is not reachable for this site. It may be disabled or the ActivityPub service may not be initialized yet.',
          {
            code: 'NOT_FOUND',
            exitCode: ExitCode.NOT_FOUND,
            status: 404,
            details,
          },
        );
      }

      throw createSocialWebError(response.status, message, details);
    }

    if (response.status === 204 || response.status === 202) {
      return {} as T;
    }

    if (options.responseType === 'text') {
      return (await response.text()) as T;
    }

    const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';
    if (
      contentType.includes('application/json') ||
      contentType.includes('application/activity+json')
    ) {
      return (await response.json()) as T;
    }

    const text = await response.text();
    return (text.trim().length > 0 ? text : {}) as T;
  }

  get<T>(
    endpointPath: string,
    params?: Record<string, string | number | boolean | undefined>,
  ): Promise<T> {
    return this.request<T>('GET', endpointPath, { params });
  }

  post<T>(endpointPath: string, body?: unknown): Promise<T> {
    return this.request<T>('POST', endpointPath, { body });
  }

  put<T>(endpointPath: string, body?: unknown): Promise<T> {
    return this.request<T>('PUT', endpointPath, { body });
  }

  delete<T>(endpointPath: string): Promise<T> {
    return this.request<T>('DELETE', endpointPath);
  }

  async uploadImage(filePath: string): Promise<Record<string, unknown>> {
    const bytes = await fs.readFile(filePath);
    const formData = new FormData();
    formData.append(
      'file',
      new Blob([bytes], { type: inferImageMimeType(filePath) }),
      path.basename(filePath),
    );

    return this.request<Record<string, unknown>>('POST', '/.ghost/activitypub/v1/upload/image', {
      body: formData,
    });
  }
}
