import http from 'node:http';
import { describe, expect, test, vi } from 'vitest';

const mcpTransportMocks = vi.hoisted(() => ({
  stdioInstances: [] as Array<{ onclose?: () => void }>,
  httpInstances: [] as Array<{
    handleRequest: (req: http.IncomingMessage, res: http.ServerResponse) => void;
  }>,
  handleRequest: vi.fn((_: http.IncomingMessage, res: http.ServerResponse) => {
    res.statusCode = 200;
    res.end('ok');
  }),
}));

vi.mock('@modelcontextprotocol/sdk/server/stdio.js', () => ({
  StdioServerTransport: class {
    onclose?: () => void;

    constructor() {
      mcpTransportMocks.stdioInstances.push(this);
    }
  },
}));

vi.mock('@modelcontextprotocol/sdk/server/streamableHttp.js', () => ({
  StreamableHTTPServerTransport: class {
    handleRequest = mcpTransportMocks.handleRequest;

    constructor(_options: Record<string, unknown>) {
      mcpTransportMocks.httpInstances.push(this as never);
    }
  },
}));

import { runMcpHttp } from '../src/mcp/transports/http.js';
import { runMcpStdio } from '../src/mcp/transports/stdio.js';

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

      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(address.port);
      });
    });
  });
}

async function waitForServer(url: string, timeoutMs = 1000): Promise<void> {
  const start = Date.now();
  while (true) {
    try {
      await fetch(url, { method: 'OPTIONS' });
      return;
    } catch {
      if (Date.now() - start > timeoutMs) {
        throw new Error('Timed out waiting for MCP HTTP server');
      }
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }
}

async function requestRaw(
  options: {
    host: string;
    port: number;
    method: string;
    headers?: Record<string, string>;
  },
  body?: string,
): Promise<{ status: number; body: string }> {
  return await new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: options.host,
        port: options.port,
        path: '/',
        method: options.method,
        headers: options.headers,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk) => {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
        });
        res.on('end', () => {
          resolve({
            status: res.statusCode ?? 0,
            body: Buffer.concat(chunks).toString('utf8'),
          });
        });
      },
    );

    req.once('error', reject);
    if (body !== undefined) {
      req.write(body);
    }
    req.end();
  });
}

describe.sequential('mcp transports', () => {
  test('stdio transport connects and waits for onclose', async () => {
    mcpTransportMocks.stdioInstances.length = 0;

    const connect = vi.fn(async (transport: { onclose?: () => void }) => {
      setImmediate(() => {
        transport.onclose?.();
      });
    });

    await runMcpStdio({ connect } as never);

    expect(connect).toHaveBeenCalledTimes(1);
    expect(mcpTransportMocks.stdioInstances).toHaveLength(1);
  });

  test('http transport serves requests, applies CORS, and shuts down on signal', async () => {
    mcpTransportMocks.httpInstances.length = 0;
    mcpTransportMocks.handleRequest.mockClear();

    const connect = vi.fn(async () => undefined);
    const port = await getFreePort();

    const runPromise = runMcpHttp({ connect } as never, {
      host: '127.0.0.1',
      port,
      corsOrigin: 'https://app.example.com',
      authToken: 'test-token',
    });

    const baseUrl = `http://127.0.0.1:${port}`;
    await waitForServer(baseUrl);

    const optionsResponse = await fetch(baseUrl, { method: 'OPTIONS' });
    expect(optionsResponse.status).toBe(204);
    expect(optionsResponse.headers.get('access-control-allow-origin')).toBe(
      'https://app.example.com',
    );

    const unauthorized = await fetch(baseUrl, { method: 'GET' });
    expect(unauthorized.status).toBe(401);
    const invalidToken = await fetch(baseUrl, {
      method: 'GET',
      headers: {
        authorization: 'Bearer wrong-token',
      },
    });
    expect(invalidToken.status).toBe(401);

    const getResponse = await fetch(baseUrl, {
      method: 'GET',
      headers: {
        authorization: 'Bearer test-token',
      },
    });
    expect(getResponse.status).toBe(200);
    expect(await getResponse.text()).toBe('ok');
    expect(mcpTransportMocks.handleRequest).toHaveBeenCalled();

    process.emit('SIGINT');
    await runPromise;

    expect(connect).toHaveBeenCalledTimes(1);
    expect(mcpTransportMocks.httpInstances).toHaveLength(1);
  });

  test('http transport enforces request body limits for POST', async () => {
    mcpTransportMocks.handleRequest.mockClear();

    const connect = vi.fn(async () => undefined);
    const port = await getFreePort();

    const runPromise = runMcpHttp({ connect } as never, {
      host: '127.0.0.1',
      port,
      authToken: 'test-token',
      maxBodyBytes: 8,
    });

    const baseUrl = `http://127.0.0.1:${port}`;
    await waitForServer(baseUrl);

    const tooLarge = await fetch(baseUrl, {
      method: 'POST',
      headers: {
        authorization: 'Bearer test-token',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ value: '1234567890' }),
    });
    expect(tooLarge.status).toBe(413);

    const noLength = await requestRaw(
      {
        host: '127.0.0.1',
        port,
        method: 'POST',
        headers: {
          authorization: 'Bearer test-token',
          'transfer-encoding': 'chunked',
          'content-type': 'application/json',
        },
      },
      '{"ok":true}',
    );
    expect(noLength.status).toBe(411);

    expect(mcpTransportMocks.handleRequest).not.toHaveBeenCalled();

    process.emit('SIGINT');
    await runPromise;
  });
});
