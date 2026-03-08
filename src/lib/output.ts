import process from 'node:process';
import chalk from 'chalk';
import Table from 'cli-table3';
import type {
  StatsBreakdownRow,
  StatsContentRow,
  StatsGrowthReport,
  StatsNewsletterClicksReport,
  StatsNewsletterSubscribersReport,
  StatsNewslettersReport,
  StatsOverviewReport,
  StatsPostGrowthReport,
  StatsPostNewsletterReport,
  StatsPostReferrersReport,
  StatsPostReport,
  StatsPostsReport,
  StatsPostWebReport,
  StatsWebReport,
  StatsWebTableReport,
} from './stats.js';
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

export function printTableHuman(headers: string[], rows: string[][], useColor = true): void {
  printRows(headers, rows, useColor);
}

export function formatCsv(headers: string[], rows: string[][]): string {
  const escapeValue = (value: string): string => {
    if (/[",\n]/.test(value)) {
      return `"${value.replaceAll('"', '""')}"`;
    }

    return value;
  };

  return [headers, ...rows].map((row) => row.map(escapeValue).join(',')).join('\n');
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

function formatInteger(value: number): string {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(value);
}

function formatDecimal(value: number): string {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: value % 1 === 0 ? 0 : 1,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatPercent(value: number): string {
  return `${formatDecimal(value)}%`;
}

function formatSeconds(value: number): string {
  return `${formatInteger(value)}s`;
}

function printSection(title: string): void {
  console.log(title);
}

function printKeyValues(lines: string[]): void {
  console.log(lines.join('\n'));
}

function breakdownRows(items: StatsBreakdownRow[]): string[][] {
  return items.map((item) => [
    item.label,
    formatInteger(item.visits),
    item.signups === null ? '' : formatInteger(item.signups),
    item.paid_conversions === null ? '' : formatInteger(item.paid_conversions),
    item.mrr === null ? '' : formatInteger(item.mrr),
  ]);
}

function contentRows(items: StatsContentRow[]): string[][] {
  return items.map((item) => [
    item.title,
    item.pathname,
    formatInteger(item.visits),
    formatInteger(item.pageviews),
  ]);
}

function trafficSourceRows(items: StatsBreakdownRow[]): string[][] {
  return items.map((item) => [item.label, formatInteger(item.visits)]);
}

export function printStatsOverviewHuman(payload: StatsOverviewReport, useColor = true): void {
  const memberDelta = `${payload.summary.member_delta >= 0 ? '+' : ''}${formatInteger(payload.summary.member_delta)}`;
  const paidDelta = `${payload.summary.paid_delta >= 0 ? '+' : ''}${formatInteger(payload.summary.paid_delta)}`;
  const mrrDelta = `${payload.summary.mrr_delta >= 0 ? '+' : ''}${formatInteger(payload.summary.mrr_delta)}`;

  printSection(
    `Overview (${payload.range.from ?? 'all'} to ${payload.range.to}, ${payload.range.timezone})`,
  );
  printKeyValues([
    `Visitors: ${formatInteger(payload.summary.visitors)}`,
    `Pageviews: ${formatInteger(payload.summary.pageviews)}`,
    `Bounce rate: ${formatPercent(payload.summary.bounce_rate)}`,
    `Visit duration: ${formatSeconds(payload.summary.avg_session_sec)}`,
    `Active visitors: ${formatInteger(payload.summary.active_visitors)}`,
    `Members: ${formatInteger(payload.summary.total_members)} (${memberDelta})`,
    `Paid members: ${formatInteger(payload.summary.paid_members)} (${paidDelta})`,
    `MRR: ${formatInteger(payload.summary.mrr)} (${mrrDelta})`,
  ]);
  console.log('');
  printSection('Top Content');
  printRows(['TITLE', 'PATH', 'VISITS', 'PAGEVIEWS'], contentRows(payload.web.content), useColor);
  console.log('');
  printSection('Top Sources');
  printRows(['SOURCE', 'VISITS'], trafficSourceRows(payload.web.sources), useColor);
}

export function printStatsWebHuman(payload: StatsWebReport, useColor = true): void {
  printSection(
    `Web (${payload.range.from ?? 'all'} to ${payload.range.to}, ${payload.range.timezone})`,
  );
  printKeyValues([
    `Visitors: ${formatInteger(payload.kpis.visits)}`,
    `Pageviews: ${formatInteger(payload.kpis.pageviews)}`,
    `Bounce rate: ${formatPercent(payload.kpis.bounce_rate)}`,
    `Visit duration: ${formatSeconds(payload.kpis.avg_session_sec)}`,
    `Active visitors: ${formatInteger(payload.kpis.active_visitors)}`,
  ]);
  console.log('');
  printSection('Top Content');
  printRows(['TITLE', 'PATH', 'VISITS', 'PAGEVIEWS'], contentRows(payload.content), useColor);
  console.log('');
  printSection('Top Sources');
  printRows(
    ['SOURCE', 'VISITS', 'SIGNUPS', 'PAID', 'MRR'],
    breakdownRows(payload.sources),
    useColor,
  );
  console.log('');
  printSection('Top Locations');
  printRows(
    ['LOCATION', 'VISITS', 'SIGNUPS', 'PAID', 'MRR'],
    breakdownRows(payload.locations),
    useColor,
  );
}

export function printStatsWebTableHuman(payload: StatsWebTableReport, useColor = true): void {
  if (payload.metric === 'content') {
    printRows(
      ['TITLE', 'PATH', 'VISITS', 'PAGEVIEWS'],
      contentRows(payload.items as StatsContentRow[]),
      useColor,
    );
    return;
  }

  printRows(
    ['LABEL', 'VISITS', 'SIGNUPS', 'PAID', 'MRR'],
    breakdownRows(payload.items as StatsBreakdownRow[]),
    useColor,
  );
}

export function printStatsGrowthHuman(payload: StatsGrowthReport, useColor = true): void {
  printSection(
    `Growth (${payload.range.from ?? 'all'} to ${payload.range.to}, ${payload.range.timezone})`,
  );
  printKeyValues([
    `Members: ${formatInteger(payload.summary.total_members)} (${payload.summary.member_delta >= 0 ? '+' : ''}${formatInteger(payload.summary.member_delta)})`,
    `Paid members: ${formatInteger(payload.summary.paid_members)} (${payload.summary.paid_delta >= 0 ? '+' : ''}${formatInteger(payload.summary.paid_delta)})`,
    `MRR: ${formatInteger(payload.summary.mrr)} (${payload.summary.mrr_delta >= 0 ? '+' : ''}${formatInteger(payload.summary.mrr_delta)})`,
    `Subscriptions: ${formatInteger(payload.summary.total_subscriptions)} (${payload.summary.subscription_delta >= 0 ? '+' : ''}${formatInteger(payload.summary.subscription_delta)})`,
  ]);
  console.log('');
  printSection('Top Sources');
  printRows(
    ['SOURCE', 'VISITS', 'SIGNUPS', 'PAID', 'MRR'],
    breakdownRows(payload.sources),
    useColor,
  );
}

export function printStatsPostsHuman(payload: StatsPostsReport, useColor = true): void {
  printRows(
    ['TITLE', 'VIEWS', 'MEMBERS', 'SENT', 'OPEN RATE', 'CLICK RATE'],
    payload.posts.map((item) => [
      item.title,
      formatInteger(item.views),
      formatInteger(item.members),
      item.sent_count === null ? '' : formatInteger(item.sent_count),
      item.open_rate === null ? '' : formatPercent(item.open_rate),
      item.click_rate === null ? '' : formatPercent(item.click_rate),
    ]),
    useColor,
  );
}

export function printStatsNewslettersHuman(payload: StatsNewslettersReport, useColor = true): void {
  const rows = payload.newsletters.map((item) => [
    item.newsletter_name,
    formatInteger(item.sent_posts),
    formatInteger(item.recipients),
    formatPercent(item.open_rate),
    formatPercent(item.click_rate),
    formatInteger(item.subscribers),
  ]);

  printRows(
    ['NEWSLETTER', 'POSTS', 'RECIPIENTS', 'OPEN RATE', 'CLICK RATE', 'SUBSCRIBERS'],
    rows,
    useColor,
  );
}

export function printStatsNewsletterClicksHuman(
  payload: StatsNewsletterClicksReport,
  useColor = true,
): void {
  const rows = payload.clicks.map((item) => [
    item.post_title,
    item.send_date ?? '',
    formatInteger(item.recipients),
    formatInteger(item.clicks),
    formatPercent(item.click_rate),
  ]);
  printRows(['POST', 'DATE', 'RECIPIENTS', 'CLICKS', 'CLICK RATE'], rows, useColor);
}

export function printStatsNewsletterSubscribersHuman(
  payload: StatsNewsletterSubscribersReport,
  useColor = true,
): void {
  const rows = payload.newsletters.map((item) => [
    item.newsletter_name,
    formatInteger(item.subscribers),
    `${item.subscriber_delta >= 0 ? '+' : ''}${formatInteger(item.subscriber_delta)}`,
  ]);
  printRows(['NEWSLETTER', 'SUBSCRIBERS', 'DELTA'], rows, useColor);
}

export function printStatsPostHuman(payload: StatsPostReport, useColor = true): void {
  printSection(`Post: ${payload.post.title}`);
  printKeyValues([
    `Visitors: ${formatInteger(payload.summary.visitors)}`,
    `Pageviews: ${formatInteger(payload.summary.pageviews)}`,
    `Free members: ${formatInteger(payload.summary.free_members)}`,
    `Paid members: ${formatInteger(payload.summary.paid_members)}`,
    `MRR: ${formatInteger(payload.summary.mrr)}`,
    `Email recipients: ${formatInteger(payload.summary.email_recipients)}`,
    `Email open rate: ${formatPercent(payload.summary.email_open_rate)}`,
    `Email click rate: ${formatPercent(payload.summary.email_click_rate)}`,
  ]);

  if (payload.web) {
    console.log('');
    printSection('Web');
    printKeyValues([
      `Visitors: ${formatInteger(payload.web.kpis.visits)}`,
      `Pageviews: ${formatInteger(payload.web.kpis.pageviews)}`,
      `Bounce rate: ${formatPercent(payload.web.kpis.bounce_rate)}`,
    ]);
  }

  console.log('');
  printSection('Top Referrers');
  printRows(
    ['SOURCE', 'VISITS', 'SIGNUPS', 'PAID', 'MRR'],
    payload.referrers.map((item) => [
      item.source,
      formatInteger(item.visits),
      formatInteger(item.signups),
      formatInteger(item.paid_conversions),
      formatInteger(item.mrr),
    ]),
    useColor,
  );
}

export function printStatsPostGrowthHuman(payload: StatsPostGrowthReport, useColor = true): void {
  printRows(
    ['DATE', 'FREE', 'PAID', 'MRR'],
    payload.growth.map((item) => [
      item.date,
      formatInteger(item.free_members),
      formatInteger(item.paid_members),
      formatInteger(item.mrr),
    ]),
    useColor,
  );
}

export function printStatsPostNewsletterHuman(payload: StatsPostNewsletterReport): void {
  printSection(`Post Newsletter: ${payload.post.title}`);
  printKeyValues([
    `Recipients: ${formatInteger(payload.newsletter.recipients)}`,
    `Open rate: ${formatPercent(payload.newsletter.open_rate)}`,
    `Click rate: ${formatPercent(payload.newsletter.click_rate)}`,
  ]);
}

export function printStatsPostReferrersHuman(
  payload: StatsPostReferrersReport,
  useColor = true,
): void {
  printRows(
    ['SOURCE', 'VISITS', 'SIGNUPS', 'PAID', 'MRR'],
    payload.referrers.map((item) => [
      item.source,
      formatInteger(item.visits),
      formatInteger(item.signups),
      formatInteger(item.paid_conversions),
      formatInteger(item.mrr),
    ]),
    useColor,
  );
}

export function printStatsPostWebHuman(payload: StatsPostWebReport, useColor = true): void {
  printSection(`Post Web: ${payload.post.title}`);
  printKeyValues([
    `Visitors: ${formatInteger(payload.kpis.visits)}`,
    `Pageviews: ${formatInteger(payload.kpis.pageviews)}`,
    `Bounce rate: ${formatPercent(payload.kpis.bounce_rate)}`,
    `Visit duration: ${formatSeconds(payload.kpis.avg_session_sec)}`,
    `Active visitors: ${formatInteger(payload.kpis.active_visitors)}`,
  ]);
  console.log('');
  printSection('Top Sources');
  printRows(
    ['SOURCE', 'VISITS', 'SIGNUPS', 'PAID', 'MRR'],
    breakdownRows(payload.sources),
    useColor,
  );
  console.log('');
  printSection('Top Locations');
  printRows(
    ['LOCATION', 'VISITS', 'SIGNUPS', 'PAID', 'MRR'],
    breakdownRows(payload.locations),
    useColor,
  );
}

export function isJsonMode(global: GlobalOptions): boolean {
  return Boolean(global.json || global.jq || process.env.GHST_OUTPUT === 'json');
}
