import process from 'node:process';
import chalk from 'chalk';
import Table from 'cli-table3';
import { isStdoutTty } from './tty.js';
import type { GlobalOptions } from './types.js';

function applyJqSubset(data: unknown, jq?: string): unknown {
  if (!jq) {
    return data;
  }

  const rootArrayPattern = /^\.\[\]\.([a-zA-Z0-9_]+)$/;
  const nestedArrayPattern = /^\.([a-zA-Z0-9_]+)\[\]\.([a-zA-Z0-9_]+)$/;
  const singleFieldPattern = /^\.([a-zA-Z0-9_]+)$/;

  const rootMatch = jq.match(rootArrayPattern);
  if (rootMatch) {
    const [, field = ''] = rootMatch;
    return Array.isArray(data)
      ? data.map((entry) => (entry as Record<string, unknown>)[field])
      : [];
  }

  const nestedMatch = jq.match(nestedArrayPattern);
  if (nestedMatch) {
    const [, collection = '', field = ''] = nestedMatch;
    const collectionValue = (data as Record<string, unknown>)[collection];
    return Array.isArray(collectionValue)
      ? collectionValue.map((entry) => (entry as Record<string, unknown>)[field])
      : [];
  }

  const singleMatch = jq.match(singleFieldPattern);
  if (singleMatch) {
    const [, field = ''] = singleMatch;
    return (data as Record<string, unknown>)[field];
  }

  throw new Error(`Unsupported --jq filter: ${jq}`);
}

export function printJson(data: unknown, jq?: string): void {
  const filtered = applyJqSubset(data, jq);

  if (Array.isArray(filtered) && jq) {
    for (const entry of filtered) {
      console.log(JSON.stringify(entry));
    }
    return;
  }

  console.log(JSON.stringify(filtered, null, 2));
}

function formatStatus(status: string, useColor: boolean): string {
  if (!useColor) {
    return status;
  }

  if (status === 'published') return chalk.green(status);
  if (status === 'draft') return chalk.yellow(status);
  if (status === 'scheduled') return chalk.blue(status);
  return status;
}

function printRows(headers: string[], rows: string[][], useColor: boolean): void {
  if (!isStdoutTty()) {
    for (const row of rows) {
      console.log(row.join('\t'));
    }
    return;
  }

  const table = new Table({
    head: headers,
    style: {
      head: useColor ? ['cyan'] : [],
      border: useColor ? ['gray'] : [],
    },
    wordWrap: true,
  });

  for (const row of rows) {
    table.push(row);
  }

  console.log(table.toString());
}

function printPagination(payload: Record<string, unknown>, label: string): void {
  const meta = payload.meta as Record<string, unknown> | undefined;
  const pagination = meta?.pagination as Record<string, unknown> | undefined;
  if (!pagination) {
    return;
  }

  console.log(
    `\nShowing page ${pagination.page ?? '?'} of ${pagination.pages ?? '?'} (total ${pagination.total ?? '?'} ${label})`,
  );
}

function printSingleRecord(
  payload: Record<string, unknown>,
  key: string,
  fields: Array<{ label: string; field: string }>,
): void {
  const entries = Array.isArray(payload[key]) ? payload[key] : [];
  const record = entries[0] as Record<string, unknown> | undefined;

  if (!record) {
    console.log('No record found.');
    return;
  }

  const lines = fields.map(({ label, field }) => `${label}: ${String(record[field] ?? '')}`);
  console.log(lines.join('\n'));
}

export function printPostListHuman(payload: Record<string, unknown>, useColor = true): void {
  const posts = Array.isArray(payload.posts) ? payload.posts : [];
  const rows = posts.map((entry) => {
    const record = entry as Record<string, unknown>;
    return [
      String(record.id ?? ''),
      String(record.title ?? ''),
      formatStatus(String(record.status ?? 'unknown'), useColor),
      String(record.published_at ?? ''),
    ];
  });

  printRows(['ID', 'TITLE', 'STATUS', 'PUBLISHED'], rows, useColor);
  printPagination(payload, 'posts');
}

export function printPageListHuman(payload: Record<string, unknown>, useColor = true): void {
  const pages = Array.isArray(payload.pages) ? payload.pages : [];
  const rows = pages.map((entry) => {
    const record = entry as Record<string, unknown>;
    return [
      String(record.id ?? ''),
      String(record.title ?? ''),
      formatStatus(String(record.status ?? 'unknown'), useColor),
      String(record.published_at ?? ''),
    ];
  });

  printRows(['ID', 'TITLE', 'STATUS', 'PUBLISHED'], rows, useColor);
  printPagination(payload, 'pages');
}

export function printTagListHuman(payload: Record<string, unknown>, useColor = true): void {
  const tags = Array.isArray(payload.tags) ? payload.tags : [];
  const rows = tags.map((entry) => {
    const record = entry as Record<string, unknown>;
    return [
      String(record.id ?? ''),
      String(record.name ?? ''),
      String(record.slug ?? ''),
      String(record.visibility ?? 'public'),
    ];
  });

  printRows(['ID', 'NAME', 'SLUG', 'VISIBILITY'], rows, useColor);
  printPagination(payload, 'tags');
}

export function printPostHuman(payload: Record<string, unknown>): void {
  printSingleRecord(payload, 'posts', [
    { label: 'ID', field: 'id' },
    { label: 'Title', field: 'title' },
    { label: 'Slug', field: 'slug' },
    { label: 'Status', field: 'status' },
    { label: 'Updated', field: 'updated_at' },
  ]);
}

export function printPageHuman(payload: Record<string, unknown>): void {
  printSingleRecord(payload, 'pages', [
    { label: 'ID', field: 'id' },
    { label: 'Title', field: 'title' },
    { label: 'Slug', field: 'slug' },
    { label: 'Status', field: 'status' },
    { label: 'Updated', field: 'updated_at' },
  ]);
}

export function printTagHuman(payload: Record<string, unknown>): void {
  printSingleRecord(payload, 'tags', [
    { label: 'ID', field: 'id' },
    { label: 'Name', field: 'name' },
    { label: 'Slug', field: 'slug' },
    { label: 'Visibility', field: 'visibility' },
    { label: 'Updated', field: 'updated_at' },
  ]);
}

export function isJsonMode(global: GlobalOptions): boolean {
  return Boolean(global.json || process.env.GHST_OUTPUT === 'json');
}
