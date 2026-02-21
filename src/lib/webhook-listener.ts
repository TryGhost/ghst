import { randomUUID } from 'node:crypto';
import http from 'node:http';
import type { GlobalOptions } from './types.js';
import { createWebhook, deleteWebhook } from './webhooks.js';

interface WebhookListenerOptions {
  publicUrl: string;
  forwardTo: string;
  events: string[];
  host?: string;
  port?: number;
  onEvent?: (event: Record<string, unknown>) => void;
}

interface CreatedHook {
  id: string;
  event: string;
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

async function readRequestBody(request: http.IncomingMessage): Promise<Buffer> {
  return await new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
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
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
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
  const createdHooks: CreatedHook[] = [];
  let server: http.Server | null = null;

  try {
    for (const eventName of options.events) {
      const payload = await createWebhook(global, {
        event: eventName,
        target_url: options.publicUrl,
        name: `ghst-listen-${eventName}-${Date.now().toString(36)}`,
        secret: randomUUID(),
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
        body = await readRequestBody(request);
      } catch (error) {
        options.onEvent?.({
          type: 'error',
          stage: 'request',
          message: (error as Error).message,
        });
        response.statusCode = 400;
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
