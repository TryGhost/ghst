import type { Command } from 'commander';
import { GhostClient } from '../lib/client.js';
import { getGlobalOptions } from '../lib/context.js';
import { resolveConnectionConfig } from '../lib/config.js';
import { ExitCode, GhstError } from '../lib/errors.js';
import { isJsonMode, printJson, printPostHuman, printPostListHuman } from '../lib/output.js';
import { PostGetInputSchema, PostListInputSchema } from '../schemas/post.js';
import { registerNotImplemented } from './stub.js';

export function registerPostCommands(program: Command): void {
  const post = program.command('post').description('Post management');

  post
    .command('list')
    .description('List posts')
    .option('--limit <number>', 'Number of posts per page')
    .option('--page <number>', 'Page number')
    .option('--filter <nql>', 'NQL filter')
    .option('--status <status>', 'Post status filter')
    .option('--include <relations>', 'Include relationships')
    .option('--fields <fields>', 'Select output fields')
    .option('--order <order>', 'Sort order')
    .action(async (options, command) => {
      const global = getGlobalOptions(command);
      const parsed = PostListInputSchema.safeParse({
        limit: options.limit ? Number(options.limit) : undefined,
        page: options.page ? Number(options.page) : undefined,
        filter: options.filter,
        status: options.status,
        include: options.include,
        fields: options.fields,
        order: options.order,
      });

      if (!parsed.success) {
        throw new GhstError(parsed.error.issues.map((issue) => issue.message).join('; '), {
          exitCode: ExitCode.VALIDATION_ERROR,
          code: 'VALIDATION_ERROR',
          details: parsed.error.flatten(),
        });
      }

      const connection = await resolveConnectionConfig(global);
      const client = new GhostClient({
        url: connection.url,
        key: connection.key,
        version: connection.apiVersion,
      });

      const payload = await client.posts.browse(parsed.data);
      if (isJsonMode(global)) {
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
        throw new GhstError(parsed.error.issues.map((issue) => issue.message).join('; '), {
          exitCode: ExitCode.VALIDATION_ERROR,
          code: 'VALIDATION_ERROR',
          details: parsed.error.flatten(),
        });
      }

      if (!parsed.data.id && !parsed.data.slug) {
        throw new GhstError('Provide an id argument or --slug.', {
          exitCode: ExitCode.USAGE_ERROR,
          code: 'USAGE_ERROR',
        });
      }

      const connection = await resolveConnectionConfig(global);
      const client = new GhostClient({
        url: connection.url,
        key: connection.key,
        version: connection.apiVersion,
      });

      const payload = await client.posts.read(parsed.data.slug ?? parsed.data.id!, {
        bySlug: Boolean(parsed.data.slug),
        params: {
          include: parsed.data.include,
          fields: parsed.data.fields,
          formats: parsed.data.formats,
        },
      });

      if (isJsonMode(global)) {
        printJson(payload, global.jq);
        return;
      }

      printPostHuman(payload);
    });

  registerNotImplemented(post, 'create', 'Create a post', 'post create');
  registerNotImplemented(post, 'update', 'Update a post', 'post update');
  registerNotImplemented(post, 'delete', 'Delete a post', 'post delete');
  registerNotImplemented(post, 'publish', 'Publish a post', 'post publish');
}
