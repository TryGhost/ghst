import { describe, expect, test } from 'vitest';
import { buildProgram } from '../src/index.js';
import { MCP_TOOL_GROUPS, registerCoreTools } from '../src/mcp/tools/core.js';

type ToolHandler = (args: Record<string, unknown>) => Promise<Record<string, unknown>>;

interface RegisteredTool {
  meta: Record<string, unknown>;
  handler: ToolHandler;
}

function getSubcommand(program: ReturnType<typeof buildProgram>, name: string) {
  const command = program.commands.find((entry) => entry.name() === name);
  expect(command, `Missing top-level command '${name}'`).toBeDefined();
  return command;
}

function getSubcommandNames(program: ReturnType<typeof buildProgram>, name: string): string[] {
  const command = getSubcommand(program, name);
  return command ? command.commands.map((entry) => entry.name()) : [];
}

function getSubcommandOptionNames(
  program: ReturnType<typeof buildProgram>,
  name: string,
  action: string,
): string[] {
  const root = getSubcommand(program, name);
  const command = root?.commands.find((entry) => entry.name() === action);
  expect(command, `Missing command '${name} ${action}'`).toBeDefined();
  return command
    ? command.options
        .map((option) => option.long)
        .filter((value): value is string => Boolean(value))
    : [];
}

function getSubcommandOption(
  program: ReturnType<typeof buildProgram>,
  name: string,
  action: string,
  long: string,
) {
  const root = getSubcommand(program, name);
  const command = root?.commands.find((entry) => entry.name() === action);
  expect(command, `Missing command '${name} ${action}'`).toBeDefined();
  const option = command?.options.find((entry) => entry.long === long);
  expect(option, `Missing option '${long}' on '${name} ${action}'`).toBeDefined();
  return option;
}

function createRegistry(): {
  server: {
    registerTool: (name: string, meta: Record<string, unknown>, handler: ToolHandler) => void;
  };
  tools: Map<string, RegisteredTool>;
} {
  const tools = new Map<string, RegisteredTool>();
  return {
    tools,
    server: {
      registerTool: (name, meta, handler) => {
        tools.set(name, { meta, handler });
      },
    },
  };
}

describe('PRD parity guardrails', () => {
  test('top-level command surface matches phase 1-4 target plus intentional extensions', () => {
    const program = buildProgram();
    const topLevel = program.commands.map((entry) => entry.name());

    const required = [
      'auth',
      'comment',
      'post',
      'page',
      'tag',
      'member',
      'newsletter',
      'tier',
      'offer',
      'label',
      'webhook',
      'user',
      'image',
      'theme',
      'site',
      'socialweb',
      'stats',
      'setting',
      'config',
      'api',
      'mcp',
      'migrate',
      'completion',
    ];

    for (const command of required) {
      expect(topLevel).toContain(command);
    }

    expect(topLevel).not.toContain('snippet');
  });

  test('comment moderation command surface remains registered', () => {
    const program = buildProgram();

    expect(getSubcommandNames(program, 'comment')).toEqual(
      expect.arrayContaining([
        'list',
        'get',
        'thread',
        'replies',
        'likes',
        'reports',
        'hide',
        'show',
        'delete',
      ]),
    );

    const listFlags = getSubcommandOptionNames(program, 'comment', 'list');
    const repliesFlags = getSubcommandOptionNames(program, 'comment', 'replies');
    const likesFlags = getSubcommandOptionNames(program, 'comment', 'likes');
    const deleteFlags = getSubcommandOptionNames(program, 'comment', 'delete');

    for (const flag of ['--limit', '--page']) {
      expect(listFlags).toContain(flag);
      expect(repliesFlags).toContain(flag);
      expect(likesFlags).toContain(flag);
    }

    expect(listFlags).toContain('--filter');
    expect(listFlags).toContain('--order');
    expect(listFlags).toContain('--top-level-only');
    expect(repliesFlags).toContain('--filter');
    expect(deleteFlags).toContain('--yes');
  });

  test('phase 4 actions remain registered for post/page/tag', () => {
    const program = buildProgram();

    expect(getSubcommandNames(program, 'post')).toEqual(
      expect.arrayContaining(['schedule', 'unschedule', 'copy', 'bulk']),
    );
    expect(getSubcommandNames(program, 'page')).toEqual(expect.arrayContaining(['copy', 'bulk']));
    expect(getSubcommandNames(program, 'tag')).toEqual(expect.arrayContaining(['bulk']));
  });

  test('stats command surface and shared analytics flags remain registered', () => {
    const program = buildProgram();

    expect(getSubcommandNames(program, 'stats')).toEqual(
      expect.arrayContaining(['overview', 'web', 'growth', 'posts', 'email', 'post']),
    );

    const webFlags = getSubcommandOptionNames(program, 'stats', 'web');
    const growthFlags = getSubcommandOptionNames(program, 'stats', 'growth');
    const postsFlags = getSubcommandOptionNames(program, 'stats', 'posts');
    const emailFlags = getSubcommandOptionNames(program, 'stats', 'email');
    const postFlags = getSubcommandOptionNames(program, 'stats', 'post');

    for (const flag of ['--range', '--from', '--to', '--timezone']) {
      expect(webFlags).toContain(flag);
      expect(growthFlags).toContain(flag);
      expect(postsFlags).toContain(flag);
      expect(emailFlags).toContain(flag);
      expect(postFlags).toContain(flag);
    }

    for (const flag of [
      '--audience',
      '--source',
      '--location',
      '--device',
      '--utm-source',
      '--utm-medium',
      '--utm-campaign',
      '--utm-content',
      '--utm-term',
      '--limit',
      '--csv',
      '--output',
    ]) {
      expect(webFlags).toContain(flag);
    }

    for (const flag of ['--limit', '--csv', '--output']) {
      expect(postsFlags).toContain(flag);
    }

    expect(emailFlags).toContain('--newsletter');
    expect(emailFlags).toContain('--post');
    expect(emailFlags).toContain('--csv');
    expect(postFlags).toContain('--csv');
  });

  test('post parity flags remain available', () => {
    const program = buildProgram();
    const postCreateFlags = getSubcommandOptionNames(program, 'post', 'create');
    const postUpdateFlags = getSubcommandOptionNames(program, 'post', 'update');
    const postPublishFlags = getSubcommandOptionNames(program, 'post', 'publish');
    const postScheduleFlags = getSubcommandOptionNames(program, 'post', 'schedule');
    const postDeleteFlags = getSubcommandOptionNames(program, 'post', 'delete');
    const postBulkFlags = getSubcommandOptionNames(program, 'post', 'bulk');

    for (const flag of [
      '--markdown-file',
      '--markdown-stdin',
      '--html-raw-file',
      '--from-json',
      '--feature-image',
      '--meta-title',
      '--meta-description',
      '--og-title',
      '--og-image',
      '--excerpt',
      '--code-injection-head',
      '--tier',
    ]) {
      expect(postCreateFlags).toContain(flag);
    }

    for (const flag of ['--from-json', '--feature-image', '--meta-title']) {
      expect(postUpdateFlags).toContain(flag);
    }

    for (const flag of ['--newsletter', '--email-segment', '--email-only']) {
      expect(postPublishFlags).toContain(flag);
      expect(postScheduleFlags).toContain(flag);
    }

    expect(postDeleteFlags).toContain('--filter');

    for (const flag of ['--update', '--delete', '--add-tag', '--authors']) {
      expect(postBulkFlags).toContain(flag);
    }

    const postCreateStatus = getSubcommandOption(program, 'post', 'create', '--status');
    expect(postCreateStatus?.defaultValue).toBeUndefined();
  });

  test('member/tier parity flags remain available', () => {
    const program = buildProgram();
    const memberListFlags = getSubcommandOptionNames(program, 'member', 'list');
    const memberUpdateFlags = getSubcommandOptionNames(program, 'member', 'update');
    const memberBulkFlags = getSubcommandOptionNames(program, 'member', 'bulk');
    const tierListFlags = getSubcommandOptionNames(program, 'tier', 'list');

    expect(memberListFlags).toContain('--status');
    expect(memberUpdateFlags).toContain('--expiry');
    expect(tierListFlags).toContain('--include');

    for (const flag of ['--update', '--delete', '--labels', '--yes']) {
      expect(memberBulkFlags).toContain(flag);
    }
  });

  test('mcp http hardening flags remain available', () => {
    const program = buildProgram();
    const httpFlags = getSubcommandOptionNames(program, 'mcp', 'http');

    expect(httpFlags).toContain('--unsafe-public-bind');
    expect(httpFlags).toContain('--cors-origin');
    expect(httpFlags).toContain('--auth-token');
  });

  test('socialweb command surface remains registered', () => {
    const program = buildProgram();

    expect(getSubcommandNames(program, 'socialweb')).toEqual(
      expect.arrayContaining([
        'status',
        'enable',
        'disable',
        'profile',
        'profile-update',
        'search',
        'notes',
        'reader',
        'notifications',
        'notifications-count',
        'posts',
        'likes',
        'followers',
        'following',
        'post',
        'thread',
        'follow',
        'unfollow',
        'like',
        'unlike',
        'repost',
        'derepost',
        'delete',
        'note',
        'reply',
        'blocked-accounts',
        'blocked-domains',
        'block',
        'unblock',
        'block-domain',
        'unblock-domain',
        'upload',
      ]),
    );

    for (const action of [
      'notes',
      'reader',
      'notifications',
      'posts',
      'likes',
      'followers',
      'following',
      'blocked-accounts',
      'blocked-domains',
    ]) {
      const flags = getSubcommandOptionNames(program, 'socialweb', action);
      expect(flags).toContain('--all');
      expect(flags).toContain('--limit');
    }

    const noteFlags = getSubcommandOptionNames(program, 'socialweb', 'note');
    expect(noteFlags).toEqual(
      expect.arrayContaining([
        '--content',
        '--stdin',
        '--image-file',
        '--image-url',
        '--image-alt',
      ]),
    );
  });

  test('bulk support exists for all mutable resources in phase 1-4', () => {
    const program = buildProgram();
    for (const resource of [
      'post',
      'page',
      'tag',
      'member',
      'newsletter',
      'tier',
      'offer',
      'label',
    ]) {
      expect(getSubcommandNames(program, resource)).toContain('bulk');
    }
  });

  test('mcp tool registration matches PRD parity target (snippet deferred)', () => {
    const { server, tools } = createRegistry();
    registerCoreTools(server as never, {}, new Set(MCP_TOOL_GROUPS));
    const names = Array.from(tools.keys());

    const required = [
      'ghost_post_list',
      'ghost_post_get',
      'ghost_post_create',
      'ghost_post_update',
      'ghost_post_delete',
      'ghost_post_publish',
      'ghost_post_schedule',
      'ghost_page_list',
      'ghost_page_get',
      'ghost_page_create',
      'ghost_page_update',
      'ghost_page_delete',
      'ghost_image_upload',
      'ghost_tag_list',
      'ghost_tag_get',
      'ghost_tag_create',
      'ghost_tag_update',
      'ghost_tag_delete',
      'ghost_member_list',
      'ghost_member_get',
      'ghost_member_create',
      'ghost_member_update',
      'ghost_member_import',
      'ghost_comment_list',
      'ghost_comment_get',
      'ghost_comment_thread',
      'ghost_comment_replies',
      'ghost_comment_likes',
      'ghost_comment_reports',
      'ghost_comment_hide',
      'ghost_comment_show',
      'ghost_comment_delete',
      'ghost_newsletter_list',
      'ghost_tier_list',
      'ghost_offer_list',
      'ghost_site_info',
      'ghost_user_list',
      'ghost_theme_upload',
      'ghost_webhook_create',
      'ghost_setting_list',
      'ghost_api_request',
      'ghost_search',
      'ghost_socialweb_status',
      'ghost_socialweb_profile',
      'ghost_socialweb_profile_update',
      'ghost_socialweb_search',
      'ghost_socialweb_notes',
      'ghost_socialweb_reader',
      'ghost_socialweb_notifications',
      'ghost_socialweb_notifications_count',
      'ghost_socialweb_posts',
      'ghost_socialweb_likes',
      'ghost_socialweb_followers',
      'ghost_socialweb_following',
      'ghost_socialweb_post',
      'ghost_socialweb_thread',
      'ghost_socialweb_follow',
      'ghost_socialweb_unfollow',
      'ghost_socialweb_like',
      'ghost_socialweb_unlike',
      'ghost_socialweb_repost',
      'ghost_socialweb_derepost',
      'ghost_socialweb_delete',
      'ghost_socialweb_note',
      'ghost_socialweb_reply',
      'ghost_socialweb_blocked_accounts',
      'ghost_socialweb_blocked_domains',
      'ghost_socialweb_block',
      'ghost_socialweb_unblock',
      'ghost_socialweb_block_domain',
      'ghost_socialweb_unblock_domain',
      'ghost_socialweb_upload',
    ];

    for (const tool of required) {
      expect(names).toContain(tool);
    }

    expect(names).not.toContain('ghost_snippet_list');
  });
});
