import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import {
  MCP_TOOL_GROUP_METADATA,
  MCP_TOOL_GROUPS,
  type McpToolGroup,
  parseToolGroups,
  registerCoreTools,
} from '../src/mcp/tools/core.js';
import { fixtureIds } from './helpers/ghost-fixtures.js';
import { installGhostFixtureFetchMock } from './helpers/mock-ghost.js';

const KEY = 'abc123:00112233445566778899aabbccddeeff';

type ToolHandler = (args: Record<string, unknown>) => Promise<Record<string, unknown>>;

interface RegisteredTool {
  meta: Record<string, unknown>;
  handler: ToolHandler;
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

describe('mcp core tool registration', () => {
  let tempRoot = '';
  let workDir = '';
  let configDir = '';
  let previousCwd = '';
  let previousConfigDir: string | undefined;
  let previousApiVersion: string | undefined;
  let previousContentKey: string | undefined;

  beforeEach(async () => {
    previousCwd = process.cwd();
    previousConfigDir = process.env.GHST_CONFIG_DIR;
    previousApiVersion = process.env.GHOST_API_VERSION;
    previousContentKey = process.env.GHOST_CONTENT_API_KEY;

    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'ghst-mcp-tools-'));
    workDir = path.join(tempRoot, 'work');
    configDir = path.join(tempRoot, 'config');
    await fs.mkdir(workDir, { recursive: true });
    await fs.mkdir(configDir, { recursive: true });
    process.chdir(workDir);

    process.env.GHST_CONFIG_DIR = configDir;
    process.env.GHOST_API_VERSION = 'v6.0';
    process.env.GHOST_CONTENT_API_KEY = 'content-key';

    await fs.writeFile(
      path.join(configDir, 'config.json'),
      JSON.stringify(
        {
          version: 1,
          active: 'myblog',
          sites: {
            myblog: {
              url: 'https://myblog.ghost.io',
              staffAccessToken: KEY,
              apiVersion: 'v6.0',
              addedAt: '2026-01-01T00:00:00.000Z',
            },
          },
        },
        null,
        2,
      ),
      'utf8',
    );

    installGhostFixtureFetchMock({ postConflictOnce: true });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    process.chdir(previousCwd);

    if (previousConfigDir === undefined) {
      delete process.env.GHST_CONFIG_DIR;
    } else {
      process.env.GHST_CONFIG_DIR = previousConfigDir;
    }

    if (previousApiVersion === undefined) {
      delete process.env.GHOST_API_VERSION;
    } else {
      process.env.GHOST_API_VERSION = previousApiVersion;
    }

    if (previousContentKey === undefined) {
      delete process.env.GHOST_CONTENT_API_KEY;
    } else {
      process.env.GHOST_CONTENT_API_KEY = previousContentKey;
    }
  });

  test('registers all tool groups and executes handlers', async () => {
    const { server, tools } = createRegistry();
    registerCoreTools(server as never, {}, new Set(MCP_TOOL_GROUPS));

    expect([...tools.keys()]).toEqual(
      expect.arrayContaining([
        'ghost_post_list',
        'ghost_page_list',
        'ghost_tag_list',
        'ghost_member_list',
        'ghost_comment_list',
        'ghost_site_info',
        'ghost_setting_list',
        'ghost_user_list',
        'ghost_api_request',
        'ghost_search',
        'ghost_socialweb_status',
        'ghost_stats_overview',
      ]),
    );

    expect(tools.get('ghost_post_list')?.meta._meta).toMatchObject({
      'ghst/toolGroup': 'posts',
      'ghst/toolGroupTitle': 'Posts',
    });
    expect(tools.get('ghost_site_info')?.meta._meta).toMatchObject({
      'ghst/toolGroup': 'site',
      'ghst/toolGroupTitle': 'Site',
    });
    expect(tools.get('ghost_stats_overview')?.meta._meta).toMatchObject({
      'ghst/toolGroup': 'stats',
      'ghst/toolGroupTitle': 'Stats',
    });

    for (const [name, tool] of tools) {
      const metadata = tool.meta._meta as Record<string, unknown> | undefined;
      const group = metadata?.['ghst/toolGroup'] as McpToolGroup | undefined;

      expect(metadata, `${name} should expose MCP group metadata`).toBeDefined();
      expect(MCP_TOOL_GROUPS, `${name} should use a known MCP tool group`).toContain(group);
      expect(metadata?.['ghst/toolGroupTitle']).toBe(
        group ? MCP_TOOL_GROUP_METADATA[group].title : undefined,
      );
    }

    const run = async (
      name: string,
      args: Record<string, unknown>,
    ): Promise<Record<string, unknown>> => {
      const tool = tools.get(name);
      expect(tool, `Tool ${name} should be registered`).toBeDefined();
      if (!tool) {
        throw new Error(`Tool ${name} should be registered`);
      }
      const result = await tool.handler(args);
      expect(result).toMatchObject({
        content: [{ type: 'text' }],
      });
      return result;
    };

    await run('ghost_post_list', { limit: 5, filter: 'status:draft' });
    await run('ghost_post_get', { id: fixtureIds.postId });
    await run('ghost_post_create', { title: 'Tool Post', html: '<p>tool</p>' });
    await run('ghost_post_update', { id: fixtureIds.postId, title: 'Updated Tool Post' });
    await run('ghost_post_delete', { id: fixtureIds.postId, confirm: true });
    await run('ghost_post_publish', { id: fixtureIds.postId });
    await run('ghost_post_schedule', {
      id: fixtureIds.postId,
      at: '2026-03-01T10:00:00Z',
      newsletter: 'weekly',
      email_only: true,
      email_segment: 'status:paid',
    });
    await fs.writeFile(path.join(workDir, 'image.jpg'), 'fake-image', 'utf8');
    await run('ghost_image_upload', { file_path: path.join(workDir, 'image.jpg') });

    await run('ghost_page_list', { limit: 5 });
    await run('ghost_page_get', { slug: fixtureIds.pageSlug });
    await run('ghost_page_create', { title: 'Tool Page', html: '<p>tool</p>' });
    await run('ghost_page_update', { id: fixtureIds.pageId, title: 'Updated Tool Page' });
    await run('ghost_page_delete', { id: fixtureIds.pageId, confirm: true });

    await run('ghost_tag_list', { limit: 5 });
    await run('ghost_tag_get', { id: fixtureIds.tagId });
    await run('ghost_tag_create', { name: 'Tool Tag' });
    await run('ghost_tag_update', { id: fixtureIds.tagId, name: 'Tool Tag Updated' });
    await run('ghost_tag_delete', { id: fixtureIds.tagId, confirm: true });

    await run('ghost_member_list', { limit: 5 });
    await run('ghost_member_get', { email: fixtureIds.memberEmail });
    await run('ghost_member_create', { email: 'newmember@example.com', name: 'Tool Member' });
    await run('ghost_member_update', { id: fixtureIds.memberId, name: 'Tool Member Updated' });
    await run('ghost_member_delete', { id: fixtureIds.memberId, confirm: true });
    await fs.writeFile(path.join(workDir, 'members.csv'), 'email\nx@example.com\n', 'utf8');
    await run('ghost_member_import', { file_path: path.join(workDir, 'members.csv') });

    const commentListResponse = await run('ghost_comment_list', {
      limit: 5,
      filter: 'status:published',
    });
    expect(commentListResponse.structuredContent).toHaveProperty('comments');

    const commentGetResponse = await run('ghost_comment_get', { id: fixtureIds.commentId });
    expect(commentGetResponse.structuredContent).toMatchObject({
      comments: [{ id: fixtureIds.commentId }],
    });

    const commentThreadResponse = await run('ghost_comment_thread', { id: fixtureIds.commentId });
    expect(commentThreadResponse.structuredContent).toMatchObject({
      comment: { id: fixtureIds.commentId },
      comments: [{ id: fixtureIds.commentReplyId }],
    });

    await run('ghost_comment_replies', {
      id: fixtureIds.commentId,
      limit: 5,
      filter: 'status:published',
    });
    await run('ghost_comment_likes', { id: fixtureIds.commentId, limit: 5 });
    await run('ghost_comment_reports', { id: fixtureIds.commentId, limit: 5 });
    await run('ghost_comment_hide', { id: fixtureIds.commentId });
    await run('ghost_comment_show', { id: fixtureIds.commentId });
    await run('ghost_comment_delete', { id: fixtureIds.commentId, confirm: true });

    await run('ghost_newsletter_list', { limit: 5 });
    await run('ghost_tier_list', { limit: 5 });
    await run('ghost_offer_list', { limit: 5 });

    await run('ghost_site_info', {});
    await fs.writeFile(path.join(workDir, 'theme.zip'), 'fake-zip', 'utf8');
    await run('ghost_theme_upload', { file_path: path.join(workDir, 'theme.zip') });
    const activatedThemeResponse = await run('ghost_theme_upload', {
      file_path: path.join(workDir, 'theme.zip'),
      activate: true,
    });
    expect(activatedThemeResponse.structuredContent).toMatchObject({
      themes: [{ name: 'uploaded-theme', active: true }],
    });
    await run('ghost_webhook_create', {
      event: 'post.published',
      target_url: 'https://example.com/hook',
    });
    await run('ghost_setting_list', {});
    await run('ghost_setting_get', { key: 'title' });
    await run('ghost_setting_set', { key: 'title', value: 'Tool Blog' });
    await run('ghost_user_list', { limit: 5 });

    const apiContentResponse = await run('ghost_api_request', {
      path: '/ghost/api/content/posts/',
      params: { limit: 1 },
      content_api: true,
    });
    expect(apiContentResponse.structuredContent).toHaveProperty('posts');

    const apiAdminResponse = await run('ghost_api_request', {
      path: '/ghost/api/admin/site/',
      method: 'GET',
    });
    expect(apiAdminResponse.structuredContent).toHaveProperty('site');

    const searchResponse = await run('ghost_search', {
      query: "o'hara",
      limit: 2,
    });
    expect(searchResponse.structuredContent).toMatchObject({
      query: "o'hara",
    });

    const socialStatusResponse = await run('ghost_socialweb_status', {});
    expect(socialStatusResponse.structuredContent).toHaveProperty('settings.social_web', true);

    const socialProfileResponse = await run('ghost_socialweb_profile', {});
    expect(socialProfileResponse.structuredContent).toHaveProperty('handle');

    const socialProfileUpdateResponse = await run('ghost_socialweb_profile_update', {
      name: 'Updated Owner',
      username: 'updated-owner',
      bio: 'Updated bio',
      avatar_url: 'https://myblog.ghost.io/content/images/updated-avatar.png',
    });
    expect(socialProfileUpdateResponse.structuredContent).toHaveProperty(
      'handle',
      '@updated-owner@myblog.ghost.io',
    );

    const socialSearchResponse = await run('ghost_socialweb_search', {
      query: 'alice',
    });
    expect(socialSearchResponse.structuredContent).toHaveProperty('accounts');

    const socialNotesResponse = await run('ghost_socialweb_notes', { all_pages: true });
    const socialNotesStructured = socialNotesResponse.structuredContent as Record<string, unknown>;
    expect(socialNotesResponse.structuredContent).toHaveProperty('posts');
    expect(Array.isArray(socialNotesStructured.posts)).toBe(true);
    expect((socialNotesStructured.posts as unknown[]).length).toBeGreaterThan(1);

    const socialReaderResponse = await run('ghost_socialweb_reader', { limit: 1 });
    expect(socialReaderResponse.structuredContent).toHaveProperty('posts');

    const socialNotificationsResponse = await run('ghost_socialweb_notifications', { limit: 1 });
    expect(socialNotificationsResponse.structuredContent).toHaveProperty('notifications');

    const socialNotificationCountResponse = await run('ghost_socialweb_notifications_count', {});
    expect(socialNotificationCountResponse.structuredContent).toHaveProperty('count', 3);

    const socialPostsResponse = await run('ghost_socialweb_posts', { handle: 'me' });
    expect(socialPostsResponse.structuredContent).toHaveProperty('posts');

    const socialLikesResponse = await run('ghost_socialweb_likes', { limit: 1 });
    expect(socialLikesResponse.structuredContent).toHaveProperty('posts');

    const socialFollowersResponse = await run('ghost_socialweb_followers', { limit: 1 });
    expect(socialFollowersResponse.structuredContent).toHaveProperty('accounts');

    const socialFollowingResponse = await run('ghost_socialweb_following', { limit: 1 });
    expect(socialFollowingResponse.structuredContent).toHaveProperty('accounts');

    const socialPostResponse = await run('ghost_socialweb_post', {
      id: 'https://remote.example/posts/1',
    });
    expect(socialPostResponse.structuredContent).toHaveProperty('id');

    const socialThreadResponse = await run('ghost_socialweb_thread', {
      id: 'https://remote.example/posts/1',
    });
    expect(socialThreadResponse.structuredContent).toHaveProperty('children');

    const socialFollowResponse = await run('ghost_socialweb_follow', {
      handle: '@alice@remote.example',
    });
    expect(socialFollowResponse.structuredContent).toHaveProperty(
      'handle',
      '@alice@remote.example',
    );

    await run('ghost_socialweb_unfollow', {
      handle: '@alice@remote.example',
    });
    await run('ghost_socialweb_like', {
      id: 'https://remote.example/posts/1',
    });
    await run('ghost_socialweb_unlike', {
      id: 'https://remote.example/posts/1',
    });
    await run('ghost_socialweb_repost', {
      id: 'https://remote.example/posts/1',
    });
    await run('ghost_socialweb_derepost', {
      id: 'https://remote.example/posts/1',
    });
    await run('ghost_socialweb_delete', {
      id: 'https://myblog.ghost.io/.ghost/activitypub/note/1',
    });

    const socialNoteResponse = await run('ghost_socialweb_note', {
      content: 'Tool note',
      image_url: 'https://example.com/note.png',
      image_alt: 'Note image',
    });
    expect(socialNoteResponse.structuredContent).toHaveProperty('post');

    const socialReplyResponse = await run('ghost_socialweb_reply', {
      id: 'https://remote.example/posts/1',
      content: 'Tool reply',
      image_file: path.join(workDir, 'image.jpg'),
      image_alt: 'Reply image',
    });
    expect(socialReplyResponse.structuredContent).toHaveProperty('post');

    const socialBlockedAccountsResponse = await run('ghost_socialweb_blocked_accounts', {
      limit: 1,
    });
    expect(socialBlockedAccountsResponse.structuredContent).toHaveProperty('blocked_accounts');

    const socialBlockedDomainsResponse = await run('ghost_socialweb_blocked_domains', {
      limit: 1,
    });
    expect(socialBlockedDomainsResponse.structuredContent).toHaveProperty('blocked_domains');

    await run('ghost_socialweb_block', {
      id: 'https://remote.example/users/alice',
    });
    await run('ghost_socialweb_unblock', {
      id: 'https://remote.example/users/alice',
    });
    await run('ghost_socialweb_block_domain', {
      url: 'https://remote.example',
    });
    await run('ghost_socialweb_unblock_domain', {
      url: 'https://remote.example',
    });

    const socialUploadResponse = await run('ghost_socialweb_upload', {
      file_path: path.join(workDir, 'image.jpg'),
    });
    expect(socialUploadResponse.structuredContent).toHaveProperty(
      'fileUrl',
      'https://myblog.ghost.io/content/images/social-upload.png',
    );

    const socialDisableResponse = await run('ghost_socialweb_disable', {});
    expect(socialDisableResponse.structuredContent).toHaveProperty('settings.social_web', false);

    const socialEnableResponse = await run('ghost_socialweb_enable', {});
    expect(socialEnableResponse.structuredContent).toHaveProperty('settings.social_web', true);

    const overviewResponse = await run('ghost_stats_overview', { range: '30d' });
    expect(overviewResponse.structuredContent).toHaveProperty('summary');

    const webResponse = await run('ghost_stats_web', { range: '30d' });
    expect(webResponse.structuredContent).toHaveProperty('kpis');

    const webTableResponse = await run('ghost_stats_web_table', {
      view: 'devices',
      range: '30d',
    });
    expect(webTableResponse.structuredContent).toHaveProperty('items');

    const growthResponse = await run('ghost_stats_growth', { range: '30d' });
    expect(growthResponse.structuredContent).toHaveProperty('summary');

    const postsResponse = await run('ghost_stats_posts', { range: '30d' });
    expect(postsResponse.structuredContent).toHaveProperty('posts');

    const emailResponse = await run('ghost_stats_email', { range: '30d' });
    expect(emailResponse.structuredContent).toHaveProperty('newsletters');

    const emailClicksResponse = await run('ghost_stats_email_clicks', {
      newsletter_id: fixtureIds.newsletterId,
      range: '30d',
    });
    expect(emailClicksResponse.structuredContent).toHaveProperty('clicks');

    const emailSubscribersResponse = await run('ghost_stats_email_subscribers', {
      range: '30d',
    });
    expect(emailSubscribersResponse.structuredContent).toHaveProperty('newsletters');

    const postResponse = await run('ghost_stats_post', {
      id: fixtureIds.postId,
      range: '30d',
    });
    expect(postResponse.structuredContent).toHaveProperty('summary');

    const postWebResponse = await run('ghost_stats_post_web', {
      id: fixtureIds.postId,
      range: '30d',
    });
    expect(postWebResponse.structuredContent).toHaveProperty('kpis');

    const postGrowthResponse = await run('ghost_stats_post_growth', {
      id: fixtureIds.postId,
      range: '30d',
    });
    expect(postGrowthResponse.structuredContent).toHaveProperty('growth');

    const postNewsletterResponse = await run('ghost_stats_post_newsletter', {
      id: fixtureIds.postId,
      range: '30d',
    });
    expect(postNewsletterResponse.structuredContent).toHaveProperty('newsletter');

    const postReferrersResponse = await run('ghost_stats_post_referrers', {
      id: fixtureIds.postId,
      range: '30d',
    });
    expect(postReferrersResponse.structuredContent).toHaveProperty('referrers');
  });

  test('rejects escape-capable ghost api request paths before execution', async () => {
    const { server, tools } = createRegistry();
    registerCoreTools(server as never, {}, new Set(MCP_TOOL_GROUPS));

    const tool = tools.get('ghost_api_request');
    expect(tool).toBeDefined();
    await expect(tool?.handler({ path: '../../../members/' }) as Promise<unknown>).rejects.toThrow(
      'dot segments',
    );
    await expect(tool?.handler({ path: '/%2E%2E%2Fmembers/' }) as Promise<unknown>).rejects.toThrow(
      'encoded path separators',
    );
  });

  test('rejects socialweb all_pages combined with next to preserve cli parity', async () => {
    const { server, tools } = createRegistry();
    registerCoreTools(server as never, {}, new Set(MCP_TOOL_GROUPS));

    const tool = tools.get('ghost_socialweb_notes');
    expect(tool).toBeDefined();
    const parsed = (
      tool?.meta.inputSchema as {
        safeParse: (value: unknown) => { success: boolean; error?: Error };
      }
    ).safeParse({
      all_pages: true,
      next: 'notes-next',
    });

    expect(parsed.success).toBe(false);
    expect(parsed.error?.message).toContain('all_pages cannot be combined with next');
  });

  test('ghost_post_schedule forwards email delivery flags as query params', async () => {
    const putRequests: Array<{ url: URL; body: Record<string, unknown> }> = [];
    installGhostFixtureFetchMock({
      onRequest: ({ pathname, method, url, init }) => {
        if (method === 'PUT' && pathname.endsWith(`/ghost/api/admin/posts/${fixtureIds.postId}/`)) {
          putRequests.push({
            url: new URL(url.toString()),
            body: JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>,
          });
        }

        return undefined;
      },
    });

    const { server, tools } = createRegistry();
    registerCoreTools(server as never, {}, new Set(MCP_TOOL_GROUPS));
    const tool = tools.get('ghost_post_schedule');

    expect(tool, 'Tool ghost_post_schedule should be registered').toBeDefined();
    const result = await tool?.handler({
      id: fixtureIds.postId,
      at: '2026-03-01T10:00:00Z',
      newsletter: 'weekly',
      email_only: true,
      email_segment: 'status:paid',
    });

    expect(result).toMatchObject({
      content: [{ type: 'text' }],
      structuredContent: { posts: [{ id: fixtureIds.postId }] },
    });
    expect(putRequests).toHaveLength(1);
    expect(putRequests[0]?.url.searchParams.get('newsletter')).toBe('weekly');
    expect(putRequests[0]?.url.searchParams.get('email_only')).toBe('true');
    expect(putRequests[0]?.url.searchParams.get('email_segment')).toBe('status:paid');
    expect(putRequests[0]?.body).toMatchObject({
      posts: [
        {
          status: 'scheduled',
          published_at: '2026-03-01T10:00:00Z',
          updated_at: expect.any(String),
        },
      ],
    });
    expect(JSON.stringify(putRequests[0]?.body ?? {})).not.toContain('"newsletter"');
    expect(JSON.stringify(putRequests[0]?.body ?? {})).not.toContain('"email_only"');
    expect(JSON.stringify(putRequests[0]?.body ?? {})).not.toContain('"email_segment"');
  });

  test('can register a narrow tool subset', () => {
    const { server, tools } = createRegistry();
    registerCoreTools(server as never, {}, new Set<McpToolGroup>(['site']));

    expect(Array.from(tools.keys())).toEqual([
      'ghost_site_info',
      'ghost_theme_upload',
      'ghost_webhook_create',
    ]);
    for (const tool of tools.values()) {
      expect(tool.meta._meta).toMatchObject({
        'ghst/toolGroup': 'site',
        'ghst/toolGroupTitle': 'Site',
      });
    }
  });

  test('can register only socialweb tools', () => {
    const { server, tools } = createRegistry();
    registerCoreTools(server as never, {}, new Set<McpToolGroup>(['socialweb']));

    expect(Array.from(tools.keys())).toEqual([
      'ghost_socialweb_status',
      'ghost_socialweb_enable',
      'ghost_socialweb_disable',
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
    ]);
  });

  test('parses tool groups from csv', () => {
    expect(parseToolGroups(undefined)).toEqual(new Set(MCP_TOOL_GROUPS));
    expect(parseToolGroups('all')).toEqual(new Set(MCP_TOOL_GROUPS));
    expect(parseToolGroups('posts,comments,tags')).toEqual(new Set(['posts', 'comments', 'tags']));
    expect(parseToolGroups('socialweb,stats')).toEqual(new Set(['socialweb', 'stats']));
    expect(parseToolGroups('posts,unknown')).toEqual(new Set(['posts']));
    expect(parseToolGroups('unknown')).toEqual(new Set());
    expect(parseToolGroups('')).toEqual(new Set());
    expect(parseToolGroups(',')).toEqual(new Set());
  });
});
