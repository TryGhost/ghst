import http from 'node:http';
import { describe, expect, test } from 'vitest';
import { createGhostMcpServer } from '../src/mcp/server.js';
import { parseToolGroups } from '../src/mcp/tools/core.js';
import { runMcpHttp } from '../src/mcp/transports/http.js';

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
      const response = await fetch(url, { method: 'OPTIONS' });
      if (response.status === 204) {
        return;
      }
    } catch {}

    if (Date.now() - start > timeoutMs) {
      throw new Error('Timed out waiting for MCP HTTP server');
    }

    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

describe.sequential('mcp http integration', () => {
  test('supports initialize plus follow-up requests with the real SDK transport', async () => {
    const port = await getFreePort();
    const runPromise = runMcpHttp(
      () =>
        createGhostMcpServer(
          {},
          {
            enabledGroups: parseToolGroups('site'),
          },
        ),
      {
        host: '127.0.0.1',
        port,
        authToken: 'test-token',
      },
    );

    const baseUrl = `http://127.0.0.1:${port}/mcp`;

    try {
      await waitForServer(baseUrl);

      const initializeResponse = await fetch(baseUrl, {
        method: 'POST',
        headers: {
          authorization: 'Bearer test-token',
          accept: 'application/json, text/event-stream',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
          params: {
            protocolVersion: '2025-11-25',
            capabilities: {},
            clientInfo: {
              name: 'test',
              version: '0.1',
            },
          },
        }),
      });

      expect(initializeResponse.status).toBe(200);
      const initializeBody = await initializeResponse.text();
      expect(initializeBody).toContain('"protocolVersion":"');

      const initializedResponse = await fetch(baseUrl, {
        method: 'POST',
        headers: {
          authorization: 'Bearer test-token',
          accept: 'application/json, text/event-stream',
          'content-type': 'application/json',
          'mcp-protocol-version': '2025-11-25',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'notifications/initialized',
          params: {},
        }),
      });

      expect(initializedResponse.status).toBe(202);
      expect(await initializedResponse.text()).toBe('');

      const toolsListResponse = await fetch(baseUrl, {
        method: 'POST',
        headers: {
          authorization: 'Bearer test-token',
          accept: 'application/json, text/event-stream',
          'content-type': 'application/json',
          'mcp-protocol-version': '2025-11-25',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 2,
          method: 'tools/list',
          params: {},
        }),
      });

      expect(toolsListResponse.status).toBe(200);
      expect(await toolsListResponse.text()).toContain('"tools":');
    } finally {
      process.emit('SIGINT');
      await runPromise;
    }
  });
});
