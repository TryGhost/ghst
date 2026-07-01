import type { Command } from 'commander';
import {
  assignDefined,
  readOptionalFile,
  readOptionalResourceJson,
  readOptionalStdin,
  renderMarkdown,
  wrapRawHtmlCard,
} from '../lib/content-input.js';
import { getGlobalOptions } from '../lib/context.js';
import { assertDestructiveActionsEnabled } from '../lib/destructive-actions.js';
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
import { parseBooleanFlag, parseCsv, parseInteger } from '../lib/parse.js';
import { confirmDestructiveAction } from '../lib/prompts.js';
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
    .option('--title <title>', 'Page title')
    .option('--slug <slug>', 'Page slug')
    .option('--status <status>', 'Page status')
    .option('--publish-at <datetime>', 'Publish date-time for scheduled pages')
    .option('--html <html>', 'Page HTML content')
    .option('--html-file <path>', 'Path to HTML file')
    .option('--lexical-file <path>', 'Path to Lexical JSON file')
    .option('--markdown-file <path>', 'Path to Markdown file')
    .option('--markdown-stdin', 'Read Markdown content from stdin')
    .option('--html-raw-file <path>', 'Path to raw HTML file wrapped in an HTML card')
    .option('--from-json <path>', 'Read page payload from JSON file')
    .option('--tags <tags>', 'Comma separated tag names')
    .option('--featured', 'Mark as featured')
    .option('--visibility <visibility>', 'public|members|paid|tiers')
    .action(async (options, command) => {
      const global = getGlobalOptions(command);
      const parsed = PageCreateInputSchema.safeParse({
        title: options.title,
        slug: options.slug,
        status: options.status,
        publishAt: options.publishAt,
        html: options.html,
        htmlFile: options.htmlFile,
        lexicalFile: options.lexicalFile,
        markdownFile: options.markdownFile,
        markdownStdin: parseBooleanFlag(options.markdownStdin),
        htmlRawFile: options.htmlRawFile,
        fromJson: options.fromJson,
        tags: options.tags,
        featured: parseBooleanFlag(options.featured),
        visibility: options.visibility,
      });

      if (!parsed.success) {
        throwValidationError(parsed.error);
      }

      const fromJson = await readOptionalResourceJson(parsed.data.fromJson, 'pages');
      const htmlFromFile = await readOptionalFile(parsed.data.htmlFile);
      const lexicalFromFile = await readOptionalFile(parsed.data.lexicalFile);
      const markdownFromFile = await readOptionalFile(parsed.data.markdownFile);
      const markdownFromStdin = await readOptionalStdin(parsed.data.markdownStdin);
      const rawHtmlFromFile = await readOptionalFile(parsed.data.htmlRawFile);

      const markdown = markdownFromStdin ?? markdownFromFile;
      const renderedMarkdown = markdown ? renderMarkdown(markdown) : undefined;
      const wrappedRawHtml = rawHtmlFromFile ? wrapRawHtmlCard(rawHtmlFromFile) : undefined;

      const html =
        parsed.data.html ??
        htmlFromFile ??
        wrappedRawHtml ??
        renderedMarkdown ??
        (typeof fromJson.html === 'string' ? fromJson.html : undefined);
      const lexical =
        lexicalFromFile ??
        (typeof fromJson.lexical === 'string' ? (fromJson.lexical as string) : undefined);
      const source = html ? 'html' : undefined;

      const createPayload = assignDefined(
        { ...fromJson },
        {
          title: parsed.data.title,
          slug: parsed.data.slug,
          status:
            parsed.data.status ??
            (typeof fromJson.status === 'string' ? fromJson.status : undefined) ??
            'draft',
          published_at: parsed.data.publishAt,
          html,
          lexical,
          tags: parseCsv(parsed.data.tags),
          featured: parsed.data.featured,
          visibility: parsed.data.visibility,
        },
      );

      const payload = await createPage(global, createPayload, source);

      if (global.json) {
        printJson(payload, global.jq);
        return;
      }

      printPageHuman(payload);
    });

  page
    .command('update [id]')
    .description('Update a page by id or slug')
    .option('--slug <slug>', 'Page slug lookup, or new slug when a positional id is given')
    .option('--title <title>', 'Page title')
    .option('--status <status>', 'Page status')
    .option('--publish-at <datetime>', 'Publish date-time for scheduled pages')
    .option('--html <html>', 'Page HTML content')
    .option('--html-file <path>', 'Path to HTML file')
    .option('--lexical-file <path>', 'Path to Lexical JSON file')
    .option('--markdown-file <path>', 'Path to Markdown file')
    .option('--markdown-stdin', 'Read Markdown content from stdin')
    .option('--html-raw-file <path>', 'Path to raw HTML file wrapped in an HTML card')
    .option('--from-json <path>', 'Read page patch from JSON file')
    .option('--tags <tags>', 'Comma separated tag names')
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
        markdownFile: options.markdownFile,
        markdownStdin: parseBooleanFlag(options.markdownStdin),
        htmlRawFile: options.htmlRawFile,
        fromJson: options.fromJson,
        tags: options.tags,
        featured: parseBooleanFlag(options.featured),
        visibility: options.visibility,
      });

      if (!parsed.success) {
        throwValidationError(parsed.error);
      }

      const fromJson = await readOptionalResourceJson(parsed.data.fromJson, 'pages');
      const htmlFromFile = await readOptionalFile(parsed.data.htmlFile);
      const lexicalFromFile = await readOptionalFile(parsed.data.lexicalFile);
      const markdownFromFile = await readOptionalFile(parsed.data.markdownFile);
      const markdownFromStdin = await readOptionalStdin(parsed.data.markdownStdin);
      const rawHtmlFromFile = await readOptionalFile(parsed.data.htmlRawFile);

      const markdown = markdownFromStdin ?? markdownFromFile;
      const renderedMarkdown = markdown ? renderMarkdown(markdown) : undefined;
      const wrappedRawHtml = rawHtmlFromFile ? wrapRawHtmlCard(rawHtmlFromFile) : undefined;

      const html =
        parsed.data.html ??
        htmlFromFile ??
        wrappedRawHtml ??
        renderedMarkdown ??
        (typeof fromJson.html === 'string' ? fromJson.html : undefined);
      const lexical =
        lexicalFromFile ??
        (typeof fromJson.lexical === 'string' ? (fromJson.lexical as string) : undefined);
      const source = html ? 'html' : undefined;

      // When a positional id is supplied, --slug is a new slug to set rather
      // than the lookup key, so `page update <id> --slug new-slug` renames the
      // page. With no id, --slug remains the lookup key.
      const lookupSlug = parsed.data.id ? undefined : parsed.data.slug;
      const renameSlug = parsed.data.id ? parsed.data.slug : undefined;

      const patch = assignDefined(
        { ...fromJson },
        {
          title: parsed.data.title,
          slug: renameSlug,
          status: parsed.data.status,
          published_at: parsed.data.publishAt,
          html,
          lexical,
          tags: parseCsv(parsed.data.tags),
          featured: parsed.data.featured,
          visibility: parsed.data.visibility,
        },
      );

      const payload = await updatePage(global, {
        id: parsed.data.id,
        slug: lookupSlug,
        patch,
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

      assertDestructiveActionsEnabled(global, 'delete page');

      if (!parsed.data.yes) {
        if (isNonInteractive()) {
          throw new GhstError('Deleting in non-interactive mode requires --yes.', {
            code: 'USAGE_ERROR',
            exitCode: ExitCode.USAGE_ERROR,
          });
        }

        const ok = await confirmDestructiveAction(`Delete page '${parsed.data.id}'? [y/N]: `, {
          action: 'delete_page',
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

      if (parsed.data.action === 'delete') {
        assertDestructiveActionsEnabled(global, 'bulk delete pages');
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
