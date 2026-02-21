import process from 'node:process';
import chalk from 'chalk';
import Table from 'cli-table3';
import type { GlobalOptions } from './types.js';

function ensureJsonJq(data: unknown, jq?: string): unknown {
  if (!jq) return data;

  const pattern = /^\.([a-zA-Z0-9_]+)\[\]\.([a-zA-Z0-9_]+)$/;
  const matched = jq.match(pattern);
  if (!matched) {
    throw new Error(`Unsupported --jq filter: ${jq}`);
  }

  const [, collection = '', field = ''] = matched;
  const collectionValue = (data as Record<string, unknown>)[collection];
  if (!Array.isArray(collectionValue)) {
    return [];
  }

  return collectionValue.map((entry) => (entry as Record<string, unknown>)[field]);
}

export function printJson(data: unknown, jq?: string): void {
  const filtered = ensureJsonJq(data, jq);

  if (Array.isArray(filtered) && jq) {
    for (const entry of filtered) {
      console.log(JSON.stringify(entry));
    }
    return;
  }

  console.log(JSON.stringify(filtered, null, 2));
}

export function printPostListHuman(payload: Record<string, unknown>, useColor = true): void {
  const posts = Array.isArray(payload.posts) ? payload.posts : [];
  const table = new Table({
    head: ['ID', 'TITLE', 'STATUS', 'PUBLISHED'],
    style: {
      head: useColor ? ['cyan'] : [],
      border: useColor ? ['gray'] : [],
    },
    wordWrap: true,
  });

  for (const post of posts) {
    const record = post as Record<string, unknown>;
    const status = String(record.status ?? 'unknown');
    let renderedStatus = status;

    if (useColor) {
      if (status === 'published') renderedStatus = chalk.green(status);
      else if (status === 'draft') renderedStatus = chalk.yellow(status);
      else if (status === 'scheduled') renderedStatus = chalk.blue(status);
    }

    table.push([
      String(record.id ?? ''),
      String(record.title ?? ''),
      renderedStatus,
      String(record.published_at ?? ''),
    ]);
  }

  console.log(table.toString());

  const meta = payload.meta as Record<string, unknown> | undefined;
  const pagination = meta?.pagination as Record<string, unknown> | undefined;
  if (pagination) {
    console.log(
      `\nShowing page ${pagination.page ?? '?'} of ${pagination.pages ?? '?'} (total ${pagination.total ?? '?'} posts)`,
    );
  }
}

export function printPostHuman(payload: Record<string, unknown>): void {
  const posts = Array.isArray(payload.posts) ? payload.posts : [];
  const post = posts[0] as Record<string, unknown> | undefined;

  if (!post) {
    console.log('No post found.');
    return;
  }

  const lines = [
    `ID: ${String(post.id ?? '')}`,
    `Title: ${String(post.title ?? '')}`,
    `Slug: ${String(post.slug ?? '')}`,
    `Status: ${String(post.status ?? '')}`,
    `Updated: ${String(post.updated_at ?? '')}`,
  ];

  console.log(lines.join('\n'));
}

export function isJsonMode(global: GlobalOptions): boolean {
  return Boolean(global.json || process.env.GHST_OUTPUT === 'json');
}
