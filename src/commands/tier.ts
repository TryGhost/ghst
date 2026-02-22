import type { Command } from 'commander';
import { getGlobalOptions } from '../lib/context.js';
import { ExitCode, GhstError } from '../lib/errors.js';
import {
  printJson,
  printOperationStatsHuman,
  printTierHuman,
  printTierListHuman,
} from '../lib/output.js';
import { parseBooleanFlag, parseCsv, parseInteger } from '../lib/parse.js';
import { bulkTiers, createTier, getTier, listTiers, updateTier } from '../lib/tiers.js';
import {
  TierBulkInputSchema,
  TierCreateInputSchema,
  TierGetInputSchema,
  TierListInputSchema,
  TierUpdateInputSchema,
} from '../schemas/tier.js';

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

function parseNullableInteger(value: string | undefined, label: string): number | null | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (value.trim().toLowerCase() === 'null') {
    return null;
  }

  return parseInteger(value, label);
}

export function registerTierCommands(program: Command): void {
  const tier = program.command('tier').description('Tier management');

  tier
    .command('list')
    .description('List tiers')
    .option('--limit <numberOrAll>', 'Number of tiers per page or "all"')
    .option('--page <number>', 'Page number')
    .option('--filter <nql>', 'NQL filter')
    .option('--include <relations>', 'Include relationships')
    .option('--fields <fields>', 'Select output fields')
    .option('--order <order>', 'Sort order')
    .action(async (options, command) => {
      const global = getGlobalOptions(command);
      const rawLimit = options.limit === 'all' ? 'all' : parseInteger(options.limit, 'limit');
      const rawPage = parseInteger(options.page, 'page');

      const parsed = TierListInputSchema.safeParse({
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
      const payload = await listTiers(
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

      printTierListHuman(payload, global.color !== false);
    });

  tier
    .command('get <id>')
    .description('Get a tier by id')
    .action(async (id: string, _, command) => {
      const global = getGlobalOptions(command);
      const parsed = TierGetInputSchema.safeParse({ id });

      if (!parsed.success) {
        throwValidationError(parsed.error);
      }

      const payload = await getTier(global, parsed.data.id);

      if (global.json) {
        printJson(payload, global.jq);
        return;
      }

      printTierHuman(payload);
    });

  tier
    .command('create')
    .description('Create a tier')
    .requiredOption('--name <name>', 'Tier name')
    .option('--description <description>', 'Tier description')
    .option('--active <value>', 'true|false')
    .option('--type <type>', 'free|paid')
    .option('--visibility <visibility>', 'public|none')
    .option('--monthly-price <cents>', 'Monthly price in cents')
    .option('--yearly-price <cents>', 'Yearly price in cents')
    .option('--currency <code>', '3-letter currency code')
    .option('--trial-days <daysOrNull>', 'Trial days, or null')
    .option('--benefits <benefits>', 'Comma separated benefit labels')
    .action(async (options, command) => {
      const global = getGlobalOptions(command);

      const parsed = TierCreateInputSchema.safeParse({
        name: options.name,
        description: options.description,
        active: parseBooleanFlag(options.active),
        type: options.type,
        visibility: options.visibility,
        monthlyPrice: parseInteger(options.monthlyPrice, 'monthly-price'),
        yearlyPrice: parseInteger(options.yearlyPrice, 'yearly-price'),
        currency: options.currency,
        trialDays: parseNullableInteger(options.trialDays, 'trial-days'),
        benefits: options.benefits,
      });

      if (!parsed.success) {
        throwValidationError(parsed.error);
      }

      const payload = await createTier(global, {
        name: parsed.data.name,
        description: parsed.data.description,
        active: parsed.data.active,
        type: parsed.data.type,
        visibility: parsed.data.visibility,
        monthly_price: parsed.data.monthlyPrice,
        yearly_price: parsed.data.yearlyPrice,
        currency: parsed.data.currency?.toUpperCase(),
        trial_days: parsed.data.trialDays,
        benefits: parseCsv(parsed.data.benefits),
      });

      if (global.json) {
        printJson(payload, global.jq);
        return;
      }

      printTierHuman(payload);
    });

  tier
    .command('update <id>')
    .description('Update a tier')
    .option('--name <name>', 'Tier name')
    .option('--description <description>', 'Tier description')
    .option('--active <value>', 'true|false')
    .option('--type <type>', 'free|paid')
    .option('--visibility <visibility>', 'public|none')
    .option('--monthly-price <cents>', 'Monthly price in cents')
    .option('--yearly-price <cents>', 'Yearly price in cents')
    .option('--currency <code>', '3-letter currency code')
    .option('--trial-days <daysOrNull>', 'Trial days, or null')
    .option('--benefits <benefits>', 'Comma separated benefit labels')
    .action(async (id: string, options, command) => {
      const global = getGlobalOptions(command);

      const parsed = TierUpdateInputSchema.safeParse({
        id,
        name: options.name,
        description: options.description,
        active: parseBooleanFlag(options.active),
        type: options.type,
        visibility: options.visibility,
        monthlyPrice: parseInteger(options.monthlyPrice, 'monthly-price'),
        yearlyPrice: parseInteger(options.yearlyPrice, 'yearly-price'),
        currency: options.currency,
        trialDays: parseNullableInteger(options.trialDays, 'trial-days'),
        benefits: options.benefits,
      });

      if (!parsed.success) {
        throwValidationError(parsed.error);
      }

      const payload = await updateTier(global, parsed.data.id, {
        name: parsed.data.name,
        description: parsed.data.description,
        active: parsed.data.active,
        type: parsed.data.type,
        visibility: parsed.data.visibility,
        monthly_price: parsed.data.monthlyPrice,
        yearly_price: parsed.data.yearlyPrice,
        currency: parsed.data.currency?.toUpperCase(),
        trial_days: parsed.data.trialDays,
        benefits: parsed.data.benefits !== undefined ? parseCsv(parsed.data.benefits) : undefined,
      });

      if (global.json) {
        printJson(payload, global.jq);
        return;
      }

      printTierHuman(payload);
    });

  tier
    .command('bulk')
    .description('Run bulk tier operations')
    .requiredOption('--filter <nql>', 'NQL filter to select tiers')
    .requiredOption('--action <action>', 'update')
    .option('--active <value>', 'true|false')
    .option('--visibility <visibility>', 'public|none')
    .option('--trial-days <daysOrNull>', 'Trial days, or null')
    .action(async (options, command) => {
      const global = getGlobalOptions(command);
      const parsed = TierBulkInputSchema.safeParse({
        filter: options.filter,
        action: options.action,
        active: parseBooleanFlag(options.active),
        visibility: options.visibility,
        trialDays: parseNullableInteger(options.trialDays, 'trial-days'),
      });

      if (!parsed.success) {
        throwValidationError(parsed.error);
      }

      const payload = await bulkTiers(global, {
        filter: parsed.data.filter,
        patch: {
          active: parsed.data.active,
          visibility: parsed.data.visibility,
          trial_days: parsed.data.trialDays,
        },
      });

      if (global.json) {
        printJson(payload, global.jq);
        return;
      }

      printOperationStatsHuman(payload, 'Bulk tier operation completed');
    });
}
