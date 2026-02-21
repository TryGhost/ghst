import { GhostClient } from './client.js';
import { resolveConnectionConfig } from './config.js';
import type { GlobalOptions } from './types.js';

export const WEBHOOK_EVENTS = [
  'site.changed',
  'post.added',
  'post.deleted',
  'post.edited',
  'post.published',
  'post.published.edited',
  'post.unpublished',
  'post.scheduled',
  'post.unscheduled',
  'post.rescheduled',
  'page.added',
  'page.deleted',
  'page.edited',
  'page.published',
  'page.published.edited',
  'page.unpublished',
  'page.scheduled',
  'page.unscheduled',
  'page.rescheduled',
  'tag.added',
  'tag.edited',
  'tag.deleted',
  'member.added',
  'member.deleted',
  'member.edited',
  'post.tag.attached',
  'post.tag.detached',
  'page.tag.attached',
  'page.tag.detached',
] as const;

async function getClient(global: GlobalOptions): Promise<GhostClient> {
  const connection = await resolveConnectionConfig(global);
  return new GhostClient({
    url: connection.url,
    key: connection.key,
    version: connection.apiVersion,
  });
}

export async function createWebhook(
  global: GlobalOptions,
  webhook: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const client = await getClient(global);
  return client.webhooks.add(webhook);
}

export async function updateWebhook(
  global: GlobalOptions,
  id: string,
  webhook: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const client = await getClient(global);
  return client.webhooks.edit(id, webhook);
}

export async function deleteWebhook(
  global: GlobalOptions,
  id: string,
): Promise<Record<string, never>> {
  const client = await getClient(global);
  return client.webhooks.delete(id);
}
