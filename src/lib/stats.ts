import type {
  StatsGrowthInput,
  StatsNewsletterClicksInput,
  StatsNewsletterSubscribersInput,
  StatsNewslettersInput,
  StatsOverviewInput,
  StatsPostGrowthInput,
  StatsPostInput,
  StatsPostNewsletterInput,
  StatsPostReferrersInput,
  StatsPostsInput,
  StatsPostWebInput,
  StatsWebInput,
  StatsWebTableInput,
} from '../schemas/stats.js';
import { GhostClient, type GhostPaginatedResponse } from './client.js';
import { resolveConnectionConfig } from './config.js';
import { ExitCode, GhstError, mapHttpStatusToExitCode } from './errors.js';
import { collectAllPages } from './pagination.js';
import type { GlobalOptions } from './types.js';

type TinybirdPrimitive = string | number | boolean | undefined;
type TinybirdParams = Record<string, TinybirdPrimitive>;
type TinybirdRow = Record<string, unknown>;
type SettingsRecord = Record<string, unknown>;
const ALL_RANGE_DATE_FROM = '1970-01-01';

interface StatsBootstrap {
  config: Record<string, unknown>;
  settings: SettingsRecord[];
  site: Record<string, unknown>;
}

interface StatsConfigRecord extends Record<string, unknown> {
  id?: string;
  endpoint?: string;
  endpointBrowser?: string;
  version?: string;
  local?: {
    enabled?: boolean;
    endpoint?: string;
  };
}

export interface StatsRange {
  preset: '7d' | '30d' | '90d' | '365d' | 'all';
  from: string | null;
  to: string;
  timezone: string;
}

export interface StatsFilters {
  audience: 'all' | 'free' | 'paid';
  source: string | null;
  location: string | null;
  device: 'desktop' | 'mobile-ios' | 'mobile-android' | 'bot' | 'unknown' | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  utm_term: string | null;
}

export interface StatsKpis {
  visits: number;
  pageviews: number;
  bounce_rate: number;
  avg_session_sec: number;
  active_visitors: number;
}

export interface StatsContentRow {
  id: string | null;
  uuid: string | null;
  title: string;
  pathname: string;
  url: string | null;
  type: string | null;
  visits: number;
  pageviews: number;
}

export interface StatsBreakdownRow {
  key: string;
  label: string;
  visits: number;
  pageviews: number | null;
  signups: number | null;
  paid_conversions: number | null;
  mrr: number | null;
}

export interface StatsSeriesPoint {
  date: string;
  free_members: number | null;
  paid_members: number | null;
  total_members: number | null;
  mrr: number | null;
  subscriptions: number | null;
}

export interface StatsTrafficPoint {
  date: string;
  visits: number;
  pageviews: number;
  bounce_rate: number;
  avg_session_sec: number;
}

export interface StatsSubscriptionTotal {
  tier: string;
  label: string;
  count: number;
}

export interface StatsWebReport {
  range: StatsRange;
  filters: StatsFilters;
  kpis: StatsKpis;
  timeseries: StatsTrafficPoint[];
  content: StatsContentRow[];
  sources: StatsBreakdownRow[];
  locations: StatsBreakdownRow[];
}

export interface StatsWebTableReport {
  range: StatsRange;
  filters: StatsFilters;
  metric: string;
  items: StatsBreakdownRow[] | StatsContentRow[];
}

export interface StatsGrowthReport {
  range: StatsRange;
  summary: {
    free_members: number;
    paid_members: number;
    total_members: number;
    member_delta: number;
    paid_delta: number;
    mrr: number;
    mrr_delta: number;
    total_subscriptions: number;
    subscription_delta: number;
    currency: string | null;
  };
  members: StatsSeriesPoint[];
  mrr: StatsSeriesPoint[];
  subscriptions: {
    history: StatsSeriesPoint[];
    totals: StatsSubscriptionTotal[];
  };
  sources: StatsBreakdownRow[];
}

export interface StatsNewsletterSummaryRow {
  newsletter_id: string;
  newsletter_name: string;
  newsletter_slug: string | null;
  sent_posts: number;
  recipients: number;
  opened: number;
  clicked: number;
  open_rate: number;
  click_rate: number;
  subscribers: number;
  subscriber_delta: number;
}

export interface StatsNewslettersReport {
  range: StatsRange;
  newsletters: StatsNewsletterSummaryRow[];
}

export interface StatsNewsletterClicksRow {
  post_id: string | null;
  post_title: string;
  send_date: string | null;
  recipients: number;
  clicks: number;
  click_rate: number;
}

export interface StatsNewsletterClicksReport {
  range: StatsRange;
  newsletter: {
    id: string;
    name: string;
    slug: string | null;
  };
  posts: string[];
  clicks: StatsNewsletterClicksRow[];
}

export interface StatsNewsletterSubscribersRow {
  newsletter_id: string;
  newsletter_name: string;
  newsletter_slug: string | null;
  subscribers: number;
  subscriber_delta: number;
  history: Array<{ date: string; total: number; delta: number }>;
}

export interface StatsNewsletterSubscribersReport {
  range: StatsRange;
  newsletters: StatsNewsletterSubscribersRow[];
}

export interface StatsPostMeta {
  id: string;
  uuid: string | null;
  title: string;
  slug: string | null;
  url: string | null;
  published_at?: string | null;
}

export interface StatsPostSummary {
  visitors: number;
  pageviews: number;
  free_members: number;
  paid_members: number;
  mrr: number;
  email_recipients: number;
  email_open_rate: number;
  email_click_rate: number;
}

export interface StatsPostReferrerRow {
  source: string;
  visits: number;
  signups: number;
  paid_conversions: number;
  mrr: number;
}

export interface StatsPostGrowthPoint {
  date: string;
  free_members: number;
  paid_members: number;
  mrr: number;
}

export interface StatsPostNewsletterReport {
  range: StatsRange;
  post: StatsPostMeta;
  newsletter: {
    recipients: number;
    open_rate: number;
    click_rate: number;
  };
}

export interface StatsPostGrowthReport {
  range: StatsRange;
  post: StatsPostMeta;
  growth: StatsPostGrowthPoint[];
}

export interface StatsPostReferrersReport {
  range: StatsRange;
  post: StatsPostMeta;
  referrers: StatsPostReferrerRow[];
}

export interface StatsPostWebReport {
  range: StatsRange;
  filters: StatsFilters;
  post: StatsPostMeta;
  kpis: StatsKpis;
  timeseries: StatsTrafficPoint[];
  sources: StatsBreakdownRow[];
  locations: StatsBreakdownRow[];
}

export interface StatsPostViewsRow {
  post_id: string;
  title: string;
  published_at: string | null;
  feature_image: string | null;
  status: string | null;
  authors: string;
  views: number;
  sent_count: number | null;
  opened_count: number | null;
  open_rate: number | null;
  clicked_count: number;
  click_rate: number | null;
  members: number;
  free_members: number;
  paid_members: number;
}

export interface StatsPostsReport {
  range: StatsRange;
  posts: StatsPostViewsRow[];
}

interface StatsPostSummaryFallback {
  free_members: number;
  paid_members: number;
  email_recipients: number;
  email_open_rate: number;
  email_click_rate: number;
}

export interface StatsPostReport {
  range: StatsRange;
  post: StatsPostMeta;
  summary: StatsPostSummary;
  web: StatsPostWebReport | null;
  growth: StatsPostGrowthPoint[];
  referrers: StatsPostReferrerRow[];
}

export interface StatsOverviewReport {
  range: StatsRange;
  summary: {
    visitors: number;
    pageviews: number;
    bounce_rate: number;
    avg_session_sec: number;
    active_visitors: number;
    total_members: number;
    member_delta: number;
    paid_members: number;
    paid_delta: number;
    mrr: number;
    mrr_delta: number;
  };
  web: StatsWebReport;
  growth: StatsGrowthReport;
  newsletters: StatsNewslettersReport;
}

function getArray(payload: unknown, key = 'stats'): Record<string, unknown>[] {
  if (!payload || typeof payload !== 'object') {
    return [];
  }

  const value = (payload as Record<string, unknown>)[key];
  return Array.isArray(value) ? (value as Record<string, unknown>[]) : [];
}

function getObject(payload: unknown, key: string): Record<string, unknown> {
  if (!payload || typeof payload !== 'object') {
    return {};
  }

  const value = (payload as Record<string, unknown>)[key];
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function getString(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  return String(value);
}

function getNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return 0;
}

function getNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const parsed = getNumber(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatDateInTimeZone(date: Date, timeZone: string): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = formatter.formatToParts(date);
  const year = parts.find((part) => part.type === 'year')?.value ?? '1970';
  const month = parts.find((part) => part.type === 'month')?.value ?? '01';
  const day = parts.find((part) => part.type === 'day')?.value ?? '01';
  return `${year}-${month}-${day}`;
}

function subtractDays(dateString: string, days: number): string {
  const [year, month, day] = dateString.split('-').map((value) => Number(value));
  const safeYear = typeof year === 'number' && Number.isFinite(year) ? year : 1970;
  const safeMonth = typeof month === 'number' && Number.isFinite(month) ? month : 1;
  const safeDay = typeof day === 'number' && Number.isFinite(day) ? day : 1;
  const date = new Date(Date.UTC(safeYear, safeMonth - 1, safeDay));
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

function lastValue<T>(items: T[]): T | null {
  return items.length > 0 ? (items[items.length - 1] ?? null) : null;
}

function deltaOf(items: Array<number | null>): number {
  if (items.length === 0) {
    return 0;
  }

  const first = items.find((value) => value !== null) ?? 0;
  const last = [...items].reverse().find((value) => value !== null) ?? 0;
  return Number(last) - Number(first);
}

function normalizePercentValue(value: unknown): number {
  const numeric = getNumber(value);
  const normalized = numeric <= 1 ? numeric * 100 : numeric;
  return Number(normalized.toFixed(2));
}

function isDateWithinRange(date: string | null | undefined, range: StatsRange): boolean {
  if (!date) {
    return false;
  }

  const dateOnly = date.slice(0, 10);
  if (range.from && dateOnly < range.from) {
    return false;
  }

  return dateOnly <= range.to;
}

function clipDatedRows<T extends { date: string }>(rows: T[], range: StatsRange): T[] {
  return rows.filter((row) => isDateWithinRange(row.date, range));
}

function hasExplicitWindowOverride(
  input: Pick<StatsOverviewInput, 'range' | 'from' | 'to'>,
): boolean {
  return Boolean(input.range || input.from || input.to);
}

function getRangePresetDays(preset: StatsRange['preset']): number | null {
  switch (preset) {
    case '7d':
      return 7;
    case '30d':
      return 30;
    case '90d':
      return 90;
    case '365d':
      return 365;
    case 'all':
      return null;
  }
}

function settingValue(settings: SettingsRecord[], key: string): unknown {
  const match = settings.find((entry) => entry.key === key);
  return match?.value;
}

function resolveFilters(
  input: Pick<
    StatsWebInput,
    | 'audience'
    | 'source'
    | 'location'
    | 'device'
    | 'utmSource'
    | 'utmMedium'
    | 'utmCampaign'
    | 'utmContent'
    | 'utmTerm'
  >,
): StatsFilters {
  return {
    audience: input.audience ?? 'all',
    source: input.source ?? null,
    location: input.location ?? null,
    device: input.device ?? null,
    utm_source: input.utmSource ?? null,
    utm_medium: input.utmMedium ?? null,
    utm_campaign: input.utmCampaign ?? null,
    utm_content: input.utmContent ?? null,
    utm_term: input.utmTerm ?? null,
  };
}

function makeAnalyticsUnavailableError(): GhstError {
  return new GhstError('Ghost web analytics is unavailable for this site.', {
    code: 'ANALYTICS_UNAVAILABLE',
    exitCode: ExitCode.GENERAL_ERROR,
  });
}

function normalizeKpis(
  kpiRows: Record<string, unknown>[],
  activeRow: Record<string, unknown> | undefined,
): StatsKpis {
  const totals = kpiRows.reduce<{
    visits: number;
    pageviews: number;
    bounceNumerator: number;
    durationNumerator: number;
  }>(
    (acc, row) => {
      const visits = getNumber(row.visits);
      const pageviews = getNumber(row.pageviews);
      const bounceRate = normalizePercentValue(row.bounce_rate);
      const avgSessionSec = getNumber(row.avg_session_sec);

      return {
        visits: acc.visits + visits,
        pageviews: acc.pageviews + pageviews,
        bounceNumerator: acc.bounceNumerator + visits * bounceRate,
        durationNumerator: acc.durationNumerator + visits * avgSessionSec,
      };
    },
    {
      visits: 0,
      pageviews: 0,
      bounceNumerator: 0,
      durationNumerator: 0,
    },
  );

  return {
    visits: totals.visits,
    pageviews: totals.pageviews,
    bounce_rate: totals.visits > 0 ? totals.bounceNumerator / totals.visits : 0,
    avg_session_sec: totals.visits > 0 ? totals.durationNumerator / totals.visits : 0,
    active_visitors: getNumber(
      activeRow?.active_visitors ?? activeRow?.visitors ?? activeRow?.count ?? 0,
    ),
  };
}

function normalizeTrafficSeries(rows: Record<string, unknown>[]): StatsTrafficPoint[] {
  return rows
    .map((row) => ({
      date: getString(row.date) ?? '',
      visits: getNumber(row.visits),
      pageviews: getNumber(row.pageviews),
      bounce_rate: normalizePercentValue(row.bounce_rate),
      avg_session_sec: getNumber(row.avg_session_sec),
    }))
    .filter((row) => row.date.length > 0);
}

function normalizeContentRow(row: Record<string, unknown>): StatsContentRow {
  return {
    id: getString(row.id ?? row.post_id),
    uuid: getString(row.uuid ?? row.post_uuid),
    title: getString(row.title ?? row.post_title ?? row.pathname) ?? '(untitled)',
    pathname: getString(row.pathname) ?? '/',
    url: getString(row.url),
    type: getString(row.type ?? row.post_type),
    visits: getNumber(row.visits),
    pageviews: getNumber(row.pageviews ?? row.views),
  };
}

function normalizeBreakdownRow(
  row: Record<string, unknown>,
  keys: string[],
  fallbackLabel: string,
): StatsBreakdownRow {
  const key =
    keys
      .map((entry) => getString(row[entry]))
      .find((entry) => Boolean(entry && entry.length > 0)) ?? fallbackLabel;

  return {
    key,
    label: key,
    visits: getNumber(row.visits ?? row.count),
    pageviews: getNullableNumber(row.pageviews),
    signups: getNullableNumber(row.signups ?? row.free_members),
    paid_conversions: getNullableNumber(row.paid_conversions ?? row.paid_members),
    mrr: getNullableNumber(row.mrr),
  };
}

function normalizeMembersSeries(rows: Record<string, unknown>[]): StatsSeriesPoint[] {
  return rows.map((row) => ({
    date: getString(row.date) ?? '',
    free_members: getNullableNumber(row.free_members ?? row.free),
    paid_members: getNullableNumber(row.paid_members ?? row.paid),
    total_members: getNullableNumber(
      row.total_members ??
        row.members ??
        row.all_members ??
        row.total ??
        row.count ??
        getNumber(row.free_members ?? row.free) +
          getNumber(row.paid_members ?? row.paid) +
          getNumber(row.comped),
    ),
    mrr: null,
    subscriptions: null,
  }));
}

function normalizeMrrSeries(rows: Record<string, unknown>[]): StatsSeriesPoint[] {
  return rows.map((row) => ({
    date: getString(row.date) ?? '',
    free_members: null,
    paid_members: null,
    total_members: null,
    mrr: getNullableNumber(row.mrr),
    subscriptions: null,
  }));
}

function normalizeSubscriptionsHistory(rows: Record<string, unknown>[]): StatsSeriesPoint[] {
  return rows.map((row) => ({
    date: getString(row.date) ?? '',
    free_members: null,
    paid_members: null,
    total_members: null,
    mrr: null,
    subscriptions: getNullableNumber(row.count ?? row.subscriptions),
  }));
}

function normalizeTopSources(rows: Record<string, unknown>[]): StatsBreakdownRow[] {
  return rows.map((row) => normalizeBreakdownRow(row, ['source'], 'Direct'));
}

function normalizeLocations(rows: Record<string, unknown>[]): StatsBreakdownRow[] {
  return rows.map((row) => normalizeBreakdownRow(row, ['location', 'country'], 'Unknown'));
}

function normalizeDevices(rows: Record<string, unknown>[]): StatsBreakdownRow[] {
  return rows.map((row) => normalizeBreakdownRow(row, ['device'], 'unknown'));
}

function normalizeUtm(rows: Record<string, unknown>[], field: string): StatsBreakdownRow[] {
  return rows.map((row) => normalizeBreakdownRow(row, [field], '(none)'));
}

function normalizePostReferrers(rows: Record<string, unknown>[]): StatsPostReferrerRow[] {
  return rows.map((row) => ({
    source: getString(row.source) ?? 'Direct',
    visits: getNumber(row.visits ?? row.count),
    signups: getNumber(row.signups ?? row.free_members),
    paid_conversions: getNumber(row.paid_conversions ?? row.paid_members),
    mrr: getNumber(row.mrr),
  }));
}

function normalizePostGrowth(rows: Record<string, unknown>[]): StatsPostGrowthPoint[] {
  return rows.map((row) => ({
    date: getString(row.date) ?? '',
    free_members: getNumber(row.free_members),
    paid_members: getNumber(row.paid_members),
    mrr: getNumber(row.mrr),
  }));
}

function normalizeTopPostsViews(rows: Record<string, unknown>[]): StatsPostViewsRow[] {
  return rows.map((row) => ({
    post_id: getString(row.post_id ?? row.id) ?? '',
    title: getString(row.title) ?? '(untitled)',
    published_at: getString(row.published_at),
    feature_image: getString(row.feature_image),
    status: getString(row.status),
    authors: getString(row.authors) ?? '',
    views: getNumber(row.views ?? row.visits),
    sent_count: getNullableNumber(row.sent_count ?? row.email_count),
    opened_count: getNullableNumber(row.opened_count),
    open_rate:
      row.open_rate === null || row.open_rate === undefined
        ? null
        : normalizePercentValue(row.open_rate),
    clicked_count: getNumber(row.clicked_count ?? row.total_clicks),
    click_rate:
      row.click_rate === null || row.click_rate === undefined
        ? null
        : normalizePercentValue(row.click_rate),
    members: getNumber(row.members),
    free_members: getNumber(row.free_members),
    paid_members: getNumber(row.paid_members),
  }));
}

function buildPostSummaryFallback(row: StatsPostViewsRow | null): StatsPostSummaryFallback | null {
  if (!row) {
    return null;
  }

  return {
    free_members: row.free_members,
    paid_members: row.paid_members,
    email_recipients: row.sent_count ?? 0,
    email_open_rate: row.open_rate ?? 0,
    email_click_rate: row.click_rate ?? 0,
  };
}

function normalizeNewsletterClicks(rows: Record<string, unknown>[]): StatsNewsletterClicksRow[] {
  return rows.map((row) => ({
    post_id: getString(row.post_id),
    post_title: getString(row.post_title ?? row.title) ?? '(untitled)',
    send_date: getString(row.send_date),
    recipients: getNumber(row.sent_to ?? row.recipients ?? row.email_count),
    clicks: getNumber(row.total_clicks ?? row.clicked ?? row.clicks ?? row.click_count),
    click_rate: Number(
      (getNumber(row.click_rate) * (getNumber(row.click_rate) <= 1 ? 100 : 1)).toFixed(2),
    ),
  }));
}

function mergeNewsletterClickStats(
  basicStatsRows: Record<string, unknown>[],
  clickRows: Record<string, unknown>[],
): Record<string, unknown>[] {
  const clickRowsByPostId = new Map<string, Record<string, unknown>>();

  for (const row of clickRows) {
    const postId = getString(row.post_id);
    if (postId) {
      clickRowsByPostId.set(postId, row);
    }
  }

  return basicStatsRows.map((row) => {
    const postId = getString(row.post_id);
    const clickRow = postId ? clickRowsByPostId.get(postId) : undefined;

    return {
      ...row,
      total_clicks: clickRow?.total_clicks ?? row.total_clicks ?? 0,
      click_rate: clickRow?.click_rate ?? row.click_rate ?? 0,
      email_count: clickRow?.email_count ?? row.email_count ?? row.sent_to ?? row.recipients ?? 0,
    };
  });
}

function extractPostSummary(raw: unknown): StatsPostSummary {
  const statsObject = getObject(raw, 'stats');
  const dataObject = getObject(raw, 'data');
  const source = Object.keys(statsObject).length > 0 ? statsObject : dataObject;

  return {
    visitors: getNumber(source.visitors ?? source.visits),
    pageviews: getNumber(source.pageviews ?? source.views),
    free_members: getNumber(source.free_members),
    paid_members: getNumber(source.paid_members),
    mrr: getNumber(source.mrr),
    email_recipients: getNumber(source.email_recipients ?? source.email_recipients_count),
    email_open_rate: normalizePercentValue(source.email_open_rate ?? source.open_rate),
    email_click_rate: normalizePercentValue(source.email_click_rate ?? source.click_rate),
  };
}

function newsletterStatsSummary(
  newsletter: Record<string, unknown>,
  basicStatsRows: Record<string, unknown>[],
  subscriberHistory: Array<{ date: string; total: number; delta: number }>,
): StatsNewsletterSummaryRow {
  const recipients = basicStatsRows.reduce(
    (sum, row) => sum + getNumber(row.sent_to ?? row.recipients ?? row.email_count),
    0,
  );
  const opened = basicStatsRows.reduce(
    (sum, row) => sum + getNumber(row.total_opens ?? row.opened ?? row.opens ?? row.open_count),
    0,
  );
  const clicked = basicStatsRows.reduce(
    (sum, row) => sum + getNumber(row.total_clicks ?? row.clicked ?? row.clicks ?? row.click_count),
    0,
  );
  const latestSubscriber = lastValue(subscriberHistory);

  return {
    newsletter_id: String(newsletter.id ?? ''),
    newsletter_name: getString(newsletter.name) ?? '(untitled)',
    newsletter_slug: getString(newsletter.slug),
    sent_posts: basicStatsRows.length,
    recipients,
    opened,
    clicked,
    open_rate: recipients > 0 ? Number(((opened / recipients) * 100).toFixed(2)) : 0,
    click_rate: recipients > 0 ? Number(((clicked / recipients) * 100).toFixed(2)) : 0,
    subscribers: latestSubscriber?.total ?? 0,
    subscriber_delta: latestSubscriber?.delta ?? 0,
  };
}

function summarizePostGrowth(
  points: StatsPostGrowthPoint[],
): Pick<StatsPostSummary, 'free_members' | 'paid_members' | 'mrr'> {
  const latest = lastValue(points);

  return {
    free_members: latest?.free_members ?? 0,
    paid_members: latest?.paid_members ?? 0,
    mrr: latest?.mrr ?? 0,
  };
}

function buildPostEmailSummary(
  summary: StatsPostSummary,
  range: StatsRange,
  post: StatsPostMeta,
): Pick<StatsPostSummary, 'email_recipients' | 'email_open_rate' | 'email_click_rate'> {
  if (!post.published_at) {
    return {
      email_recipients: summary.email_recipients,
      email_open_rate: summary.email_open_rate,
      email_click_rate: summary.email_click_rate,
    };
  }

  if (!isDateWithinRange(post.published_at, range)) {
    return {
      email_recipients: 0,
      email_open_rate: 0,
      email_click_rate: 0,
    };
  }

  return {
    email_recipients: summary.email_recipients,
    email_open_rate: summary.email_open_rate,
    email_click_rate: summary.email_click_rate,
  };
}

function normalizeSubscriptionTotals(
  rows: Record<string, unknown>[],
  fallbackTotals: StatsSubscriptionTotal[],
  range: StatsRange,
): StatsSubscriptionTotal[] {
  const latestByTier = new Map<string, Record<string, unknown>>();

  for (const row of rows) {
    const date = getString(row.date);
    if (!isDateWithinRange(date, range)) {
      continue;
    }

    const tier = getString(row.tier) ?? '';
    if (!tier) {
      continue;
    }

    const existing = latestByTier.get(tier);
    if (!existing || (getString(existing.date) ?? '') <= (date ?? '')) {
      latestByTier.set(tier, row);
    }
  }

  if (latestByTier.size === 0) {
    return fallbackTotals;
  }

  return [...latestByTier.entries()].map(([tier, row]) => ({
    tier,
    label: getString(row.label ?? row.name ?? row.tier) ?? tier,
    count: getNumber(row.count),
  }));
}

class StatsClient {
  private readonly global: GlobalOptions;
  private connectionPromise?: Promise<Awaited<ReturnType<typeof resolveConnectionConfig>>>;
  private clientPromise?: Promise<GhostClient>;
  private bootstrapPromise?: Promise<StatsBootstrap>;
  private tokenPromise?: Promise<string>;
  private postCache = new Map<string, StatsPostMeta>();

  constructor(global: GlobalOptions) {
    this.global = global;
  }

  private async getConnection() {
    if (!this.connectionPromise) {
      this.connectionPromise = resolveConnectionConfig(this.global);
    }

    return this.connectionPromise;
  }

  private async getClient(): Promise<GhostClient> {
    if (!this.clientPromise) {
      this.clientPromise = this.getConnection().then(
        (connection) =>
          new GhostClient({
            url: connection.url,
            staffToken: connection.staffToken,
            version: connection.apiVersion,
          }),
      );
    }

    return this.clientPromise;
  }

  private async getBootstrap(): Promise<StatsBootstrap> {
    if (!this.bootstrapPromise) {
      this.bootstrapPromise = this.getClient().then(async (client) => {
        const [configResponse, settingsResponse, siteResponse] = await Promise.all([
          client.rawRequest<Record<string, unknown>>('/config/'),
          client.rawRequest<Record<string, unknown>>('/settings/'),
          client.rawRequest<Record<string, unknown>>('/site/'),
        ]);

        return {
          config: getObject(configResponse, 'config'),
          settings: getArray(settingsResponse, 'settings'),
          site: getObject(siteResponse, 'site'),
        };
      });
    }

    return this.bootstrapPromise;
  }

  private async getTimeZone(requested?: string): Promise<string> {
    if (requested) {
      return requested;
    }

    const bootstrap = await this.getBootstrap();
    const siteTz =
      getString(settingValue(bootstrap.settings, 'timezone')) ??
      getString(settingValue(bootstrap.settings, 'active_timezone'));
    if (siteTz) {
      return siteTz;
    }

    const systemTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return systemTz || 'UTC';
  }

  private async resolveLifetimeRange(requested?: string): Promise<StatsRange> {
    const timezone = await this.getTimeZone(requested);
    const today = formatDateInTimeZone(new Date(), timezone);

    return {
      preset: 'all',
      from: null,
      to: today,
      timezone,
    };
  }

  async resolveRange(
    input: Pick<StatsOverviewInput, 'range' | 'from' | 'to' | 'timezone'>,
  ): Promise<StatsRange> {
    const timezone = await this.getTimeZone(input.timezone);
    const preset = input.range ?? '30d';
    const today = formatDateInTimeZone(new Date(), timezone);
    const to = input.to ?? today;
    const explicitRange = input.from !== undefined || input.to !== undefined;

    if (preset === 'all' && !input.from) {
      return {
        preset,
        from: null,
        to,
        timezone,
      };
    }

    const days = getRangePresetDays(preset) ?? 30;
    const from =
      input.from ?? (explicitRange ? subtractDays(to, days - 1) : subtractDays(today, days - 1));

    return {
      preset,
      from,
      to,
      timezone,
    };
  }

  private async getStatsConfig(): Promise<StatsConfigRecord> {
    const bootstrap = await this.getBootstrap();
    const stats = bootstrap.config.stats;
    if (!stats || typeof stats !== 'object' || Array.isArray(stats)) {
      throw makeAnalyticsUnavailableError();
    }

    return stats as StatsConfigRecord;
  }

  private async getTinybirdToken(): Promise<string> {
    if (!this.tokenPromise) {
      this.tokenPromise = this.getClient().then(async (client) => {
        const payload = await client.rawRequest<Record<string, unknown>>('/tinybird/token/');
        const token = getString(getObject(payload, 'tinybird').token);
        if (!token) {
          throw new GhstError('Tinybird token was not returned by Ghost.', {
            code: 'ANALYTICS_UNAVAILABLE',
            exitCode: ExitCode.GENERAL_ERROR,
          });
        }
        return token;
      });
    }

    return this.tokenPromise;
  }

  private async tinybirdQuery(pipeName: string, params: TinybirdParams): Promise<TinybirdRow[]> {
    const statsConfig = await this.getStatsConfig();
    const token = await this.getTinybirdToken();
    const baseUrl = statsConfig.local?.enabled
      ? getString(statsConfig.local.endpoint)
      : getString(statsConfig.endpointBrowser ?? statsConfig.endpoint);

    const siteUuid = getString(statsConfig.id);
    if (!baseUrl || !siteUuid) {
      throw makeAnalyticsUnavailableError();
    }

    const version = getString(statsConfig.version);
    const finalPipe = version ? `${pipeName}_${version}` : pipeName;
    const url = new URL(`/v0/pipes/${finalPipe}.json`, baseUrl);
    url.searchParams.set('site_uuid', siteUuid);

    for (const [key, value] of Object.entries(params)) {
      if (value === undefined || value === null || value === '') {
        continue;
      }

      url.searchParams.set(key, String(value));
    }

    const response = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      throw new GhstError(`Analytics request failed (${response.status})`, {
        code: 'ANALYTICS_REQUEST_FAILED',
        exitCode: mapHttpStatusToExitCode(response.status),
        status: response.status,
      });
    }

    const payload = (await response.json()) as Record<string, unknown>;
    return Array.isArray(payload.data) ? (payload.data as TinybirdRow[]) : [];
  }

  private buildRangeParams(range: StatsRange): TinybirdParams {
    return {
      date_from: range.from ?? (range.preset === 'all' ? ALL_RANGE_DATE_FROM : undefined),
      date_to: range.to,
      timezone: range.timezone,
    };
  }

  private buildFilterParams(
    filters: StatsFilters,
    extra: Record<string, TinybirdPrimitive> = {},
  ): TinybirdParams {
    return {
      member_status: filters.audience === 'all' ? undefined : filters.audience,
      source: filters.source ?? undefined,
      location: filters.location ?? undefined,
      device: filters.device ?? undefined,
      utm_source: filters.utm_source ?? undefined,
      utm_medium: filters.utm_medium ?? undefined,
      utm_campaign: filters.utm_campaign ?? undefined,
      utm_content: filters.utm_content ?? undefined,
      utm_term: filters.utm_term ?? undefined,
      ...extra,
    };
  }

  private async listNewsletters(): Promise<Record<string, unknown>[]> {
    const client = await this.getClient();
    const payload = (await collectAllPages('newsletters', (page) =>
      client.newsletters.browse({
        limit: 100,
        page,
      }),
    )) as GhostPaginatedResponse;
    return Array.isArray(payload.newsletters)
      ? (payload.newsletters as Record<string, unknown>[])
      : [];
  }

  async getPostMeta(id: string): Promise<StatsPostMeta> {
    const cached = this.postCache.get(id);
    if (cached) {
      return cached;
    }

    const client = await this.getClient();
    const payload = await client.posts.read(id);
    const posts = Array.isArray(payload.posts) ? (payload.posts as Record<string, unknown>[]) : [];
    const post = posts[0];

    if (!post) {
      throw new GhstError('Post not found', {
        code: 'NOT_FOUND',
        exitCode: ExitCode.NOT_FOUND,
      });
    }

    const meta = {
      id,
      uuid: getString(post.uuid),
      title: getString(post.title) ?? '(untitled)',
      slug: getString(post.slug),
      url: getString(post.url),
      published_at: getString(post.published_at),
    };

    this.postCache.set(id, meta);
    return meta;
  }

  async getWebReport(input: StatsWebInput): Promise<StatsWebReport> {
    const range = await this.resolveRange(input);
    const filters = resolveFilters(input);
    const limit = input.limit ?? 5;
    const client = await this.getClient();

    const [kpisRows, activeRows, topContentPayload, sourceRows, locationRows] = await Promise.all([
      this.tinybirdQuery('api_kpis', {
        ...this.buildRangeParams(range),
        ...this.buildFilterParams(filters),
      }),
      this.tinybirdQuery('api_active_visitors', {
        ...this.buildRangeParams(range),
        ...this.buildFilterParams(filters),
      }),
      client.rawRequest<Record<string, unknown>>('/stats/top-content/', 'GET', undefined, {
        ...this.buildRangeParams(range),
        ...this.buildFilterParams(filters),
        limit,
      }),
      this.tinybirdQuery('api_top_sources', {
        ...this.buildRangeParams(range),
        ...this.buildFilterParams(filters),
        limit,
      }),
      this.tinybirdQuery('api_top_locations', {
        ...this.buildRangeParams(range),
        ...this.buildFilterParams(filters),
        limit,
      }),
    ]);

    return {
      range,
      filters,
      kpis: normalizeKpis(kpisRows, activeRows[0]),
      timeseries: normalizeTrafficSeries(kpisRows),
      content: getArray(topContentPayload).map(normalizeContentRow),
      sources: normalizeTopSources(sourceRows),
      locations: normalizeLocations(locationRows),
    };
  }

  async getWebTable(metric: string, input: StatsWebTableInput): Promise<StatsWebTableReport> {
    const range = await this.resolveRange(input);
    const filters = resolveFilters(input);
    const client = await this.getClient();
    const limit = input.limit ?? 10;

    if (metric === 'content') {
      const payload = await client.rawRequest<Record<string, unknown>>(
        '/stats/top-content/',
        'GET',
        undefined,
        {
          ...this.buildRangeParams(range),
          ...this.buildFilterParams(filters),
          limit,
        },
      );

      return {
        range,
        filters,
        metric,
        items: getArray(payload).map(normalizeContentRow),
      };
    }

    const pipeByMetric: Record<
      string,
      { pipe: string; normalizer: (rows: TinybirdRow[]) => StatsBreakdownRow[] }
    > = {
      sources: { pipe: 'api_top_sources', normalizer: normalizeTopSources },
      locations: { pipe: 'api_top_locations', normalizer: normalizeLocations },
      devices: { pipe: 'api_top_devices', normalizer: normalizeDevices },
      'utm-sources': {
        pipe: 'api_top_utm_sources',
        normalizer: (rows) => normalizeUtm(rows, 'utm_source'),
      },
      'utm-mediums': {
        pipe: 'api_top_utm_mediums',
        normalizer: (rows) => normalizeUtm(rows, 'utm_medium'),
      },
      'utm-campaigns': {
        pipe: 'api_top_utm_campaigns',
        normalizer: (rows) => normalizeUtm(rows, 'utm_campaign'),
      },
      'utm-contents': {
        pipe: 'api_top_utm_contents',
        normalizer: (rows) => normalizeUtm(rows, 'utm_content'),
      },
      'utm-terms': {
        pipe: 'api_top_utm_terms',
        normalizer: (rows) => normalizeUtm(rows, 'utm_term'),
      },
    };

    const selected = pipeByMetric[metric];
    if (!selected) {
      throw new GhstError(`Unsupported web metric: ${metric}`, {
        code: 'USAGE_ERROR',
        exitCode: ExitCode.USAGE_ERROR,
      });
    }

    const rows = await this.tinybirdQuery(selected.pipe, {
      ...this.buildRangeParams(range),
      ...this.buildFilterParams(filters),
      limit,
    });

    return {
      range,
      filters,
      metric,
      items: selected.normalizer(rows),
    };
  }

  async getGrowthReport(input: StatsGrowthInput): Promise<StatsGrowthReport> {
    const range = await this.resolveRange(input);
    const client = await this.getClient();
    const limit = input.limit ?? 5;

    const [membersPayload, mrrPayload, subscriptionsPayload, sourcesPayload] = await Promise.all([
      client.rawRequest<Record<string, unknown>>('/stats/member_count/', 'GET', undefined, {
        date_from: range.from ?? undefined,
      }),
      client.rawRequest<Record<string, unknown>>('/stats/mrr/', 'GET', undefined, {
        date_from: range.from ?? undefined,
      }),
      client.rawRequest<Record<string, unknown>>('/stats/subscriptions/'),
      client.rawRequest<Record<string, unknown>>('/stats/top-sources-growth/', 'GET', undefined, {
        ...this.buildRangeParams(range),
        limit,
      }),
    ]);

    const members = clipDatedRows(normalizeMembersSeries(getArray(membersPayload)), range);
    const mrr = clipDatedRows(normalizeMrrSeries(getArray(mrrPayload)), range);
    const rawSubscriptionRows = getArray(subscriptionsPayload);
    const subscriptionsHistory = clipDatedRows(
      normalizeSubscriptionsHistory(rawSubscriptionRows),
      range,
    );
    const subscriptionsMeta = getObject(subscriptionsPayload, 'meta');
    const fallbackTotals = Array.isArray(subscriptionsMeta.totals)
      ? (subscriptionsMeta.totals as Record<string, unknown>[]).map((row) => ({
          tier: getString(row.tier) ?? '',
          label: getString(row.label ?? row.name ?? row.tier) ?? '',
          count: getNumber(row.count),
        }))
      : [];
    const totals = normalizeSubscriptionTotals(rawSubscriptionRows, fallbackTotals, range);
    const latestMembers = lastValue(members);
    const latestMrr = lastValue(mrr);
    const latestSubscriptions = lastValue(subscriptionsHistory);

    return {
      range,
      summary: {
        free_members: latestMembers?.free_members ?? 0,
        paid_members: latestMembers?.paid_members ?? 0,
        total_members: latestMembers?.total_members ?? 0,
        member_delta: deltaOf(members.map((entry) => entry.total_members)),
        paid_delta: deltaOf(members.map((entry) => entry.paid_members)),
        mrr: latestMrr?.mrr ?? 0,
        mrr_delta: deltaOf(mrr.map((entry) => entry.mrr)),
        total_subscriptions: latestSubscriptions?.subscriptions ?? 0,
        subscription_delta: deltaOf(subscriptionsHistory.map((entry) => entry.subscriptions)),
        currency: getString(getArray(mrrPayload)[0]?.currency),
      },
      members,
      mrr,
      subscriptions: {
        history: subscriptionsHistory,
        totals,
      },
      sources: normalizeTopSources(getArray(sourcesPayload)),
    };
  }

  async getPostsReport(input: StatsPostsInput): Promise<StatsPostsReport> {
    const range = await this.resolveRange(input);
    const client = await this.getClient();
    const payload = await client.rawRequest<Record<string, unknown>>(
      '/stats/top-posts-views/',
      'GET',
      undefined,
      {
        ...this.buildRangeParams(range),
        limit: input.limit ?? 5,
      },
    );

    return {
      range,
      posts: normalizeTopPostsViews(getArray(payload)),
    };
  }

  async getNewslettersReport(input: StatsNewslettersInput): Promise<StatsNewslettersReport> {
    const range = await this.resolveRange(input);
    const client = await this.getClient();
    const allNewsletters = await this.listNewsletters();
    const selected = input.newsletterId
      ? allNewsletters.filter((newsletter) => String(newsletter.id ?? '') === input.newsletterId)
      : allNewsletters;

    if (input.newsletterId && selected.length === 0) {
      throw new GhstError('Newsletter not found', {
        code: 'NOT_FOUND',
        exitCode: ExitCode.NOT_FOUND,
      });
    }

    const rows = await Promise.all(
      selected.slice(0, input.limit ?? selected.length).map(async (newsletter) => {
        const newsletterId = String(newsletter.id ?? '');
        const [basicStatsPayload, subscriberPayload] = await Promise.all([
          client.rawRequest<Record<string, unknown>>(
            '/stats/newsletter-basic-stats/',
            'GET',
            undefined,
            {
              ...this.buildRangeParams(range),
              newsletter_id: newsletterId,
              limit: input.limit ?? 10,
            },
          ),
          client.rawRequest<Record<string, unknown>>('/stats/subscriber-count/', 'GET', undefined, {
            ...this.buildRangeParams(range),
            newsletter_id: newsletterId,
          }),
        ]);
        const basicStatsRows = getArray(basicStatsPayload);
        const postIds = basicStatsRows
          .map((row) => getString(row.post_id))
          .filter((value): value is string => Boolean(value));
        const clickPayload =
          postIds.length > 0
            ? await client.rawRequest<Record<string, unknown>>(
                '/stats/newsletter-click-stats/',
                'GET',
                undefined,
                {
                  newsletter_id: newsletterId,
                  post_ids: postIds.join(','),
                },
              )
            : { stats: [] };
        const mergedRows = mergeNewsletterClickStats(basicStatsRows, getArray(clickPayload));

        const subscriberHistory = getArray(subscriberPayload).map((row) => ({
          date: getString(row.date) ?? '',
          total: getNumber(row.total ?? row.subscribers),
          delta: getNumber(row.delta ?? row.change),
        }));

        return newsletterStatsSummary(newsletter, mergedRows, subscriberHistory);
      }),
    );

    return {
      range,
      newsletters: rows,
    };
  }

  private async getPostSummaryFallback(
    postId: string,
    range: StatsRange,
  ): Promise<StatsPostSummaryFallback | null> {
    const client = await this.getClient();
    const payload = await client.rawRequest<Record<string, unknown>>(
      '/stats/top-posts-views/',
      'GET',
      undefined,
      {
        ...this.buildRangeParams(range),
        limit: 100,
      },
    );
    const row =
      normalizeTopPostsViews(getArray(payload)).find((item) => item.post_id === postId) ?? null;
    return buildPostSummaryFallback(row);
  }

  async getNewsletterClicksReport(
    input: StatsNewsletterClicksInput,
  ): Promise<StatsNewsletterClicksReport> {
    const range = await this.resolveRange(input);
    const client = await this.getClient();
    const newsletters = await this.listNewsletters();
    const newsletter = newsletters.find((entry) => String(entry.id ?? '') === input.newsletterId);

    if (!newsletter) {
      throw new GhstError('Newsletter not found', {
        code: 'NOT_FOUND',
        exitCode: ExitCode.NOT_FOUND,
      });
    }

    const basicStatsPayload = await client.rawRequest<Record<string, unknown>>(
      '/stats/newsletter-basic-stats/',
      'GET',
      undefined,
      {
        ...this.buildRangeParams(range),
        newsletter_id: input.newsletterId,
        limit: input.limit ?? 10,
      },
    );
    const basicStatsRows = getArray(basicStatsPayload);
    const selectedRows =
      input.postIds && input.postIds.length > 0
        ? basicStatsRows.filter((row) => {
            const postId = getString(row.post_id);
            return postId ? input.postIds?.includes(postId) : false;
          })
        : basicStatsRows;
    const postIds = selectedRows
      .map((row) => getString(row.post_id))
      .filter((value): value is string => Boolean(value));
    const clickPayload =
      postIds.length > 0
        ? await client.rawRequest<Record<string, unknown>>(
            '/stats/newsletter-click-stats/',
            'GET',
            undefined,
            {
              newsletter_id: input.newsletterId,
              post_ids: postIds.join(','),
            },
          )
        : { stats: [] };
    const mergedRows = mergeNewsletterClickStats(selectedRows, getArray(clickPayload));

    return {
      range,
      newsletter: {
        id: input.newsletterId,
        name: getString(newsletter.name) ?? '(untitled)',
        slug: getString(newsletter.slug),
      },
      posts: input.postIds ?? [],
      clicks: normalizeNewsletterClicks(mergedRows),
    };
  }

  async getNewsletterSubscribersReport(
    input: StatsNewsletterSubscribersInput,
  ): Promise<StatsNewsletterSubscribersReport> {
    const range = await this.resolveRange(input);
    const client = await this.getClient();
    const newsletters = await this.listNewsletters();
    const selected = input.newsletterId
      ? newsletters.filter((newsletter) => String(newsletter.id ?? '') === input.newsletterId)
      : newsletters;

    if (input.newsletterId && selected.length === 0) {
      throw new GhstError('Newsletter not found', {
        code: 'NOT_FOUND',
        exitCode: ExitCode.NOT_FOUND,
      });
    }

    const rows = await Promise.all(
      selected.map(async (newsletter) => {
        const payload = await client.rawRequest<Record<string, unknown>>(
          '/stats/subscriber-count/',
          'GET',
          undefined,
          {
            ...this.buildRangeParams(range),
            newsletter_id: String(newsletter.id ?? ''),
          },
        );

        const history = getArray(payload).map((row) => ({
          date: getString(row.date) ?? '',
          total: getNumber(row.total ?? row.subscribers),
          delta: getNumber(row.delta ?? row.change),
        }));
        const latest = lastValue(history);

        return {
          newsletter_id: String(newsletter.id ?? ''),
          newsletter_name: getString(newsletter.name) ?? '(untitled)',
          newsletter_slug: getString(newsletter.slug),
          subscribers: latest?.total ?? 0,
          subscriber_delta: latest?.delta ?? 0,
          history,
        };
      }),
    );

    return {
      range,
      newsletters: rows,
    };
  }

  async getPostGrowthReport(input: StatsPostGrowthInput): Promise<StatsPostGrowthReport> {
    const range = hasExplicitWindowOverride(input)
      ? await this.resolveRange(input)
      : await this.resolveLifetimeRange(input.timezone);
    const client = await this.getClient();
    const post = await this.getPostMeta(input.id);
    const payload = await client.rawRequest<Record<string, unknown>>(
      `/stats/posts/${input.id}/growth`,
      'GET',
      undefined,
      this.buildRangeParams(range),
    );

    return {
      range,
      post,
      growth: clipDatedRows(normalizePostGrowth(getArray(payload)), range),
    };
  }

  async getPostReferrersReport(input: StatsPostReferrersInput): Promise<StatsPostReferrersReport> {
    const range = await this.resolveRange(input);
    const client = await this.getClient();
    const post = await this.getPostMeta(input.id);
    const payload = await client.rawRequest<Record<string, unknown>>(
      `/stats/posts/${input.id}/top-referrers`,
      'GET',
      undefined,
      {
        ...this.buildRangeParams(range),
        limit: input.limit ?? 10,
      },
    );

    return {
      range,
      post,
      referrers: normalizePostReferrers(getArray(payload)),
    };
  }

  async getPostNewsletterReport(
    input: StatsPostNewsletterInput,
  ): Promise<StatsPostNewsletterReport> {
    const range = hasExplicitWindowOverride(input)
      ? await this.resolveRange(input)
      : await this.resolveLifetimeRange(input.timezone);
    const client = await this.getClient();
    const post = await this.getPostMeta(input.id);
    if (
      hasExplicitWindowOverride(input) &&
      post.published_at &&
      !isDateWithinRange(post.published_at, range)
    ) {
      return {
        range,
        post,
        newsletter: {
          recipients: 0,
          open_rate: 0,
          click_rate: 0,
        },
      };
    }

    const payload = await client.rawRequest<Record<string, unknown>>(
      `/stats/posts/${input.id}/stats/`,
    );
    const summary = extractPostSummary(payload);
    const fallback =
      summary.email_recipients > 0 || summary.email_open_rate > 0 || summary.email_click_rate > 0
        ? null
        : await this.getPostSummaryFallback(input.id, range);

    return {
      range,
      post,
      newsletter: {
        recipients: fallback?.email_recipients ?? summary.email_recipients,
        open_rate: fallback?.email_open_rate ?? summary.email_open_rate,
        click_rate: fallback?.email_click_rate ?? summary.email_click_rate,
      },
    };
  }

  async getPostWebReport(input: StatsPostWebInput): Promise<StatsPostWebReport> {
    const range = await this.resolveRange(input);
    const filters = resolveFilters(input);
    const post = await this.getPostMeta(input.id);
    if (!post.uuid) {
      throw makeAnalyticsUnavailableError();
    }

    const limit = input.limit ?? 10;
    const [kpisRows, activeRows, sourceRows, locationRows] = await Promise.all([
      this.tinybirdQuery('api_kpis', {
        ...this.buildRangeParams(range),
        ...this.buildFilterParams(filters, { post_uuid: post.uuid }),
      }),
      this.tinybirdQuery('api_active_visitors', {
        ...this.buildRangeParams(range),
        ...this.buildFilterParams(filters, { post_uuid: post.uuid }),
      }),
      this.tinybirdQuery('api_top_sources', {
        ...this.buildRangeParams(range),
        ...this.buildFilterParams(filters, { post_uuid: post.uuid, limit }),
      }),
      this.tinybirdQuery('api_top_locations', {
        ...this.buildRangeParams(range),
        ...this.buildFilterParams(filters, { post_uuid: post.uuid, limit }),
      }),
    ]);

    return {
      range,
      filters,
      post,
      kpis: normalizeKpis(kpisRows, activeRows[0]),
      timeseries: normalizeTrafficSeries(kpisRows),
      sources: normalizeTopSources(sourceRows),
      locations: normalizeLocations(locationRows),
    };
  }

  async getPostReport(input: StatsPostInput): Promise<StatsPostReport> {
    const range = await this.resolveRange(input);
    const client = await this.getClient();
    const post = await this.getPostMeta(input.id);
    const [summaryPayload, growthReport, referrersReport, webReport, fallback] = await Promise.all([
      client.rawRequest<Record<string, unknown>>(`/stats/posts/${input.id}/stats/`),
      this.getPostGrowthReport(input),
      this.getPostReferrersReport({ ...input, limit: 5 }),
      this.getPostWebReport({ ...input, limit: 5 }).catch(() => null),
      this.getPostSummaryFallback(input.id, range),
    ]);
    const summary = extractPostSummary(summaryPayload);
    const postGrowthSummary = summarizePostGrowth(growthReport.growth);
    const emailSummary = buildPostEmailSummary(summary, range, post);

    return {
      range,
      post,
      summary: {
        visitors: webReport?.kpis.visits ?? summary.visitors,
        pageviews: webReport?.kpis.pageviews ?? summary.pageviews,
        free_members:
          postGrowthSummary.free_members > 0
            ? postGrowthSummary.free_members
            : (fallback?.free_members ?? 0),
        paid_members:
          postGrowthSummary.paid_members > 0
            ? postGrowthSummary.paid_members
            : (fallback?.paid_members ?? 0),
        mrr: postGrowthSummary.mrr,
        email_recipients:
          emailSummary.email_recipients > 0
            ? emailSummary.email_recipients
            : (fallback?.email_recipients ?? 0),
        email_open_rate:
          emailSummary.email_open_rate > 0
            ? emailSummary.email_open_rate
            : (fallback?.email_open_rate ?? 0),
        email_click_rate:
          emailSummary.email_click_rate > 0
            ? emailSummary.email_click_rate
            : (fallback?.email_click_rate ?? 0),
      },
      web: webReport,
      growth: growthReport.growth,
      referrers: referrersReport.referrers,
    };
  }
}

export async function getStatsOverview(
  global: GlobalOptions,
  input: StatsOverviewInput,
): Promise<StatsOverviewReport> {
  const client = new StatsClient(global);
  const [web, growth, newsletters] = await Promise.all([
    client.getWebReport({ ...input, limit: 5 }),
    client.getGrowthReport({ ...input, limit: 5 }),
    client.getNewslettersReport({ ...input, limit: 5 }),
  ]);

  return {
    range: web.range,
    summary: {
      visitors: web.kpis.visits,
      pageviews: web.kpis.pageviews,
      bounce_rate: web.kpis.bounce_rate,
      avg_session_sec: web.kpis.avg_session_sec,
      active_visitors: web.kpis.active_visitors,
      total_members: growth.summary.total_members,
      member_delta: growth.summary.member_delta,
      paid_members: growth.summary.paid_members,
      paid_delta: growth.summary.paid_delta,
      mrr: growth.summary.mrr,
      mrr_delta: growth.summary.mrr_delta,
    },
    web,
    growth,
    newsletters,
  };
}

export async function getStatsWeb(
  global: GlobalOptions,
  input: StatsWebInput,
): Promise<StatsWebReport> {
  return new StatsClient(global).getWebReport(input);
}

export async function getStatsWebTable(
  global: GlobalOptions,
  metric: string,
  input: StatsWebTableInput,
): Promise<StatsWebTableReport> {
  return new StatsClient(global).getWebTable(metric, input);
}

export async function getStatsGrowth(
  global: GlobalOptions,
  input: StatsGrowthInput,
): Promise<StatsGrowthReport> {
  return new StatsClient(global).getGrowthReport(input);
}

export async function getStatsPosts(
  global: GlobalOptions,
  input: StatsPostsInput,
): Promise<StatsPostsReport> {
  return new StatsClient(global).getPostsReport(input);
}

export async function getStatsNewsletters(
  global: GlobalOptions,
  input: StatsNewslettersInput,
): Promise<StatsNewslettersReport> {
  return new StatsClient(global).getNewslettersReport(input);
}

export async function getStatsNewsletterClicks(
  global: GlobalOptions,
  input: StatsNewsletterClicksInput,
): Promise<StatsNewsletterClicksReport> {
  return new StatsClient(global).getNewsletterClicksReport(input);
}

export async function getStatsNewsletterSubscribers(
  global: GlobalOptions,
  input: StatsNewsletterSubscribersInput,
): Promise<StatsNewsletterSubscribersReport> {
  return new StatsClient(global).getNewsletterSubscribersReport(input);
}

export async function getStatsPost(
  global: GlobalOptions,
  input: StatsPostInput,
): Promise<StatsPostReport> {
  return new StatsClient(global).getPostReport(input);
}

export async function getStatsPostGrowth(
  global: GlobalOptions,
  input: StatsPostGrowthInput,
): Promise<StatsPostGrowthReport> {
  return new StatsClient(global).getPostGrowthReport(input);
}

export async function getStatsPostNewsletter(
  global: GlobalOptions,
  input: StatsPostNewsletterInput,
): Promise<StatsPostNewsletterReport> {
  return new StatsClient(global).getPostNewsletterReport(input);
}

export async function getStatsPostReferrers(
  global: GlobalOptions,
  input: StatsPostReferrersInput,
): Promise<StatsPostReferrersReport> {
  return new StatsClient(global).getPostReferrersReport(input);
}

export async function getStatsPostWeb(
  global: GlobalOptions,
  input: StatsPostWebInput,
): Promise<StatsPostWebReport> {
  return new StatsClient(global).getPostWebReport(input);
}
