import fs from 'node:fs/promises';
import type { Command } from 'commander';
import { getGlobalOptions } from '../lib/context.js';
import { ExitCode, GhstError } from '../lib/errors.js';
import {
  printJson,
  printSocialWebAccountHuman,
  printSocialWebAccountsHuman,
  printSocialWebNotificationsHuman,
  printSocialWebPostsHuman,
  printSocialWebStatusHuman,
  printSocialWebThreadHuman,
} from '../lib/output.js';
import { parseBooleanFlag, parseInteger } from '../lib/parse.js';
import {
  blockAccount,
  blockDomain,
  createNote,
  deleteSocialWebPost,
  derepostPost,
  disableSocialWeb,
  enableSocialWeb,
  followAccount,
  getNotificationsCount,
  getSocialWebPost,
  getSocialWebProfile,
  getSocialWebStatus,
  getSocialWebThread,
  likePost,
  listBlockedAccounts,
  listBlockedDomains,
  listFollowers,
  listFollowing,
  listNotes,
  listNotifications,
  listReader,
  listSocialWebLikes,
  listSocialWebPosts,
  replyToPost,
  repostPost,
  searchSocialWeb,
  unblockAccount,
  unblockDomain,
  unfollowAccount,
  unlikePost,
  updateSocialWebProfile,
  uploadSocialWebImage,
} from '../lib/socialweb.js';
import {
  SocialWebBlockDomainInputSchema,
  SocialWebContentInputSchema,
  SocialWebFollowsInputSchema,
  SocialWebHandleActionInputSchema,
  SocialWebIdInputSchema,
  SocialWebPaginatedInputSchema,
  SocialWebProfileInputSchema,
  SocialWebProfileUpdateInputSchema,
  SocialWebReplyInputSchema,
  SocialWebSearchInputSchema,
  SocialWebUploadInputSchema,
} from '../schemas/socialweb.js';

function throwValidationError(error: unknown): never {
  throw new GhstError(
    (error as { issues?: Array<{ message: string }> }).issues
      ?.map((issue) => issue.message)
      .join('; ') ?? 'Validation failed',
    {
      exitCode: ExitCode.VALIDATION_ERROR,
      code: 'VALIDATION_ERROR',
      details: error,
    },
  );
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

function parsePagination(options: { limit?: string; next?: string; all?: unknown }) {
  return {
    limit: parseInteger(options.limit, 'limit'),
    next: options.next,
    all: parseBooleanFlag(options.all),
  };
}

function printSocialWebReadPayload(
  commandName: string,
  payload: Record<string, unknown>,
  global: ReturnType<typeof getGlobalOptions>,
): void {
  if (global.json) {
    printJson(payload, global.jq);
    return;
  }

  switch (commandName) {
    case 'status':
    case 'enable':
    case 'disable':
      printSocialWebStatusHuman(payload, global.color !== false);
      return;
    case 'profile':
    case 'profile-update':
    case 'search':
    case 'follow':
      if (Array.isArray(payload.accounts)) {
        printSocialWebAccountsHuman(payload, global.color !== false);
        return;
      }
      printSocialWebAccountHuman(payload, global.color !== false);
      return;
    case 'notes':
    case 'reader':
    case 'posts':
    case 'likes':
    case 'post':
    case 'note':
    case 'reply':
      printSocialWebPostsHuman(payload, global.color !== false);
      return;
    case 'notifications':
      printSocialWebNotificationsHuman(payload, global.color !== false);
      return;
    case 'followers':
    case 'following':
    case 'blocked-accounts':
    case 'blocked-domains':
      printSocialWebAccountsHuman(payload, global.color !== false);
      return;
    case 'thread':
      printSocialWebThreadHuman(payload, global.color !== false);
      return;
    default:
      console.log(JSON.stringify(payload, null, 2));
  }
}

export function registerSocialWebCommands(program: Command): void {
  const socialweb = program.command('socialweb').description('Ghost social web management');

  socialweb
    .command('status')
    .description('Show social web settings and connectivity status')
    .action(async (_, command) => {
      const global = getGlobalOptions(command);
      const payload = await getSocialWebStatus(global);
      printSocialWebReadPayload('status', payload as unknown as Record<string, unknown>, global);
    });

  socialweb
    .command('enable')
    .description('Enable social web in Ghost settings')
    .action(async (_, command) => {
      const global = getGlobalOptions(command);
      const payload = await enableSocialWeb(global);
      printSocialWebReadPayload('enable', payload as unknown as Record<string, unknown>, global);
      if (global.json) {
        return;
      }

      const report = payload as { settings?: { social_web?: boolean }; reachable?: boolean };
      if (report.settings?.social_web && report.reachable === false) {
        console.log(
          'Warning: Social web is enabled, but the social web service is not reachable yet.',
        );
      }
    });

  socialweb
    .command('disable')
    .description('Disable social web in Ghost settings')
    .action(async (_, command) => {
      const global = getGlobalOptions(command);
      const payload = await disableSocialWeb(global);
      printSocialWebReadPayload('disable', payload as unknown as Record<string, unknown>, global);
    });

  socialweb
    .command('profile [handle]')
    .description('Show a social web profile')
    .action(async (handle: string | undefined, _, command) => {
      const global = getGlobalOptions(command);
      const parsed = SocialWebProfileInputSchema.safeParse({ handle: handle ?? 'me' });
      if (!parsed.success) {
        throwValidationError(parsed.error);
      }

      const payload = await getSocialWebProfile(global, parsed.data.handle);
      printSocialWebReadPayload('profile', payload as unknown as Record<string, unknown>, global);
    });

  socialweb
    .command('profile-update')
    .description('Update the current social web profile')
    .option('--name <name>', 'Profile display name')
    .option('--username <username>', 'Profile username')
    .option('--bio <bio>', 'Profile bio')
    .option('--avatar-url <url>', 'Avatar image URL')
    .option('--banner-image-url <url>', 'Banner image URL')
    .action(async (options, command) => {
      const global = getGlobalOptions(command);
      const parsed = SocialWebProfileUpdateInputSchema.safeParse({
        name: options.name,
        username: options.username,
        bio: options.bio,
        avatarUrl: options.avatarUrl,
        bannerImageUrl: options.bannerImageUrl,
      });
      if (!parsed.success) {
        throwValidationError(parsed.error);
      }

      const payload = await updateSocialWebProfile(global, parsed.data);
      printSocialWebReadPayload(
        'profile-update',
        payload as unknown as Record<string, unknown>,
        global,
      );
    });

  socialweb
    .command('search <query>')
    .description('Search social web accounts')
    .action(async (query: string, _, command) => {
      const global = getGlobalOptions(command);
      const parsed = SocialWebSearchInputSchema.safeParse({ query });
      if (!parsed.success) {
        throwValidationError(parsed.error);
      }

      const payload = await searchSocialWeb(global, parsed.data.query);
      printSocialWebReadPayload('search', payload, global);
    });

  for (const entry of [
    ['notes', listNotes, 'Show note feed'],
    ['reader', listReader, 'Show reader feed'],
    ['notifications', listNotifications, 'Show notifications'],
    ['likes', listSocialWebLikes, 'Show liked posts'],
  ] as const) {
    socialweb
      .command(entry[0])
      .description(entry[2])
      .option('--limit <number>', 'Items per page')
      .option('--next <cursor>', 'Pagination cursor')
      .option('--all', 'Fetch all available pages')
      .action(async (options, command) => {
        const global = getGlobalOptions(command);
        const parsed = SocialWebPaginatedInputSchema.safeParse(parsePagination(options));
        if (!parsed.success) {
          throwValidationError(parsed.error);
        }

        const payload = await entry[1](
          global,
          {
            limit: parsed.data.limit,
            next: parsed.data.next,
          },
          Boolean(parsed.data.all),
        );
        printSocialWebReadPayload(entry[0], payload, global);
      });
  }

  socialweb
    .command('notifications-count')
    .description('Show unread notification count')
    .action(async (_, command) => {
      const global = getGlobalOptions(command);
      const payload = await getNotificationsCount(global);
      if (global.json) {
        printJson(payload, global.jq);
        return;
      }
      console.log(String(payload.count ?? 0));
    });

  socialweb
    .command('posts [handle]')
    .description('List posts for a social web account')
    .option('--limit <number>', 'Items per page')
    .option('--next <cursor>', 'Pagination cursor')
    .option('--all', 'Fetch all available pages')
    .action(async (handle: string | undefined, options, command) => {
      const global = getGlobalOptions(command);
      const handleValue = handle ?? 'me';
      const pagination = parsePagination(options);
      const parsedHandle = SocialWebProfileInputSchema.safeParse({ handle: handleValue });
      const parsedPagination = SocialWebPaginatedInputSchema.safeParse(pagination);
      if (!parsedHandle.success) {
        throwValidationError(parsedHandle.error);
      }
      if (!parsedPagination.success) {
        throwValidationError(parsedPagination.error);
      }

      const payload = await listSocialWebPosts(
        global,
        parsedHandle.data.handle,
        { limit: parsedPagination.data.limit, next: parsedPagination.data.next },
        Boolean(parsedPagination.data.all),
      );
      printSocialWebReadPayload('posts', payload, global);
    });

  for (const entry of [
    ['followers', listFollowers, 'List followers'],
    ['following', listFollowing, 'List following'],
  ] as const) {
    socialweb
      .command(`${entry[0]} [handle]`)
      .description(entry[2])
      .option('--limit <number>', 'Items per page')
      .option('--next <cursor>', 'Pagination cursor')
      .option('--all', 'Fetch all available pages')
      .action(async (handle: string | undefined, options, command) => {
        const global = getGlobalOptions(command);
        const parsed = SocialWebFollowsInputSchema.safeParse({
          handle: handle ?? 'me',
          limit: parseInteger(options.limit, 'limit'),
          next: options.next,
          all: parseBooleanFlag(options.all),
        });
        if (!parsed.success) {
          throwValidationError(parsed.error);
        }

        const payload = await entry[1](
          global,
          parsed.data.handle,
          { limit: parsed.data.limit, next: parsed.data.next },
          Boolean(parsed.data.all),
        );
        printSocialWebReadPayload(entry[0], payload, global);
      });
  }

  socialweb
    .command('post <id>')
    .description('Fetch a social web post by ActivityPub id')
    .action(async (id: string, _, command) => {
      const global = getGlobalOptions(command);
      const parsed = SocialWebIdInputSchema.safeParse({ id });
      if (!parsed.success) {
        throwValidationError(parsed.error);
      }

      const payload = await getSocialWebPost(global, parsed.data.id);
      printSocialWebReadPayload('post', payload as unknown as Record<string, unknown>, global);
    });

  socialweb
    .command('thread <id>')
    .description('Fetch a post thread by ActivityPub id')
    .action(async (id: string, _, command) => {
      const global = getGlobalOptions(command);
      const parsed = SocialWebIdInputSchema.safeParse({ id });
      if (!parsed.success) {
        throwValidationError(parsed.error);
      }

      const payload = await getSocialWebThread(global, parsed.data.id);
      printSocialWebReadPayload('thread', payload, global);
    });

  for (const entry of [
    ['follow', followAccount, 'Follow an account'],
    ['unfollow', unfollowAccount, 'Unfollow an account'],
  ] as const) {
    socialweb
      .command(`${entry[0]} <handle>`)
      .description(entry[2])
      .action(async (handle: string, _, command) => {
        const global = getGlobalOptions(command);
        const parsed = SocialWebHandleActionInputSchema.safeParse({ handle });
        if (!parsed.success) {
          throwValidationError(parsed.error);
        }

        const payload = await entry[1](global, parsed.data.handle);
        printSocialWebReadPayload(entry[0], payload, global);
      });
  }

  for (const entry of [
    ['like', likePost, 'Like a post'],
    ['unlike', unlikePost, 'Unlike a post'],
    ['repost', repostPost, 'Repost a post'],
    ['derepost', derepostPost, 'Undo repost on a post'],
    ['delete', deleteSocialWebPost, 'Delete a post'],
  ] as const) {
    socialweb
      .command(`${entry[0]} <id>`)
      .description(entry[2])
      .action(async (id: string, _, command) => {
        const global = getGlobalOptions(command);
        const parsed = SocialWebIdInputSchema.safeParse({ id });
        if (!parsed.success) {
          throwValidationError(parsed.error);
        }

        const payload = await entry[1](global, parsed.data.id);
        if (global.json) {
          printJson(payload, global.jq);
          return;
        }
        console.log(entry[0] === 'delete' ? 'Deleted post' : 'OK');
      });
  }

  socialweb
    .command('note')
    .description('Create a social web note')
    .option('--content <text>', 'Note content')
    .option('--stdin', 'Read note content from stdin')
    .option('--image-file <path>', 'Attach an image from a local file')
    .option('--image-url <url>', 'Attach an image by URL')
    .option('--image-alt <text>', 'Image alt text')
    .action(async (options, command) => {
      const global = getGlobalOptions(command);
      const parsed = SocialWebContentInputSchema.safeParse({
        content: options.content,
        stdin: parseBooleanFlag(options.stdin),
        imageFile: options.imageFile,
        imageUrl: options.imageUrl,
        imageAlt: options.imageAlt,
      });
      if (!parsed.success) {
        throwValidationError(parsed.error);
      }

      const stdin = await readOptionalStdin(parsed.data.stdin);
      const content = parsed.data.content ?? stdin;
      if (!content) {
        throw new GhstError('Note content cannot be empty.', {
          code: 'VALIDATION_ERROR',
          exitCode: ExitCode.VALIDATION_ERROR,
        });
      }

      const payload = await createNote(global, {
        content,
        imageFile: parsed.data.imageFile,
        imageUrl: parsed.data.imageUrl,
        imageAlt: parsed.data.imageAlt,
      });
      printSocialWebReadPayload('note', payload, global);
    });

  socialweb
    .command('reply <id>')
    .description('Reply to a social web post')
    .option('--content <text>', 'Reply content')
    .option('--stdin', 'Read reply content from stdin')
    .option('--image-file <path>', 'Attach an image from a local file')
    .option('--image-url <url>', 'Attach an image by URL')
    .option('--image-alt <text>', 'Image alt text')
    .action(async (id: string, options, command) => {
      const global = getGlobalOptions(command);
      const parsed = SocialWebReplyInputSchema.safeParse({
        id,
        content: options.content,
        stdin: parseBooleanFlag(options.stdin),
        imageFile: options.imageFile,
        imageUrl: options.imageUrl,
        imageAlt: options.imageAlt,
      });
      if (!parsed.success) {
        throwValidationError(parsed.error);
      }

      const stdin = await readOptionalStdin(parsed.data.stdin);
      const content = parsed.data.content ?? stdin;
      if (!content) {
        throw new GhstError('Reply content cannot be empty.', {
          code: 'VALIDATION_ERROR',
          exitCode: ExitCode.VALIDATION_ERROR,
        });
      }

      const payload = await replyToPost(global, parsed.data.id, {
        content,
        imageFile: parsed.data.imageFile,
        imageUrl: parsed.data.imageUrl,
        imageAlt: parsed.data.imageAlt,
      });
      printSocialWebReadPayload('reply', payload, global);
    });

  socialweb
    .command('blocked-accounts')
    .description('List blocked accounts')
    .option('--limit <number>', 'Items per page')
    .option('--next <cursor>', 'Pagination cursor')
    .option('--all', 'Fetch all available pages')
    .action(async (options, command) => {
      const global = getGlobalOptions(command);
      const parsed = SocialWebFollowsInputSchema.safeParse({
        handle: 'me',
        limit: parseInteger(options.limit, 'limit'),
        next: options.next,
        all: parseBooleanFlag(options.all),
      });
      if (!parsed.success) {
        throwValidationError(parsed.error);
      }

      const payload = await listBlockedAccounts(
        global,
        { limit: parsed.data.limit, next: parsed.data.next },
        Boolean(parsed.data.all),
      );
      printSocialWebReadPayload('blocked-accounts', payload, global);
    });

  socialweb
    .command('blocked-domains')
    .description('List blocked domains')
    .option('--limit <number>', 'Items per page')
    .option('--next <cursor>', 'Pagination cursor')
    .option('--all', 'Fetch all available pages')
    .action(async (options, command) => {
      const global = getGlobalOptions(command);
      const parsed = SocialWebFollowsInputSchema.safeParse({
        handle: 'me',
        limit: parseInteger(options.limit, 'limit'),
        next: options.next,
        all: parseBooleanFlag(options.all),
      });
      if (!parsed.success) {
        throwValidationError(parsed.error);
      }

      const payload = await listBlockedDomains(
        global,
        { limit: parsed.data.limit, next: parsed.data.next },
        Boolean(parsed.data.all),
      );
      printSocialWebReadPayload('blocked-domains', payload, global);
    });

  for (const entry of [
    ['block', blockAccount, 'Block an account'],
    ['unblock', unblockAccount, 'Unblock an account'],
  ] as const) {
    socialweb
      .command(`${entry[0]} <id>`)
      .description(entry[2])
      .action(async (id: string, _, command) => {
        const global = getGlobalOptions(command);
        const parsed = SocialWebIdInputSchema.safeParse({ id });
        if (!parsed.success) {
          throwValidationError(parsed.error);
        }

        const payload = await entry[1](global, parsed.data.id);
        if (global.json) {
          printJson(payload, global.jq);
          return;
        }
        console.log('OK');
      });
  }

  for (const entry of [
    ['block-domain', blockDomain, 'Block a domain'],
    ['unblock-domain', unblockDomain, 'Unblock a domain'],
  ] as const) {
    socialweb
      .command(`${entry[0]} <url>`)
      .description(entry[2])
      .action(async (url: string, _, command) => {
        const global = getGlobalOptions(command);
        const parsed = SocialWebBlockDomainInputSchema.safeParse({ url });
        if (!parsed.success) {
          throwValidationError(parsed.error);
        }

        const payload = await entry[1](global, parsed.data.url);
        if (global.json) {
          printJson(payload, global.jq);
          return;
        }
        console.log('OK');
      });
  }

  socialweb
    .command('upload <filePath>')
    .description('Upload an image for social web notes and replies')
    .action(async (filePath: string, _, command) => {
      const global = getGlobalOptions(command);
      const parsed = SocialWebUploadInputSchema.safeParse({ filePath });
      if (!parsed.success) {
        throwValidationError(parsed.error);
      }

      try {
        await fs.access(parsed.data.filePath);
      } catch {
        throw new GhstError(`File not found: ${parsed.data.filePath}`, {
          code: 'VALIDATION_ERROR',
          exitCode: ExitCode.VALIDATION_ERROR,
        });
      }

      const payload = await uploadSocialWebImage(global, parsed.data.filePath);
      if (global.json) {
        printJson(payload, global.jq);
        return;
      }
      console.log(String(payload.fileUrl ?? 'Uploaded image'));
    });
}
