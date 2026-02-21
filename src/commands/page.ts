import fs from 'node:fs/promises';
import type { Command } from 'commander';
import { getGlobalOptions } from '../lib/context.js';
import { ExitCode, GhstError } from '../lib/errors.js';
import { printJson, printPageHuman, printPageListHuman } from '../lib/output.js';
import {
  bulkPages,
  copyPage,
  createPage,
  deletePage,
  getPage,
  listPages,
  updatePage,
} from '../lib/pages.js';
import { parseBooleanFlag, parseInteger } from '../lib/parse.js';
import { confirm } from '../lib/prompts.js';
import { isNonInteractive } from '../lib/tty.js';
import {
  PageBulkInputSchema,
  PageCopyInputSchema,
  PageCreateInputSchema,
  PageDeleteInputSchema,
  PageGetInputSchema,
  PageListInputSchema,
  PageUpdateInputSchema,
} from '../schemas/page.js';

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

async function readOptionalFile(filePath: string | undefined): Promise<string | undefined> {
  if (!filePath) {
    return undefined;
  }

  return fs.readFile(filePath, 'utf8');
}

export function registerPageCommands(program: Command): void {
  const page = program.command('page').description('Page management');

  page
    .command('list')
    .description('List pages')
    .option('--limit <numberOrAll>', 'Number of pages per page or "all"')
    .option('--page <number>', 'Page number')
    .option('--filter <nql>', 'NQL filter')
    .option('--status <status>', 'Page status filter')
    .option('--featured', 'Only featured pages')
    .option('--include <relations>', 'Include relationships')
    .option('--fields <fields>', 'Select output fields')
    .option('--order <order>', 'Sort order')
    .option('--formats <formats>', 'Return requested content formats')
    .action(async (options, command) => {
      const global = getGlobalOptions(command);
      const rawLimit = options.limit === 'all' ? 'all' : parseInteger(options.limit, 'limit');
      const rawPage = parseInteger(options.page, 'page');

      const parsed = PageListInputSchema.safeParse({
        limit: rawLimit,
        page: rawPage,
        filter: options.filter,
        status: options.status,
        featured: options.featured,
        include: options.include,
        fields: options.fields,
        order: options.order,
        formats: options.formats,
      });

      if (!parsed.success) {
        throwValidationError(parsed.error);
      }

      const allPages = parsed.data.limit === 'all';
      const payload = await listPages(
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

      printPageListHuman(payload, global.color !== false);
    });

  page
    .command('get [id]')
    .description('Get a page by id or slug')
    .option('--slug <slug>', 'Page slug')
    .option('--include <relations>', 'Include relationships')
    .option('--fields <fields>', 'Select output fields')
    .option('--formats <formats>', 'Return requested content formats')
    .action(async (id: string | undefined, options, command) => {
      const global = getGlobalOptions(command);
      const parsed = PageGetInputSchema.safeParse({
        id,
        slug: options.slug,
        include: options.include,
        fields: options.fields,
        formats: options.formats,
      });

      if (!parsed.success) {
        throwValidationError(parsed.error);
      }

      const lookup = parsed.data.slug ?? parsed.data.id;
      if (!lookup) {
        throw new GhstError('Provide an id argument or --slug.', {
          exitCode: ExitCode.USAGE_ERROR,
          code: 'USAGE_ERROR',
        });
      }

      const payload = await getPage(global, lookup, {
        bySlug: Boolean(parsed.data.slug),
        params: {
          include: parsed.data.include,
          fields: parsed.data.fields,
          formats: parsed.data.formats,
        },
      });

      if (global.json) {
        printJson(payload, global.jq);
        return;
      }

      printPageHuman(payload);
    });

  page
    .command('create')
    .description('Create a page')
    .requiredOption('--title <title>', 'Page title')
    .option('--status <status>', 'Page status', 'draft')
    .option('--publish-at <datetime>', 'Publish date-time for scheduled pages')
    .option('--html <html>', 'Page HTML content')
    .option('--html-file <path>', 'Path to HTML file')
    .option('--lexical-file <path>', 'Path to Lexical JSON file')
    .option('--featured', 'Mark as featured')
    .option('--visibility <visibility>', 'public|members|paid|tiers')
    .action(async (options, command) => {
      const global = getGlobalOptions(command);
      const parsed = PageCreateInputSchema.safeParse({
        title: options.title,
        status: options.status,
        publishAt: options.publishAt,
        html: options.html,
        htmlFile: options.htmlFile,
        lexicalFile: options.lexicalFile,
        featured: options.featured,
        visibility: options.visibility,
      });

      if (!parsed.success) {
        throwValidationError(parsed.error);
      }

      const htmlFromFile = await readOptionalFile(parsed.data.htmlFile);
      const lexicalFromFile = await readOptionalFile(parsed.data.lexicalFile);
      const html = parsed.data.html ?? htmlFromFile;
      const lexical = lexicalFromFile;
      const source = html ? 'html' : undefined;

      const payload = await createPage(
        global,
        {
          title: parsed.data.title,
          status: parsed.data.status,
          published_at: parsed.data.publishAt,
          html,
          lexical,
          featured: parsed.data.featured,
          visibility: parsed.data.visibility,
        },
        source,
      );

      if (global.json) {
        printJson(payload, global.jq);
        return;
      }

      printPageHuman(payload);
    });

  page
    .command('update [id]')
    .description('Update a page by id or slug')
    .option('--slug <slug>', 'Page slug lookup')
    .option('--title <title>', 'Page title')
    .option('--status <status>', 'Page status')
    .option('--publish-at <datetime>', 'Publish date-time for scheduled pages')
    .option('--html <html>', 'Page HTML content')
    .option('--html-file <path>', 'Path to HTML file')
    .option('--lexical-file <path>', 'Path to Lexical JSON file')
    .option('--featured <value>', 'true|false')
    .option('--visibility <visibility>', 'public|members|paid|tiers')
    .action(async (id: string | undefined, options, command) => {
      const global = getGlobalOptions(command);
      const parsed = PageUpdateInputSchema.safeParse({
        id,
        slug: options.slug,
        title: options.title,
        status: options.status,
        publishAt: options.publishAt,
        html: options.html,
        htmlFile: options.htmlFile,
        lexicalFile: options.lexicalFile,
        featured: parseBooleanFlag(options.featured),
        visibility: options.visibility,
      });

      if (!parsed.success) {
        throwValidationError(parsed.error);
      }

      const htmlFromFile = await readOptionalFile(parsed.data.htmlFile);
      const lexicalFromFile = await readOptionalFile(parsed.data.lexicalFile);
      const html = parsed.data.html ?? htmlFromFile;
      const lexical = lexicalFromFile;
      const source = html ? 'html' : undefined;

      const payload = await updatePage(global, {
        id: parsed.data.id,
        slug: parsed.data.slug,
        patch: {
          title: parsed.data.title,
          status: parsed.data.status,
          published_at: parsed.data.publishAt,
          html,
          lexical,
          featured: parsed.data.featured,
          visibility: parsed.data.visibility,
        },
        source,
      });

      if (global.json) {
        printJson(payload, global.jq);
        return;
      }

      printPageHuman(payload);
    });

  page
    .command('delete <id>')
    .description('Delete a page')
    .option('--yes', 'Skip confirmation')
    .action(async (id: string, options, command) => {
      const global = getGlobalOptions(command);
      const parsed = PageDeleteInputSchema.safeParse({
        id,
        yes: options.yes,
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

        const ok = await confirm(`Delete page '${parsed.data.id}'? [y/N]: `);
        if (!ok) {
          throw new GhstError('Operation cancelled.', {
            code: 'OPERATION_CANCELLED',
            exitCode: ExitCode.OPERATION_CANCELLED,
          });
        }
      }

      await deletePage(global, parsed.data.id);

      if (global.json) {
        printJson({ ok: true, id: parsed.data.id });
        return;
      }

      console.log(`Deleted page '${parsed.data.id}'.`);
    });

  page
    .command('copy <id>')
    .description('Copy a page')
    .action(async (id: string, _, command) => {
      const global = getGlobalOptions(command);
      const parsed = PageCopyInputSchema.safeParse({ id });

      if (!parsed.success) {
        throwValidationError(parsed.error);
      }

      const payload = await copyPage(global, parsed.data.id);
      if (global.json) {
        printJson(payload, global.jq);
        return;
      }
      printPageHuman(payload);
    });

  page
    .command('bulk')
    .description('Run bulk page operations')
    .requiredOption('--filter <nql>', 'NQL filter to select pages')
    .requiredOption('--action <action>', 'update|delete')
    .option('--status <status>', 'Status to set for bulk update')
    .option('--yes', 'Confirm bulk delete')
    .action(async (options, command) => {
      const global = getGlobalOptions(command);
      const parsed = PageBulkInputSchema.safeParse({
        filter: options.filter,
        action: options.action,
        status: options.status,
        yes: options.yes,
      });

      if (!parsed.success) {
        throwValidationError(parsed.error);
      }

      const payload = await bulkPages(global, {
        filter: parsed.data.filter,
        delete: parsed.data.action === 'delete',
        status: parsed.data.status,
      });

      if (global.json) {
        printJson(payload, global.jq);
        return;
      }

      const stats = (
        (payload.bulk as Record<string, unknown> | undefined)?.meta as Record<string, unknown>
      )?.stats as Record<string, unknown> | undefined;
      console.log(
        `Bulk operation complete: ${String(stats?.successful ?? 0)} successful, ${String(stats?.unsuccessful ?? 0)} unsuccessful`,
      );
    });
}
