import fs from 'node:fs/promises';
import path from 'node:path';
import { GhostClient } from './client.js';
import { resolveConnectionConfig } from './config.js';
import type { GlobalOptions } from './types.js';

async function getClient(global: GlobalOptions): Promise<GhostClient> {
  const connection = await resolveConnectionConfig(global);
  return new GhostClient({
    url: connection.url,
    key: connection.key,
    version: connection.apiVersion,
  });
}

export async function uploadImage(
  global: GlobalOptions,
  options: {
    filePath: string;
    purpose?: string;
    ref?: string;
  },
): Promise<Record<string, unknown>> {
  const client = await getClient(global);
  const bytes = await fs.readFile(options.filePath);

  const formData = new FormData();
  formData.append('file', new Blob([bytes]), path.basename(options.filePath));

  if (options.purpose) {
    formData.append('purpose', options.purpose);
  }

  if (options.ref) {
    formData.append('ref', options.ref);
  }

  return client.images.upload(formData);
}
