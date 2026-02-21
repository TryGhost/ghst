import fs from 'node:fs/promises';
import type { Command } from 'commander';
import { getGlobalOptions } from '../lib/context.js';
import { ExitCode, GhstError } from '../lib/errors.js';
import { printJson, printPostHuman, printPostListHuman } from '../lib/output.js';
import { parseBooleanFlag, parseCsv, parseInteger } from '../lib/parse.js';
import {
  createPost,
  deletePost,
  getPost,
  listPosts,
  publishPost,
  updatePost,
} from '../lib/posts.js';
import { confirm } from '../lib/prompts.js';
import { isNonInteractive } from '../lib/tty.js';
import {
  PostCreateInputSchema,
  PostDeleteInputSchema,
  PostGetInputSchema,
  PostListInputSchema,
  PostPublishInputSchema,
  PostUpdateInputSchema,
} from '../schemas/post.js';

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

export function registerPostCommands(program: Command): void {
  const post = program.command('post').description('Post management');

  post
    .command('list')
    .description('List posts')
    .option('--limit <numberOrAll>', 'Number of posts per page or "all"')
    .option('--page <number>', 'Page number')
    .option('--filter <nql>', 'NQL filter')
    .option('--status <status>', 'Post status filter')
    .option('--featured', 'Only featured posts')
    .option('--include <relations>', 'Include relationships')
    .option('--fields <fields>', 'Select output fields')
    .option('--order <order>', 'Sort order')
    .option('--formats <formats>', 'Return requested content formats')
    .action(async (options, command) => {
      const global = getGlobalOptions(command);
      const rawLimit = options.limit === 'all' ? 'all' : parseInteger(options.limit, 'limit');
      const rawPage = parseInteger(options.page, 'page');

      const parsed = PostListInputSchema.safeParse({
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
      const payload = await listPosts(
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

      printPostListHuman(payload, global.color !== false);
    });

  post
    .command('get [id]')
    .description('Get a post by id or slug')
    .option('--slug <slug>', 'Post slug')
    .option('--include <relations>', 'Include relationships')
    .option('--fields <fields>', 'Select output fields')
    .option('--formats <formats>', 'Return requested content formats')
    .action(async (id: string | undefined, options, command) => {
      const global = getGlobalOptions(command);
      const parsed = PostGetInputSchema.safeParse({
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

      const payload = await getPost(global, lookup, {
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

      printPostHuman(payload);
    });

  post
    .command('create')
    .description('Create a post')
    .requiredOption('--title <title>', 'Post title')
    .option('--status <status>', 'Post status', 'draft')
    .option('--publish-at <datetime>', 'Publish date-time for scheduled posts')
    .option('--html <html>', 'Post HTML content')
    .option('--html-file <path>', 'Path to HTML file')
    .option('--lexical-file <path>', 'Path to Lexical JSON file')
    .option('--tags <tags>', 'Comma separated tag names')
    .option('--authors <authors>', 'Comma separated author emails')
    .option('--featured', 'Mark as featured')
    .option('--visibility <visibility>', 'public|members|paid|tiers')
    .action(async (options, command) => {
      const global = getGlobalOptions(command);
      const parsed = PostCreateInputSchema.safeParse({
        title: options.title,
        status: options.status,
        publishAt: options.publishAt,
        html: options.html,
        htmlFile: options.htmlFile,
        lexicalFile: options.lexicalFile,
        tags: options.tags,
        authors: options.authors,
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

      const payload = await createPost(
        global,
        {
          title: parsed.data.title,
          status: parsed.data.status,
          published_at: parsed.data.publishAt,
          html,
          lexical,
          tags: parseCsv(parsed.data.tags),
          authors: parseCsv(parsed.data.authors),
          featured: parsed.data.featured,
          visibility: parsed.data.visibility,
        },
        source,
      );

      if (global.json) {
        printJson(payload, global.jq);
        return;
      }

      printPostHuman(payload);
    });

  post
    .command('update [id]')
    .description('Update a post by id or slug')
    .option('--slug <slug>', 'Post slug lookup')
    .option('--title <title>', 'Post title')
    .option('--status <status>', 'Post status')
    .option('--publish-at <datetime>', 'Publish date-time for scheduled posts')
    .option('--html <html>', 'Post HTML content')
    .option('--html-file <path>', 'Path to HTML file')
    .option('--lexical-file <path>', 'Path to Lexical JSON file')
    .option('--tags <tags>', 'Comma separated tag names')
    .option('--authors <authors>', 'Comma separated author emails')
    .option('--featured <value>', 'true|false')
    .option('--visibility <visibility>', 'public|members|paid|tiers')
    .action(async (id: string | undefined, options, command) => {
      const global = getGlobalOptions(command);
      const parsed = PostUpdateInputSchema.safeParse({
        id,
        slug: options.slug,
        title: options.title,
        status: options.status,
        publishAt: options.publishAt,
        html: options.html,
        htmlFile: options.htmlFile,
        lexicalFile: options.lexicalFile,
        tags: options.tags,
        authors: options.authors,
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

      const payload = await updatePost(global, {
        id: parsed.data.id,
        slug: parsed.data.slug,
        patch: {
          title: parsed.data.title,
          status: parsed.data.status,
          published_at: parsed.data.publishAt,
          html,
          lexical,
          tags: parseCsv(parsed.data.tags),
          authors: parseCsv(parsed.data.authors),
          featured: parsed.data.featured,
          visibility: parsed.data.visibility,
        },
        source,
      });

      if (global.json) {
        printJson(payload, global.jq);
        return;
      }

      printPostHuman(payload);
    });

  post
    .command('delete <id>')
    .description('Delete a post')
    .option('--yes', 'Skip confirmation')
    .action(async (id: string, options, command) => {
      const global = getGlobalOptions(command);
      const parsed = PostDeleteInputSchema.safeParse({
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

        const ok = await confirm(`Delete post '${parsed.data.id}'? [y/N]: `);
        if (!ok) {
          throw new GhstError('Operation cancelled.', {
            code: 'OPERATION_CANCELLED',
            exitCode: ExitCode.OPERATION_CANCELLED,
          });
        }
      }

      await deletePost(global, parsed.data.id);

      if (global.json) {
        printJson({ ok: true, id: parsed.data.id });
        return;
      }

      console.log(`Deleted post '${parsed.data.id}'.`);
    });

  post
    .command('publish <id>')
    .description('Publish a post')
    .action(async (id: string, _, command) => {
      const global = getGlobalOptions(command);
      const parsed = PostPublishInputSchema.safeParse({ id });

      if (!parsed.success) {
        throwValidationError(parsed.error);
      }

      const payload = await publishPost(global, parsed.data.id);

      if (global.json) {
        printJson(payload, global.jq);
        return;
      }

      printPostHuman(payload);
    });
}
