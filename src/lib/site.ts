import { GhostClient } from './client.js';
import { resolveConnectionConfig } from './config.js';
import type { GlobalOptions } from './types.js';

async function getClient(global: GlobalOptions): Promise<GhostClient> {
  const connection = await resolveConnectionConfig(global);
  return new GhostClient({
    url: connection.url,
    staffToken: connection.staffToken,
    version: connection.apiVersion,
  });
}

export async function getSiteInfo(global: GlobalOptions): Promise<Record<string, unknown>> {
  const client = await getClient(global);
  return client.siteInfo();
}
