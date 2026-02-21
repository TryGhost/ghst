import type { Command } from 'commander';
import { getGlobalOptions } from '../lib/context.js';
import { ExitCode, GhstError } from '../lib/errors.js';
import { printJson, printUserHuman, printUserListHuman } from '../lib/output.js';
import { parseInteger } from '../lib/parse.js';
import { getCurrentUser, getUser, listUsers } from '../lib/users.js';
import { UserGetInputSchema, UserListInputSchema, UserMeInputSchema } from '../schemas/user.js';

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

export function registerUserCommands(program: Command): void {
  const user = program.command('user').description('User management');

  user
    .command('list')
    .description('List users')
    .option('--limit <numberOrAll>', 'Number of users per page or "all"')
    .option('--page <number>', 'Page number')
    .option('--filter <nql>', 'NQL filter')
    .option('--include <relations>', 'Include relationships')
    .option('--fields <fields>', 'Select output fields')
    .option('--order <order>', 'Sort order')
    .action(async (options, command) => {
      const global = getGlobalOptions(command);
      const rawLimit = options.limit === 'all' ? 'all' : parseInteger(options.limit, 'limit');
      const rawPage = parseInteger(options.page, 'page');

      const parsed = UserListInputSchema.safeParse({
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
      const payload = await listUsers(
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

      printUserListHuman(payload, global.color !== false);
    });

  user
    .command('get [id]')
    .description('Get a user by id, slug, or email')
    .option('--slug <slug>', 'User slug')
    .option('--email <email>', 'User email')
    .option('--include <relations>', 'Include relationships')
    .option('--fields <fields>', 'Select output fields')
    .action(async (id: string | undefined, options, command) => {
      const global = getGlobalOptions(command);
      const parsed = UserGetInputSchema.safeParse({
        id,
        slug: options.slug,
        email: options.email,
        include: options.include,
        fields: options.fields,
      });

      if (!parsed.success) {
        throwValidationError(parsed.error);
      }

      const payload = await getUser(global, {
        id: parsed.data.id,
        slug: parsed.data.slug,
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

      printUserHuman(payload);
    });

  user
    .command('me')
    .description('Get current authenticated user')
    .option('--include <relations>', 'Include relationships')
    .option('--fields <fields>', 'Select output fields')
    .action(async (options, command) => {
      const global = getGlobalOptions(command);
      const parsed = UserMeInputSchema.safeParse({
        include: options.include,
        fields: options.fields,
      });

      if (!parsed.success) {
        throwValidationError(parsed.error);
      }

      const payload = await getCurrentUser(global, {
        include: parsed.data.include,
        fields: parsed.data.fields,
      });

      if (global.json) {
        printJson(payload, global.jq);
        return;
      }

      printUserHuman(payload);
    });
}
