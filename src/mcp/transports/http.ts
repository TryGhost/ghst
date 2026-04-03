import { timingSafeEqual } from 'node:crypto';
import http from 'node:http';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';

interface RunMcpHttpOptions {
  host: string;
  port: number;
  corsOrigin?: string;
  authToken: string;
  maxBodyBytes?: number;
  headersTimeoutMs?: number;
  requestTimeoutMs?: number;
  keepAliveTimeoutMs?: number;
}

const DEFAULT_MAX_BODY_BYTES = 1024 * 1024;
const DEFAULT_HEADERS_TIMEOUT_MS = 15_000;
const DEFAULT_REQUEST_TIMEOUT_MS = 15_000;
const DEFAULT_KEEP_ALIVE_TIMEOUT_MS = 5_000;

function isAuthorized(authHeader: string | undefined, token: string): boolean {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return false;
  }

  const provided = authHeader.slice('Bearer '.length).trim();
  const expected = Buffer.from(token, 'utf8');
  const actual = Buffer.from(provided, 'utf8');
  if (expected.length !== actual.length) {
    return false;
  }

  return timingSafeEqual(expected, actual);
}

function parseContentLength(contentLengthHeader: string | undefined): number | null {
  if (!contentLengthHeader) {
    return null;
  }

  const parsed = Number(contentLengthHeader);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed < 0) {
    return null;
  }

  return parsed;
}

export async function runMcpHttp(
  createServer: () => McpServer,
  options: RunMcpHttpOptions,
): Promise<void> {
  const maxBodyBytes = options.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES;
  const headersTimeoutMs = options.headersTimeoutMs ?? DEFAULT_HEADERS_TIMEOUT_MS;
  const requestTimeoutMs = options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
  const keepAliveTimeoutMs = options.keepAliveTimeoutMs ?? DEFAULT_KEEP_ALIVE_TIMEOUT_MS;

  const appServer = http.createServer(async (req, res) => {
    if (options.corsOrigin) {
      res.setHeader('Access-Control-Allow-Origin', options.corsOrigin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
      res.setHeader(
        'Access-Control-Allow-Headers',
        'Content-Type, Mcp-Protocol-Version, Mcp-Session-Id, Last-Event-ID, Authorization',
      );
    }

    if (req.method === 'OPTIONS') {
      res.statusCode = 204;
      res.end();
      return;
    }

    const authHeader = Array.isArray(req.headers.authorization)
      ? req.headers.authorization[0]
      : req.headers.authorization;
    if (!isAuthorized(authHeader, options.authToken)) {
      res.statusCode = 401;
      res.end('Unauthorized');
      return;
    }

    if (req.method === 'POST') {
      const contentLengthHeader = Array.isArray(req.headers['content-length'])
        ? req.headers['content-length'][0]
        : req.headers['content-length'];
      const contentLength = parseContentLength(contentLengthHeader);
      if (contentLength === null) {
        res.statusCode = 411;
        res.end('Length Required');
        return;
      }
      if (contentLength > maxBodyBytes) {
        res.statusCode = 413;
        res.end('Payload Too Large');
        return;
      }
    }

    let requestServer: McpServer | undefined;
    let transport: StreamableHTTPServerTransport | undefined;
    let cleanedUp = false;
    const cleanup = async () => {
      if (cleanedUp) {
        return;
      }

      cleanedUp = true;
      const pending: Promise<unknown>[] = [];
      if (transport) {
        pending.push(transport.close());
      }
      if (requestServer) {
        pending.push(requestServer.close());
      }
      await Promise.allSettled(pending);
    };

    res.once('close', () => {
      void cleanup();
    });

    try {
      requestServer = createServer();
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
      });
      await requestServer.connect(transport);
      await transport.handleRequest(req, res);
    } catch {
      await cleanup();
      if (!res.headersSent) {
        res.statusCode = 500;
        res.end('Internal Server Error');
      } else if (!res.writableEnded) {
        res.end();
      }
    }
  });
  appServer.headersTimeout = headersTimeoutMs;
  appServer.requestTimeout = requestTimeoutMs;
  appServer.keepAliveTimeout = keepAliveTimeoutMs;

  await new Promise<void>((resolve, reject) => {
    appServer.once('error', reject);
    appServer.listen(options.port, options.host, () => {
      appServer.off('error', reject);
      resolve();
    });
  });

  await new Promise<void>((resolve) => {
    let closed = false;

    const stop = async () => {
      if (closed) {
        return;
      }

      closed = true;
      await new Promise<void>((done) => {
        appServer.close(() => done());
      });
      process.off('SIGINT', onSigint);
      process.off('SIGTERM', onSigterm);
      resolve();
    };

    const onSigint = () => {
      void stop();
    };

    const onSigterm = () => {
      void stop();
    };

    process.on('SIGINT', onSigint);
    process.on('SIGTERM', onSigterm);
  });
}
