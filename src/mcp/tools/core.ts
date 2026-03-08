import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { normalizeGhostApiPath } from '../../lib/api-path.js';
import { GhostClient } from '../../lib/client.js';
import {
  getComment,
  getCommentThread,
  listCommentLikes,
  listCommentReplies,
  listCommentReports,
  listComments,
  setCommentStatus,
} from '../../lib/comments.js';
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
  schedulePost,
  updatePost,
} from '../../lib/posts.js';
import { getSetting, listSettings, setSetting } from '../../lib/settings.js';
import { getSiteInfo } from '../../lib/site.js';
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
} from '../../lib/socialweb.js';
import {
  getStatsGrowth,
  getStatsNewsletterClicks,
  getStatsNewsletterSubscribers,
  getStatsNewsletters,
  getStatsOverview,
  getStatsPost,
  getStatsPostGrowth,
  getStatsPostNewsletter,
  getStatsPostReferrers,
  getStatsPosts,
  getStatsPostWeb,
  getStatsWeb,
  getStatsWebTable,
} from '../../lib/stats.js';
import { createTag, deleteTag, getTag, listTags, updateTag } from '../../lib/tags.js';
import { activateTheme, getUploadedThemeName, uploadTheme } from '../../lib/themes.js';
import { listTiers } from '../../lib/tiers.js';
import type { GlobalOptions } from '../../lib/types.js';
import { listUsers } from '../../lib/users.js';
import { createWebhook } from '../../lib/webhooks.js';

export type McpToolGroup =
  | 'posts'
  | 'pages'
  | 'tags'
  | 'members'
  | 'comments'
  | 'site'
  | 'settings'
  | 'users'
  | 'api'
  | 'search'
  | 'socialweb'
  | 'stats';

export const MCP_TOOL_GROUPS: readonly McpToolGroup[] = [
  'posts',
  'pages',
  'tags',
  'members',
  'comments',
  'site',
  'settings',
  'users',
  'api',
  'search',
  'socialweb',
  'stats',
] as const;

const statsRangeArgs = {
  range: z.enum(['7d', '30d', '90d', '365d', 'all']).optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  timezone: z.string().optional(),
};

const statsWebArgs = {
  ...statsRangeArgs,
  audience: z.enum(['all', 'free', 'paid']).optional(),
  source: z.string().optional(),
  location: z.string().optional(),
  device: z.enum(['desktop', 'mobile-ios', 'mobile-android', 'bot', 'unknown']).optional(),
  utm_source: z.string().optional(),
  utm_medium: z.string().optional(),
  utm_campaign: z.string().optional(),
  utm_content: z.string().optional(),
  utm_term: z.string().optional(),
  limit: z.number().int().positive().max(100).optional(),
};

const commentBrowseArgs = {
  limit: z.number().int().positive().max(100).optional(),
  page: z.number().int().positive().optional(),
  filter: z.string().optional(),
};

const socialWebHandleSchema = z
  .string()
  .min(1)
  .refine((value) => value === 'me' || /^@?[^@\s]+@[^@\s]+$/.test(value), {
    message: 'handle must be me or a federated handle like @user@domain',
  });

const socialWebRemoteHandleSchema = socialWebHandleSchema.refine((value) => value !== 'me', {
  message: 'handle must be a federated handle like @user@domain',
});

const socialWebUrlSchema = z.string().url();

const socialWebPaginationArgs = {
  limit: z.number().int().positive().max(100).optional(),
  next: z.string().min(1).optional(),
  all_pages: z.boolean().optional(),
};

const socialWebPaginationSchema = z
  .object({
    ...socialWebPaginationArgs,
  })
  .superRefine((value, context) => {
    if (value.all_pages && value.next) {
      context.addIssue({
        code: 'custom',
        message: 'all_pages cannot be combined with next.',
        path: ['all_pages'],
      });
    }
  });

const socialWebHandlePaginationSchema = z
  .object({
    handle: socialWebHandleSchema.optional(),
    ...socialWebPaginationArgs,
  })
  .superRefine((value, context) => {
    if (value.all_pages && value.next) {
      context.addIssue({
        code: 'custom',
        message: 'all_pages cannot be combined with next.',
        path: ['all_pages'],
      });
    }
  });

const socialWebProfileUpdateSchema = z
  .object({
    name: z.string().min(1).optional(),
    username: z.string().min(1).optional(),
    bio: z.string().optional(),
    avatar_url: socialWebUrlSchema.optional(),
    banner_image_url: socialWebUrlSchema.optional(),
  })
  .refine(
    (value) =>
      value.name !== undefined ||
      value.username !== undefined ||
      value.bio !== undefined ||
      value.avatar_url !== undefined ||
      value.banner_image_url !== undefined,
    {
      message: 'Provide at least one profile field to update.',
      path: ['name'],
    },
  );

const socialWebContentSchema = z
  .object({
    content: z.string().min(1),
    image_file: z.string().min(1).optional(),
    image_url: socialWebUrlSchema.optional(),
    image_alt: z.string().min(1).optional(),
  })
  .superRefine((value, context) => {
    const imageSources = [value.image_file !== undefined, value.image_url !== undefined].filter(
      Boolean,
    ).length;
    if (imageSources > 1) {
      context.addIssue({
        code: 'custom',
        message: 'Provide at most one image source with image_file or image_url.',
        path: ['image_file'],
      });
    }
  });

const statsTableViewSchema = z.enum([
  'content',
  'sources',
  'locations',
  'devices',
  'utm-sources',
  'utm-mediums',
  'utm-campaigns',
  'utm-contents',
  'utm-terms',
]);

type StatsRangeArgsInput = {
  range?: '7d' | '30d' | '90d' | '365d' | 'all';
  from?: string;
  to?: string;
  timezone?: string;
};

type StatsWebArgsInput = StatsRangeArgsInput & {
  audience?: 'all' | 'free' | 'paid';
  source?: string;
  location?: string;
  device?: 'desktop' | 'mobile-ios' | 'mobile-android' | 'bot' | 'unknown';
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  utm_term?: string;
  limit?: number;
};

function mapStatsRangeArgs(args: StatsRangeArgsInput) {
  return {
    range: args.range,
    from: args.from,
    to: args.to,
    timezone: args.timezone,
  };
}

function mapStatsWebArgs(args: StatsWebArgsInput) {
  return {
    ...mapStatsRangeArgs(args),
    audience: args.audience,
    source: args.source,
    location: args.location,
    device: args.device,
    utmSource: args.utm_source,
    utmMedium: args.utm_medium,
    utmCampaign: args.utm_campaign,
    utmContent: args.utm_content,
    utmTerm: args.utm_term,
    limit: args.limit,
  };
}

function mapSocialWebPaginationArgs(args: { limit?: number; next?: string; all_pages?: boolean }) {
  return {
    params: {
      limit: args.limit,
      next: args.next,
    },
    allPages: Boolean(args.all_pages),
  };
}

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
      'ghost_post_schedule',
      {
        description: 'Schedule a Ghost post, with optional email delivery settings.',
        inputSchema: z.object({
          id: z.string(),
          at: z.string().datetime(),
          newsletter: z.string().optional(),
          email_only: z.boolean().optional(),
          email_segment: z.string().optional(),
        }),
      },
      async (args) => {
        const payload = await schedulePost(global, args.id, args.at, {
          newsletter: args.newsletter,
          email_only: args.email_only,
          email_segment: args.email_segment,
        });
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

  if (enabledGroups.has('comments')) {
    server.registerTool(
      'ghost_comment_list',
      {
        description: 'List Ghost comments from the Admin moderation view.',
        inputSchema: z.object({
          ...commentBrowseArgs,
          order: z.string().optional(),
          top_level_only: z.boolean().optional(),
        }),
      },
      async (args) =>
        toolResult(
          await listComments(
            global,
            {
              limit: args.limit,
              page: args.page,
              filter: args.filter,
              order: args.order,
              includeNested: !args.top_level_only,
            },
            false,
          ),
        ),
    );

    server.registerTool(
      'ghost_comment_get',
      {
        description: 'Get a Ghost comment with Admin moderation fields.',
        inputSchema: z.object({
          id: z.string(),
        }),
      },
      async (args) => toolResult(await getComment(global, args.id)),
    );

    server.registerTool(
      'ghost_comment_thread',
      {
        description: 'Get a Ghost comment thread using the Admin moderation thread view.',
        inputSchema: z.object({
          id: z.string(),
        }),
      },
      async (args) => toolResult(await getCommentThread(global, args.id)),
    );

    server.registerTool(
      'ghost_comment_replies',
      {
        description: 'List replies for a Ghost comment using the raw replies endpoint.',
        inputSchema: z.object({
          id: z.string(),
          ...commentBrowseArgs,
        }),
      },
      async (args) =>
        toolResult(
          await listCommentReplies(
            global,
            args.id,
            {
              limit: args.limit,
              page: args.page,
              filter: args.filter,
            },
            false,
          ),
        ),
    );

    server.registerTool(
      'ghost_comment_likes',
      {
        description: 'List likes for a Ghost comment.',
        inputSchema: z.object({
          id: z.string(),
          limit: z.number().int().positive().max(100).optional(),
          page: z.number().int().positive().optional(),
        }),
      },
      async (args) =>
        toolResult(
          await listCommentLikes(
            global,
            args.id,
            {
              limit: args.limit,
              page: args.page,
            },
            false,
          ),
        ),
    );

    server.registerTool(
      'ghost_comment_reports',
      {
        description: 'List reports for a Ghost comment.',
        inputSchema: z.object({
          id: z.string(),
          limit: z.number().int().positive().max(100).optional(),
          page: z.number().int().positive().optional(),
        }),
      },
      async (args) =>
        toolResult(
          await listCommentReports(
            global,
            args.id,
            {
              limit: args.limit,
              page: args.page,
            },
            false,
          ),
        ),
    );

    server.registerTool(
      'ghost_comment_hide',
      {
        description: 'Hide a Ghost comment.',
        inputSchema: z.object({
          id: z.string(),
        }),
      },
      async (args) => toolResult(await setCommentStatus(global, args.id, 'hidden')),
    );

    server.registerTool(
      'ghost_comment_show',
      {
        description: 'Show a previously hidden Ghost comment.',
        inputSchema: z.object({
          id: z.string(),
        }),
      },
      async (args) => toolResult(await setCommentStatus(global, args.id, 'published')),
    );

    server.registerTool(
      'ghost_comment_delete',
      {
        description: 'Soft-delete a Ghost comment.',
        inputSchema: z.object({
          id: z.string(),
          confirm: z.literal(true),
        }),
      },
      async (args) => toolResult(await setCommentStatus(global, args.id, 'deleted')),
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
        let resultPayload = payload;

        if (args.activate) {
          const name = getUploadedThemeName(payload);
          if (!name) {
            throw new Error('Theme uploaded, but activation could not determine the theme name.');
          }

          resultPayload = await activateTheme(global, name);
        }

        return toolResult(resultPayload);
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

  if (enabledGroups.has('socialweb')) {
    server.registerTool(
      'ghost_socialweb_status',
      {
        description: 'Show Ghost social web settings and connectivity status.',
      },
      async () => toolResult(await getSocialWebStatus(global)),
    );

    server.registerTool(
      'ghost_socialweb_enable',
      {
        description: 'Enable Ghost social web and return the resulting status.',
      },
      async () => toolResult(await enableSocialWeb(global)),
    );

    server.registerTool(
      'ghost_socialweb_disable',
      {
        description: 'Disable Ghost social web and return the resulting status.',
      },
      async () => toolResult(await disableSocialWeb(global)),
    );

    server.registerTool(
      'ghost_socialweb_profile',
      {
        description: 'Get a social web profile by federated handle or me.',
        inputSchema: z.object({
          handle: socialWebHandleSchema.optional(),
        }),
      },
      async (args) => toolResult(await getSocialWebProfile(global, args.handle ?? 'me')),
    );

    server.registerTool(
      'ghost_socialweb_profile_update',
      {
        description: 'Update the current social web profile.',
        inputSchema: socialWebProfileUpdateSchema,
      },
      async (args) =>
        toolResult(
          await updateSocialWebProfile(global, {
            name: args.name,
            username: args.username,
            bio: args.bio,
            avatarUrl: args.avatar_url,
            bannerImageUrl: args.banner_image_url,
          }),
        ),
    );

    server.registerTool(
      'ghost_socialweb_search',
      {
        description: 'Search social web accounts.',
        inputSchema: z.object({
          query: z.string().min(1),
        }),
      },
      async (args) => toolResult(await searchSocialWeb(global, args.query)),
    );

    server.registerTool(
      'ghost_socialweb_notes',
      {
        description: 'List the social web note feed.',
        inputSchema: socialWebPaginationSchema,
      },
      async (args) => {
        const pagination = mapSocialWebPaginationArgs(args);
        return toolResult(await listNotes(global, pagination.params, pagination.allPages));
      },
    );

    server.registerTool(
      'ghost_socialweb_reader',
      {
        description: 'List the social web reader feed.',
        inputSchema: socialWebPaginationSchema,
      },
      async (args) => {
        const pagination = mapSocialWebPaginationArgs(args);
        return toolResult(await listReader(global, pagination.params, pagination.allPages));
      },
    );

    server.registerTool(
      'ghost_socialweb_notifications',
      {
        description: 'List social web notifications.',
        inputSchema: socialWebPaginationSchema,
      },
      async (args) => {
        const pagination = mapSocialWebPaginationArgs(args);
        return toolResult(await listNotifications(global, pagination.params, pagination.allPages));
      },
    );

    server.registerTool(
      'ghost_socialweb_notifications_count',
      {
        description: 'Get the unread social web notification count.',
      },
      async () => toolResult(await getNotificationsCount(global)),
    );

    server.registerTool(
      'ghost_socialweb_posts',
      {
        description: 'List posts for a social web account.',
        inputSchema: socialWebHandlePaginationSchema,
      },
      async (args) => {
        const pagination = mapSocialWebPaginationArgs(args);
        return toolResult(
          await listSocialWebPosts(
            global,
            args.handle ?? 'me',
            pagination.params,
            pagination.allPages,
          ),
        );
      },
    );

    server.registerTool(
      'ghost_socialweb_likes',
      {
        description: 'List posts liked by the current social web account.',
        inputSchema: socialWebPaginationSchema,
      },
      async (args) => {
        const pagination = mapSocialWebPaginationArgs(args);
        return toolResult(await listSocialWebLikes(global, pagination.params, pagination.allPages));
      },
    );

    server.registerTool(
      'ghost_socialweb_followers',
      {
        description: 'List followers for a social web account.',
        inputSchema: socialWebHandlePaginationSchema,
      },
      async (args) => {
        const pagination = mapSocialWebPaginationArgs(args);
        return toolResult(
          await listFollowers(global, args.handle ?? 'me', pagination.params, pagination.allPages),
        );
      },
    );

    server.registerTool(
      'ghost_socialweb_following',
      {
        description: 'List followed accounts for a social web account.',
        inputSchema: socialWebHandlePaginationSchema,
      },
      async (args) => {
        const pagination = mapSocialWebPaginationArgs(args);
        return toolResult(
          await listFollowing(global, args.handle ?? 'me', pagination.params, pagination.allPages),
        );
      },
    );

    server.registerTool(
      'ghost_socialweb_post',
      {
        description: 'Get a social web post by ActivityPub id.',
        inputSchema: z.object({
          id: socialWebUrlSchema,
        }),
      },
      async (args) => toolResult(await getSocialWebPost(global, args.id)),
    );

    server.registerTool(
      'ghost_socialweb_thread',
      {
        description: 'Get a social web thread by ActivityPub id.',
        inputSchema: z.object({
          id: socialWebUrlSchema,
        }),
      },
      async (args) => toolResult(await getSocialWebThread(global, args.id)),
    );

    server.registerTool(
      'ghost_socialweb_follow',
      {
        description: 'Follow a federated social web account.',
        inputSchema: z.object({
          handle: socialWebRemoteHandleSchema,
        }),
      },
      async (args) => toolResult(await followAccount(global, args.handle)),
    );

    server.registerTool(
      'ghost_socialweb_unfollow',
      {
        description: 'Unfollow a federated social web account.',
        inputSchema: z.object({
          handle: socialWebRemoteHandleSchema,
        }),
      },
      async (args) => toolResult(await unfollowAccount(global, args.handle)),
    );

    server.registerTool(
      'ghost_socialweb_like',
      {
        description: 'Like a social web post.',
        inputSchema: z.object({
          id: socialWebUrlSchema,
        }),
      },
      async (args) => toolResult(await likePost(global, args.id)),
    );

    server.registerTool(
      'ghost_socialweb_unlike',
      {
        description: 'Unlike a social web post.',
        inputSchema: z.object({
          id: socialWebUrlSchema,
        }),
      },
      async (args) => toolResult(await unlikePost(global, args.id)),
    );

    server.registerTool(
      'ghost_socialweb_repost',
      {
        description: 'Repost a social web post.',
        inputSchema: z.object({
          id: socialWebUrlSchema,
        }),
      },
      async (args) => toolResult(await repostPost(global, args.id)),
    );

    server.registerTool(
      'ghost_socialweb_derepost',
      {
        description: 'Undo a repost on a social web post.',
        inputSchema: z.object({
          id: socialWebUrlSchema,
        }),
      },
      async (args) => toolResult(await derepostPost(global, args.id)),
    );

    server.registerTool(
      'ghost_socialweb_delete',
      {
        description: 'Delete a social web post authored by the current account.',
        inputSchema: z.object({
          id: socialWebUrlSchema,
        }),
      },
      async (args) => toolResult(await deleteSocialWebPost(global, args.id)),
    );

    server.registerTool(
      'ghost_socialweb_note',
      {
        description: 'Create a new social web note.',
        inputSchema: socialWebContentSchema,
      },
      async (args) =>
        toolResult(
          await createNote(global, {
            content: args.content,
            imageFile: args.image_file,
            imageUrl: args.image_url,
            imageAlt: args.image_alt,
          }),
        ),
    );

    server.registerTool(
      'ghost_socialweb_reply',
      {
        description: 'Reply to a social web post.',
        inputSchema: socialWebContentSchema.extend({
          id: socialWebUrlSchema,
        }),
      },
      async (args) =>
        toolResult(
          await replyToPost(global, args.id, {
            content: args.content,
            imageFile: args.image_file,
            imageUrl: args.image_url,
            imageAlt: args.image_alt,
          }),
        ),
    );

    server.registerTool(
      'ghost_socialweb_blocked_accounts',
      {
        description: 'List blocked social web accounts.',
        inputSchema: socialWebPaginationSchema,
      },
      async (args) => {
        const pagination = mapSocialWebPaginationArgs(args);
        return toolResult(
          await listBlockedAccounts(global, pagination.params, pagination.allPages),
        );
      },
    );

    server.registerTool(
      'ghost_socialweb_blocked_domains',
      {
        description: 'List blocked social web domains.',
        inputSchema: socialWebPaginationSchema,
      },
      async (args) => {
        const pagination = mapSocialWebPaginationArgs(args);
        return toolResult(await listBlockedDomains(global, pagination.params, pagination.allPages));
      },
    );

    server.registerTool(
      'ghost_socialweb_block',
      {
        description: 'Block a social web account by ActivityPub id.',
        inputSchema: z.object({
          id: socialWebUrlSchema,
        }),
      },
      async (args) => toolResult(await blockAccount(global, args.id)),
    );

    server.registerTool(
      'ghost_socialweb_unblock',
      {
        description: 'Unblock a social web account by ActivityPub id.',
        inputSchema: z.object({
          id: socialWebUrlSchema,
        }),
      },
      async (args) => toolResult(await unblockAccount(global, args.id)),
    );

    server.registerTool(
      'ghost_socialweb_block_domain',
      {
        description: 'Block a social web domain.',
        inputSchema: z.object({
          url: socialWebUrlSchema,
        }),
      },
      async (args) => toolResult(await blockDomain(global, args.url)),
    );

    server.registerTool(
      'ghost_socialweb_unblock_domain',
      {
        description: 'Unblock a social web domain.',
        inputSchema: z.object({
          url: socialWebUrlSchema,
        }),
      },
      async (args) => toolResult(await unblockDomain(global, args.url)),
    );

    server.registerTool(
      'ghost_socialweb_upload',
      {
        description: 'Upload an image for social web notes and replies.',
        inputSchema: z.object({
          file_path: z.string().min(1),
        }),
      },
      async (args) => toolResult(await uploadSocialWebImage(global, args.file_path)),
    );
  }

  if (enabledGroups.has('stats')) {
    server.registerTool(
      'ghost_stats_overview',
      {
        description: 'Get the Ghost analytics overview report.',
        inputSchema: z.object({
          ...statsRangeArgs,
        }),
      },
      async (args) => toolResult(await getStatsOverview(global, mapStatsRangeArgs(args))),
    );

    server.registerTool(
      'ghost_stats_web',
      {
        description: 'Get the Ghost web analytics report.',
        inputSchema: z.object({
          ...statsWebArgs,
        }),
      },
      async (args) => toolResult(await getStatsWeb(global, mapStatsWebArgs(args))),
    );

    server.registerTool(
      'ghost_stats_web_table',
      {
        description: 'Get a focused Ghost web analytics table view.',
        inputSchema: z.object({
          view: statsTableViewSchema,
          ...statsWebArgs,
        }),
      },
      async (args) =>
        toolResult(
          await getStatsWebTable(global, args.view, {
            ...mapStatsWebArgs(args),
            limit: args.limit ?? 10,
          }),
        ),
    );

    server.registerTool(
      'ghost_stats_growth',
      {
        description: 'Get Ghost member and revenue growth analytics.',
        inputSchema: z.object({
          ...statsRangeArgs,
          limit: z.number().int().positive().max(100).optional(),
        }),
      },
      async (args) =>
        toolResult(
          await getStatsGrowth(global, { ...mapStatsRangeArgs(args), limit: args.limit ?? 5 }),
        ),
    );

    server.registerTool(
      'ghost_stats_posts',
      {
        description: 'Get top Ghost posts by views.',
        inputSchema: z.object({
          ...statsRangeArgs,
          limit: z.number().int().positive().max(100).optional(),
        }),
      },
      async (args) =>
        toolResult(
          await getStatsPosts(global, { ...mapStatsRangeArgs(args), limit: args.limit ?? 5 }),
        ),
    );

    server.registerTool(
      'ghost_stats_email',
      {
        description: 'Get Ghost email analytics grouped by newsletter.',
        inputSchema: z.object({
          ...statsRangeArgs,
          newsletter_id: z.string().optional(),
          limit: z.number().int().positive().max(100).optional(),
        }),
      },
      async (args) =>
        toolResult(
          await getStatsNewsletters(global, {
            ...mapStatsRangeArgs(args),
            newsletterId: args.newsletter_id,
            limit: args.limit ?? 10,
          }),
        ),
    );

    server.registerTool(
      'ghost_stats_email_clicks',
      {
        description:
          'Get Ghost email click analytics for a newsletter, optionally filtered by post ids.',
        inputSchema: z.object({
          ...statsRangeArgs,
          newsletter_id: z.string(),
          post_ids: z.array(z.string()).optional(),
          limit: z.number().int().positive().max(100).optional(),
        }),
      },
      async (args) =>
        toolResult(
          await getStatsNewsletterClicks(global, {
            ...mapStatsRangeArgs(args),
            newsletterId: args.newsletter_id,
            postIds: args.post_ids,
            limit: args.limit ?? 10,
          }),
        ),
    );

    server.registerTool(
      'ghost_stats_email_subscribers',
      {
        description: 'Get Ghost newsletter subscriber analytics.',
        inputSchema: z.object({
          ...statsRangeArgs,
          newsletter_id: z.string().optional(),
        }),
      },
      async (args) =>
        toolResult(
          await getStatsNewsletterSubscribers(global, {
            ...mapStatsRangeArgs(args),
            newsletterId: args.newsletter_id,
          }),
        ),
    );

    server.registerTool(
      'ghost_stats_post',
      {
        description: 'Get Ghost analytics for a single post.',
        inputSchema: z.object({
          id: z.string(),
          ...statsRangeArgs,
        }),
      },
      async (args) =>
        toolResult(await getStatsPost(global, { ...mapStatsRangeArgs(args), id: args.id })),
    );

    server.registerTool(
      'ghost_stats_post_web',
      {
        description: 'Get Ghost web analytics for a single post.',
        inputSchema: z.object({
          id: z.string(),
          ...statsWebArgs,
        }),
      },
      async (args) =>
        toolResult(await getStatsPostWeb(global, { ...mapStatsWebArgs(args), id: args.id })),
    );

    server.registerTool(
      'ghost_stats_post_growth',
      {
        description: 'Get Ghost growth analytics for a single post.',
        inputSchema: z.object({
          id: z.string(),
          ...statsRangeArgs,
        }),
      },
      async (args) =>
        toolResult(await getStatsPostGrowth(global, { ...mapStatsRangeArgs(args), id: args.id })),
    );

    server.registerTool(
      'ghost_stats_post_newsletter',
      {
        description: 'Get Ghost email performance analytics for a single post.',
        inputSchema: z.object({
          id: z.string(),
          ...statsRangeArgs,
        }),
      },
      async (args) =>
        toolResult(
          await getStatsPostNewsletter(global, { ...mapStatsRangeArgs(args), id: args.id }),
        ),
    );

    server.registerTool(
      'ghost_stats_post_referrers',
      {
        description: 'Get Ghost referrer analytics for a single post.',
        inputSchema: z.object({
          id: z.string(),
          ...statsRangeArgs,
          limit: z.number().int().positive().max(100).optional(),
        }),
      },
      async (args) =>
        toolResult(
          await getStatsPostReferrers(global, {
            ...mapStatsRangeArgs(args),
            id: args.id,
            limit: args.limit ?? 10,
          }),
        ),
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
