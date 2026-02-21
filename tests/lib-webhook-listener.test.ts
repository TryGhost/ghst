import http from 'node:http';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const webhookMocks = vi.hoisted(() => ({
  createWebhook: vi.fn(),
  deleteWebhook: vi.fn(),
}));

vi.mock('../src/lib/webhooks.js', () => ({
  createWebhook: (...args: unknown[]) => webhookMocks.createWebhook(...args),
  deleteWebhook: (...args: unknown[]) => webhookMocks.deleteWebhook(...args),
}));

import { runWebhookListener } from '../src/lib/webhook-listener.js';

async function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = http.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close(() => reject(new Error('Failed to allocate port')));
        return;
      }

      const { port } = address;
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(port);
      });
    });
  });
}

async function waitFor(check: () => boolean, timeoutMs = 1000): Promise<void> {
  const start = Date.now();
  while (!check()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error('Timed out waiting for condition');
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

describe.sequential('webhook listener runtime', () => {
  beforeEach(() => {
    webhookMocks.createWebhook.mockReset();
    webhookMocks.deleteWebhook.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('creates webhooks, forwards payloads, and cleans up on signal', async () => {
    webhookMocks.createWebhook.mockImplementation(
      async (_global: unknown, payload: { event?: string }) => ({
        webhooks: [{ id: `hook-${payload.event ?? 'unknown'}` }],
      }),
    );
    webhookMocks.deleteWebhook.mockResolvedValue({});

    const forwardedBodies: string[] = [];
    const forwardServer = http.createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on('data', (chunk) => {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      });
      req.on('end', () => {
        forwardedBodies.push(Buffer.concat(chunks).toString('utf8'));
        res.statusCode = 202;
        res.end('ok');
      });
    });

    const forwardPort = await getFreePort();
    await new Promise<void>((resolve, reject) => {
      forwardServer.once('error', reject);
      forwardServer.listen(forwardPort, '127.0.0.1', () => {
        forwardServer.off('error', reject);
        resolve();
      });
    });

    const listenPort = await getFreePort();
    const events: Array<Record<string, unknown>> = [];

    const listenerPromise = runWebhookListener(
      {},
      {
        publicUrl: 'https://hooks.example.com/ghost',
        forwardTo: `http://127.0.0.1:${forwardPort}/webhooks`,
        events: ['post.published', 'member.added'],
        host: '127.0.0.1',
        port: listenPort,
        onEvent: (event) => events.push(event),
      },
    );

    await waitFor(() => events.some((event) => event.type === 'ready'));

    const postResponse = await fetch(`http://127.0.0.1:${listenPort}/`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({ id: 'evt-1', type: 'post.published' }),
    });
    expect(postResponse.status).toBe(200);

    const getResponse = await fetch(`http://127.0.0.1:${listenPort}/`, {
      method: 'GET',
    });
    expect(getResponse.status).toBe(405);

    await waitFor(() => events.some((event) => event.type === 'forwarded'));

    process.emit('SIGTERM');
    await listenerPromise;

    await new Promise<void>((resolve, reject) => {
      forwardServer.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });

    expect(forwardedBodies).toEqual(['{"id":"evt-1","type":"post.published"}']);
    expect(webhookMocks.createWebhook).toHaveBeenCalledTimes(2);
    expect(webhookMocks.deleteWebhook).toHaveBeenCalledTimes(2);
    expect(events.some((event) => event.type === 'cleanup')).toBe(true);
  });

  test('returns 502 when forwarding fails and still shuts down', async () => {
    webhookMocks.createWebhook.mockResolvedValue({ webhooks: [{}] });
    webhookMocks.deleteWebhook.mockResolvedValue({});

    const unavailablePort = await getFreePort();
    const listenPort = await getFreePort();
    const events: Array<Record<string, unknown>> = [];

    const listenerPromise = runWebhookListener(
      {},
      {
        publicUrl: 'https://hooks.example.com/ghost',
        forwardTo: `http://127.0.0.1:${unavailablePort}/fail`,
        events: ['post.published'],
        host: '127.0.0.1',
        port: listenPort,
        onEvent: (event) => events.push(event),
      },
    );

    await waitFor(() => events.some((event) => event.type === 'ready'));

    const response = await fetch(`http://127.0.0.1:${listenPort}/`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({ id: 'evt-2' }),
    });

    expect(response.status).toBe(502);
    await waitFor(() => events.some((event) => event.type === 'error'));

    process.emit('SIGINT');
    await listenerPromise;

    expect(webhookMocks.createWebhook).toHaveBeenCalledTimes(1);
    expect(webhookMocks.deleteWebhook).toHaveBeenCalledTimes(0);
  });

  test('handles aborted request streams per-request without crashing listener', async () => {
    webhookMocks.createWebhook.mockResolvedValue({ webhooks: [{ id: 'hook-post' }] });
    webhookMocks.deleteWebhook.mockResolvedValue({});

    const forwardServer = http.createServer((req, res) => {
      req.on('data', () => undefined);
      req.on('end', () => {
        res.statusCode = 200;
        res.end('ok');
      });
    });

    const forwardPort = await getFreePort();
    await new Promise<void>((resolve, reject) => {
      forwardServer.once('error', reject);
      forwardServer.listen(forwardPort, '127.0.0.1', () => {
        forwardServer.off('error', reject);
        resolve();
      });
    });

    const listenPort = await getFreePort();
    const events: Array<Record<string, unknown>> = [];

    const listenerPromise = runWebhookListener(
      {},
      {
        publicUrl: 'https://hooks.example.com/ghost',
        forwardTo: `http://127.0.0.1:${forwardPort}/webhooks`,
        events: ['post.published'],
        host: '127.0.0.1',
        port: listenPort,
        onEvent: (event) => events.push(event),
      },
    );

    await waitFor(() => events.some((event) => event.type === 'ready'));

    await new Promise<void>((resolve) => {
      const req = http.request({
        host: '127.0.0.1',
        port: listenPort,
        path: '/',
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'content-length': '100',
        },
      });
      req.on('response', () => resolve());
      req.on('error', () => resolve());
      req.write('{"partial":');
      req.end();
      setTimeout(() => {
        req.destroy();
        resolve();
      }, 50);
    });

    const okResponse = await fetch(`http://127.0.0.1:${listenPort}/`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: 'evt-ok' }),
    });
    expect(okResponse.status).toBe(200);

    process.emit('SIGINT');
    await listenerPromise;

    await new Promise<void>((resolve, reject) => {
      forwardServer.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  });

  test('cleans up already-created webhooks if creation fails mid-startup', async () => {
    webhookMocks.createWebhook
      .mockResolvedValueOnce({ webhooks: [{ id: 'hook-post' }] })
      .mockRejectedValueOnce(new Error('create failed'));
    webhookMocks.deleteWebhook.mockResolvedValue({});

    const events: Array<Record<string, unknown>> = [];

    await expect(
      runWebhookListener(
        {},
        {
          publicUrl: 'https://hooks.example.com/ghost',
          forwardTo: 'http://127.0.0.1:1234/webhooks',
          events: ['post.published', 'member.added'],
          onEvent: (event) => events.push(event),
        },
      ),
    ).rejects.toThrow('create failed');

    expect(webhookMocks.deleteWebhook).toHaveBeenCalledTimes(1);
    expect(webhookMocks.deleteWebhook).toHaveBeenCalledWith({}, 'hook-post');
    expect(events.some((event) => event.type === 'ready')).toBe(false);
    expect(events.some((event) => event.type === 'cleanup')).toBe(true);
  });

  test('cleans up created webhooks when listener bind fails', async () => {
    webhookMocks.createWebhook.mockResolvedValue({ webhooks: [{ id: 'hook-post' }] });
    webhookMocks.deleteWebhook.mockResolvedValue({});

    const boundPort = await getFreePort();
    const blocker = http.createServer();
    await new Promise<void>((resolve, reject) => {
      blocker.once('error', reject);
      blocker.listen(boundPort, '127.0.0.1', () => {
        blocker.off('error', reject);
        resolve();
      });
    });

    const events: Array<Record<string, unknown>> = [];
    await expect(
      runWebhookListener(
        {},
        {
          publicUrl: 'https://hooks.example.com/ghost',
          forwardTo: 'http://127.0.0.1:1234/webhooks',
          events: ['post.published'],
          host: '127.0.0.1',
          port: boundPort,
          onEvent: (event) => events.push(event),
        },
      ),
    ).rejects.toThrow();

    await new Promise<void>((resolve, reject) => {
      blocker.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });

    expect(webhookMocks.deleteWebhook).toHaveBeenCalledTimes(1);
    expect(events.some((event) => event.type === 'ready')).toBe(false);
    expect(events.some((event) => event.type === 'cleanup')).toBe(true);
  });
});
