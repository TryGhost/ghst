import type { Command } from 'commander';
import { getGlobalOptions } from '../lib/context.js';
import { ExitCode, GhstError } from '../lib/errors.js';
import {
  bulkNewsletters,
  createNewsletter,
  getNewsletter,
  listNewsletters,
  updateNewsletter,
} from '../lib/newsletters.js';
import {
  printJson,
  printNewsletterHuman,
  printNewsletterListHuman,
  printOperationStatsHuman,
} from '../lib/output.js';
import { parseBooleanFlag, parseInteger } from '../lib/parse.js';
import {
  NewsletterBulkInputSchema,
  NewsletterCreateInputSchema,
  NewsletterGetInputSchema,
  NewsletterListInputSchema,
  NewsletterUpdateInputSchema,
} from '../schemas/newsletter.js';

function throwValidationError(error: unknown): never {
  throw new GhstError(
    (error as { issues?: Array<{ message: string }> }).issues?.map((i) => i.message).join('; ') ??
      'Validation failed',
    {
      exitCode: ExitCode.VALIDATION_ERROR,
      code: 'VALIDATION_ERROR',
      details: error,
    },
  );
}

function parseNullableEmail(value: string | undefined): string | null | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (value.trim().toLowerCase() === 'null') {
    return null;
  }

  return value;
}

export function registerNewsletterCommands(program: Command): void {
  const newsletter = program.command('newsletter').description('Newsletter management');

  newsletter
    .command('list')
    .description('List newsletters')
    .option('--limit <numberOrAll>', 'Number of newsletters per page or "all"')
    .option('--page <number>', 'Page number')
    .option('--filter <nql>', 'NQL filter')
    .option('--include <relations>', 'Include relationships')
    .option('--fields <fields>', 'Select output fields')
    .option('--order <order>', 'Sort order')
    .action(async (options, command) => {
      const global = getGlobalOptions(command);
      const rawLimit = options.limit === 'all' ? 'all' : parseInteger(options.limit, 'limit');
      const rawPage = parseInteger(options.page, 'page');

      const parsed = NewsletterListInputSchema.safeParse({
        limit: rawLimit,
        page: rawPage,
        filter: options.filter,
        include: options.include,
        fields: options.fields,
        order: options.order,
      });

      if (!parsed.success) {
        throwValidationError(parsed.error);
      }

      const allPages = parsed.data.limit === 'all';
      const payload = await listNewsletters(
        global,
        {
          ...parsed.data,
          limit: parsed.data.limit === 'all' ? undefined : parsed.data.limit,
        },
        allPages,
      );

      if (global.json) {
        printJson(payload, global.jq);
        return;
      }

      printNewsletterListHuman(payload, global.color !== false);
    });

  newsletter
    .command('get <id>')
    .description('Get a newsletter by id')
    .option('--include <relations>', 'Include relationships')
    .option('--fields <fields>', 'Select output fields')
    .action(async (id: string, options, command) => {
      const global = getGlobalOptions(command);
      const parsed = NewsletterGetInputSchema.safeParse({
        id,
        include: options.include,
        fields: options.fields,
      });

      if (!parsed.success) {
        throwValidationError(parsed.error);
      }

      const payload = await getNewsletter(global, parsed.data.id, {
        include: parsed.data.include,
        fields: parsed.data.fields,
      });

      if (global.json) {
        printJson(payload, global.jq);
        return;
      }

      printNewsletterHuman(payload);
    });

  newsletter
    .command('create')
    .description('Create a newsletter')
    .requiredOption('--name <name>', 'Newsletter name')
    .option('--description <description>', 'Newsletter description')
    .option('--sender-name <name>', 'Sender name')
    .option('--sender-email <emailOrNull>', 'Sender email or null')
    .option('--sender-reply-to <value>', 'Sender reply-to setting')
    .option('--status <status>', 'active|archived')
    .option('--visibility <visibility>', 'all|members|paid')
    .option('--subscribe-on-signup <value>', 'true|false')
    .option('--opt-in-existing', 'Subscribe existing members to this newsletter')
    .action(async (options, command) => {
      const global = getGlobalOptions(command);

      const parsed = NewsletterCreateInputSchema.safeParse({
        name: options.name,
        description: options.description,
        senderName: options.senderName,
        senderEmail: parseNullableEmail(options.senderEmail),
        senderReplyTo: options.senderReplyTo,
        status: options.status,
        visibility: options.visibility,
        subscribeOnSignup: parseBooleanFlag(options.subscribeOnSignup),
        optInExisting: parseBooleanFlag(options.optInExisting),
      });

      if (!parsed.success) {
        throwValidationError(parsed.error);
      }

      const payload = await createNewsletter(
        global,
        {
          name: parsed.data.name,
          description: parsed.data.description,
          sender_name: parsed.data.senderName,
          sender_email: parsed.data.senderEmail,
          sender_reply_to: parsed.data.senderReplyTo,
          status: parsed.data.status,
          visibility: parsed.data.visibility,
          subscribe_on_signup: parsed.data.subscribeOnSignup,
        },
        {
          opt_in_existing: parsed.data.optInExisting,
        },
      );

      if (global.json) {
        printJson(payload, global.jq);
        return;
      }

      printNewsletterHuman(payload);
    });

  newsletter
    .command('update <id>')
    .description('Update a newsletter')
    .option('--name <name>', 'Newsletter name')
    .option('--description <description>', 'Newsletter description')
    .option('--sender-name <name>', 'Sender name')
    .option('--sender-email <emailOrNull>', 'Sender email or null')
    .option('--sender-reply-to <value>', 'Sender reply-to setting')
    .option('--status <status>', 'active|archived')
    .option('--visibility <visibility>', 'all|members|paid')
    .option('--subscribe-on-signup <value>', 'true|false')
    .action(async (id: string, options, command) => {
      const global = getGlobalOptions(command);

      const parsed = NewsletterUpdateInputSchema.safeParse({
        id,
        name: options.name,
        description: options.description,
        senderName: options.senderName,
        senderEmail: parseNullableEmail(options.senderEmail),
        senderReplyTo: options.senderReplyTo,
        status: options.status,
        visibility: options.visibility,
        subscribeOnSignup: parseBooleanFlag(options.subscribeOnSignup),
      });

      if (!parsed.success) {
        throwValidationError(parsed.error);
      }

      const payload = await updateNewsletter(global, parsed.data.id, {
        name: parsed.data.name,
        description: parsed.data.description,
        sender_name: parsed.data.senderName,
        sender_email: parsed.data.senderEmail,
        sender_reply_to: parsed.data.senderReplyTo,
        status: parsed.data.status,
        visibility: parsed.data.visibility,
        subscribe_on_signup: parsed.data.subscribeOnSignup,
      });

      if (global.json) {
        printJson(payload, global.jq);
        return;
      }

      printNewsletterHuman(payload);
    });

  newsletter
    .command('bulk')
    .description('Run bulk newsletter operations')
    .requiredOption('--filter <nql>', 'NQL filter to select newsletters')
    .requiredOption('--action <action>', 'update')
    .option('--status <status>', 'active|archived')
    .option('--visibility <visibility>', 'all|members|paid')
    .action(async (options, command) => {
      const global = getGlobalOptions(command);
      const parsed = NewsletterBulkInputSchema.safeParse({
        filter: options.filter,
        action: options.action,
        status: options.status,
        visibility: options.visibility,
      });

      if (!parsed.success) {
        throwValidationError(parsed.error);
      }

      const payload = await bulkNewsletters(global, {
        filter: parsed.data.filter,
        patch: {
          status: parsed.data.status,
          visibility: parsed.data.visibility,
        },
      });

      if (global.json) {
        printJson(payload, global.jq);
        return;
      }

      printOperationStatsHuman(payload, 'Bulk newsletter operation completed');
    });
}
