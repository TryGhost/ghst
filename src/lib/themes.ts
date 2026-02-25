import fs from 'node:fs/promises';
import path from 'node:path';
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

export async function listThemes(global: GlobalOptions): Promise<Record<string, unknown>> {
  const client = await getClient(global);
  return client.themes.browse();
}

export async function uploadTheme(
  global: GlobalOptions,
  filePath: string,
): Promise<Record<string, unknown>> {
  const client = await getClient(global);
  const bytes = await fs.readFile(filePath);
  const formData = new FormData();
  formData.append('file', new Blob([bytes]), path.basename(filePath));
  return client.themes.upload(formData);
}

export async function activateTheme(
  global: GlobalOptions,
  name: string,
): Promise<Record<string, unknown>> {
  const client = await getClient(global);
  return client.themes.activate(name);
}
