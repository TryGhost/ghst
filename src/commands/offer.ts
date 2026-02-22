import type { Command } from 'commander';
import { getGlobalOptions } from '../lib/context.js';
import { ExitCode, GhstError } from '../lib/errors.js';
import { bulkOffers, createOffer, getOffer, listOffers, updateOffer } from '../lib/offers.js';
import {
  printJson,
  printOfferHuman,
  printOfferListHuman,
  printOperationStatsHuman,
} from '../lib/output.js';
import { parseInteger } from '../lib/parse.js';
import {
  OfferBulkInputSchema,
  OfferCreateInputSchema,
  OfferGetInputSchema,
  OfferListInputSchema,
  OfferUpdateInputSchema,
} from '../schemas/offer.js';

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

export function registerOfferCommands(program: Command): void {
  const offer = program.command('offer').description('Offer management');

  offer
    .command('list')
    .description('List offers')
    .option('--limit <numberOrAll>', 'Number of offers per page or "all"')
    .option('--page <number>', 'Page number')
    .option('--filter <nql>', 'NQL filter')
    .action(async (options, command) => {
      const global = getGlobalOptions(command);
      const rawLimit = options.limit === 'all' ? 'all' : parseInteger(options.limit, 'limit');
      const rawPage = parseInteger(options.page, 'page');

      const parsed = OfferListInputSchema.safeParse({
        limit: rawLimit,
        page: rawPage,
        filter: options.filter,
      });

      if (!parsed.success) {
        throwValidationError(parsed.error);
      }

      const allPages = parsed.data.limit === 'all';
      const payload = await listOffers(
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

      printOfferListHuman(payload, global.color !== false);
    });

  offer
    .command('get <id>')
    .description('Get an offer by id')
    .action(async (id: string, _, command) => {
      const global = getGlobalOptions(command);
      const parsed = OfferGetInputSchema.safeParse({ id });

      if (!parsed.success) {
        throwValidationError(parsed.error);
      }

      const payload = await getOffer(global, parsed.data.id);

      if (global.json) {
        printJson(payload, global.jq);
        return;
      }

      printOfferHuman(payload);
    });

  offer
    .command('create')
    .description('Create an offer')
    .requiredOption('--name <name>', 'Offer name')
    .requiredOption('--code <code>', 'Offer code')
    .option('--display-title <title>', 'Display title')
    .option('--display-description <description>', 'Display description')
    .option('--type <type>', 'percent|fixed|trial|free_months')
    .option('--cadence <cadence>', 'month|year')
    .option('--amount <amount>', 'Numeric amount')
    .option('--duration <duration>', 'once|forever|trial|free_months')
    .option('--duration-in-months <months>', 'Duration in months')
    .option('--currency <codeOrNull>', '3-letter currency code or null')
    .option('--status <status>', 'active|archived')
    .option('--redemption-type <type>', 'signup|retention')
    .option('--tier-id <id>', 'Tier id')
    .action(async (options, command) => {
      const global = getGlobalOptions(command);

      const parsed = OfferCreateInputSchema.safeParse({
        name: options.name,
        code: options.code,
        displayTitle: options.displayTitle,
        displayDescription: options.displayDescription,
        type: options.type,
        cadence: options.cadence,
        amount: parseInteger(options.amount, 'amount'),
        duration: options.duration,
        durationInMonths: parseInteger(options.durationInMonths, 'duration-in-months'),
        currency: options.currency?.trim().toLowerCase() === 'null' ? null : options.currency,
        status: options.status,
        redemptionType: options.redemptionType,
        tierId: options.tierId,
      });

      if (!parsed.success) {
        throwValidationError(parsed.error);
      }

      const payload = await createOffer(global, {
        name: parsed.data.name,
        code: parsed.data.code,
        display_title: parsed.data.displayTitle,
        display_description: parsed.data.displayDescription,
        type: parsed.data.type,
        cadence: parsed.data.cadence,
        amount: parsed.data.amount,
        duration: parsed.data.duration,
        duration_in_months: parsed.data.durationInMonths,
        currency: parsed.data.currency ? parsed.data.currency.toUpperCase() : parsed.data.currency,
        status: parsed.data.status,
        redemption_type: parsed.data.redemptionType,
        tier: parsed.data.tierId ? { id: parsed.data.tierId } : undefined,
      });

      if (global.json) {
        printJson(payload, global.jq);
        return;
      }

      printOfferHuman(payload);
    });

  offer
    .command('update <id>')
    .description('Update an offer')
    .option('--name <name>', 'Offer name')
    .option('--code <code>', 'Offer code')
    .option('--display-title <title>', 'Display title')
    .option('--display-description <description>', 'Display description')
    .option('--type <type>', 'percent|fixed|trial|free_months')
    .option('--cadence <cadence>', 'month|year')
    .option('--amount <amount>', 'Numeric amount')
    .option('--duration <duration>', 'once|forever|trial|free_months')
    .option('--duration-in-months <months>', 'Duration in months')
    .option('--currency <codeOrNull>', '3-letter currency code or null')
    .option('--status <status>', 'active|archived')
    .option('--redemption-type <type>', 'signup|retention')
    .option('--tier-id <id>', 'Tier id')
    .action(async (id: string, options, command) => {
      const global = getGlobalOptions(command);

      const parsed = OfferUpdateInputSchema.safeParse({
        id,
        name: options.name,
        code: options.code,
        displayTitle: options.displayTitle,
        displayDescription: options.displayDescription,
        type: options.type,
        cadence: options.cadence,
        amount: parseInteger(options.amount, 'amount'),
        duration: options.duration,
        durationInMonths: parseInteger(options.durationInMonths, 'duration-in-months'),
        currency: options.currency?.trim().toLowerCase() === 'null' ? null : options.currency,
        status: options.status,
        redemptionType: options.redemptionType,
        tierId: options.tierId,
      });

      if (!parsed.success) {
        throwValidationError(parsed.error);
      }

      const payload = await updateOffer(global, parsed.data.id, {
        name: parsed.data.name,
        code: parsed.data.code,
        display_title: parsed.data.displayTitle,
        display_description: parsed.data.displayDescription,
        type: parsed.data.type,
        cadence: parsed.data.cadence,
        amount: parsed.data.amount,
        duration: parsed.data.duration,
        duration_in_months: parsed.data.durationInMonths,
        currency: parsed.data.currency ? parsed.data.currency.toUpperCase() : parsed.data.currency,
        status: parsed.data.status,
        redemption_type: parsed.data.redemptionType,
        tier: parsed.data.tierId ? { id: parsed.data.tierId } : undefined,
      });

      if (global.json) {
        printJson(payload, global.jq);
        return;
      }

      printOfferHuman(payload);
    });

  offer
    .command('bulk')
    .description('Run bulk offer operations')
    .requiredOption('--filter <nql>', 'NQL filter to select offers')
    .requiredOption('--action <action>', 'update')
    .option('--status <status>', 'active|archived')
    .action(async (options, command) => {
      const global = getGlobalOptions(command);
      const parsed = OfferBulkInputSchema.safeParse({
        filter: options.filter,
        action: options.action,
        status: options.status,
      });

      if (!parsed.success) {
        throwValidationError(parsed.error);
      }

      const payload = await bulkOffers(global, {
        filter: parsed.data.filter,
        patch: {
          status: parsed.data.status,
        },
      });

      if (global.json) {
        printJson(payload, global.jq);
        return;
      }

      printOperationStatsHuman(payload, 'Bulk offer operation completed');
    });
}
