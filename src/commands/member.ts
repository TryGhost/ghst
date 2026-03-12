import fs from 'node:fs/promises';
import type { Command } from 'commander';
import { getGlobalOptions } from '../lib/context.js';
import { ExitCode, GhstError } from '../lib/errors.js';
import { assertFileDoesNotExist } from '../lib/file-guards.js';
import {
  bulkMembers,
  createMember,
  deleteMember,
  exportMembersCsv,
  getMember,
  importMembersCsv,
  listMembers,
  updateMember,
} from '../lib/members.js';
import {
  printJson,
  printMemberHuman,
  printMemberListHuman,
  printOperationStatsHuman,
} from '../lib/output.js';
import { parseBooleanFlag, parseCsv, parseInteger } from '../lib/parse.js';
import { confirm } from '../lib/prompts.js';
import { isNonInteractive } from '../lib/tty.js';
import {
  MemberBulkInputSchema,
  MemberCreateInputSchema,
  MemberDeleteInputSchema,
  MemberExportInputSchema,
  MemberGetInputSchema,
  MemberImportInputSchema,
  MemberListInputSchema,
  MemberUpdateInputSchema,
} from '../schemas/member.js';

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

function csvAsObjects(
  input: string | undefined,
  key: 'id' | 'name',
): Array<Record<string, string>> | undefined {
  const values = parseCsv(input);
  if (!values || values.length === 0) {
    return undefined;
  }

  return values.map((value) => ({ [key]: value }));
}

export function registerMemberCommands(program: Command): void {
  const member = program.command('member').description('Member management');

  member
    .command('list')
    .description('List members')
    .option('--limit <numberOrAll>', 'Number of members per page or "all"')
    .option('--page <number>', 'Page number')
    .option('--filter <nql>', 'NQL filter')
    .option('--status <status>', 'Member status (free|paid|comped)')
    .option('--search <term>', 'Search term')
    .option('--include <relations>', 'Include relationships')
    .option('--fields <fields>', 'Select output fields')
    .option('--order <order>', 'Sort order')
    .action(async (options, command) => {
      const global = getGlobalOptions(command);
      const rawLimit = options.limit === 'all' ? 'all' : parseInteger(options.limit, 'limit');
      const rawPage = parseInteger(options.page, 'page');

      const parsed = MemberListInputSchema.safeParse({
        limit: rawLimit,
        page: rawPage,
        filter: options.filter,
        status: options.status,
        search: options.search,
        include: options.include,
        fields: options.fields,
        order: options.order,
      });

      if (!parsed.success) {
        throwValidationError(parsed.error);
      }

      const allPages = parsed.data.limit === 'all';
      const combinedFilter =
        parsed.data.filter && parsed.data.status
          ? `${parsed.data.filter}+status:${parsed.data.status}`
          : (parsed.data.filter ??
            (parsed.data.status ? `status:${parsed.data.status}` : undefined));
      const payload = await listMembers(
        global,
        {
          ...parsed.data,
          filter: combinedFilter,
          limit: parsed.data.limit === 'all' ? undefined : parsed.data.limit,
        },
        allPages,
      );

      if (global.json) {
        printJson(payload, global.jq);
        return;
      }

      printMemberListHuman(payload, global.color !== false);
    });

  member
    .command('get [id]')
    .description('Get a member by id or email')
    .option('--email <email>', 'Member email')
    .option('--include <relations>', 'Include relationships')
    .option('--fields <fields>', 'Select output fields')
    .action(async (id: string | undefined, options, command) => {
      const global = getGlobalOptions(command);

      const parsed = MemberGetInputSchema.safeParse({
        id,
        email: options.email,
        include: options.include,
        fields: options.fields,
      });

      if (!parsed.success) {
        throwValidationError(parsed.error);
      }

      const payload = await getMember(global, {
        id: parsed.data.id,
        email: parsed.data.email,
        params: {
          include: parsed.data.include,
          fields: parsed.data.fields,
        },
      });

      if (global.json) {
        printJson(payload, global.jq);
        return;
      }

      printMemberHuman(payload);
    });

  member
    .command('create')
    .description('Create a member')
    .requiredOption('--email <email>', 'Member email')
    .option('--name <name>', 'Member name')
    .option('--note <note>', 'Internal note')
    .option('--labels <labels>', 'Comma separated labels')
    .option('--newsletters <ids>', 'Comma separated newsletter ids')
    .option('--subscribed <value>', 'true|false')
    .option('--send-email', 'Send welcome/signin/signup email')
    .option('--email-type <type>', 'signin|signup|subscribe')
    .option('--comp', 'Create as complimentary member')
    .option('--tier <id>', 'Tier id for complimentary access')
    .action(async (options, command) => {
      const global = getGlobalOptions(command);

      const parsed = MemberCreateInputSchema.safeParse({
        email: options.email,
        name: options.name,
        note: options.note,
        labels: options.labels,
        newsletters: options.newsletters,
        subscribed: parseBooleanFlag(options.subscribed),
        sendEmail: parseBooleanFlag(options.sendEmail),
        emailType: options.emailType,
        comp: parseBooleanFlag(options.comp),
        tier: options.tier,
      });

      if (!parsed.success) {
        throwValidationError(parsed.error);
      }

      const tierId = parsed.data.tier;
      const memberPayload: Record<string, unknown> = {
        email: parsed.data.email,
        name: parsed.data.name,
        note: parsed.data.note,
        subscribed: parsed.data.subscribed,
        labels: csvAsObjects(parsed.data.labels, 'name'),
        newsletters: csvAsObjects(parsed.data.newsletters, 'id'),
      };

      if (parsed.data.comp && tierId) {
        memberPayload.tiers = [{ id: tierId }];
      }

      const apiParams: Record<string, string | number | boolean | undefined> = {
        send_email: parsed.data.sendEmail,
        email_type: parsed.data.emailType,
      };

      const payload = await createMember(global, memberPayload, apiParams);

      if (global.json) {
        printJson(payload, global.jq);
        return;
      }

      printMemberHuman(payload);
    });

  member
    .command('update [id]')
    .description('Update a member by id or email')
    .option('--email <email>', 'Member email lookup')
    .option('--name <name>', 'Member name')
    .option('--note <note>', 'Internal note')
    .option('--labels <labels>', 'Comma separated labels')
    .option('--newsletters <ids>', 'Comma separated newsletter ids')
    .option('--subscribed <value>', 'true|false')
    .option('--comp', 'Set complimentary tier access')
    .option('--tier <id>', 'Tier id for complimentary access')
    .option('--expiry <datetime>', 'Tier access expiry datetime')
    .option('--clear-tiers', 'Remove all complimentary tiers')
    .action(async (id: string | undefined, options, command) => {
      const global = getGlobalOptions(command);

      const parsed = MemberUpdateInputSchema.safeParse({
        id,
        email: options.email,
        name: options.name,
        note: options.note,
        labels: options.labels,
        newsletters: options.newsletters,
        subscribed: parseBooleanFlag(options.subscribed),
        comp: parseBooleanFlag(options.comp),
        tier: options.tier,
        expiry: options.expiry,
        clearTiers: parseBooleanFlag(options.clearTiers),
      });

      if (!parsed.success) {
        throwValidationError(parsed.error);
      }

      const patch: Record<string, unknown> = {
        name: parsed.data.name,
        note: parsed.data.note,
        subscribed: parsed.data.subscribed,
        labels:
          parsed.data.labels !== undefined ? csvAsObjects(parsed.data.labels, 'name') : undefined,
        newsletters:
          parsed.data.newsletters !== undefined
            ? csvAsObjects(parsed.data.newsletters, 'id')
            : undefined,
      };

      if (parsed.data.clearTiers) {
        patch.tiers = [];
      } else if (parsed.data.tier && (parsed.data.comp || parsed.data.expiry)) {
        patch.tiers = [
          {
            id: parsed.data.tier,
            expiry_at: parsed.data.expiry,
          },
        ];
      }

      const payload = await updateMember(global, {
        id: parsed.data.id,
        email: parsed.data.email,
        patch,
      });

      if (global.json) {
        printJson(payload, global.jq);
        return;
      }

      printMemberHuman(payload);
    });

  member
    .command('delete <id>')
    .description('Delete a member')
    .option('--cancel', 'Cancel Stripe subscriptions when deleting')
    .option('--yes', 'Skip confirmation')
    .action(async (id: string, options, command) => {
      const global = getGlobalOptions(command);
      const parsed = MemberDeleteInputSchema.safeParse({
        id,
        cancel: parseBooleanFlag(options.cancel),
        yes: parseBooleanFlag(options.yes),
      });

      if (!parsed.success) {
        throwValidationError(parsed.error);
      }

      if (!parsed.data.yes) {
        if (isNonInteractive()) {
          throw new GhstError('Deleting in non-interactive mode requires --yes.', {
            code: 'USAGE_ERROR',
            exitCode: ExitCode.USAGE_ERROR,
          });
        }

        const ok = await confirm(`Delete member '${parsed.data.id}'? [y/N]: `);
        if (!ok) {
          throw new GhstError('Operation cancelled.', {
            code: 'OPERATION_CANCELLED',
            exitCode: ExitCode.OPERATION_CANCELLED,
          });
        }
      }

      await deleteMember(global, parsed.data.id, {
        cancel: parsed.data.cancel,
      });

      if (global.json) {
        printJson({ ok: true, id: parsed.data.id });
        return;
      }

      console.log(`Deleted member '${parsed.data.id}'.`);
    });

  member
    .command('import <filePath>')
    .description('Import members from CSV')
    .option('--labels <labels>', 'Comma separated labels to apply to imported members')
    .action(async (filePath: string, options, command) => {
      const global = getGlobalOptions(command);

      const parsed = MemberImportInputSchema.safeParse({
        filePath,
        labels: options.labels,
      });

      if (!parsed.success) {
        throwValidationError(parsed.error);
      }

      const payload = await importMembersCsv(global, {
        filePath: parsed.data.filePath,
        labels: parseCsv(parsed.data.labels),
      });

      if (global.json) {
        printJson(payload, global.jq);
        return;
      }

      printOperationStatsHuman(payload, 'Imported members');
    });

  member
    .command('export')
    .description('Export members as CSV')
    .option('--limit <numberOrAll>', 'Number of members per page or "all"')
    .option('--filter <nql>', 'NQL filter')
    .option('--search <term>', 'Search term')
    .option('--output <path>', 'Write CSV to file path')
    .action(async (options, command) => {
      const global = getGlobalOptions(command);

      const rawLimit = options.limit === 'all' ? 'all' : parseInteger(options.limit, 'limit');
      const parsed = MemberExportInputSchema.safeParse({
        limit: rawLimit,
        filter: options.filter,
        search: options.search,
        output: options.output,
      });

      if (!parsed.success) {
        throwValidationError(parsed.error);
      }

      const csv = await exportMembersCsv(global, {
        limit: parsed.data.limit === 'all' ? undefined : parsed.data.limit,
        filter: parsed.data.filter,
        search: parsed.data.search,
      });

      if (parsed.data.output) {
        await assertFileDoesNotExist(parsed.data.output);
        await fs.writeFile(parsed.data.output, csv, 'utf8');

        if (global.json) {
          printJson({ ok: true, output: parsed.data.output });
          return;
        }

        console.log(`Exported members CSV to '${parsed.data.output}'.`);
        return;
      }

      if (global.json) {
        printJson({ csv }, global.jq);
        return;
      }

      process.stdout.write(csv);
      if (!csv.endsWith('\n')) {
        process.stdout.write('\n');
      }
    });

  member
    .command('bulk')
    .description('Run a bulk member operation')
    .option('--action <action>', 'unsubscribe|add-label|remove-label|delete')
    .option('--update', 'PRD alias for bulk label replacement')
    .option('--delete', 'PRD alias for delete action')
    .option('--all', 'Apply to all members')
    .option('--filter <nql>', 'Filter members by NQL')
    .option('--search <term>', 'Search members')
    .option('--label-id <id>', 'Label id for add-label/remove-label operations')
    .option('--labels <labels>', 'Comma separated label names for --update')
    .option('--yes', 'Confirm --delete action')
    .action(async (options, command) => {
      const global = getGlobalOptions(command);
      const parsed = MemberBulkInputSchema.safeParse({
        action: options.action,
        update: parseBooleanFlag(options.update),
        delete: parseBooleanFlag(options.delete),
        all: parseBooleanFlag(options.all),
        filter: options.filter,
        search: options.search,
        labelId: options.labelId,
        labels: options.labels,
        yes: parseBooleanFlag(options.yes),
      });

      if (!parsed.success) {
        throwValidationError(parsed.error);
      }

      const resolvedAction = parsed.data.update
        ? 'update-labels'
        : parsed.data.delete
          ? 'delete'
          : parsed.data.action;
      const payload = await bulkMembers(global, {
        action: (resolvedAction ?? 'unsubscribe') as
          | 'unsubscribe'
          | 'add-label'
          | 'remove-label'
          | 'delete'
          | 'update-labels',
        all: parsed.data.all,
        filter: parsed.data.filter,
        search: parsed.data.search,
        labelId: parsed.data.labelId,
        labels: parseCsv(parsed.data.labels),
      });

      if (global.json) {
        printJson(payload, global.jq);
        return;
      }

      printOperationStatsHuman(payload, 'Bulk member operation completed');
    });
}
