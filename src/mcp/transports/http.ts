import http from 'node:http';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';

interface RunMcpHttpOptions {
  host: string;
  port: number;
  corsOrigin?: string;
}

export async function runMcpHttp(server: McpServer, options: RunMcpHttpOptions): Promise<void> {
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });
  await server.connect(transport);

  const appServer = http.createServer((req, res) => {
    if (options.corsOrigin) {
      res.setHeader('Access-Control-Allow-Origin', options.corsOrigin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Mcp-Session-Id');
    }

    if (req.method === 'OPTIONS') {
      res.statusCode = 204;
      res.end();
      return;
    }

    void transport.handleRequest(req, res);
  });

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
