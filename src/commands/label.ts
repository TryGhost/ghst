import type { Command } from 'commander';
import { getGlobalOptions } from '../lib/context.js';
import { assertDestructiveActionsEnabled } from '../lib/destructive-actions.js';
import { ExitCode, GhstError } from '../lib/errors.js';
import {
  bulkLabels,
  createLabel,
  deleteLabel,
  getLabel,
  listLabels,
  updateLabel,
} from '../lib/labels.js';
import {
  printJson,
  printLabelHuman,
  printLabelListHuman,
  printOperationStatsHuman,
} from '../lib/output.js';
import { parseInteger } from '../lib/parse.js';
import { confirmDestructiveAction } from '../lib/prompts.js';
import { isNonInteractive } from '../lib/tty.js';
import {
  LabelBulkInputSchema,
  LabelCreateInputSchema,
  LabelDeleteInputSchema,
  LabelGetInputSchema,
  LabelListInputSchema,
  LabelUpdateInputSchema,
} from '../schemas/label.js';

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

export function registerLabelCommands(program: Command): void {
  const label = program.command('label').description('Label management');

  label
    .command('list')
    .description('List labels')
    .option('--limit <numberOrAll>', 'Number of labels per page or "all"')
    .option('--page <number>', 'Page number')
    .option('--filter <nql>', 'NQL filter')
    .option('--include <relations>', 'Include relationships')
    .option('--fields <fields>', 'Select output fields')
    .option('--order <order>', 'Sort order')
    .action(async (options, command) => {
      const global = getGlobalOptions(command);
      const rawLimit = options.limit === 'all' ? 'all' : parseInteger(options.limit, 'limit');
      const rawPage = parseInteger(options.page, 'page');

      const parsed = LabelListInputSchema.safeParse({
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
      const payload = await listLabels(
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

      printLabelListHuman(payload, global.color !== false);
    });

  label
    .command('get [id]')
    .description('Get a label by id or slug')
    .option('--slug <slug>', 'Label slug')
    .option('--include <relations>', 'Include relationships')
    .option('--fields <fields>', 'Select output fields')
    .action(async (id: string | undefined, options, command) => {
      const global = getGlobalOptions(command);

      const parsed = LabelGetInputSchema.safeParse({
        id,
        slug: options.slug,
        include: options.include,
        fields: options.fields,
      });

      if (!parsed.success) {
        throwValidationError(parsed.error);
      }

      const lookup = parsed.data.slug ?? parsed.data.id;
      if (!lookup) {
        throw new GhstError('Provide an id argument or --slug.', {
          code: 'USAGE_ERROR',
          exitCode: ExitCode.USAGE_ERROR,
        });
      }

      const payload = await getLabel(global, lookup, {
        bySlug: Boolean(parsed.data.slug),
        params: {
          include: parsed.data.include,
          fields: parsed.data.fields,
        },
      });

      if (global.json) {
        printJson(payload, global.jq);
        return;
      }

      printLabelHuman(payload);
    });

  label
    .command('create')
    .description('Create a label')
    .requiredOption('--name <name>', 'Label name')
    .action(async (options, command) => {
      const global = getGlobalOptions(command);
      const parsed = LabelCreateInputSchema.safeParse({
        name: options.name,
      });

      if (!parsed.success) {
        throwValidationError(parsed.error);
      }

      const payload = await createLabel(global, {
        name: parsed.data.name,
      });

      if (global.json) {
        printJson(payload, global.jq);
        return;
      }

      printLabelHuman(payload);
    });

  label
    .command('update [id]')
    .description('Update a label by id or slug')
    .option('--slug <slug>', 'Label slug lookup')
    .requiredOption('--name <name>', 'Label name')
    .action(async (id: string | undefined, options, command) => {
      const global = getGlobalOptions(command);
      const parsed = LabelUpdateInputSchema.safeParse({
        id,
        slugLookup: options.slug,
        name: options.name,
      });

      if (!parsed.success) {
        throwValidationError(parsed.error);
      }

      const payload = await updateLabel(global, {
        id: parsed.data.id,
        slug: parsed.data.slugLookup,
        patch: {
          name: parsed.data.name,
        },
      });

      if (global.json) {
        printJson(payload, global.jq);
        return;
      }

      printLabelHuman(payload);
    });

  label
    .command('delete <id>')
    .description('Delete a label')
    .option('--yes', 'Skip confirmation')
    .action(async (id: string, options, command) => {
      const global = getGlobalOptions(command);
      const parsed = LabelDeleteInputSchema.safeParse({
        id,
        yes: options.yes,
      });

      if (!parsed.success) {
        throwValidationError(parsed.error);
      }

      assertDestructiveActionsEnabled(global, 'delete label');

      if (!parsed.data.yes) {
        if (isNonInteractive()) {
          throw new GhstError('Deleting in non-interactive mode requires --yes.', {
            code: 'USAGE_ERROR',
            exitCode: ExitCode.USAGE_ERROR,
          });
        }

        const ok = await confirmDestructiveAction(`Delete label '${parsed.data.id}'? [y/N]: `, {
          action: 'delete_label',
          target: parsed.data.id,
          reversible: false,
          site: global.site ?? null,
        });
        if (!ok) {
          throw new GhstError('Operation cancelled.', {
            code: 'OPERATION_CANCELLED',
            exitCode: ExitCode.OPERATION_CANCELLED,
          });
        }
      }

      await deleteLabel(global, parsed.data.id);

      if (global.json) {
        printJson({ ok: true, id: parsed.data.id });
        return;
      }

      console.log(`Deleted label '${parsed.data.id}'.`);
    });

  label
    .command('bulk')
    .description('Run bulk label operations')
    .requiredOption('--filter <nql>', 'NQL filter to select labels')
    .requiredOption('--action <action>', 'update|delete')
    .option('--name <name>', 'Label name for update action')
    .option('--yes', 'Confirm bulk delete')
    .action(async (options, command) => {
      const global = getGlobalOptions(command);
      const parsed = LabelBulkInputSchema.safeParse({
        filter: options.filter,
        action: options.action,
        name: options.name,
        yes: options.yes,
      });

      if (!parsed.success) {
        throwValidationError(parsed.error);
      }

      if (parsed.data.action === 'delete') {
        assertDestructiveActionsEnabled(global, 'bulk delete labels');
      }

      const payload = await bulkLabels(global, {
        filter: parsed.data.filter,
        delete: parsed.data.action === 'delete',
        name: parsed.data.name,
      });

      if (global.json) {
        printJson(payload, global.jq);
        return;
      }

      printOperationStatsHuman(payload, 'Bulk label operation completed');
    });
}
