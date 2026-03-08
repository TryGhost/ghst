import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import {
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

    expect(tools.size).toBe(49);

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
    await run('ghost_newsletter_list', { limit: 5 });
    await run('ghost_tier_list', { limit: 5 });
    await run('ghost_offer_list', { limit: 5 });

    await run('ghost_site_info', {});
    await fs.writeFile(path.join(workDir, 'theme.zip'), 'fake-zip', 'utf8');
    await run('ghost_theme_upload', { file_path: path.join(workDir, 'theme.zip') });
    await run('ghost_theme_upload', { file_path: path.join(workDir, 'theme.zip'), activate: true });
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
  });

  test('parses tool groups from csv', () => {
    expect(parseToolGroups(undefined)).toEqual(new Set(MCP_TOOL_GROUPS));
    expect(parseToolGroups('all')).toEqual(new Set(MCP_TOOL_GROUPS));
    expect(parseToolGroups('posts,tags')).toEqual(new Set(['posts', 'tags']));
    expect(parseToolGroups('posts,unknown')).toEqual(new Set(['posts']));
    expect(parseToolGroups('unknown')).toEqual(new Set());
    expect(parseToolGroups('')).toEqual(new Set());
    expect(parseToolGroups(',')).toEqual(new Set());
  });
});
