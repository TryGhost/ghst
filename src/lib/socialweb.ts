import { ExitCode, GhstError } from './errors.js';
import { listSettings, setSetting } from './settings.js';
import { SocialWebClient, type SocialWebIdentityInfo } from './socialweb-client.js';
import type { GlobalOptions } from './types.js';

export interface SocialWebAccount {
  id: string;
  apId?: string;
  name: string;
  handle: string;
  bio?: string;
  url?: string;
  avatarUrl?: string | null;
  bannerImageUrl?: string | null;
  postCount?: number;
  likedCount?: number;
  followingCount?: number;
  followerCount?: number;
  followedByMe?: boolean;
  blockedByMe?: boolean;
  domainBlockedByMe?: boolean;
  blueskyEnabled?: boolean;
  blueskyHandleConfirmed?: boolean;
  blueskyHandle?: string | null;
  [key: string]: unknown;
}

export interface SocialWebPost {
  id: string;
  type?: number | string;
  title?: string | null;
  excerpt?: string;
  summary?: string | null;
  content?: string;
  url?: string;
  featureImageUrl?: string | null;
  publishedAt?: string;
  likeCount?: number;
  likedByMe?: boolean;
  replyCount?: number;
  readingTimeMinutes?: number;
  attachments?: Array<Record<string, unknown>>;
  author?: Record<string, unknown>;
  authoredByMe?: boolean;
  repostCount?: number;
  repostedByMe?: boolean;
  repostedBy?: Record<string, unknown> | null;
  [key: string]: unknown;
}

export interface SocialWebNotification {
  id: string;
  type: string;
  actor: {
    id: string;
    name: string;
    handle: string;
    avatarUrl?: string | null;
    [key: string]: unknown;
  };
  post?: Record<string, unknown> | null;
  inReplyTo?: Record<string, unknown> | null;
  createdAt: string;
  [key: string]: unknown;
}

export interface SocialWebStatusReport {
  settings: {
    social_web: boolean;
    explore_ping: boolean | null;
    explore_ping_growth: boolean | null;
  };
  identity: {
    available: boolean;
    sub: string | null;
    role: string | null;
    exp: number | null;
  };
  account: SocialWebAccount | null;
  reachable: boolean;
}

type PaginatedKey = 'posts' | 'accounts' | 'notifications' | 'blocked_accounts' | 'blocked_domains';
type PaginatedParams = { limit?: number; next?: string };
const MAX_PAGINATION_PAGES = 100;

function parseSettingBool(value: unknown): boolean | null {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'string') {
    if (value === 'true') return true;
    if (value === 'false') return false;
  }

  return null;
}

function getSettingMap(payload: Record<string, unknown>): Map<string, unknown> {
  const settings = Array.isArray(payload.settings)
    ? (payload.settings as Array<Record<string, unknown>>)
    : [];
  return new Map(settings.map((setting) => [String(setting.key ?? ''), setting.value]));
}

function mergePaginatedPages(
  existing: Record<string, unknown> | null,
  next: Record<string, unknown>,
  key: PaginatedKey,
): Record<string, unknown> {
  if (!existing) {
    return next;
  }

  const currentItems = Array.isArray(existing[key]) ? (existing[key] as unknown[]) : [];
  const nextItems = Array.isArray(next[key]) ? (next[key] as unknown[]) : [];

  return {
    ...next,
    [key]: [...currentItems, ...nextItems],
    next: next.next ?? null,
  };
}

async function collectPaginated(
  fetchPage: (next?: string) => Promise<Record<string, unknown>>,
  key: PaginatedKey,
  allPages: boolean,
  next?: string,
): Promise<Record<string, unknown>> {
  if (!allPages) {
    return fetchPage(next);
  }

  let cursor = next;
  let merged: Record<string, unknown> | null = null;
  let pageCount = 0;

  while (true) {
    if (++pageCount > MAX_PAGINATION_PAGES) {
      throw new GhstError('Pagination exceeded the maximum number of pages.', {
        code: 'PAGINATION_ERROR',
        exitCode: ExitCode.GENERAL_ERROR,
      });
    }

    const page = await fetchPage(cursor);
    merged = mergePaginatedPages(merged, page, key);
    const nextCursor = typeof page.next === 'string' && page.next.length > 0 ? page.next : null;
    if (!nextCursor) {
      break;
    }
    cursor = nextCursor;
  }

  return merged ?? { [key]: [], next: null };
}

function encodeHandle(handle: string): string {
  return handle === 'me' ? 'me' : encodeURIComponent(handle);
}

function encodeActivityPubId(id: string): string {
  return encodeURIComponent(id);
}

async function getClient(global: GlobalOptions): Promise<SocialWebClient> {
  return new SocialWebClient(global);
}

async function getStatusBase(global: GlobalOptions): Promise<{
  client: SocialWebClient;
  settings: SocialWebStatusReport['settings'];
}> {
  const settingsPayload = await listSettings(global);
  const settingMap = getSettingMap(settingsPayload);

  return {
    client: await getClient(global),
    settings: {
      social_web: parseSettingBool(settingMap.get('social_web')) ?? false,
      explore_ping: parseSettingBool(settingMap.get('explore_ping')),
      explore_ping_growth: parseSettingBool(settingMap.get('explore_ping_growth')),
    },
  };
}

function identityStatus(identity: SocialWebIdentityInfo | null): SocialWebStatusReport['identity'] {
  return {
    available: Boolean(identity),
    sub: identity?.claims.sub ?? null,
    role: identity?.claims.role ?? null,
    exp: identity?.claims.exp ?? null,
  };
}

export async function getSocialWebStatus(global: GlobalOptions): Promise<SocialWebStatusReport> {
  const { client, settings } = await getStatusBase(global);
  if (!settings.social_web) {
    return {
      settings,
      identity: identityStatus(null),
      account: null,
      reachable: false,
    };
  }

  try {
    const identity = await client.getIdentity();
    const account = await client.get<SocialWebAccount>('/.ghost/activitypub/v1/account/me');

    return {
      settings,
      identity: identityStatus(identity),
      account,
      reachable: true,
    };
  } catch {
    let identity: SocialWebIdentityInfo | null = null;
    try {
      identity = await client.getIdentity();
    } catch {
      identity = null;
    }

    return {
      settings,
      identity: identityStatus(identity),
      account: null,
      reachable: false,
    };
  }
}

export async function enableSocialWeb(global: GlobalOptions): Promise<SocialWebStatusReport> {
  await setSetting(global, 'social_web', true);
  return getSocialWebStatus(global);
}

export async function disableSocialWeb(global: GlobalOptions): Promise<SocialWebStatusReport> {
  await setSetting(global, 'social_web', false);
  const report = await getSocialWebStatus(global);
  return {
    ...report,
    settings: {
      ...report.settings,
      social_web: false,
    },
  };
}

export async function getSocialWebProfile(
  global: GlobalOptions,
  handle: string,
): Promise<SocialWebAccount> {
  const client = await getClient(global);
  return client.get<SocialWebAccount>(`/.ghost/activitypub/v1/account/${encodeHandle(handle)}`);
}

export async function updateSocialWebProfile(
  global: GlobalOptions,
  patch: {
    name?: string;
    username?: string;
    bio?: string;
    avatarUrl?: string;
    bannerImageUrl?: string;
  },
): Promise<SocialWebAccount> {
  const client = await getClient(global);
  const current = await client.get<SocialWebAccount>('/.ghost/activitypub/v1/account/me');
  const currentUsername =
    String(current.handle ?? '')
      .replace(/^@/, '')
      .split('@')[0] ?? '';

  await client.put<Record<string, unknown>>('/.ghost/activitypub/v1/account', {
    name: patch.name ?? current.name ?? '',
    username: patch.username ?? currentUsername,
    bio: patch.bio ?? current.bio ?? '',
    avatarUrl: patch.avatarUrl ?? current.avatarUrl ?? '',
    bannerImageUrl: patch.bannerImageUrl ?? current.bannerImageUrl ?? '',
  });

  return client.get<SocialWebAccount>('/.ghost/activitypub/v1/account/me');
}

export async function searchSocialWeb(
  global: GlobalOptions,
  query: string,
): Promise<Record<string, unknown>> {
  const client = await getClient(global);
  return client.get<Record<string, unknown>>('/.ghost/activitypub/v1/actions/search', { query });
}

export async function listNotes(
  global: GlobalOptions,
  params: { limit?: number; next?: string },
  allPages: boolean,
): Promise<Record<string, unknown>> {
  const client = await getClient(global);
  return collectPaginated(
    (next) => client.get('/.ghost/activitypub/v1/feed/notes', { limit: params.limit, next }),
    'posts',
    allPages,
    params.next,
  );
}

export async function listReader(
  global: GlobalOptions,
  params: { limit?: number; next?: string },
  allPages: boolean,
): Promise<Record<string, unknown>> {
  const client = await getClient(global);
  return collectPaginated(
    (next) => client.get('/.ghost/activitypub/v1/feed/reader', { limit: params.limit, next }),
    'posts',
    allPages,
    params.next,
  );
}

export async function listNotifications(
  global: GlobalOptions,
  params: { limit?: number; next?: string },
  allPages: boolean,
): Promise<Record<string, unknown>> {
  const client = await getClient(global);
  return collectPaginated(
    (next) => client.get('/.ghost/activitypub/v1/notifications', { limit: params.limit, next }),
    'notifications',
    allPages,
    params.next,
  );
}

export async function getNotificationsCount(
  global: GlobalOptions,
): Promise<Record<string, unknown>> {
  const client = await getClient(global);
  return client.get<Record<string, unknown>>('/.ghost/activitypub/v1/notifications/unread/count');
}

export async function resetNotificationsCount(
  global: GlobalOptions,
): Promise<Record<string, unknown>> {
  const client = await getClient(global);
  await client.put<Record<string, unknown>>('/.ghost/activitypub/v1/notifications/unread/reset');
  return { count: 0, reset: true };
}

export async function listSocialWebPosts(
  global: GlobalOptions,
  handle: string,
  params: PaginatedParams,
  allPages: boolean,
): Promise<Record<string, unknown>> {
  const client = await getClient(global);
  return collectPaginated(
    (next) =>
      client.get(`/.ghost/activitypub/v1/posts/${encodeHandle(handle)}`, {
        limit: params.limit,
        next,
      }),
    'posts',
    allPages,
    params.next,
  );
}

export async function listSocialWebLikes(
  global: GlobalOptions,
  params: { limit?: number; next?: string },
  allPages: boolean,
): Promise<Record<string, unknown>> {
  const client = await getClient(global);
  return collectPaginated(
    (next) => client.get('/.ghost/activitypub/v1/posts/me/liked', { limit: params.limit, next }),
    'posts',
    allPages,
    params.next,
  );
}

async function listSocialWebFollows(
  global: GlobalOptions,
  handle: string,
  type: 'followers' | 'following',
  params: PaginatedParams,
  allPages: boolean,
): Promise<Record<string, unknown>> {
  const client = await getClient(global);
  return collectPaginated(
    (next) =>
      client.get(`/.ghost/activitypub/v1/account/${encodeHandle(handle)}/follows/${type}`, {
        limit: params.limit,
        next,
      }),
    'accounts',
    allPages,
    params.next,
  );
}

export async function listFollowers(
  global: GlobalOptions,
  handle: string,
  params: PaginatedParams,
  allPages: boolean,
): Promise<Record<string, unknown>> {
  return listSocialWebFollows(global, handle, 'followers', params, allPages);
}

export async function listFollowing(
  global: GlobalOptions,
  handle: string,
  params: PaginatedParams,
  allPages: boolean,
): Promise<Record<string, unknown>> {
  return listSocialWebFollows(global, handle, 'following', params, allPages);
}

export async function getSocialWebPost(global: GlobalOptions, id: string): Promise<SocialWebPost> {
  const client = await getClient(global);
  return client.get<SocialWebPost>(`/.ghost/activitypub/v1/post/${encodeActivityPubId(id)}`);
}

export async function getSocialWebThread(
  global: GlobalOptions,
  id: string,
): Promise<Record<string, unknown>> {
  const client = await getClient(global);
  try {
    return await client.get<Record<string, unknown>>(
      `/.ghost/activitypub/v1/replies/${encodeActivityPubId(id)}`,
    );
  } catch (error) {
    const status = (error as { status?: number }).status;
    if (status !== 404) {
      throw error;
    }

    await client.get<Record<string, unknown>>(
      `/.ghost/activitypub/v1/post/${encodeActivityPubId(id)}`,
    );
    return client.get<Record<string, unknown>>(
      `/.ghost/activitypub/v1/replies/${encodeActivityPubId(id)}`,
    );
  }
}

export async function followAccount(
  global: GlobalOptions,
  handle: string,
): Promise<Record<string, unknown>> {
  const client = await getClient(global);
  return client.post<Record<string, unknown>>(
    `/.ghost/activitypub/v1/actions/follow/${encodeHandle(handle)}`,
  );
}

export async function unfollowAccount(
  global: GlobalOptions,
  handle: string,
): Promise<Record<string, unknown>> {
  const client = await getClient(global);
  return client.post<Record<string, unknown>>(
    `/.ghost/activitypub/v1/actions/unfollow/${encodeHandle(handle)}`,
  );
}

export async function likePost(
  global: GlobalOptions,
  id: string,
): Promise<Record<string, unknown>> {
  const client = await getClient(global);
  return client.post<Record<string, unknown>>(
    `/.ghost/activitypub/v1/actions/like/${encodeActivityPubId(id)}`,
  );
}

export async function unlikePost(
  global: GlobalOptions,
  id: string,
): Promise<Record<string, unknown>> {
  const client = await getClient(global);
  return client.post<Record<string, unknown>>(
    `/.ghost/activitypub/v1/actions/unlike/${encodeActivityPubId(id)}`,
  );
}

export async function repostPost(
  global: GlobalOptions,
  id: string,
): Promise<Record<string, unknown>> {
  const client = await getClient(global);
  return client.post<Record<string, unknown>>(
    `/.ghost/activitypub/v1/actions/repost/${encodeActivityPubId(id)}`,
  );
}

export async function derepostPost(
  global: GlobalOptions,
  id: string,
): Promise<Record<string, unknown>> {
  const client = await getClient(global);
  return client.post<Record<string, unknown>>(
    `/.ghost/activitypub/v1/actions/derepost/${encodeActivityPubId(id)}`,
  );
}

export async function deleteSocialWebPost(
  global: GlobalOptions,
  id: string,
): Promise<Record<string, unknown>> {
  const client = await getClient(global);
  return client.delete<Record<string, unknown>>(
    `/.ghost/activitypub/v1/post/${encodeActivityPubId(id)}`,
  );
}

export async function uploadSocialWebImage(
  global: GlobalOptions,
  filePath: string,
): Promise<Record<string, unknown>> {
  const client = await getClient(global);
  return client.uploadImage(filePath);
}

async function resolveImagePayload(
  global: GlobalOptions,
  options: { imageFile?: string; imageUrl?: string; imageAlt?: string },
): Promise<{ url: string; altText?: string } | undefined> {
  if (options.imageFile) {
    const uploaded = await uploadSocialWebImage(global, options.imageFile);
    const fileUrl = typeof uploaded.fileUrl === 'string' ? uploaded.fileUrl : '';
    return fileUrl ? { url: fileUrl, altText: options.imageAlt } : undefined;
  }

  if (options.imageUrl) {
    return { url: options.imageUrl, altText: options.imageAlt };
  }

  return undefined;
}

export async function createNote(
  global: GlobalOptions,
  options: {
    content: string;
    imageFile?: string;
    imageUrl?: string;
    imageAlt?: string;
  },
): Promise<Record<string, unknown>> {
  const client = await getClient(global);
  const image = await resolveImagePayload(global, options);
  return client.post<Record<string, unknown>>('/.ghost/activitypub/v1/actions/note', {
    content: options.content,
    ...(image ? { image } : {}),
  });
}

export async function replyToPost(
  global: GlobalOptions,
  id: string,
  options: {
    content: string;
    imageFile?: string;
    imageUrl?: string;
    imageAlt?: string;
  },
): Promise<Record<string, unknown>> {
  const client = await getClient(global);
  const image = await resolveImagePayload(global, options);
  return client.post<Record<string, unknown>>(
    `/.ghost/activitypub/v1/actions/reply/${encodeActivityPubId(id)}`,
    {
      content: options.content,
      ...(image ? { image } : {}),
    },
  );
}

export async function listBlockedAccounts(
  global: GlobalOptions,
  params: PaginatedParams,
  allPages: boolean,
): Promise<Record<string, unknown>> {
  const client = await getClient(global);
  return collectPaginated(
    (next) => client.get('/.ghost/activitypub/v1/blocks/accounts', { limit: params.limit, next }),
    'blocked_accounts',
    allPages,
    params.next,
  );
}

export async function listBlockedDomains(
  global: GlobalOptions,
  params: PaginatedParams,
  allPages: boolean,
): Promise<Record<string, unknown>> {
  const client = await getClient(global);
  return collectPaginated(
    (next) => client.get('/.ghost/activitypub/v1/blocks/domains', { limit: params.limit, next }),
    'blocked_domains',
    allPages,
    params.next,
  );
}

export async function blockAccount(
  global: GlobalOptions,
  id: string,
): Promise<Record<string, unknown>> {
  const client = await getClient(global);
  return client.post<Record<string, unknown>>(
    `/.ghost/activitypub/v1/actions/block/${encodeActivityPubId(id)}`,
  );
}

export async function unblockAccount(
  global: GlobalOptions,
  id: string,
): Promise<Record<string, unknown>> {
  const client = await getClient(global);
  return client.post<Record<string, unknown>>(
    `/.ghost/activitypub/v1/actions/unblock/${encodeActivityPubId(id)}`,
  );
}

export async function blockDomain(
  global: GlobalOptions,
  url: string,
): Promise<Record<string, unknown>> {
  const client = await getClient(global);
  return client.post<Record<string, unknown>>(
    `/.ghost/activitypub/v1/actions/block/domain/${encodeActivityPubId(url)}`,
  );
}

export async function unblockDomain(
  global: GlobalOptions,
  url: string,
): Promise<Record<string, unknown>> {
  const client = await getClient(global);
  return client.post<Record<string, unknown>>(
    `/.ghost/activitypub/v1/actions/unblock/domain/${encodeActivityPubId(url)}`,
  );
}
