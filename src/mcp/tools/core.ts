import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { normalizeGhostApiPath } from '../../lib/api-path.js';
import { GhostClient } from '../../lib/client.js';
import { resolveConnectionConfig } from '../../lib/config.js';
import { uploadImage } from '../../lib/images.js';
import {
  createMember,
  deleteMember,
  getMember,
  importMembersCsv,
  listMembers,
  updateMember,
} from '../../lib/members.js';
import { listNewsletters } from '../../lib/newsletters.js';
import { listOffers } from '../../lib/offers.js';
import { createPage, deletePage, getPage, listPages, updatePage } from '../../lib/pages.js';
import { parseCsv } from '../../lib/parse.js';
import {
  createPost,
  deletePost,
  getPost,
  listPosts,
  publishPost,
  updatePost,
} from '../../lib/posts.js';
import { getSetting, listSettings, setSetting } from '../../lib/settings.js';
import { getSiteInfo } from '../../lib/site.js';
import { createTag, deleteTag, getTag, listTags, updateTag } from '../../lib/tags.js';
import { activateTheme, uploadTheme } from '../../lib/themes.js';
import { listTiers } from '../../lib/tiers.js';
import type { GlobalOptions } from '../../lib/types.js';
import { listUsers } from '../../lib/users.js';
import { createWebhook } from '../../lib/webhooks.js';

export type McpToolGroup =
  | 'posts'
  | 'pages'
  | 'tags'
  | 'members'
  | 'site'
  | 'settings'
  | 'users'
  | 'api'
  | 'search';

export const MCP_TOOL_GROUPS: readonly McpToolGroup[] = [
  'posts',
  'pages',
  'tags',
  'members',
  'site',
  'settings',
  'users',
  'api',
  'search',
] as const;

function toolResult(data: unknown): {
  content: Array<{ type: 'text'; text: string }>;
  structuredContent: Record<string, unknown>;
} {
  let structuredContent: Record<string, unknown>;
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    structuredContent = data as Record<string, unknown>;
  } else if (Array.isArray(data)) {
    structuredContent = { items: data };
  } else {
    structuredContent = { value: data };
  }

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(data, null, 2),
      },
    ],
    structuredContent,
  };
}

function escapeNqlValue(value: string): string {
  return value.replace(/'/g, "\\'");
}

async function runSearch(
  global: GlobalOptions,
  query: string,
  limit: number,
): Promise<Record<string, unknown>> {
  const escaped = escapeNqlValue(query);
  const filter = `title:~'${escaped}'`;

  const [posts, pages, tags, members] = await Promise.all([
    listPosts(global, { filter, limit }, false),
    listPages(global, { filter, limit }, false),
    listTags(global, { filter: `name:~'${escaped}'`, limit }, false),
    listMembers(global, { filter: `email:~'${escaped}',name:~'${escaped}'`, limit }, false),
  ]);

  return {
    query,
    posts: Array.isArray(posts.posts) ? posts.posts : [],
    pages: Array.isArray(pages.pages) ? pages.pages : [],
    tags: Array.isArray(tags.tags) ? tags.tags : [],
    members: Array.isArray(members.members) ? members.members : [],
  };
}

async function callApi(
  global: GlobalOptions,
  options: {
    path: string;
    method?: string;
    body?: unknown;
    params?: Record<string, string | number | boolean | undefined>;
    contentApi?: boolean;
  },
): Promise<Record<string, unknown>> {
  const connection = await resolveConnectionConfig(global);
  const client = new GhostClient({
    url: connection.url,
    staffToken: connection.staffToken,
    version: connection.apiVersion,
    contentKey: process.env.GHOST_CONTENT_API_KEY,
  });

  const payload = await client.rawRequest<Record<string, unknown>>(
    normalizeGhostApiPath(options.path, options.contentApi ? 'content' : 'admin'),
    options.method ?? 'GET',
    options.body,
    options.params,
    {
      api: options.contentApi ? 'content' : 'admin',
    },
  );

  return payload;
}

export function registerCoreTools(
  server: McpServer,
  global: GlobalOptions,
  enabledGroups: Set<McpToolGroup>,
): void {
  if (enabledGroups.has('posts')) {
    server.registerTool(
      'ghost_post_list',
      {
        description: 'List Ghost posts.',
        inputSchema: z.object({
          limit: z.number().int().positive().max(100).optional(),
          page: z.number().int().positive().optional(),
          filter: z.string().optional(),
          status: z.enum(['draft', 'published', 'scheduled']).optional(),
          include: z.string().optional(),
        }),
      },
      async (args) => {
        const payload = await listPosts(global, { ...args }, false);
        return toolResult(payload);
      },
    );

    server.registerTool(
      'ghost_post_get',
      {
        description: 'Get a Ghost post by id or slug.',
        inputSchema: z.object({
          id: z.string().optional(),
          slug: z.string().optional(),
          include: z.string().optional(),
        }),
      },
      async (args) => {
        const payload = await getPost(global, args.slug ?? args.id ?? '', {
          bySlug: Boolean(args.slug),
          params: {
            include: args.include,
          },
        });
        return toolResult(payload);
      },
    );

    server.registerTool(
      'ghost_post_create',
      {
        description: 'Create a Ghost post.',
        inputSchema: z.object({
          title: z.string(),
          html: z.string().optional(),
          status: z.enum(['draft', 'published', 'scheduled']).optional(),
          publish_at: z.string().datetime().optional(),
          tags: z.array(z.string()).optional(),
          visibility: z.enum(['public', 'members', 'paid', 'tiers']).optional(),
        }),
      },
      async (args) => {
        const payload = await createPost(
          global,
          {
            title: args.title,
            html: args.html,
            status: args.status,
            published_at: args.publish_at,
            tags: args.tags,
            visibility: args.visibility,
          },
          args.html ? 'html' : undefined,
        );
        return toolResult(payload);
      },
    );

    server.registerTool(
      'ghost_post_update',
      {
        description: 'Update a Ghost post by id or slug.',
        inputSchema: z.object({
          id: z.string().optional(),
          slug: z.string().optional(),
          title: z.string().optional(),
          html: z.string().optional(),
          status: z.enum(['draft', 'published', 'scheduled']).optional(),
          publish_at: z.string().datetime().optional(),
          tags: z.array(z.string()).optional(),
          visibility: z.enum(['public', 'members', 'paid', 'tiers']).optional(),
        }),
      },
      async (args) => {
        const payload = await updatePost(global, {
          id: args.id,
          slug: args.slug,
          patch: {
            title: args.title,
            html: args.html,
            status: args.status,
            published_at: args.publish_at,
            tags: args.tags,
            visibility: args.visibility,
          },
          source: args.html ? 'html' : undefined,
        });
        return toolResult(payload);
      },
    );

    server.registerTool(
      'ghost_post_delete',
      {
        description: 'Delete a Ghost post.',
        inputSchema: z.object({
          id: z.string(),
          confirm: z.literal(true),
        }),
      },
      async (args) => {
        const payload = await deletePost(global, args.id);
        return toolResult(payload);
      },
    );

    server.registerTool(
      'ghost_post_publish',
      {
        description: 'Publish a Ghost post.',
        inputSchema: z.object({
          id: z.string(),
        }),
      },
      async (args) => {
        const payload = await publishPost(global, args.id);
        return toolResult(payload);
      },
    );

    server.registerTool(
      'ghost_image_upload',
      {
        description: 'Upload an image and return the uploaded image payload.',
        inputSchema: z.object({
          file_path: z.string().min(1),
          purpose: z.string().optional(),
          ref: z.string().optional(),
        }),
      },
      async (args) =>
        toolResult(
          await uploadImage(global, {
            filePath: args.file_path,
            purpose: args.purpose,
            ref: args.ref,
          }),
        ),
    );
  }

  if (enabledGroups.has('pages')) {
    server.registerTool(
      'ghost_page_list',
      {
        description: 'List Ghost pages.',
        inputSchema: z.object({
          limit: z.number().int().positive().max(100).optional(),
          page: z.number().int().positive().optional(),
          filter: z.string().optional(),
          status: z.enum(['draft', 'published', 'scheduled']).optional(),
          include: z.string().optional(),
        }),
      },
      async (args) => {
        const payload = await listPages(global, { ...args }, false);
        return toolResult(payload);
      },
    );

    server.registerTool(
      'ghost_page_get',
      {
        description: 'Get a Ghost page by id or slug.',
        inputSchema: z.object({
          id: z.string().optional(),
          slug: z.string().optional(),
          include: z.string().optional(),
        }),
      },
      async (args) => {
        const payload = await getPage(global, args.slug ?? args.id ?? '', {
          bySlug: Boolean(args.slug),
          params: {
            include: args.include,
          },
        });
        return toolResult(payload);
      },
    );

    server.registerTool(
      'ghost_page_create',
      {
        description: 'Create a Ghost page.',
        inputSchema: z.object({
          title: z.string(),
          html: z.string().optional(),
          status: z.enum(['draft', 'published', 'scheduled']).optional(),
          publish_at: z.string().datetime().optional(),
          visibility: z.enum(['public', 'members', 'paid', 'tiers']).optional(),
        }),
      },
      async (args) => {
        const payload = await createPage(
          global,
          {
            title: args.title,
            html: args.html,
            status: args.status,
            published_at: args.publish_at,
            visibility: args.visibility,
          },
          args.html ? 'html' : undefined,
        );
        return toolResult(payload);
      },
    );

    server.registerTool(
      'ghost_page_update',
      {
        description: 'Update a Ghost page by id or slug.',
        inputSchema: z.object({
          id: z.string().optional(),
          slug: z.string().optional(),
          title: z.string().optional(),
          html: z.string().optional(),
          status: z.enum(['draft', 'published', 'scheduled']).optional(),
          publish_at: z.string().datetime().optional(),
          visibility: z.enum(['public', 'members', 'paid', 'tiers']).optional(),
        }),
      },
      async (args) => {
        const payload = await updatePage(global, {
          id: args.id,
          slug: args.slug,
          patch: {
            title: args.title,
            html: args.html,
            status: args.status,
            published_at: args.publish_at,
            visibility: args.visibility,
          },
          source: args.html ? 'html' : undefined,
        });
        return toolResult(payload);
      },
    );

    server.registerTool(
      'ghost_page_delete',
      {
        description: 'Delete a Ghost page.',
        inputSchema: z.object({
          id: z.string(),
          confirm: z.literal(true),
        }),
      },
      async (args) => {
        const payload = await deletePage(global, args.id);
        return toolResult(payload);
      },
    );
  }

  if (enabledGroups.has('tags')) {
    server.registerTool(
      'ghost_tag_list',
      {
        description: 'List Ghost tags.',
        inputSchema: z.object({
          limit: z.number().int().positive().max(100).optional(),
          page: z.number().int().positive().optional(),
          filter: z.string().optional(),
        }),
      },
      async (args) => toolResult(await listTags(global, { ...args }, false)),
    );

    server.registerTool(
      'ghost_tag_get',
      {
        description: 'Get a Ghost tag by id or slug.',
        inputSchema: z.object({
          id: z.string().optional(),
          slug: z.string().optional(),
        }),
      },
      async (args) =>
        toolResult(
          await getTag(global, args.slug ?? args.id ?? '', {
            bySlug: Boolean(args.slug),
          }),
        ),
    );

    server.registerTool(
      'ghost_tag_create',
      {
        description: 'Create a Ghost tag.',
        inputSchema: z.object({
          name: z.string(),
          slug: z.string().optional(),
          description: z.string().optional(),
        }),
      },
      async (args) => toolResult(await createTag(global, args)),
    );

    server.registerTool(
      'ghost_tag_update',
      {
        description: 'Update a Ghost tag.',
        inputSchema: z.object({
          id: z.string().optional(),
          slug: z.string().optional(),
          name: z.string().optional(),
          description: z.string().optional(),
        }),
      },
      async (args) =>
        toolResult(
          await updateTag(global, {
            id: args.id,
            slug: args.slug,
            patch: {
              name: args.name,
              description: args.description,
            },
          }),
        ),
    );

    server.registerTool(
      'ghost_tag_delete',
      {
        description: 'Delete a Ghost tag.',
        inputSchema: z.object({
          id: z.string(),
          confirm: z.literal(true),
        }),
      },
      async (args) => toolResult(await deleteTag(global, args.id)),
    );
  }

  if (enabledGroups.has('members')) {
    server.registerTool(
      'ghost_member_list',
      {
        description: 'List Ghost members.',
        inputSchema: z.object({
          limit: z.number().int().positive().max(100).optional(),
          page: z.number().int().positive().optional(),
          filter: z.string().optional(),
          search: z.string().optional(),
        }),
      },
      async (args) => toolResult(await listMembers(global, { ...args }, false)),
    );

    server.registerTool(
      'ghost_member_get',
      {
        description: 'Get Ghost member by id or email.',
        inputSchema: z.object({
          id: z.string().optional(),
          email: z.string().optional(),
        }),
      },
      async (args) =>
        toolResult(
          await getMember(global, {
            id: args.id,
            email: args.email,
          }),
        ),
    );

    server.registerTool(
      'ghost_member_create',
      {
        description: 'Create Ghost member.',
        inputSchema: z.object({
          email: z.string(),
          name: z.string().optional(),
          labels: z.array(z.string()).optional(),
          newsletters: z.array(z.string()).optional(),
        }),
      },
      async (args) =>
        toolResult(
          await createMember(global, {
            email: args.email,
            name: args.name,
            labels: args.labels,
            newsletters: args.newsletters,
          }),
        ),
    );

    server.registerTool(
      'ghost_member_update',
      {
        description: 'Update Ghost member.',
        inputSchema: z.object({
          id: z.string().optional(),
          email: z.string().optional(),
          name: z.string().optional(),
          note: z.string().optional(),
        }),
      },
      async (args) =>
        toolResult(
          await updateMember(global, {
            id: args.id,
            email: args.email,
            patch: {
              name: args.name,
              note: args.note,
            },
          }),
        ),
    );

    server.registerTool(
      'ghost_member_delete',
      {
        description: 'Delete Ghost member.',
        inputSchema: z.object({
          id: z.string(),
          confirm: z.literal(true),
        }),
      },
      async (args) => toolResult(await deleteMember(global, args.id)),
    );

    server.registerTool(
      'ghost_member_import',
      {
        description: 'Import members from a CSV file path.',
        inputSchema: z.object({
          file_path: z.string().min(1),
          labels: z.array(z.string()).optional(),
        }),
      },
      async (args) =>
        toolResult(
          await importMembersCsv(global, {
            filePath: args.file_path,
            labels: args.labels,
          }),
        ),
    );

    server.registerTool(
      'ghost_newsletter_list',
      {
        description: 'List Ghost newsletters.',
        inputSchema: z.object({
          limit: z.number().int().positive().max(100).optional(),
          page: z.number().int().positive().optional(),
          filter: z.string().optional(),
        }),
      },
      async (args) => toolResult(await listNewsletters(global, { ...args }, false)),
    );

    server.registerTool(
      'ghost_tier_list',
      {
        description: 'List Ghost tiers.',
        inputSchema: z.object({
          limit: z.number().int().positive().max(100).optional(),
          page: z.number().int().positive().optional(),
          filter: z.string().optional(),
        }),
      },
      async (args) => toolResult(await listTiers(global, { ...args }, false)),
    );

    server.registerTool(
      'ghost_offer_list',
      {
        description: 'List Ghost offers.',
        inputSchema: z.object({
          limit: z.number().int().positive().max(100).optional(),
          page: z.number().int().positive().optional(),
          filter: z.string().optional(),
        }),
      },
      async (args) => toolResult(await listOffers(global, { ...args }, false)),
    );
  }

  if (enabledGroups.has('site')) {
    server.registerTool(
      'ghost_site_info',
      {
        description: 'Get Ghost site metadata.',
      },
      async () => toolResult(await getSiteInfo(global)),
    );

    server.registerTool(
      'ghost_theme_upload',
      {
        description: 'Upload a Ghost theme zip path and optionally activate it.',
        inputSchema: z.object({
          file_path: z.string().min(1),
          activate: z.boolean().optional(),
        }),
      },
      async (args) => {
        const payload = await uploadTheme(global, args.file_path);
        if (args.activate) {
          const themes = Array.isArray(payload.themes) ? payload.themes : [];
          const first = (themes[0] as Record<string, unknown> | undefined) ?? payload;
          const name = String(first.name ?? '').trim();
          if (name) {
            await activateTheme(global, name);
          }
        }

        return toolResult(payload);
      },
    );

    server.registerTool(
      'ghost_webhook_create',
      {
        description: 'Create a Ghost webhook.',
        inputSchema: z.object({
          event: z.string().min(1),
          target_url: z.string().url(),
          name: z.string().optional(),
          secret: z.string().optional(),
          api_version: z.string().optional(),
        }),
      },
      async (args) =>
        toolResult(
          await createWebhook(global, {
            event: args.event,
            target_url: args.target_url,
            name: args.name,
            secret: args.secret,
            api_version: args.api_version,
          }),
        ),
    );
  }

  if (enabledGroups.has('settings')) {
    server.registerTool(
      'ghost_setting_list',
      {
        description: 'List Ghost settings.',
      },
      async () => toolResult(await listSettings(global)),
    );

    server.registerTool(
      'ghost_setting_get',
      {
        description: 'Get a Ghost setting by key.',
        inputSchema: z.object({
          key: z.string(),
        }),
      },
      async (args) => toolResult(await getSetting(global, args.key)),
    );

    server.registerTool(
      'ghost_setting_set',
      {
        description: 'Set a Ghost setting by key.',
        inputSchema: z.object({
          key: z.string(),
          value: z.union([z.string(), z.number(), z.boolean(), z.null()]),
        }),
      },
      async (args) => toolResult(await setSetting(global, args.key, args.value)),
    );
  }

  if (enabledGroups.has('users')) {
    server.registerTool(
      'ghost_user_list',
      {
        description: 'List Ghost staff users.',
        inputSchema: z.object({
          limit: z.number().int().positive().max(100).optional(),
          page: z.number().int().positive().optional(),
        }),
      },
      async (args) => toolResult(await listUsers(global, { ...args }, false)),
    );
  }

  if (enabledGroups.has('api')) {
    server.registerTool(
      'ghost_api_request',
      {
        description: 'Run a raw Ghost API request.',
        inputSchema: z.object({
          path: z.string(),
          method: z.string().optional(),
          body: z.unknown().optional(),
          params: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
          content_api: z.boolean().optional(),
        }),
      },
      async (args) =>
        toolResult(
          await callApi(global, {
            path: args.path,
            method: args.method,
            body: args.body,
            params: args.params as
              | Record<string, string | number | boolean | undefined>
              | undefined,
            contentApi: args.content_api,
          }),
        ),
    );
  }

  if (enabledGroups.has('search')) {
    server.registerTool(
      'ghost_search',
      {
        description: 'Search posts, pages, tags and members.',
        inputSchema: z.object({
          query: z.string().min(1),
          limit: z.number().int().positive().max(50).optional(),
        }),
      },
      async (args) => toolResult(await runSearch(global, args.query, args.limit ?? 10)),
    );
  }
}

export function parseToolGroups(toolsArg: string | undefined): Set<McpToolGroup> {
  if (toolsArg === undefined || toolsArg === 'all') {
    return new Set(MCP_TOOL_GROUPS);
  }

  const requested = parseCsv(toolsArg) ?? [];
  if (requested.length === 0) {
    return new Set();
  }

  const result = new Set<McpToolGroup>();
  for (const value of requested) {
    if ((MCP_TOOL_GROUPS as readonly string[]).includes(value)) {
      result.add(value as McpToolGroup);
    }
  }

  return result;
}
