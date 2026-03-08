import type { Command } from 'commander';
import {
  getComment,
  getCommentThread,
  listCommentLikes,
  listCommentReplies,
  listCommentReports,
  listComments,
  setCommentStatus,
} from '../lib/comments.js';
import { getGlobalOptions } from '../lib/context.js';
import { ExitCode, GhstError } from '../lib/errors.js';
import {
  printCommentHuman,
  printCommentLikesHuman,
  printCommentListHuman,
  printCommentReportsHuman,
  printCommentThreadHuman,
  printJson,
} from '../lib/output.js';
import { parseInteger } from '../lib/parse.js';
import { confirm } from '../lib/prompts.js';
import { isNonInteractive } from '../lib/tty.js';
import {
  CommentDeleteInputSchema,
  CommentGetInputSchema,
  CommentListInputSchema,
  CommentRelationListInputSchema,
  CommentRepliesInputSchema,
  CommentStatusInputSchema,
  CommentThreadInputSchema,
} from '../schemas/comment.js';

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

export function registerCommentCommands(program: Command): void {
  const comment = program.command('comment').description('Comment moderation');

  comment
    .command('list')
    .description('List comments across the site')
    .option('--limit <numberOrAll>', 'Number of comments per page or "all"')
    .option('--page <number>', 'Page number')
    .option('--filter <nql>', 'NQL filter')
    .option('--order <order>', 'Sort order')
    .option('--top-level-only', 'Only include top-level comments')
    .action(async (options, command) => {
      const global = getGlobalOptions(command);
      const rawLimit = options.limit === 'all' ? 'all' : parseInteger(options.limit, 'limit');
      const rawPage = parseInteger(options.page, 'page');

      const parsed = CommentListInputSchema.safeParse({
        limit: rawLimit,
        page: rawPage,
        filter: options.filter,
        order: options.order,
        topLevelOnly: options.topLevelOnly,
      });

      if (!parsed.success) {
        throwValidationError(parsed.error);
      }

      const allPages = parsed.data.limit === 'all';
      const payload = await listComments(
        global,
        {
          limit: parsed.data.limit === 'all' ? undefined : parsed.data.limit,
          page: parsed.data.page,
          filter: parsed.data.filter,
          order: parsed.data.order,
          includeNested: !parsed.data.topLevelOnly,
        },
        allPages,
      );

      if (global.json) {
        printJson(payload, global.jq);
        return;
      }

      printCommentListHuman(payload, global.color !== false);
    });

  comment
    .command('get <id>')
    .description('Get a comment by id with Admin moderation fields')
    .action(async (id: string, _options, command) => {
      const global = getGlobalOptions(command);
      const parsed = CommentGetInputSchema.safeParse({ id });

      if (!parsed.success) {
        throwValidationError(parsed.error);
      }

      const payload = await getComment(global, parsed.data.id);

      if (global.json) {
        printJson(payload, global.jq);
        return;
      }

      printCommentHuman(payload);
    });

  comment
    .command('thread <id>')
    .description('Open a comment thread using the Admin moderation view')
    .action(async (id: string, _options, command) => {
      const global = getGlobalOptions(command);
      const parsed = CommentThreadInputSchema.safeParse({ id });

      if (!parsed.success) {
        throwValidationError(parsed.error);
      }

      const payload = await getCommentThread(global, parsed.data.id);

      if (global.json) {
        printJson(payload, global.jq);
        return;
      }

      printCommentThreadHuman(payload, global.color !== false);
    });

  comment
    .command('replies <id>')
    .description('List replies for a comment via the raw replies endpoint')
    .option('--limit <numberOrAll>', 'Number of replies per page or "all"')
    .option('--page <number>', 'Page number')
    .option('--filter <nql>', 'NQL filter')
    .action(async (id: string, options, command) => {
      const global = getGlobalOptions(command);
      const rawLimit = options.limit === 'all' ? 'all' : parseInteger(options.limit, 'limit');
      const rawPage = parseInteger(options.page, 'page');

      const parsed = CommentRepliesInputSchema.safeParse({
        id,
        limit: rawLimit,
        page: rawPage,
        filter: options.filter,
      });

      if (!parsed.success) {
        throwValidationError(parsed.error);
      }

      const allPages = parsed.data.limit === 'all';
      const payload = await listCommentReplies(
        global,
        parsed.data.id,
        {
          limit: parsed.data.limit === 'all' ? undefined : parsed.data.limit,
          page: parsed.data.page,
          filter: parsed.data.filter,
        },
        allPages,
      );

      if (global.json) {
        printJson(payload, global.jq);
        return;
      }

      printCommentListHuman(payload, global.color !== false);
    });

  comment
    .command('likes <id>')
    .description('List likes for a comment')
    .option('--limit <numberOrAll>', 'Number of likes per page or "all"')
    .option('--page <number>', 'Page number')
    .action(async (id: string, options, command) => {
      const global = getGlobalOptions(command);
      const rawLimit = options.limit === 'all' ? 'all' : parseInteger(options.limit, 'limit');
      const rawPage = parseInteger(options.page, 'page');

      const parsed = CommentRelationListInputSchema.safeParse({
        id,
        limit: rawLimit,
        page: rawPage,
      });

      if (!parsed.success) {
        throwValidationError(parsed.error);
      }

      const allPages = parsed.data.limit === 'all';
      const payload = await listCommentLikes(
        global,
        parsed.data.id,
        {
          limit: parsed.data.limit === 'all' ? undefined : parsed.data.limit,
          page: parsed.data.page,
        },
        allPages,
      );

      if (global.json) {
        printJson(payload, global.jq);
        return;
      }

      printCommentLikesHuman(payload, global.color !== false);
    });

  comment
    .command('reports <id>')
    .description('List reports for a comment')
    .option('--limit <numberOrAll>', 'Number of reports per page or "all"')
    .option('--page <number>', 'Page number')
    .action(async (id: string, options, command) => {
      const global = getGlobalOptions(command);
      const rawLimit = options.limit === 'all' ? 'all' : parseInteger(options.limit, 'limit');
      const rawPage = parseInteger(options.page, 'page');

      const parsed = CommentRelationListInputSchema.safeParse({
        id,
        limit: rawLimit,
        page: rawPage,
      });

      if (!parsed.success) {
        throwValidationError(parsed.error);
      }

      const allPages = parsed.data.limit === 'all';
      const payload = await listCommentReports(
        global,
        parsed.data.id,
        {
          limit: parsed.data.limit === 'all' ? undefined : parsed.data.limit,
          page: parsed.data.page,
        },
        allPages,
      );

      if (global.json) {
        printJson(payload, global.jq);
        return;
      }

      printCommentReportsHuman(payload, global.color !== false);
    });

  comment
    .command('hide <id>')
    .description('Hide a comment')
    .action(async (id: string, _options, command) => {
      const global = getGlobalOptions(command);
      const parsed = CommentStatusInputSchema.safeParse({ id });

      if (!parsed.success) {
        throwValidationError(parsed.error);
      }

      const payload = await setCommentStatus(global, parsed.data.id, 'hidden');

      if (global.json) {
        printJson(payload, global.jq);
        return;
      }

      printCommentHuman(payload);
    });

  comment
    .command('show <id>')
    .description('Show a previously hidden comment')
    .action(async (id: string, _options, command) => {
      const global = getGlobalOptions(command);
      const parsed = CommentStatusInputSchema.safeParse({ id });

      if (!parsed.success) {
        throwValidationError(parsed.error);
      }

      const payload = await setCommentStatus(global, parsed.data.id, 'published');

      if (global.json) {
        printJson(payload, global.jq);
        return;
      }

      printCommentHuman(payload);
    });

  comment
    .command('delete <id>')
    .description('Delete a comment')
    .option('--yes', 'Skip confirmation')
    .action(async (id: string, options, command) => {
      const global = getGlobalOptions(command);
      const parsed = CommentDeleteInputSchema.safeParse({
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

        const ok = await confirm(`Delete comment '${parsed.data.id}'? [y/N]: `);
        if (!ok) {
          throw new GhstError('Operation cancelled.', {
            code: 'OPERATION_CANCELLED',
            exitCode: ExitCode.OPERATION_CANCELLED,
          });
        }
      }

      const payload = await setCommentStatus(global, parsed.data.id, 'deleted');

      if (global.json) {
        printJson(payload, global.jq);
        return;
      }

      printCommentHuman(payload);
    });
}
