import fs from 'node:fs/promises';
import type { Command } from 'commander';
import MarkdownIt from 'markdown-it';
import { getGlobalOptions } from '../lib/context.js';
import { ExitCode, GhstError } from '../lib/errors.js';
import { printJson, printPostHuman, printPostListHuman } from '../lib/output.js';
import { parseBooleanFlag, parseCsv, parseInteger } from '../lib/parse.js';
import {
  bulkPosts,
  copyPost,
  createPost,
  deletePost,
  getPost,
  listPosts,
  publishPost,
  schedulePost,
  unschedulePost,
  updatePost,
} from '../lib/posts.js';
import { confirm } from '../lib/prompts.js';
import { isNonInteractive } from '../lib/tty.js';
import {
  PostBulkInputSchema,
  PostCopyInputSchema,
  PostCreateInputSchema,
  PostDeleteInputSchema,
  PostGetInputSchema,
  PostListInputSchema,
  PostPublishInputSchema,
  PostScheduleInputSchema,
  PostUnscheduleInputSchema,
  PostUpdateInputSchema,
} from '../schemas/post.js';

const markdownRenderer = new MarkdownIt({ html: true, linkify: true, breaks: true });

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

async function readOptionalStdin(enabled: boolean | undefined): Promise<string | undefined> {
  if (!enabled) {
    return undefined;
  }

  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
  }
  const value = Buffer.concat(chunks).toString('utf8').trim();
  return value.length > 0 ? value : undefined;
}

function wrapRawHtmlCard(html: string): string {
  return `<!--kg-card-begin: html-->\n${html}\n<!--kg-card-end: html-->`;
}

function asPostPayload(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object') {
    throw new GhstError('Invalid --from-json payload: expected JSON object.', {
      code: 'VALIDATION_ERROR',
      exitCode: ExitCode.VALIDATION_ERROR,
    });
  }

  const record = value as Record<string, unknown>;
  if (Array.isArray(record.posts) && record.posts.length > 0) {
    const first = record.posts[0];
    if (first && typeof first === 'object') {
      return first as Record<string, unknown>;
    }
  }

  return record;
}

async function readOptionalPostJson(
  filePath: string | undefined,
): Promise<Record<string, unknown>> {
  if (!filePath) {
    return {};
  }

  const payload = JSON.parse(await fs.readFile(filePath, 'utf8')) as unknown;
  return asPostPayload(payload);
}

function assignDefined(
  target: Record<string, unknown>,
  values: Record<string, unknown>,
): Record<string, unknown> {
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined) {
      target[key] = value;
    }
  }

  return target;
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
    .option('--title <title>', 'Post title')
    .option('--status <status>', 'Post status')
    .option('--publish-at <datetime>', 'Publish date-time for scheduled posts')
    .option('--html <html>', 'Post HTML content')
    .option('--html-file <path>', 'Path to HTML file')
    .option('--lexical-file <path>', 'Path to Lexical JSON file')
    .option('--markdown-file <path>', 'Path to Markdown file')
    .option('--markdown-stdin', 'Read Markdown content from stdin')
    .option('--html-raw-file <path>', 'Path to raw HTML file wrapped in an HTML card')
    .option('--from-json <path>', 'Read post payload from JSON file')
    .option('--tags <tags>', 'Comma separated tag names')
    .option('--authors <authors>', 'Comma separated author emails')
    .option('--featured', 'Mark as featured')
    .option('--visibility <visibility>', 'public|members|paid|tiers')
    .option('--tier <slug>', 'Tier slug for tier visibility access')
    .option('--excerpt <excerpt>', 'Custom excerpt')
    .option('--meta-title <title>', 'Meta title')
    .option('--meta-description <description>', 'Meta description')
    .option('--og-title <title>', 'Open Graph title')
    .option('--og-image <url>', 'Open Graph image URL')
    .option('--code-injection-head <value>', 'Code injection head HTML')
    .option('--newsletter <slug>', 'Newsletter slug for published posts')
    .option('--email-only', 'Publish as email-only')
    .option('--email-segment <segment>', 'Email segment for publish email')
    .action(async (options, command) => {
      const global = getGlobalOptions(command);
      const parsed = PostCreateInputSchema.safeParse({
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
        authors: options.authors,
        featured: parseBooleanFlag(options.featured),
        visibility: options.visibility,
        tier: options.tier,
        excerpt: options.excerpt,
        metaTitle: options.metaTitle,
        metaDescription: options.metaDescription,
        ogTitle: options.ogTitle,
        ogImage: options.ogImage,
        codeInjectionHead: options.codeInjectionHead,
        newsletter: options.newsletter,
        emailOnly: parseBooleanFlag(options.emailOnly),
        emailSegment: options.emailSegment,
      });

      if (!parsed.success) {
        throwValidationError(parsed.error);
      }

      const fromJson = await readOptionalPostJson(parsed.data.fromJson);
      const htmlFromFile = await readOptionalFile(parsed.data.htmlFile);
      const lexicalFromFile = await readOptionalFile(parsed.data.lexicalFile);
      const markdownFromFile = await readOptionalFile(parsed.data.markdownFile);
      const markdownFromStdin = await readOptionalStdin(parsed.data.markdownStdin);
      const rawHtmlFromFile = await readOptionalFile(parsed.data.htmlRawFile);

      const markdown = markdownFromStdin ?? markdownFromFile;
      const renderedMarkdown = markdown ? markdownRenderer.render(markdown) : undefined;
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
          status:
            parsed.data.status ??
            (typeof fromJson.status === 'string' ? fromJson.status : undefined) ??
            'draft',
          published_at: parsed.data.publishAt,
          html,
          lexical,
          tags: parseCsv(parsed.data.tags),
          authors: parseCsv(parsed.data.authors),
          featured: parsed.data.featured,
          visibility: parsed.data.visibility,
          tiers: parsed.data.tier ? [{ slug: parsed.data.tier }] : undefined,
          custom_excerpt: parsed.data.excerpt,
          meta_title: parsed.data.metaTitle,
          meta_description: parsed.data.metaDescription,
          og_title: parsed.data.ogTitle,
          og_image: parsed.data.ogImage,
          codeinjection_head: parsed.data.codeInjectionHead,
          newsletter: parsed.data.newsletter,
          email_only: parsed.data.emailOnly,
          email_segment: parsed.data.emailSegment,
        },
      );

      const payload = await createPost(global, createPayload, source);

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
    .option('--markdown-file <path>', 'Path to Markdown file')
    .option('--markdown-stdin', 'Read Markdown content from stdin')
    .option('--html-raw-file <path>', 'Path to raw HTML file wrapped in an HTML card')
    .option('--from-json <path>', 'Read post patch from JSON file')
    .option('--tags <tags>', 'Comma separated tag names')
    .option('--authors <authors>', 'Comma separated author emails')
    .option('--featured <value>', 'true|false')
    .option('--visibility <visibility>', 'public|members|paid|tiers')
    .option('--tier <slug>', 'Tier slug for tier visibility access')
    .option('--excerpt <excerpt>', 'Custom excerpt')
    .option('--meta-title <title>', 'Meta title')
    .option('--meta-description <description>', 'Meta description')
    .option('--og-title <title>', 'Open Graph title')
    .option('--og-image <url>', 'Open Graph image URL')
    .option('--code-injection-head <value>', 'Code injection head HTML')
    .option('--newsletter <slug>', 'Newsletter slug')
    .option('--email-only <value>', 'true|false')
    .option('--email-segment <segment>', 'Email segment')
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
        markdownFile: options.markdownFile,
        markdownStdin: parseBooleanFlag(options.markdownStdin),
        htmlRawFile: options.htmlRawFile,
        fromJson: options.fromJson,
        tags: options.tags,
        authors: options.authors,
        featured: parseBooleanFlag(options.featured),
        visibility: options.visibility,
        tier: options.tier,
        excerpt: options.excerpt,
        metaTitle: options.metaTitle,
        metaDescription: options.metaDescription,
        ogTitle: options.ogTitle,
        ogImage: options.ogImage,
        codeInjectionHead: options.codeInjectionHead,
        newsletter: options.newsletter,
        emailOnly: parseBooleanFlag(options.emailOnly),
        emailSegment: options.emailSegment,
      });

      if (!parsed.success) {
        throwValidationError(parsed.error);
      }

      const fromJson = await readOptionalPostJson(parsed.data.fromJson);
      const htmlFromFile = await readOptionalFile(parsed.data.htmlFile);
      const lexicalFromFile = await readOptionalFile(parsed.data.lexicalFile);
      const markdownFromFile = await readOptionalFile(parsed.data.markdownFile);
      const markdownFromStdin = await readOptionalStdin(parsed.data.markdownStdin);
      const rawHtmlFromFile = await readOptionalFile(parsed.data.htmlRawFile);

      const markdown = markdownFromStdin ?? markdownFromFile;
      const renderedMarkdown = markdown ? markdownRenderer.render(markdown) : undefined;
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

      const patch = assignDefined(
        { ...fromJson },
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
          tiers: parsed.data.tier ? [{ slug: parsed.data.tier }] : undefined,
          custom_excerpt: parsed.data.excerpt,
          meta_title: parsed.data.metaTitle,
          meta_description: parsed.data.metaDescription,
          og_title: parsed.data.ogTitle,
          og_image: parsed.data.ogImage,
          codeinjection_head: parsed.data.codeInjectionHead,
          newsletter: parsed.data.newsletter,
          email_only: parsed.data.emailOnly,
          email_segment: parsed.data.emailSegment,
        },
      );

      const payload = await updatePost(global, {
        id: parsed.data.id,
        slug: parsed.data.slug,
        patch,
        source,
      });

      if (global.json) {
        printJson(payload, global.jq);
        return;
      }

      printPostHuman(payload);
    });

  post
    .command('delete [id]')
    .description('Delete a post')
    .option('--filter <nql>', 'NQL filter to delete matching posts')
    .option('--yes', 'Skip confirmation')
    .action(async (id: string | undefined, options, command) => {
      const global = getGlobalOptions(command);
      const parsed = PostDeleteInputSchema.safeParse({
        id,
        filter: options.filter,
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

        const label = parsed.data.filter
          ? `Delete posts matching '${parsed.data.filter}'`
          : `Delete post '${parsed.data.id}'`;
        const ok = await confirm(`${label}? [y/N]: `);
        if (!ok) {
          throw new GhstError('Operation cancelled.', {
            code: 'OPERATION_CANCELLED',
            exitCode: ExitCode.OPERATION_CANCELLED,
          });
        }
      }

      if (parsed.data.filter) {
        const payload = await bulkPosts(global, {
          filter: parsed.data.filter,
          delete: true,
        });
        if (global.json) {
          printJson(payload, global.jq);
          return;
        }
        const stats = (payload.bulk as Record<string, unknown> | undefined)?.meta as
          | Record<string, unknown>
          | undefined;
        const statValues = (stats?.stats as Record<string, unknown> | undefined) ?? {};
        console.log(
          `Bulk operation complete: ${String(statValues.successful ?? 0)} successful, ${String(statValues.unsuccessful ?? 0)} unsuccessful`,
        );
        return;
      }

      await deletePost(global, parsed.data.id ?? '');

      if (global.json) {
        printJson({ ok: true, id: parsed.data.id ?? null });
        return;
      }

      console.log(`Deleted post '${parsed.data.id ?? ''}'.`);
    });

  post
    .command('publish <id>')
    .description('Publish a post')
    .option('--newsletter <slug>', 'Newsletter slug')
    .option('--email-segment <segment>', 'Email segment')
    .option('--email-only', 'Email only publish')
    .action(async (id: string, options, command) => {
      const global = getGlobalOptions(command);
      const parsed = PostPublishInputSchema.safeParse({
        id,
        newsletter: options.newsletter,
        emailOnly: parseBooleanFlag(options.emailOnly),
        emailSegment: options.emailSegment,
      });

      if (!parsed.success) {
        throwValidationError(parsed.error);
      }

      const payload = await publishPost(global, parsed.data.id, {
        newsletter: parsed.data.newsletter,
        email_only: parsed.data.emailOnly,
        email_segment: parsed.data.emailSegment,
      });

      if (global.json) {
        printJson(payload, global.jq);
        return;
      }

      printPostHuman(payload);
    });

  post
    .command('schedule <id>')
    .description('Schedule a post')
    .requiredOption('--at <datetime>', 'ISO datetime for scheduled publish')
    .action(async (id: string, options, command) => {
      const global = getGlobalOptions(command);
      const parsed = PostScheduleInputSchema.safeParse({
        id,
        at: options.at,
      });

      if (!parsed.success) {
        throwValidationError(parsed.error);
      }

      const payload = await schedulePost(global, parsed.data.id, parsed.data.at);
      if (global.json) {
        printJson(payload, global.jq);
        return;
      }
      printPostHuman(payload);
    });

  post
    .command('unschedule <id>')
    .description('Unschedule a post')
    .action(async (id: string, _, command) => {
      const global = getGlobalOptions(command);
      const parsed = PostUnscheduleInputSchema.safeParse({ id });

      if (!parsed.success) {
        throwValidationError(parsed.error);
      }

      const payload = await unschedulePost(global, parsed.data.id);
      if (global.json) {
        printJson(payload, global.jq);
        return;
      }
      printPostHuman(payload);
    });

  post
    .command('copy <id>')
    .description('Copy a post')
    .action(async (id: string, _, command) => {
      const global = getGlobalOptions(command);
      const parsed = PostCopyInputSchema.safeParse({ id });

      if (!parsed.success) {
        throwValidationError(parsed.error);
      }

      const payload = await copyPost(global, parsed.data.id);
      if (global.json) {
        printJson(payload, global.jq);
        return;
      }
      printPostHuman(payload);
    });

  post
    .command('bulk')
    .description('Run bulk post operations')
    .requiredOption('--filter <nql>', 'NQL filter to select posts')
    .option('--action <action>', 'update|delete')
    .option('--update', 'Alias for --action update')
    .option('--delete', 'Alias for --action delete')
    .option('--status <status>', 'Status to set for bulk update')
    .option('--tags <tags>', 'Comma separated tags for bulk update')
    .option('--add-tag <tags>', 'Comma separated tags to add to existing post tags')
    .option('--authors <authors>', 'Comma separated author emails for bulk update')
    .option('--yes', 'Confirm bulk delete')
    .action(async (options, command) => {
      const global = getGlobalOptions(command);
      const parsed = PostBulkInputSchema.safeParse({
        filter: options.filter,
        action: options.action,
        update: parseBooleanFlag(options.update),
        delete: parseBooleanFlag(options.delete),
        status: options.status,
        tags: options.tags,
        addTag: options.addTag,
        authors: options.authors,
        yes: options.yes,
      });

      if (!parsed.success) {
        throwValidationError(parsed.error);
      }

      const action = parsed.data.action ?? (parsed.data.delete ? 'delete' : 'update');
      const payload = await bulkPosts(global, {
        filter: parsed.data.filter,
        delete: action === 'delete',
        status: parsed.data.status,
        tags: parseCsv(parsed.data.tags),
        addTags: parseCsv(parsed.data.addTag),
        authors: parseCsv(parsed.data.authors),
      });
      if (global.json) {
        printJson(payload, global.jq);
        return;
      }

      const stats = (payload.bulk as Record<string, unknown> | undefined)?.meta as
        | Record<string, unknown>
        | undefined;
      const statValues = (stats?.stats as Record<string, unknown> | undefined) ?? {};
      console.log(
        `Bulk operation complete: ${String(statValues.successful ?? 0)} successful, ${String(statValues.unsuccessful ?? 0)} unsuccessful`,
      );
    });
}
