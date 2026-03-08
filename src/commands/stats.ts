import fs from 'node:fs/promises';
import type { Command } from 'commander';
import { getGlobalOptions } from '../lib/context.js';
import { ExitCode, GhstError } from '../lib/errors.js';
import {
  formatCsv,
  isJsonMode,
  printJson,
  printStatsGrowthHuman,
  printStatsNewsletterClicksHuman,
  printStatsNewsletterSubscribersHuman,
  printStatsNewslettersHuman,
  printStatsOverviewHuman,
  printStatsPostGrowthHuman,
  printStatsPostHuman,
  printStatsPostNewsletterHuman,
  printStatsPostReferrersHuman,
  printStatsPostsHuman,
  printStatsPostWebHuman,
  printStatsWebHuman,
  printStatsWebTableHuman,
} from '../lib/output.js';
import { parseInteger } from '../lib/parse.js';
import {
  getStatsGrowth,
  getStatsNewsletterClicks,
  getStatsNewsletterSubscribers,
  getStatsNewsletters,
  getStatsOverview,
  getStatsPost,
  getStatsPostGrowth,
  getStatsPostNewsletter,
  getStatsPostReferrers,
  getStatsPosts,
  getStatsPostWeb,
  getStatsWeb,
  getStatsWebTable,
  type StatsBreakdownRow,
  type StatsContentRow,
  type StatsNewsletterClicksReport,
  type StatsNewsletterSubscribersReport,
  type StatsNewslettersReport,
  type StatsPostGrowthReport,
  type StatsPostReferrersReport,
  type StatsPostsReport,
  type StatsWebTableReport,
} from '../lib/stats.js';
import {
  StatsGrowthInputSchema,
  StatsNewsletterClicksInputSchema,
  StatsNewsletterSubscribersInputSchema,
  StatsNewslettersInputSchema,
  StatsOverviewInputSchema,
  StatsPostGrowthInputSchema,
  StatsPostInputSchema,
  StatsPostNewsletterInputSchema,
  StatsPostReferrersInputSchema,
  StatsPostsInputSchema,
  StatsPostWebInputSchema,
  StatsWebInputSchema,
  StatsWebTableInputSchema,
} from '../schemas/stats.js';

function throwValidationError(error: unknown): never {
  throw new GhstError(
    (error as { issues?: Array<{ message: string }> }).issues
      ?.map((issue) => issue.message)
      .join('; ') ?? 'Validation failed',
    {
      exitCode: ExitCode.VALIDATION_ERROR,
      code: 'VALIDATION_ERROR',
      details: error,
    },
  );
}

function throwUsageError(message: string): never {
  throw new GhstError(message, {
    exitCode: ExitCode.USAGE_ERROR,
    code: 'USAGE_ERROR',
  });
}

function collectOption(value: string, previous: string[] = []): string[] {
  previous.push(value);
  return previous;
}

function parseRangeOptions(options: Record<string, unknown>) {
  return {
    range: options.range as string | undefined,
    from: options.from as string | undefined,
    to: options.to as string | undefined,
    timezone: options.timezone as string | undefined,
  };
}

function parseWebOptions(options: Record<string, unknown>) {
  return {
    ...parseRangeOptions(options),
    audience: options.audience as string | undefined,
    source: options.source as string | undefined,
    location: options.location as string | undefined,
    device: options.device as string | undefined,
    utmSource: options.utmSource as string | undefined,
    utmMedium: options.utmMedium as string | undefined,
    utmCampaign: options.utmCampaign as string | undefined,
    utmContent: options.utmContent as string | undefined,
    utmTerm: options.utmTerm as string | undefined,
    limit: parseInteger(options.limit as string | undefined, 'limit'),
  };
}

function assertCsvMode(
  global: ReturnType<typeof getGlobalOptions>,
  options: { csv?: boolean; output?: string },
  allowed: boolean,
): void {
  const jsonMode = isJsonMode(global);

  if (!options.csv && options.output) {
    throw new GhstError('--output requires --csv.', {
      exitCode: ExitCode.VALIDATION_ERROR,
      code: 'VALIDATION_ERROR',
    });
  }

  if (!allowed && options.csv) {
    throw new GhstError('--csv is only available on table-first analytics views.', {
      exitCode: ExitCode.VALIDATION_ERROR,
      code: 'VALIDATION_ERROR',
    });
  }

  if (options.csv && jsonMode) {
    throw new GhstError('Cannot combine --csv with --json or --jq.', {
      exitCode: ExitCode.VALIDATION_ERROR,
      code: 'VALIDATION_ERROR',
    });
  }
}

function shouldPrintJson(global: ReturnType<typeof getGlobalOptions>): boolean {
  return isJsonMode(global);
}

function addRangeOptions(command: Command): Command {
  return command
    .option('--range <preset>', '7d|30d|90d|365d|all')
    .option('--from <YYYY-MM-DD>', 'Start date')
    .option('--to <YYYY-MM-DD>', 'End date')
    .option('--timezone <iana>', 'Timezone override');
}

function addWebFilterOptions(command: Command, includeLimit = true): Command {
  const next = command
    .option('--audience <audience>', 'all|free|paid')
    .option('--source <value>', 'Filter by traffic source')
    .option('--location <code>', 'Filter by country code')
    .option('--device <device>', 'desktop|mobile-ios|mobile-android|bot|unknown')
    .option('--utm-source <value>', 'Filter by UTM source')
    .option('--utm-medium <value>', 'Filter by UTM medium')
    .option('--utm-campaign <value>', 'Filter by UTM campaign')
    .option('--utm-content <value>', 'Filter by UTM content')
    .option('--utm-term <value>', 'Filter by UTM term')
    .addHelpText(
      'after',
      '\nFilter semantics: source and utm_* filters are session-scoped in Ghost analytics. Post and member-status filters are hit-scoped.',
    );

  if (includeLimit) {
    next.option('--limit <number>', 'Limit returned rows');
  }

  return next;
}

function webTableCsv(payload: StatsWebTableReport): string {
  if (payload.metric === 'content') {
    const rows = (payload.items as StatsContentRow[]).map((item) => [
      item.title,
      item.pathname,
      String(item.visits),
      String(item.pageviews),
    ]);
    return formatCsv(['title', 'pathname', 'visits', 'pageviews'], rows);
  }

  const rows = (payload.items as StatsBreakdownRow[]).map((item) => [
    item.label,
    String(item.visits),
    item.signups === null ? '' : String(item.signups),
    item.paid_conversions === null ? '' : String(item.paid_conversions),
    item.mrr === null ? '' : String(item.mrr),
  ]);
  return formatCsv(['label', 'visits', 'signups', 'paid_conversions', 'mrr'], rows);
}

function newslettersCsv(payload: StatsNewslettersReport): string {
  const rows = payload.newsletters.map((item) => [
    item.newsletter_id,
    item.newsletter_name,
    item.newsletter_slug ?? '',
    String(item.sent_posts),
    String(item.recipients),
    String(item.open_rate),
    String(item.click_rate),
    String(item.subscribers),
    String(item.subscriber_delta),
  ]);
  return formatCsv(
    [
      'newsletter_id',
      'newsletter_name',
      'newsletter_slug',
      'sent_posts',
      'recipients',
      'open_rate',
      'click_rate',
      'subscribers',
      'subscriber_delta',
    ],
    rows,
  );
}

function postsCsv(payload: StatsPostsReport): string {
  const rows = payload.posts.map((item) => [
    item.post_id,
    item.title,
    item.published_at ?? '',
    item.status ?? '',
    item.authors,
    String(item.views),
    item.sent_count === null ? '' : String(item.sent_count),
    item.opened_count === null ? '' : String(item.opened_count),
    item.open_rate === null ? '' : String(item.open_rate),
    String(item.clicked_count),
    item.click_rate === null ? '' : String(item.click_rate),
    String(item.members),
    String(item.free_members),
    String(item.paid_members),
  ]);
  return formatCsv(
    [
      'post_id',
      'title',
      'published_at',
      'status',
      'authors',
      'views',
      'sent_count',
      'opened_count',
      'open_rate',
      'clicked_count',
      'click_rate',
      'members',
      'free_members',
      'paid_members',
    ],
    rows,
  );
}

function newsletterClicksCsv(payload: StatsNewsletterClicksReport): string {
  const rows = payload.clicks.map((item) => [
    item.post_id ?? '',
    item.post_title,
    item.send_date ?? '',
    String(item.recipients),
    String(item.clicks),
    String(item.click_rate),
  ]);
  return formatCsv(
    ['post_id', 'post_title', 'send_date', 'recipients', 'clicks', 'click_rate'],
    rows,
  );
}

function newsletterSubscribersCsv(payload: StatsNewsletterSubscribersReport): string {
  const rows = payload.newsletters.map((item) => [
    item.newsletter_id,
    item.newsletter_name,
    item.newsletter_slug ?? '',
    String(item.subscribers),
    String(item.subscriber_delta),
  ]);
  return formatCsv(
    ['newsletter_id', 'newsletter_name', 'newsletter_slug', 'subscribers', 'subscriber_delta'],
    rows,
  );
}

function postGrowthCsv(payload: StatsPostGrowthReport): string {
  const rows = payload.growth.map((item) => [
    item.date,
    String(item.free_members),
    String(item.paid_members),
    String(item.mrr),
  ]);
  return formatCsv(['date', 'free_members', 'paid_members', 'mrr'], rows);
}

function postReferrersCsv(payload: StatsPostReferrersReport): string {
  const rows = payload.referrers.map((item) => [
    item.source,
    String(item.visits),
    String(item.signups),
    String(item.paid_conversions),
    String(item.mrr),
  ]);
  return formatCsv(['source', 'visits', 'signups', 'paid_conversions', 'mrr'], rows);
}

async function emitCsv(csv: string, output?: string): Promise<void> {
  if (output) {
    await fs.writeFile(output, `${csv}\n`, 'utf8');
    return;
  }

  process.stdout.write(csv);
  if (!csv.endsWith('\n')) {
    process.stdout.write('\n');
  }
}

export function registerStatsCommands(program: Command): void {
  const stats = program.command('stats').description('Analytics and reporting');

  addRangeOptions(stats.command('overview').description('Site analytics overview')).action(
    async (options, command) => {
      const global = getGlobalOptions(command);
      const parsed = StatsOverviewInputSchema.safeParse(
        parseRangeOptions(options as Record<string, unknown>),
      );

      if (!parsed.success) {
        throwValidationError(parsed.error);
      }

      const payload = await getStatsOverview(global, parsed.data);

      if (shouldPrintJson(global)) {
        printJson(payload, global.jq);
        return;
      }

      printStatsOverviewHuman(payload, global.color !== false);
    },
  );

  addWebFilterOptions(
    addRangeOptions(stats.command('web [view]').description('Web traffic analytics')),
  )
    .option('--csv', 'Output CSV for table views')
    .option('--output <path>', 'Write CSV output to a file')
    .action(async (view: string | undefined, options, command) => {
      const global = getGlobalOptions(command);
      const isTableView =
        view !== undefined &&
        [
          'content',
          'sources',
          'locations',
          'devices',
          'utm-sources',
          'utm-mediums',
          'utm-campaigns',
          'utm-contents',
          'utm-terms',
        ].includes(view);
      assertCsvMode(global, { csv: options.csv, output: options.output }, isTableView);

      if (!view) {
        const parsed = StatsWebInputSchema.safeParse(
          parseWebOptions(options as Record<string, unknown>),
        );
        if (!parsed.success) {
          throwValidationError(parsed.error);
        }

        const payload = await getStatsWeb(global, parsed.data);
        if (shouldPrintJson(global)) {
          printJson(payload, global.jq);
          return;
        }

        printStatsWebHuman(payload, global.color !== false);
        return;
      }

      if (!isTableView) {
        throwUsageError(`Unsupported web analytics view: ${view}`);
      }

      const parsed = StatsWebTableInputSchema.safeParse(
        parseWebOptions(options as Record<string, unknown>),
      );
      if (!parsed.success) {
        throwValidationError(parsed.error);
      }

      const payload = await getStatsWebTable(global, view, parsed.data);
      if (shouldPrintJson(global)) {
        printJson(payload, global.jq);
        return;
      }

      if (options.csv) {
        await emitCsv(webTableCsv(payload), options.output);
        return;
      }

      printStatsWebTableHuman(payload, global.color !== false);
    });

  addRangeOptions(stats.command('growth').description('Member and revenue growth'))
    .option('--limit <number>', 'Limit top source rows')
    .addHelpText(
      'after',
      '\nRange behavior: Ghost member_count and mrr only accept date_from, and subscriptions are returned as lifetime history. ghst clips those datasets client-side to the selected window.',
    )
    .action(async (options, command) => {
      const global = getGlobalOptions(command);
      const parsed = StatsGrowthInputSchema.safeParse({
        ...parseRangeOptions(options as Record<string, unknown>),
        limit: parseInteger(options.limit as string | undefined, 'limit'),
      });

      if (!parsed.success) {
        throwValidationError(parsed.error);
      }

      const payload = await getStatsGrowth(global, parsed.data);
      if (shouldPrintJson(global)) {
        printJson(payload, global.jq);
        return;
      }

      printStatsGrowthHuman(payload, global.color !== false);
    });

  addRangeOptions(stats.command('posts').description('Top posts by views'))
    .option('--limit <number>', 'Limit returned rows')
    .option('--csv', 'Output CSV')
    .option('--output <path>', 'Write CSV output to a file')
    .action(async (options, command) => {
      const global = getGlobalOptions(command);
      assertCsvMode(global, { csv: options.csv, output: options.output }, true);

      const parsed = StatsPostsInputSchema.safeParse({
        ...parseRangeOptions(options as Record<string, unknown>),
        limit: parseInteger(options.limit as string | undefined, 'limit') ?? 5,
      });

      if (!parsed.success) {
        throwValidationError(parsed.error);
      }

      const payload = await getStatsPosts(global, parsed.data);
      if (shouldPrintJson(global)) {
        printJson(payload, global.jq);
        return;
      }

      if (options.csv) {
        await emitCsv(postsCsv(payload), options.output);
        return;
      }

      printStatsPostsHuman(payload, global.color !== false);
    });

  const registerEmailAnalyticsCommand = (command: Command) => {
    addRangeOptions(command.description('Email analytics'))
      .option('--newsletter <id>', 'Scope to a newsletter')
      .option('--post <id>', 'Scope click stats to a post', collectOption, [])
      .option('--limit <number>', 'Limit returned rows')
      .option('--csv', 'Output CSV for table views')
      .option('--output <path>', 'Write CSV output to a file')
      .action(async (view: string | undefined, options, commandInstance) => {
        const global = getGlobalOptions(commandInstance);
        const isTableView = view === undefined || view === 'clicks' || view === 'subscribers';
        assertCsvMode(global, { csv: options.csv, output: options.output }, isTableView);

        if (!view) {
          const parsed = StatsNewslettersInputSchema.safeParse({
            ...parseRangeOptions(options as Record<string, unknown>),
            newsletterId: options.newsletter as string | undefined,
            limit: parseInteger(options.limit as string | undefined, 'limit') ?? 10,
          });

          if (!parsed.success) {
            throwValidationError(parsed.error);
          }

          const payload = await getStatsNewsletters(global, parsed.data);
          if (shouldPrintJson(global)) {
            printJson(payload, global.jq);
            return;
          }

          if (options.csv) {
            await emitCsv(newslettersCsv(payload), options.output);
            return;
          }

          printStatsNewslettersHuman(payload, global.color !== false);
          return;
        }

        if (view === 'clicks') {
          const parsed = StatsNewsletterClicksInputSchema.safeParse({
            ...parseRangeOptions(options as Record<string, unknown>),
            newsletterId: options.newsletter as string | undefined,
            postIds:
              Array.isArray(options.post) && (options.post as string[]).length > 0
                ? (options.post as string[])
                : undefined,
            limit: parseInteger(options.limit as string | undefined, 'limit') ?? 10,
          });

          if (!parsed.success) {
            throwValidationError(parsed.error);
          }

          const payload = await getStatsNewsletterClicks(global, parsed.data);
          if (shouldPrintJson(global)) {
            printJson(payload, global.jq);
            return;
          }

          if (options.csv) {
            await emitCsv(newsletterClicksCsv(payload), options.output);
            return;
          }

          printStatsNewsletterClicksHuman(payload, global.color !== false);
          return;
        }

        if (view === 'subscribers') {
          const parsed = StatsNewsletterSubscribersInputSchema.safeParse({
            ...parseRangeOptions(options as Record<string, unknown>),
            newsletterId: options.newsletter as string | undefined,
          });

          if (!parsed.success) {
            throwValidationError(parsed.error);
          }

          const payload = await getStatsNewsletterSubscribers(global, parsed.data);
          if (shouldPrintJson(global)) {
            printJson(payload, global.jq);
            return;
          }

          if (options.csv) {
            await emitCsv(newsletterSubscribersCsv(payload), options.output);
            return;
          }

          printStatsNewsletterSubscribersHuman(payload, global.color !== false);
          return;
        }

        throwUsageError(`Unsupported email analytics view: ${view}`);
      });
  };

  registerEmailAnalyticsCommand(stats.command('email [view]'));
  registerEmailAnalyticsCommand(
    stats.command('newsletters [view]').description('Email analytics (compatibility alias)'),
  );

  addWebFilterOptions(
    addRangeOptions(stats.command('post <id> [view]').description('Post analytics')),
  )
    .option('--csv', 'Output CSV for table views')
    .option('--output <path>', 'Write CSV output to a file')
    .addHelpText(
      'after',
      '\nRange behavior: `web` and `referrers` are date-scoped. Ghost post growth is returned as lifetime history and clipped client-side to the selected window. Post newsletter stats are scoped to the send date when a custom window is supplied.',
    )
    .action(async (id: string, view: string | undefined, options, command) => {
      const global = getGlobalOptions(command);
      const isTableView = view === 'growth' || view === 'referrers';
      assertCsvMode(global, { csv: options.csv, output: options.output }, isTableView);

      if (!view) {
        const parsed = StatsPostInputSchema.safeParse({
          ...parseRangeOptions(options as Record<string, unknown>),
          id,
        });

        if (!parsed.success) {
          throwValidationError(parsed.error);
        }

        const payload = await getStatsPost(global, parsed.data);
        if (shouldPrintJson(global)) {
          printJson(payload, global.jq);
          return;
        }

        printStatsPostHuman(payload, global.color !== false);
        return;
      }

      if (view === 'web') {
        const parsed = StatsPostWebInputSchema.safeParse({
          ...parseWebOptions(options as Record<string, unknown>),
          id,
        });

        if (!parsed.success) {
          throwValidationError(parsed.error);
        }

        const payload = await getStatsPostWeb(global, parsed.data);
        if (shouldPrintJson(global)) {
          printJson(payload, global.jq);
          return;
        }

        printStatsPostWebHuman(payload, global.color !== false);
        return;
      }

      if (view === 'growth') {
        const parsed = StatsPostGrowthInputSchema.safeParse({
          ...parseRangeOptions(options as Record<string, unknown>),
          id,
        });

        if (!parsed.success) {
          throwValidationError(parsed.error);
        }

        const payload = await getStatsPostGrowth(global, parsed.data);
        if (shouldPrintJson(global)) {
          printJson(payload, global.jq);
          return;
        }

        if (options.csv) {
          await emitCsv(postGrowthCsv(payload), options.output);
          return;
        }

        printStatsPostGrowthHuman(payload, global.color !== false);
        return;
      }

      if (view === 'newsletter') {
        const parsed = StatsPostNewsletterInputSchema.safeParse({
          ...parseRangeOptions(options as Record<string, unknown>),
          id,
        });

        if (!parsed.success) {
          throwValidationError(parsed.error);
        }

        const payload = await getStatsPostNewsletter(global, parsed.data);
        if (shouldPrintJson(global)) {
          printJson(payload, global.jq);
          return;
        }

        printStatsPostNewsletterHuman(payload);
        return;
      }

      if (view === 'referrers') {
        const parsed = StatsPostReferrersInputSchema.safeParse({
          ...parseRangeOptions(options as Record<string, unknown>),
          id,
          limit: parseInteger(options.limit as string | undefined, 'limit') ?? 10,
        });

        if (!parsed.success) {
          throwValidationError(parsed.error);
        }

        const payload = await getStatsPostReferrers(global, parsed.data);
        if (shouldPrintJson(global)) {
          printJson(payload, global.jq);
          return;
        }

        if (options.csv) {
          await emitCsv(postReferrersCsv(payload), options.output);
          return;
        }

        printStatsPostReferrersHuman(payload, global.color !== false);
        return;
      }

      throwUsageError(`Unsupported post analytics view: ${view}`);
    });
}
