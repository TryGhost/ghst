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
    });

    const baseUrl = `http://127.0.0.1:${port}`;
    await waitForServer(baseUrl);

    const optionsResponse = await fetch(baseUrl, { method: 'OPTIONS' });
    expect(optionsResponse.status).toBe(204);
    expect(optionsResponse.headers.get('access-control-allow-origin')).toBe(
      'https://app.example.com',
    );

    const getResponse = await fetch(baseUrl, { method: 'GET' });
    expect(getResponse.status).toBe(200);
    expect(await getResponse.text()).toBe('ok');
    expect(mcpTransportMocks.handleRequest).toHaveBeenCalled();

    process.emit('SIGINT');
    await runPromise;

    expect(connect).toHaveBeenCalledTimes(1);
    expect(mcpTransportMocks.httpInstances).toHaveLength(1);
  });
});
