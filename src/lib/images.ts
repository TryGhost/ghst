import fs from 'node:fs/promises';
import path from 'node:path';
import { GhostClient } from './client.js';
import { resolveConnectionConfig } from './config.js';
import type { GlobalOptions } from './types.js';

const IMAGE_MIME_BY_EXT: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.avif': 'image/avif',
};

function inferImageMimeType(filePath: string): string {
  const extension = path.extname(filePath).toLowerCase();
  return IMAGE_MIME_BY_EXT[extension] ?? 'application/octet-stream';
}

async function getClient(global: GlobalOptions): Promise<GhostClient> {
  const connection = await resolveConnectionConfig(global);
  return new GhostClient({
    url: connection.url,
    staffToken: connection.staffToken,
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
  const mimeType = inferImageMimeType(options.filePath);

  const formData = new FormData();
  formData.append('file', new Blob([bytes], { type: mimeType }), path.basename(options.filePath));

  if (options.purpose) {
    formData.append('purpose', options.purpose);
  }

  if (options.ref) {
    formData.append('ref', options.ref);
  }

  return client.images.upload(formData);
}
