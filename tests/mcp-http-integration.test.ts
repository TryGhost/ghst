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

function parseMcpJsonResponse(body: string): {
  result?: {
    tools?: Array<{
      name: string;
      _meta?: Record<string, unknown>;
    }>;
  };
} {
  const trimmed = body.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const dataLines = trimmed
      .split(/\r?\n/)
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice('data:'.length).trimStart());

    if (dataLines.length === 0) {
      throw new Error('MCP event-stream response did not include a data line');
    }

    return JSON.parse(dataLines.join('\n'));
  }
}

async function mcpPost(
  baseUrl: string,
  id: number,
  method: string,
  params: Record<string, unknown>,
): Promise<{ status: number; body: string }> {
  const response = await fetch(baseUrl, {
    method: 'POST',
    headers: {
      authorization: 'Bearer test-token',
      accept: 'application/json, text/event-stream',
      'content-type': 'application/json',
      'mcp-protocol-version': '2025-11-25',
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id,
      method,
      params,
    }),
  });

  return {
    status: response.status,
    body: await response.text(),
  };
}

describe.sequential('mcp http integration', () => {
  test('parses JSON and event-stream MCP responses', () => {
    expect(parseMcpJsonResponse('{"result":{"tools":[]}}')).toEqual({
      result: { tools: [] },
    });
    expect(parseMcpJsonResponse('data: {"result":{"tools":[]}}\n\n')).toEqual({
      result: { tools: [] },
    });
    expect(
      parseMcpJsonResponse('event: message\ndata: {"result":\ndata: {"tools":[]}}\n\n'),
    ).toEqual({
      result: { tools: [] },
    });
  });

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
      const toolsListBody = parseMcpJsonResponse(await toolsListResponse.text());
      const siteTool = toolsListBody.result?.tools?.find((tool) => tool.name === 'ghost_site_info');
      expect(siteTool?._meta).toMatchObject({
        'ghst/toolGroup': 'site',
        'ghst/toolGroupTitle': 'Site',
      });
      expect(JSON.stringify(siteTool)).toContain('"site"');

      const noArgumentsCall = await mcpPost(baseUrl, 3, 'tools/call', {
        name: 'ghost_site_list',
      });
      expect(noArgumentsCall.status).toBe(200);
      expect(noArgumentsCall.body).toContain('"sites"');

      const emptyArgumentsCall = await mcpPost(baseUrl, 4, 'tools/call', {
        name: 'ghost_site_list',
        arguments: {},
      });
      expect(emptyArgumentsCall.status).toBe(200);
      expect(emptyArgumentsCall.body).toContain('"sites"');

      const siteArgumentsCall = await mcpPost(baseUrl, 5, 'tools/call', {
        name: 'ghost_site_list',
        arguments: { site: 'blog-en' },
      });
      expect(siteArgumentsCall.status).toBe(200);
      expect(siteArgumentsCall.body).toContain('"sites"');
    } finally {
      process.emit('SIGINT');
      await runPromise;
    }
  });
});
