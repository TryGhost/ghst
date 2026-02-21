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

  if (status === 'published' || status === 'active') return chalk.green(status);
  if (status === 'draft') return chalk.yellow(status);
  if (status === 'scheduled') return chalk.blue(status);
  if (status === 'archived') return chalk.gray(status);
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

function rowsFromCollection(
  payload: Record<string, unknown>,
  key: string,
  mapper: (record: Record<string, unknown>) => string[],
): string[][] {
  const collection = Array.isArray(payload[key]) ? payload[key] : [];
  return collection.map((entry) => mapper((entry as Record<string, unknown>) ?? {}));
}

function formatOperationCount(value: unknown): string {
  return typeof value === 'number' ? String(value) : '0';
}

export function printOperationStatsHuman(payload: Record<string, unknown>, label: string): void {
  const rootStats = (payload.meta as Record<string, unknown> | undefined)?.stats as
    | Record<string, unknown>
    | undefined;
  const bulkStats = (
    (payload.bulk as Record<string, unknown> | undefined)?.meta as
      | Record<string, unknown>
      | undefined
  )?.stats as Record<string, unknown> | undefined;

  const stats = rootStats ?? bulkStats;
  if (!stats) {
    console.log(label);
    return;
  }

  if (typeof stats.imported === 'number') {
    const invalidCount = Array.isArray(stats.invalid) ? stats.invalid.length : 0;
    console.log(`${label}: ${stats.imported} imported, ${invalidCount} invalid`);
    return;
  }

  const successful = formatOperationCount(stats.successful);
  const unsuccessful = formatOperationCount(stats.unsuccessful);
  console.log(`${label}: ${successful} successful, ${unsuccessful} unsuccessful`);
}

export function printPostListHuman(payload: Record<string, unknown>, useColor = true): void {
  const rows = rowsFromCollection(payload, 'posts', (record) => [
    String(record.id ?? ''),
    String(record.title ?? ''),
    formatStatus(String(record.status ?? 'unknown'), useColor),
    String(record.published_at ?? ''),
  ]);

  printRows(['ID', 'TITLE', 'STATUS', 'PUBLISHED'], rows, useColor);
  printPagination(payload, 'posts');
}

export function printPageListHuman(payload: Record<string, unknown>, useColor = true): void {
  const rows = rowsFromCollection(payload, 'pages', (record) => [
    String(record.id ?? ''),
    String(record.title ?? ''),
    formatStatus(String(record.status ?? 'unknown'), useColor),
    String(record.published_at ?? ''),
  ]);

  printRows(['ID', 'TITLE', 'STATUS', 'PUBLISHED'], rows, useColor);
  printPagination(payload, 'pages');
}

export function printTagListHuman(payload: Record<string, unknown>, useColor = true): void {
  const rows = rowsFromCollection(payload, 'tags', (record) => [
    String(record.id ?? ''),
    String(record.name ?? ''),
    String(record.slug ?? ''),
    String(record.visibility ?? 'public'),
  ]);

  printRows(['ID', 'NAME', 'SLUG', 'VISIBILITY'], rows, useColor);
  printPagination(payload, 'tags');
}

export function printMemberListHuman(payload: Record<string, unknown>, useColor = true): void {
  const rows = rowsFromCollection(payload, 'members', (record) => [
    String(record.id ?? ''),
    String(record.email ?? ''),
    String(record.name ?? ''),
    formatStatus(String(record.status ?? 'free'), useColor),
    String(record.updated_at ?? ''),
  ]);

  printRows(['ID', 'EMAIL', 'NAME', 'STATUS', 'UPDATED'], rows, useColor);
  printPagination(payload, 'members');
}

export function printNewsletterListHuman(payload: Record<string, unknown>, useColor = true): void {
  const rows = rowsFromCollection(payload, 'newsletters', (record) => [
    String(record.id ?? ''),
    String(record.name ?? ''),
    String(record.slug ?? ''),
    formatStatus(String(record.status ?? 'active'), useColor),
    String(record.visibility ?? ''),
  ]);

  printRows(['ID', 'NAME', 'SLUG', 'STATUS', 'VISIBILITY'], rows, useColor);
  printPagination(payload, 'newsletters');
}

export function printTierListHuman(payload: Record<string, unknown>, useColor = true): void {
  const rows = rowsFromCollection(payload, 'tiers', (record) => [
    String(record.id ?? ''),
    String(record.name ?? ''),
    String(record.type ?? ''),
    String(record.active ?? ''),
    String(record.monthly_price ?? ''),
    String(record.yearly_price ?? ''),
  ]);

  printRows(['ID', 'NAME', 'TYPE', 'ACTIVE', 'MONTHLY', 'YEARLY'], rows, useColor);
  printPagination(payload, 'tiers');
}

export function printOfferListHuman(payload: Record<string, unknown>, useColor = true): void {
  const rows = rowsFromCollection(payload, 'offers', (record) => [
    String(record.id ?? ''),
    String(record.name ?? ''),
    String(record.code ?? ''),
    formatStatus(String(record.status ?? ''), useColor),
    String(record.type ?? ''),
  ]);

  printRows(['ID', 'NAME', 'CODE', 'STATUS', 'TYPE'], rows, useColor);
  printPagination(payload, 'offers');
}

export function printLabelListHuman(payload: Record<string, unknown>, useColor = true): void {
  const rows = rowsFromCollection(payload, 'labels', (record) => [
    String(record.id ?? ''),
    String(record.name ?? ''),
    String(record.slug ?? ''),
    String(record.updated_at ?? ''),
  ]);

  printRows(['ID', 'NAME', 'SLUG', 'UPDATED'], rows, useColor);
  printPagination(payload, 'labels');
}

export function printUserListHuman(payload: Record<string, unknown>, useColor = true): void {
  const rows = rowsFromCollection(payload, 'users', (record) => [
    String(record.id ?? ''),
    String(record.name ?? ''),
    String(record.slug ?? ''),
    String(record.email ?? ''),
    formatStatus(String(record.status ?? ''), useColor),
  ]);

  printRows(['ID', 'NAME', 'SLUG', 'EMAIL', 'STATUS'], rows, useColor);
  printPagination(payload, 'users');
}

export function printThemeListHuman(payload: Record<string, unknown>, useColor = true): void {
  const rows = rowsFromCollection(payload, 'themes', (record) => [
    String(record.name ?? ''),
    String(record.active ?? ''),
    String(((record.package as Record<string, unknown> | undefined)?.version as string) ?? ''),
  ]);

  printRows(['NAME', 'ACTIVE', 'VERSION'], rows, useColor);
}

export function printSettingListHuman(payload: Record<string, unknown>, useColor = true): void {
  const rows = rowsFromCollection(payload, 'settings', (record) => [
    String(record.key ?? ''),
    String(record.value ?? ''),
    String(record.group ?? ''),
  ]);

  printRows(['KEY', 'VALUE', 'GROUP'], rows, useColor);
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

export function printMemberHuman(payload: Record<string, unknown>): void {
  printSingleRecord(payload, 'members', [
    { label: 'ID', field: 'id' },
    { label: 'Email', field: 'email' },
    { label: 'Name', field: 'name' },
    { label: 'Status', field: 'status' },
    { label: 'Updated', field: 'updated_at' },
  ]);
}

export function printNewsletterHuman(payload: Record<string, unknown>): void {
  printSingleRecord(payload, 'newsletters', [
    { label: 'ID', field: 'id' },
    { label: 'Name', field: 'name' },
    { label: 'Slug', field: 'slug' },
    { label: 'Status', field: 'status' },
    { label: 'Visibility', field: 'visibility' },
    { label: 'Updated', field: 'updated_at' },
  ]);
}

export function printTierHuman(payload: Record<string, unknown>): void {
  printSingleRecord(payload, 'tiers', [
    { label: 'ID', field: 'id' },
    { label: 'Name', field: 'name' },
    { label: 'Type', field: 'type' },
    { label: 'Active', field: 'active' },
    { label: 'Monthly', field: 'monthly_price' },
    { label: 'Yearly', field: 'yearly_price' },
    { label: 'Updated', field: 'updated_at' },
  ]);
}

export function printOfferHuman(payload: Record<string, unknown>): void {
  printSingleRecord(payload, 'offers', [
    { label: 'ID', field: 'id' },
    { label: 'Name', field: 'name' },
    { label: 'Code', field: 'code' },
    { label: 'Status', field: 'status' },
    { label: 'Type', field: 'type' },
    { label: 'Updated', field: 'updated_at' },
  ]);
}

export function printLabelHuman(payload: Record<string, unknown>): void {
  printSingleRecord(payload, 'labels', [
    { label: 'ID', field: 'id' },
    { label: 'Name', field: 'name' },
    { label: 'Slug', field: 'slug' },
    { label: 'Updated', field: 'updated_at' },
  ]);
}

export function printUserHuman(payload: Record<string, unknown>): void {
  printSingleRecord(payload, 'users', [
    { label: 'ID', field: 'id' },
    { label: 'Name', field: 'name' },
    { label: 'Slug', field: 'slug' },
    { label: 'Email', field: 'email' },
    { label: 'Status', field: 'status' },
  ]);
}

export function printWebhookHuman(payload: Record<string, unknown>): void {
  printSingleRecord(payload, 'webhooks', [
    { label: 'ID', field: 'id' },
    { label: 'Name', field: 'name' },
    { label: 'Event', field: 'event' },
    { label: 'Target URL', field: 'target_url' },
    { label: 'Updated', field: 'updated_at' },
  ]);
}

export function printThemeHuman(payload: Record<string, unknown>): void {
  const themes = Array.isArray(payload.themes) ? payload.themes : [];
  const theme = (themes[0] as Record<string, unknown> | undefined) ?? payload;
  const pkg = (theme.package as Record<string, unknown> | undefined) ?? {};

  console.log(
    [
      `Name: ${String(theme.name ?? '')}`,
      `Active: ${String(theme.active ?? '')}`,
      `Version: ${String(pkg.version ?? '')}`,
    ].join('\n'),
  );
}

export function printSettingHuman(payload: Record<string, unknown>): void {
  printSingleRecord(payload, 'settings', [
    { label: 'Key', field: 'key' },
    { label: 'Value', field: 'value' },
    { label: 'Group', field: 'group' },
    { label: 'Updated', field: 'updated_at' },
  ]);
}

export function printSiteHuman(payload: Record<string, unknown>): void {
  const site = ((payload.site as Record<string, unknown> | undefined) ?? payload) as Record<
    string,
    unknown
  >;
  const lines = [
    `Title: ${String(site.title ?? '')}`,
    `Description: ${String(site.description ?? '')}`,
    `URL: ${String(site.url ?? site.site_url ?? '')}`,
    `Version: ${String(site.version ?? '')}`,
  ];
  console.log(lines.join('\n'));
}

export function isJsonMode(global: GlobalOptions): boolean {
  return Boolean(global.json || process.env.GHST_OUTPUT === 'json');
}
