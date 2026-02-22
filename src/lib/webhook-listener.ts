import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import http from 'node:http';
import type { GlobalOptions } from './types.js';
import { createWebhook, deleteWebhook } from './webhooks.js';

const DEFAULT_MAX_BODY_BYTES = 1024 * 1024;
const DEFAULT_SIGNATURE_MAX_SKEW_MS = 5 * 60 * 1000;
const DEFAULT_HEADERS_TIMEOUT_MS = 15_000;
const DEFAULT_REQUEST_TIMEOUT_MS = 15_000;
const DEFAULT_KEEP_ALIVE_TIMEOUT_MS = 5_000;

interface WebhookListenerOptions {
  publicUrl: string;
  forwardTo: string;
  events: string[];
  host?: string;
  port?: number;
  maxBodyBytes?: number;
  signatureMaxSkewMs?: number;
  onEvent?: (event: Record<string, unknown>) => void;
}

interface CreatedHook {
  id: string;
  event: string;
}

class BodyTooLargeError extends Error {
  constructor(limit: number) {
    super(`Request body exceeded limit of ${limit} bytes`);
    this.name = 'BodyTooLargeError';
  }
}

interface ParsedSignatureHeader {
  digestHex: string;
  timestampRaw?: string;
  timestampMs?: number;
}

function toTimestampMs(raw: string): number | null {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }

  if (parsed > 1_000_000_000_000) {
    return Math.trunc(parsed);
  }

  return Math.trunc(parsed * 1000);
}

function parseSignatureHeader(rawHeader: string): ParsedSignatureHeader | null {
  const parts = rawHeader
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length === 0) {
    return null;
  }

  let digestHex: string | undefined;
  let timestampRaw: string | undefined;

  for (const part of parts) {
    const separatorIndex = part.indexOf('=');
    if (separatorIndex <= 0) {
      continue;
    }

    const key = part.slice(0, separatorIndex).trim();
    const value = part.slice(separatorIndex + 1).trim();
    if (!value) {
      continue;
    }

    if (key === 'sha256') {
      digestHex = value;
    } else if (key === 't') {
      timestampRaw = value;
    }
  }

  if (!digestHex) {
    return null;
  }

  const parsedTimestampMs = timestampRaw ? toTimestampMs(timestampRaw) : null;
  if (timestampRaw && parsedTimestampMs === null) {
    return null;
  }

  return {
    digestHex,
    timestampRaw,
    ...(parsedTimestampMs === null ? {} : { timestampMs: parsedTimestampMs }),
  };
}

function digestMatches(expectedHex: string, actualDigest: Buffer): boolean {
  if (!/^[a-fA-F0-9]+$/.test(expectedHex) || expectedHex.length % 2 !== 0) {
    return false;
  }

  const expectedDigest = Buffer.from(expectedHex, 'hex');
  if (expectedDigest.length !== actualDigest.length) {
    return false;
  }

  return timingSafeEqual(expectedDigest, actualDigest);
}

function verifyGhostSignature(
  secret: string,
  body: Buffer,
  rawHeader: string | undefined,
  maxSkewMs: number,
): { ok: boolean; reason?: string } {
  if (!rawHeader) {
    return { ok: false, reason: 'missing_signature' };
  }

  const parsed = parseSignatureHeader(rawHeader);
  if (!parsed) {
    return { ok: false, reason: 'malformed_signature' };
  }

  if (parsed.timestampMs !== undefined) {
    const skew = Math.abs(Date.now() - parsed.timestampMs);
    if (skew > maxSkewMs) {
      return { ok: false, reason: 'timestamp_out_of_range' };
    }
  }

  if (parsed.timestampRaw) {
    const digestWithTimestamp = createHmac('sha256', secret)
      .update(body)
      .update(parsed.timestampRaw)
      .digest();
    if (digestMatches(parsed.digestHex, digestWithTimestamp)) {
      return { ok: true };
    }
  }

  const digestRawBody = createHmac('sha256', secret).update(body).digest();
  if (digestMatches(parsed.digestHex, digestRawBody)) {
    return { ok: true };
  }

  return { ok: false, reason: 'invalid_signature' };
}

function asWebhookId(payload: Record<string, unknown>): string | null {
  const hooks = Array.isArray(payload.webhooks)
    ? (payload.webhooks as Array<Record<string, unknown>>)
    : [];
  const first = hooks[0] ?? payload;
  const id = String(first.id ?? '').trim();
  return id || null;
}

async function cleanupCreatedHooks(
  global: GlobalOptions,
  createdHooks: CreatedHook[],
  onEvent?: (event: Record<string, unknown>) => void,
): Promise<void> {
  const hooks = [...createdHooks];
  createdHooks.length = 0;

  for (const hook of hooks) {
    try {
      await deleteWebhook(global, hook.id);
      onEvent?.({
        type: 'cleanup',
        id: hook.id,
        event: hook.event,
      });
    } catch (error) {
      onEvent?.({
        type: 'cleanup_error',
        id: hook.id,
        event: hook.event,
        message: (error as Error).message,
      });
    }
  }
}

async function readRequestBody(
  request: http.IncomingMessage,
  maxBodyBytes: number,
): Promise<Buffer> {
  return await new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    let totalBytes = 0;
    let settled = false;

    const settle = (next: () => void) => {
      if (settled) {
        return;
      }
      settled = true;
      request.off('data', onData);
      request.off('end', onEnd);
      request.off('error', onError);
      request.off('aborted', onAborted);
      request.off('close', onClose);
      next();
    };

    const onData = (chunk: unknown) => {
      const normalized = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
      totalBytes += normalized.length;
      if (totalBytes > maxBodyBytes) {
        settle(() => reject(new BodyTooLargeError(maxBodyBytes)));
        return;
      }
      chunks.push(normalized);
    };
    const onEnd = () => settle(() => resolve(Buffer.concat(chunks)));
    const onError = (error: unknown) =>
      settle(() => reject(error instanceof Error ? error : new Error(String(error))));
    const onAborted = () => settle(() => reject(new Error('Request stream aborted')));
    const onClose = () => {
      if (!request.complete) {
        settle(() => reject(new Error('Request stream closed before completion')));
      }
    };

    request.on('data', onData);
    request.on('end', onEnd);
    request.on('error', onError);
    request.on('aborted', onAborted);
    request.on('close', onClose);
  });
}

export async function runWebhookListener(
  global: GlobalOptions,
  options: WebhookListenerOptions,
): Promise<void> {
  const host = options.host ?? '127.0.0.1';
  const port = options.port ?? 8787;
  const maxBodyBytes = options.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES;
  const signatureMaxSkewMs = options.signatureMaxSkewMs ?? DEFAULT_SIGNATURE_MAX_SKEW_MS;
  const listenerSecret = randomUUID();
  const createdHooks: CreatedHook[] = [];
  let server: http.Server | null = null;

  try {
    for (const eventName of options.events) {
      const payload = await createWebhook(global, {
        event: eventName,
        target_url: options.publicUrl,
        name: `ghst-listen-${eventName}-${Date.now().toString(36)}`,
        secret: listenerSecret,
      });

      const id = asWebhookId(payload);
      if (id) {
        createdHooks.push({ id, event: eventName });
      }
    }

    server = http.createServer(async (request, response) => {
      if (request.method !== 'POST') {
        response.statusCode = 405;
        response.end('Method Not Allowed');
        return;
      }

      let body: Buffer;
      try {
        body = await readRequestBody(request, maxBodyBytes);
      } catch (error) {
        options.onEvent?.({
          type: 'error',
          stage: 'request',
          message: (error as Error).message,
        });
        response.statusCode = error instanceof BodyTooLargeError ? 413 : 400;
        response.end();
        return;
      }

      const rawSignature = Array.isArray(request.headers['x-ghost-signature'])
        ? request.headers['x-ghost-signature'][0]
        : request.headers['x-ghost-signature'];
      const verification = verifyGhostSignature(
        listenerSecret,
        body,
        typeof rawSignature === 'string' ? rawSignature : undefined,
        signatureMaxSkewMs,
      );
      if (!verification.ok) {
        options.onEvent?.({
          type: 'error',
          stage: 'signature',
          message: verification.reason ?? 'invalid_signature',
        });
        response.statusCode = 401;
        response.end();
        return;
      }

      const rawBody = body.toString('utf8');
      let parsedBody: unknown = rawBody;
      try {
        parsedBody = JSON.parse(rawBody);
      } catch {
        parsedBody = rawBody;
      }

      const forwardHeaders = new Headers();
      const contentType = request.headers['content-type'];
      if (typeof contentType === 'string' && contentType.length > 0) {
        forwardHeaders.set('content-type', contentType);
      }

      const sourceIp = request.socket.remoteAddress;
      if (sourceIp) {
        forwardHeaders.set('x-forwarded-for', sourceIp);
      }

      try {
        const forwarded = await fetch(options.forwardTo, {
          method: 'POST',
          headers: forwardHeaders,
          body,
        });

        options.onEvent?.({
          type: 'forwarded',
          status: forwarded.status,
          ok: forwarded.ok,
          body: parsedBody,
        });

        response.statusCode = forwarded.ok ? 200 : 502;
        response.end();
      } catch (error) {
        options.onEvent?.({
          type: 'error',
          message: (error as Error).message,
        });
        response.statusCode = 502;
        response.end();
      }
    });
    server.headersTimeout = DEFAULT_HEADERS_TIMEOUT_MS;
    server.requestTimeout = DEFAULT_REQUEST_TIMEOUT_MS;
    server.keepAliveTimeout = DEFAULT_KEEP_ALIVE_TIMEOUT_MS;

    const appServer = server;

    await new Promise<void>((resolve, reject) => {
      appServer.once('error', reject);
      appServer.listen(port, host, () => {
        appServer.off('error', reject);
        resolve();
      });
    });

    options.onEvent?.({
      type: 'ready',
      host,
      port,
      publicUrl: options.publicUrl,
      forwardTo: options.forwardTo,
      hooks: createdHooks,
    });

    await new Promise<void>((resolve, reject) => {
      let stopped = false;

      const shutdown = async (error?: unknown) => {
        if (stopped) {
          return;
        }
        stopped = true;

        process.off('SIGINT', onSigint);
        process.off('SIGTERM', onSigterm);

        if (appServer.listening) {
          await new Promise<void>((done) => {
            appServer.close(() => done());
          });
        }

        await cleanupCreatedHooks(global, createdHooks, options.onEvent);

        if (error) {
          reject(error instanceof Error ? error : new Error(String(error)));
          return;
        }
        resolve();
      };

      const onSigint = () => {
        void shutdown();
      };

      const onSigterm = () => {
        void shutdown();
      };

      appServer.on('error', (error) => {
        void shutdown(error);
      });

      process.on('SIGINT', onSigint);
      process.on('SIGTERM', onSigterm);
    });
  } catch (error) {
    const activeServer = server;
    if (activeServer?.listening) {
      await new Promise<void>((resolve) => {
        activeServer.close(() => resolve());
      });
    }
    await cleanupCreatedHooks(global, createdHooks, options.onEvent);
    throw error;
  }
}
