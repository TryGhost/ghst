import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { ExitCode } from '../src/lib/errors.js';
import { uploadImage } from '../src/lib/images.js';
import { createLabel, deleteLabel, getLabel, listLabels, updateLabel } from '../src/lib/labels.js';
import {
  bulkMembers,
  createMember,
  deleteMember,
  exportMembersCsv,
  getMember,
  importMembersCsv,
  listMembers,
  updateMember,
} from '../src/lib/members.js';
import {
  migrateExport,
  migrateImportCsv,
  migrateImportJson,
  migrateImportMedium,
  migrateImportSubstack,
  migrateImportWordpress,
  setMigrateSourceLoaderForTests,
} from '../src/lib/migrate.js';
import {
  createNewsletter,
  getNewsletter,
  listNewsletters,
  updateNewsletter,
} from '../src/lib/newsletters.js';
import { createOffer, getOffer, listOffers, updateOffer } from '../src/lib/offers.js';
import {
  bulkPages,
  copyPage,
  createPage,
  deletePage,
  getPage,
  listPages,
  updatePage,
} from '../src/lib/pages.js';
import {
  bulkPosts,
  copyPost,
  createPost,
  deletePost,
  getPost,
  listPosts,
  publishPost,
  schedulePost,
  unschedulePost,
  updatePost,
} from '../src/lib/posts.js';
import { getSetting, listSettings, setSetting } from '../src/lib/settings.js';
import { getSiteInfo } from '../src/lib/site.js';
import { bulkTags, createTag, deleteTag, getTag, listTags, updateTag } from '../src/lib/tags.js';
import { activateTheme, listThemes, uploadTheme } from '../src/lib/themes.js';
import { createTier, getTier, listTiers, updateTier } from '../src/lib/tiers.js';
import { getCurrentUser, getUser, listUsers } from '../src/lib/users.js';
import { createWebhook, deleteWebhook, updateWebhook } from '../src/lib/webhooks.js';
import { cloneFixture, fixtureIds, ghostFixtures } from './helpers/ghost-fixtures.js';
import { installGhostFixtureFetchMock, jsonResponse } from './helpers/mock-ghost.js';

const KEY = 'abc123:00112233445566778899aabbccddeeff';

describe('resource service helpers', () => {
  let tempRoot = '';
  let workDir = '';
  let configDir = '';
  let previousCwd = '';
  let previousConfigDir: string | undefined;

  beforeEach(async () => {
    previousCwd = process.cwd();
    previousConfigDir = process.env.GHST_CONFIG_DIR;

    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'ghst-lib-services-'));
    workDir = path.join(tempRoot, 'work');
    configDir = path.join(tempRoot, 'config');
    await fs.mkdir(workDir, { recursive: true });
    await fs.mkdir(configDir, { recursive: true });
    process.chdir(workDir);

    process.env.GHST_CONFIG_DIR = configDir;
    await fs.writeFile(
      path.join(configDir, 'config.json'),
      JSON.stringify(
        {
          version: 1,
          active: 'myblog',
          sites: {
            myblog: {
              url: 'https://myblog.ghost.io',
              adminApiKey: KEY,
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

    await fs.writeFile(path.join(workDir, 'photo.jpg'), 'fake-image', 'utf8');
    await fs.writeFile(path.join(workDir, 'theme.zip'), 'fake-zip', 'utf8');
    await fs.writeFile(path.join(workDir, 'import.json'), '{"db":[{"meta":{},"data":{}}]}', 'utf8');
    await fs.writeFile(
      path.join(workDir, 'migrate.csv'),
      'title,html\nImported Post,<p>Hello</p>\n',
      'utf8',
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
    setMigrateSourceLoaderForTests(null);
    process.chdir(previousCwd);
    if (previousConfigDir === undefined) {
      delete process.env.GHST_CONFIG_DIR;
    } else {
      process.env.GHST_CONFIG_DIR = previousConfigDir;
    }
  });

  test('lists all pages for resources', async () => {
    installGhostFixtureFetchMock({
      onRequest: ({ pathname, method, url }) => {
        if (method !== 'GET') {
          return undefined;
        }

        const page = Number(url.searchParams.get('page') ?? '1');

        if (pathname.endsWith('/posts/')) {
          const payload = cloneFixture(ghostFixtures.posts.browse) as Record<string, unknown>;
          const posts = payload.posts as Array<Record<string, unknown>>;
          if (posts[0]) {
            posts[0].id = `post-${page}`;
          }
          payload.meta = { pagination: { page, pages: 2, total: 2 } };
          return jsonResponse(payload);
        }

        if (pathname.endsWith('/pages/')) {
          const payload = cloneFixture(ghostFixtures.pages.browse) as Record<string, unknown>;
          const pages = payload.pages as Array<Record<string, unknown>>;
          if (pages[0]) {
            pages[0].id = `page-${page}`;
          }
          payload.meta = { pagination: { page, pages: 2, total: 2 } };
          return jsonResponse(payload);
        }

        if (pathname.endsWith('/tags/')) {
          const payload = cloneFixture(ghostFixtures.tags.browse) as Record<string, unknown>;
          const tags = payload.tags as Array<Record<string, unknown>>;
          if (tags[0]) {
            tags[0].id = `tag-${page}`;
          }
          payload.meta = { pagination: { page, pages: 2, total: 2 } };
          return jsonResponse(payload);
        }

        if (pathname.endsWith('/members/')) {
          const payload = cloneFixture(ghostFixtures.members.browse) as Record<string, unknown>;
          const members = payload.members as Array<Record<string, unknown>>;
          if (members[0]) {
            members[0].id = `member-${page}`;
          }
          payload.meta = { pagination: { page, pages: 2, total: 2 } };
          return jsonResponse(payload);
        }

        if (pathname.endsWith('/newsletters/')) {
          const payload = cloneFixture(ghostFixtures.newsletters.browse) as Record<string, unknown>;
          const newsletters = payload.newsletters as Array<Record<string, unknown>>;
          payload.newsletters = newsletters.slice(0, 1);
          const first = (payload.newsletters as Array<Record<string, unknown>>)[0];
          if (first) {
            first.id = `newsletter-${page}`;
          }
          payload.meta = { pagination: { page, pages: 2, total: 2 } };
          return jsonResponse(payload);
        }

        if (pathname.endsWith('/tiers/')) {
          const payload = cloneFixture(ghostFixtures.tiers.browse) as Record<string, unknown>;
          const tiers = payload.tiers as Array<Record<string, unknown>>;
          payload.tiers = tiers.slice(0, 1);
          const first = (payload.tiers as Array<Record<string, unknown>>)[0];
          if (first) {
            first.id = `tier-${page}`;
          }
          payload.meta = { pagination: { page, pages: 2, total: 2 } };
          return jsonResponse(payload);
        }

        if (pathname.endsWith('/offers/')) {
          const payload = cloneFixture(ghostFixtures.offers.browse) as Record<string, unknown>;
          const offers = payload.offers as Array<Record<string, unknown>>;
          payload.offers = offers.slice(0, 1);
          const first = (payload.offers as Array<Record<string, unknown>>)[0];
          if (first) {
            first.id = `offer-${page}`;
          }
          payload.meta = { pagination: { page, pages: 2, total: 2 } };
          return jsonResponse(payload);
        }

        if (pathname.endsWith('/labels/')) {
          const payload = cloneFixture(ghostFixtures.labels.browse) as Record<string, unknown>;
          const labels = payload.labels as Array<Record<string, unknown>>;
          payload.labels = labels.slice(0, 1);
          const first = (payload.labels as Array<Record<string, unknown>>)[0];
          if (first) {
            first.id = `label-${page}`;
          }
          payload.meta = { pagination: { page, pages: 2, total: 2 } };
          return jsonResponse(payload);
        }

        if (pathname.endsWith('/users/')) {
          const payload = {
            users: [{ id: `user-${page}`, name: 'Owner', slug: `owner-${page}` }],
            meta: { pagination: { page, pages: 2, total: 2 } },
          };
          return jsonResponse(payload);
        }

        return undefined;
      },
    });

    const posts = await listPosts({}, { limit: 10 }, true);
    const pages = await listPages({}, { limit: 10 }, true);
    const tags = await listTags({}, { limit: 10 }, true);
    const members = await listMembers({}, { limit: 10 }, true);
    const newsletters = await listNewsletters({}, { limit: 10 }, true);
    const tiers = await listTiers({}, { limit: 10 }, true);
    const offers = await listOffers({}, { limit: 10 }, true);
    const labels = await listLabels({}, { limit: 10 }, true);
    const users = await listUsers({}, { limit: 10 }, true);

    const postItems = posts.posts as Array<{ id?: string }>;
    const pageItems = pages.pages as Array<{ id?: string }>;
    const tagItems = tags.tags as Array<{ id?: string }>;
    const memberItems = members.members as Array<{ id?: string }>;
    const newsletterItems = newsletters.newsletters as Array<{ id?: string }>;
    const tierItems = tiers.tiers as Array<{ id?: string }>;
    const offerItems = offers.offers as Array<{ id?: string }>;
    const labelItems = labels.labels as Array<{ id?: string }>;
    const userItems = users.users as Array<{ id?: string }>;

    expect(postItems.map((post) => post.id)).toEqual(['post-1', 'post-2']);
    expect(pageItems.map((page) => page.id)).toEqual(['page-1', 'page-2']);
    expect(tagItems.map((tag) => tag.id)).toEqual(['tag-1', 'tag-2']);
    expect(memberItems.map((member) => member.id)).toEqual(['member-1', 'member-2']);
    expect(newsletterItems.map((item) => item.id)).toEqual(['newsletter-1', 'newsletter-2']);
    expect(tierItems.map((item) => item.id)).toEqual(['tier-1', 'tier-2']);
    expect(offerItems.map((item) => item.id)).toEqual(['offer-1', 'offer-2']);
    expect(labelItems.map((item) => item.id)).toEqual(['label-1', 'label-2']);
    expect(userItems.map((item) => item.id)).toEqual(['user-1', 'user-2']);
  });

  test('supports post CRUD/update publish with conflict retry', async () => {
    installGhostFixtureFetchMock({ postConflictOnce: true });

    await expect(getPost({}, fixtureIds.postId, {})).resolves.toMatchObject({
      posts: [{ id: fixtureIds.postId }],
    });
    await expect(createPost({}, { title: 'X' })).resolves.toMatchObject({
      posts: [{ id: fixtureIds.postId }],
    });
    await expect(
      updatePost({}, { id: fixtureIds.postId, patch: { title: 'Updated' } }),
    ).resolves.toMatchObject({
      posts: [{ id: fixtureIds.postId }],
    });
    await expect(
      updatePost({}, { slug: fixtureIds.postSlug, patch: { title: 'Updated' } }),
    ).resolves.toMatchObject({
      posts: [{ id: fixtureIds.postId }],
    });
    await expect(publishPost({}, fixtureIds.postId)).resolves.toMatchObject({
      posts: [{ status: 'published' }],
    });
    await expect(deletePost({}, fixtureIds.postId)).resolves.toEqual({});

    await expect(updatePost({}, { patch: { title: 'bad' } })).rejects.toMatchObject({
      code: 'USAGE_ERROR',
      exitCode: ExitCode.USAGE_ERROR,
    });
  });

  test('supports phase4 post/page/tag parity helpers', async () => {
    installGhostFixtureFetchMock({ postConflictOnce: true });

    await expect(
      schedulePost({}, fixtureIds.postId, '2026-03-01T10:00:00Z'),
    ).resolves.toMatchObject({
      posts: [{ id: fixtureIds.postId }],
    });
    await expect(unschedulePost({}, fixtureIds.postId)).resolves.toMatchObject({
      posts: [{ id: fixtureIds.postId }],
    });
    await expect(copyPost({}, fixtureIds.postId)).resolves.toMatchObject({
      posts: [{ id: expect.any(String) }],
    });
    await expect(copyPage({}, fixtureIds.pageId)).resolves.toMatchObject({
      pages: [{ id: expect.any(String) }],
    });

    await expect(
      bulkPosts(
        {},
        {
          filter: 'status:draft',
          status: 'published',
          tags: ['News'],
        },
      ),
    ).resolves.toMatchObject({
      bulk: { meta: { stats: { successful: 1, unsuccessful: 0 } } },
    });
    await expect(
      bulkPosts(
        {},
        {
          filter: 'status:draft',
          delete: true,
        },
      ),
    ).resolves.toMatchObject({
      bulk: { meta: { stats: { successful: 1, unsuccessful: 0 } } },
    });
    await expect(
      bulkPages(
        {},
        {
          filter: 'status:draft',
          status: 'published',
        },
      ),
    ).resolves.toMatchObject({
      bulk: { meta: { stats: { successful: 1, unsuccessful: 0 } } },
    });
    await expect(
      bulkPages(
        {},
        {
          filter: 'status:draft',
          delete: true,
        },
      ),
    ).resolves.toMatchObject({
      bulk: { meta: { stats: { successful: 1, unsuccessful: 0 } } },
    });
    await expect(
      bulkTags(
        {},
        {
          filter: 'visibility:public',
          visibility: 'internal',
        },
      ),
    ).resolves.toMatchObject({
      bulk: { meta: { stats: { successful: 1, unsuccessful: 0 } } },
    });
    await expect(
      bulkTags(
        {},
        {
          filter: 'visibility:public',
          delete: true,
        },
      ),
    ).resolves.toMatchObject({
      bulk: { meta: { stats: { successful: 1, unsuccessful: 0 } } },
    });
  });

  test('returns zero-op bulk result when no resources match', async () => {
    installGhostFixtureFetchMock({
      onRequest: ({ pathname, method }) => {
        if (method !== 'GET') {
          return undefined;
        }

        if (pathname.endsWith('/posts/')) {
          return jsonResponse({
            posts: [],
            meta: { pagination: { page: 1, pages: 1, total: 0 } },
          });
        }

        if (pathname.endsWith('/pages/')) {
          return jsonResponse({
            pages: [],
            meta: { pagination: { page: 1, pages: 1, total: 0 } },
          });
        }

        if (pathname.endsWith('/tags/')) {
          return jsonResponse({
            tags: [],
            meta: { pagination: { page: 1, pages: 1, total: 0 } },
          });
        }

        return undefined;
      },
    });

    await expect(
      bulkPosts(
        {},
        {
          filter: 'status:draft',
          status: 'published',
        },
      ),
    ).resolves.toMatchObject({
      bulk: { meta: { stats: { successful: 0, unsuccessful: 0 } }, errors: [] },
    });
    await expect(
      bulkPages(
        {},
        {
          filter: 'status:draft',
          status: 'published',
        },
      ),
    ).resolves.toMatchObject({
      bulk: { meta: { stats: { successful: 0, unsuccessful: 0 } }, errors: [] },
    });
    await expect(
      bulkTags(
        {},
        {
          filter: 'visibility:public',
          visibility: 'internal',
        },
      ),
    ).resolves.toMatchObject({
      bulk: { meta: { stats: { successful: 0, unsuccessful: 0 } }, errors: [] },
    });
  });

  test('handles missing update metadata branches for page/tag services', async () => {
    installGhostFixtureFetchMock({
      onRequest: ({ pathname, method }) => {
        if (pathname.endsWith(`/pages/${fixtureIds.pageId}/`) && method === 'GET') {
          const payload = cloneFixture(ghostFixtures.pages.read) as Record<string, unknown>;
          const pages = payload.pages as Array<Record<string, unknown>>;
          if (pages[0]) {
            delete pages[0].updated_at;
          }
          return jsonResponse(payload);
        }

        if (pathname.endsWith(`/tags/${fixtureIds.tagId}/`) && method === 'GET') {
          const payload = cloneFixture(ghostFixtures.tags.read) as Record<string, unknown>;
          const tags = payload.tags as Array<Record<string, unknown>>;
          if (tags[0]) {
            delete tags[0].updated_at;
          }
          return jsonResponse(payload);
        }

        if (pathname.endsWith(`/pages/slug/${fixtureIds.pageSlug}/`) && method === 'GET') {
          const payload = cloneFixture(ghostFixtures.pages.read) as Record<string, unknown>;
          payload.pages = [];
          return jsonResponse(payload);
        }

        if (pathname.endsWith(`/tags/slug/${fixtureIds.tagSlug}/`) && method === 'GET') {
          const payload = cloneFixture(ghostFixtures.tags.read) as Record<string, unknown>;
          payload.tags = [];
          return jsonResponse(payload);
        }

        return undefined;
      },
    });

    await expect(createPage({}, { title: 'x' })).resolves.toMatchObject({
      pages: [{ id: fixtureIds.pageId }],
    });
    await expect(createTag({}, { name: 'x' })).resolves.toMatchObject({
      tags: [{ id: fixtureIds.tagId }],
    });
    await expect(deletePage({}, fixtureIds.pageId)).resolves.toEqual({});
    await expect(deleteTag({}, fixtureIds.tagId)).resolves.toEqual({});

    await expect(getPage({}, fixtureIds.pageSlug, { bySlug: true })).resolves.toMatchObject({
      pages: [],
    });
    await expect(getTag({}, fixtureIds.tagSlug, { bySlug: true })).resolves.toMatchObject({
      tags: [],
    });

    await expect(
      updatePage({}, { id: fixtureIds.pageId, patch: { title: 'new' } }),
    ).rejects.toMatchObject({
      code: 'CONFLICT',
      exitCode: ExitCode.CONFLICT,
    });
    await expect(
      updateTag({}, { id: fixtureIds.tagId, patch: { name: 'new' } }),
    ).rejects.toMatchObject({
      code: 'CONFLICT',
      exitCode: ExitCode.CONFLICT,
    });

    await expect(updatePage({}, { patch: { title: 'x' } })).rejects.toMatchObject({
      code: 'USAGE_ERROR',
      exitCode: ExitCode.USAGE_ERROR,
    });
    await expect(updateTag({}, { patch: { name: 'x' } })).rejects.toMatchObject({
      code: 'USAGE_ERROR',
      exitCode: ExitCode.USAGE_ERROR,
    });
  });

  test('supports member/newsletter/tier/offer/label helpers', async () => {
    installGhostFixtureFetchMock();

    await fs.writeFile(path.join(workDir, 'members.csv'), 'email\nx@example.com\n', 'utf8');

    await expect(getMember({}, { id: fixtureIds.memberId })).resolves.toMatchObject({
      members: [{ id: fixtureIds.memberId }],
    });
    await expect(getMember({}, { email: fixtureIds.memberEmail })).resolves.toMatchObject({
      members: [{ id: fixtureIds.memberId }],
    });
    await expect(
      createMember(
        {},
        {
          email: 'person@example.com',
        },
      ),
    ).resolves.toMatchObject({
      members: [{ id: fixtureIds.memberId }],
    });
    await expect(
      updateMember(
        {},
        {
          id: fixtureIds.memberId,
          patch: { name: 'Updated' },
        },
      ),
    ).resolves.toMatchObject({
      members: [{ id: fixtureIds.memberId }],
    });
    await expect(deleteMember({}, fixtureIds.memberId, { cancel: true })).resolves.toEqual({});
    await expect(exportMembersCsv({}, { limit: 1 })).resolves.toContain('email');
    await expect(
      importMembersCsv(
        {},
        {
          filePath: path.join(workDir, 'members.csv'),
          labels: ['Imported'],
        },
      ),
    ).resolves.toMatchObject({
      members: [{ id: fixtureIds.memberId }],
    });
    await expect(
      bulkMembers(
        {},
        {
          action: 'unsubscribe',
          all: true,
        },
      ),
    ).resolves.toMatchObject({
      bulk: { meta: { stats: { successful: 1 } } },
    });
    await expect(
      bulkMembers(
        {},
        {
          action: 'delete',
          all: true,
        },
      ),
    ).resolves.toMatchObject({
      meta: { stats: { successful: 1 } },
    });

    await expect(getNewsletter({}, fixtureIds.newsletterId)).resolves.toMatchObject({
      newsletters: [{ id: fixtureIds.newsletterId }],
    });
    await expect(createNewsletter({}, { name: 'Weekly' })).resolves.toMatchObject({
      newsletters: [{ id: fixtureIds.newsletterId }],
    });
    await expect(
      updateNewsletter({}, fixtureIds.newsletterId, { name: 'Updated' }),
    ).resolves.toMatchObject({
      newsletters: [{ id: fixtureIds.newsletterId }],
    });

    await expect(getTier({}, fixtureIds.tierId)).resolves.toMatchObject({
      tiers: [{ id: fixtureIds.tierId }],
    });
    await expect(createTier({}, { name: 'Tier' })).resolves.toMatchObject({
      tiers: [{ id: fixtureIds.tierId }],
    });
    await expect(
      updateTier({}, fixtureIds.tierId, { name: 'Tier Updated' }),
    ).resolves.toMatchObject({
      tiers: [{ id: fixtureIds.tierId }],
    });

    await expect(getOffer({}, fixtureIds.offerId)).resolves.toMatchObject({
      offers: [{ id: fixtureIds.offerId }],
    });
    await expect(createOffer({}, { name: 'Offer', code: 'offer' })).resolves.toMatchObject({
      offers: [{ id: fixtureIds.offerId }],
    });
    await expect(
      updateOffer({}, fixtureIds.offerId, { name: 'Offer Updated' }),
    ).resolves.toMatchObject({
      offers: [{ id: fixtureIds.offerId }],
    });

    await expect(getLabel({}, fixtureIds.labelId, {})).resolves.toMatchObject({
      labels: [{ id: fixtureIds.labelId }],
    });
    await expect(getLabel({}, fixtureIds.labelSlug, { bySlug: true })).resolves.toMatchObject({
      labels: [{ id: fixtureIds.labelId }],
    });
    await expect(createLabel({}, { name: 'VIP' })).resolves.toMatchObject({
      labels: [{ id: fixtureIds.labelId }],
    });
    await expect(
      updateLabel({}, { slug: fixtureIds.labelSlug, patch: { name: 'VIP2' } }),
    ).resolves.toMatchObject({
      labels: [{ id: fixtureIds.labelId }],
    });
    await expect(deleteLabel({}, fixtureIds.labelId)).resolves.toEqual({});
  });

  test('supports user/webhook/image/theme/site/setting helpers', async () => {
    installGhostFixtureFetchMock();

    await expect(getUser({}, { id: fixtureIds.userId })).resolves.toMatchObject({
      users: [{ id: fixtureIds.userId }],
    });
    await expect(getUser({}, { slug: fixtureIds.userSlug })).resolves.toMatchObject({
      users: [{ slug: fixtureIds.userSlug }],
    });
    await expect(getUser({}, { email: fixtureIds.userEmail })).resolves.toMatchObject({
      users: [{ email: fixtureIds.userEmail }],
    });
    await expect(getCurrentUser({})).resolves.toMatchObject({
      users: [{ id: fixtureIds.userId }],
    });

    await expect(
      createWebhook({}, { event: 'post.published', target_url: 'https://example.com/hook' }),
    ).resolves.toMatchObject({
      webhooks: [{ id: fixtureIds.webhookId }],
    });
    await expect(
      updateWebhook({}, fixtureIds.webhookId, { name: 'updated' }),
    ).resolves.toMatchObject({
      webhooks: [{ id: fixtureIds.webhookId }],
    });
    await expect(deleteWebhook({}, fixtureIds.webhookId)).resolves.toEqual({});

    await expect(
      uploadImage({}, { filePath: path.join(workDir, 'photo.jpg') }),
    ).resolves.toMatchObject({
      images: [{ url: expect.any(String) }],
    });

    await expect(listThemes({})).resolves.toMatchObject({
      themes: [{ name: fixtureIds.themeName }],
    });
    await expect(uploadTheme({}, path.join(workDir, 'theme.zip'))).resolves.toMatchObject({
      themes: [{ name: 'uploaded-theme' }],
    });
    await expect(activateTheme({}, fixtureIds.themeName)).resolves.toMatchObject({
      themes: [{ name: fixtureIds.themeName }],
    });

    await expect(getSiteInfo({})).resolves.toMatchObject({
      site: {
        title: expect.any(String),
      },
    });
    await expect(listSettings({})).resolves.toMatchObject({
      settings: expect.any(Array),
    });
    await expect(getSetting({}, 'title')).resolves.toMatchObject({
      settings: [{ key: 'title' }],
    });
    await expect(setSetting({}, 'title', 'Updated')).resolves.toMatchObject({
      settings: [{ key: 'title' }],
    });
  });

  test('image upload sends multipart file with image mime type', async () => {
    let seenMimeType: string | null = null;

    installGhostFixtureFetchMock({
      onRequest: ({ pathname, method, init }) => {
        if (pathname.endsWith('/ghost/api/admin/images/upload/') && method === 'POST') {
          const body = init?.body;
          expect(body).toBeInstanceOf(FormData);
          if (body instanceof FormData) {
            const file = body.get('file');
            expect(file).toBeInstanceOf(File);
            if (file instanceof File) {
              seenMimeType = file.type;
            }
          }
          return jsonResponse(cloneFixture(ghostFixtures.images.upload));
        }

        return undefined;
      },
    });

    await expect(
      uploadImage({}, { filePath: path.join(workDir, 'photo.jpg') }),
    ).resolves.toMatchObject({
      images: [{ url: expect.any(String) }],
    });
    expect(seenMimeType).toBe('image/jpeg');
  });

  test('supports migrate helpers', async () => {
    installGhostFixtureFetchMock();

    await expect(migrateImportCsv({}, path.join(workDir, 'migrate.csv'))).resolves.toMatchObject({
      imported: 1,
    });
    await expect(migrateImportJson({}, path.join(workDir, 'import.json'))).resolves.toMatchObject({
      db: [{ status: 'imported' }],
    });
    await expect(migrateExport({}, path.join(workDir, 'backup.zip'))).resolves.toContain(
      'backup.zip',
    );
  });

  test('supports wordpress/medium/substack migrate helpers via source runner hook', async () => {
    installGhostFixtureFetchMock();

    await fs.writeFile(path.join(workDir, 'wp.xml'), '<rss></rss>', 'utf8');
    await fs.writeFile(path.join(workDir, 'medium.zip'), 'fake-medium', 'utf8');
    await fs.writeFile(path.join(workDir, 'substack.zip'), 'fake-substack', 'utf8');

    const loadedModules: string[] = [];
    const seenOptions: Array<Record<string, unknown>> = [];

    setMigrateSourceLoaderForTests(async (modulePath) => {
      loadedModules.push(modulePath);

      if (modulePath === '@tryghost/mg-wp-xml') {
        return {
          default: async (ctx: { options: Record<string, unknown> }) => {
            seenOptions.push(ctx.options);
            return {
              posts: [{ url: 'wp://post/1', data: { title: 'WP Import', html: '<p>WP</p>' } }],
            };
          },
        };
      }

      if (modulePath === '@tryghost/mg-medium-export') {
        return {
          default: (inputPath: string, options: Record<string, unknown>) => {
            seenOptions.push({ pathToZip: inputPath, ...options });
            return {
              posts: [
                { url: 'medium://post/1', data: { title: 'Medium Import', html: '<p>Medium</p>' } },
              ],
            };
          },
        };
      }

      if (modulePath === '@tryghost/mg-substack') {
        return {
          default: {
            ingest: async ({ options }: { options: Record<string, unknown> }) => {
              seenOptions.push({ ingest: options });
              return { posts: [] };
            },
            process: async (_input: unknown, ctx: { options: Record<string, unknown> }) => {
              seenOptions.push({ process: ctx.options });
              return {
                posts: [
                  {
                    url: 'substack://post/1',
                    data: { title: 'Substack Import', html: '<p>Substack</p>' },
                  },
                ],
              };
            },
          },
        };
      }

      if (modulePath === '@tryghost/mg-json') {
        return {
          toGhostJSON: async (input: Record<string, unknown>) => ({
            meta: { exported_on: 1, version: '2.0.0' },
            data: input,
          }),
        };
      }

      throw new Error(`Unexpected module path: ${modulePath}`);
    });

    await expect(migrateImportWordpress({}, path.join(workDir, 'wp.xml'))).resolves.toMatchObject({
      db: [{ status: 'imported' }],
    });
    await expect(migrateImportMedium({}, path.join(workDir, 'medium.zip'))).resolves.toMatchObject({
      db: [{ status: 'imported' }],
    });
    await expect(
      migrateImportSubstack({}, path.join(workDir, 'substack.zip'), 'https://substack.example.com'),
    ).resolves.toMatchObject({
      db: [{ status: 'imported' }],
    });

    expect(loadedModules).toEqual([
      '@tryghost/mg-wp-xml',
      '@tryghost/mg-json',
      '@tryghost/mg-medium-export',
      '@tryghost/mg-json',
      '@tryghost/mg-substack',
      '@tryghost/mg-json',
    ]);
    expect(seenOptions[0]).toMatchObject({ pathToFile: path.join(workDir, 'wp.xml') });
    expect(seenOptions[1]).toMatchObject({ pathToZip: path.join(workDir, 'medium.zip') });
    expect(seenOptions[2]).toMatchObject({
      ingest: expect.objectContaining({
        pathToZip: path.join(workDir, 'substack.zip'),
        url: 'https://substack.example.com',
      }),
    });
    expect(seenOptions[3]).toMatchObject({
      process: expect.objectContaining({
        pathToZip: path.join(workDir, 'substack.zip'),
        url: 'https://substack.example.com',
      }),
    });
  });

  test('csv migrate enforces strict header and row validation', async () => {
    installGhostFixtureFetchMock();

    const missingTitlePath = path.join(workDir, 'missing-title.csv');
    await fs.writeFile(missingTitlePath, 'html\n<p>Hello</p>\n', 'utf8');
    await expect(migrateImportCsv({}, missingTitlePath)).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
      exitCode: ExitCode.VALIDATION_ERROR,
    });

    const bothContentHeadersPath = path.join(workDir, 'both-content.csv');
    await fs.writeFile(
      bothContentHeadersPath,
      'title,html,markdown\nPost,<p>Hello</p>,# Hello\n',
      'utf8',
    );
    await expect(migrateImportCsv({}, bothContentHeadersPath)).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
      exitCode: ExitCode.VALIDATION_ERROR,
    });

    const badStatusPath = path.join(workDir, 'bad-status.csv');
    await fs.writeFile(badStatusPath, 'title,html,status\nPost,<p>Hello</p>,invalid\n', 'utf8');
    await expect(migrateImportCsv({}, badStatusPath)).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
      exitCode: ExitCode.VALIDATION_ERROR,
    });

    const duplicateHeaderPath = path.join(workDir, 'duplicate-headers.csv');
    await fs.writeFile(duplicateHeaderPath, 'title,title,html\nA,B,<p>Hello</p>\n', 'utf8');
    await expect(migrateImportCsv({}, duplicateHeaderPath)).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
      exitCode: ExitCode.VALIDATION_ERROR,
    });

    const emptyHeaderPath = path.join(workDir, 'empty-header.csv');
    await fs.writeFile(emptyHeaderPath, 'title,,html\nA,B,<p>Hello</p>\n', 'utf8');
    await expect(migrateImportCsv({}, emptyHeaderPath)).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
      exitCode: ExitCode.VALIDATION_ERROR,
    });

    const mismatchedColumnsPath = path.join(workDir, 'mismatched-columns.csv');
    await fs.writeFile(mismatchedColumnsPath, 'title,html\nA,<p>Hello</p>,extra\n', 'utf8');
    await expect(migrateImportCsv({}, mismatchedColumnsPath)).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
      exitCode: ExitCode.VALIDATION_ERROR,
    });

    const markdownOnlyPath = path.join(workDir, 'markdown-only.csv');
    await fs.writeFile(markdownOnlyPath, 'title,markdown\nMarkdown Post,# Title\n', 'utf8');
    await expect(migrateImportCsv({}, markdownOnlyPath)).resolves.toMatchObject({
      imported: 1,
    });

    const multilineHtmlPath = path.join(workDir, 'multiline-html.csv');
    await fs.writeFile(
      multilineHtmlPath,
      'title,html\n"Multi line","<p>Line 1\nLine 2</p>"\n',
      'utf8',
    );
    await expect(migrateImportCsv({}, multilineHtmlPath)).resolves.toMatchObject({
      imported: 1,
      db: [{ status: 'imported' }],
    });

    const authorsAndTagsPath = path.join(workDir, 'authors-tags.csv');
    await fs.writeFile(
      authorsAndTagsPath,
      'title,html,tags,authors\nPost,<p>Hello</p>,"news, updates","writer@example.com,Second Author"\n',
      'utf8',
    );
    await expect(migrateImportCsv({}, authorsAndTagsPath)).resolves.toMatchObject({
      imported: 1,
      db: [{ status: 'imported' }],
    });
  });

  test('migrate source helpers surface module and shape errors clearly', async () => {
    installGhostFixtureFetchMock();

    await fs.writeFile(path.join(workDir, 'wp.xml'), '<rss></rss>', 'utf8');
    await fs.writeFile(path.join(workDir, 'substack.zip'), 'fake-substack', 'utf8');

    setMigrateSourceLoaderForTests(async () => {
      throw new Error('Cannot find module @tryghost/mg-wp-xml');
    });
    await expect(migrateImportWordpress({}, path.join(workDir, 'wp.xml'))).rejects.toMatchObject({
      code: 'USAGE_ERROR',
      exitCode: ExitCode.USAGE_ERROR,
    });

    setMigrateSourceLoaderForTests(async (modulePath) => {
      if (modulePath === '@tryghost/mg-wp-xml') {
        return {};
      }
      return {
        toGhostJSON: async () => ({ meta: {}, data: {} }),
      };
    });
    await expect(migrateImportWordpress({}, path.join(workDir, 'wp.xml'))).rejects.toMatchObject({
      code: 'GENERAL_ERROR',
      exitCode: ExitCode.GENERAL_ERROR,
    });

    setMigrateSourceLoaderForTests(async (modulePath) => {
      if (modulePath === '@tryghost/mg-wp-xml') {
        return {
          default: async () => [],
        };
      }
      return {
        toGhostJSON: async () => ({ meta: {}, data: {} }),
      };
    });
    await expect(migrateImportWordpress({}, path.join(workDir, 'wp.xml'))).rejects.toMatchObject({
      code: 'GENERAL_ERROR',
      exitCode: ExitCode.GENERAL_ERROR,
    });

    setMigrateSourceLoaderForTests(async (modulePath) => {
      if (modulePath === '@tryghost/mg-wp-xml') {
        return {
          default: async () => ({ posts: [{ url: 'wp://post/1', data: { title: 'WP' } }] }),
        };
      }

      if (modulePath === '@tryghost/mg-json') {
        return {};
      }

      return {};
    });
    await expect(migrateImportWordpress({}, path.join(workDir, 'wp.xml'))).rejects.toMatchObject({
      code: 'GENERAL_ERROR',
      exitCode: ExitCode.GENERAL_ERROR,
    });

    setMigrateSourceLoaderForTests(async (modulePath) => {
      if (modulePath === '@tryghost/mg-substack') {
        return { default: {} };
      }
      return {};
    });
    await expect(
      migrateImportSubstack({}, path.join(workDir, 'substack.zip'), 'https://substack.example.com'),
    ).rejects.toMatchObject({
      code: 'GENERAL_ERROR',
      exitCode: ExitCode.GENERAL_ERROR,
    });
  });

  test('member email lookup returns NOT_FOUND when no member matches', async () => {
    installGhostFixtureFetchMock({
      onRequest: ({ pathname, method }) => {
        if (pathname.endsWith('/ghost/api/admin/members/') && method === 'GET') {
          const payload = cloneFixture(ghostFixtures.members.browse) as Record<string, unknown>;
          payload.members = [];
          return jsonResponse(payload);
        }

        return undefined;
      },
    });

    await expect(getMember({}, { email: 'missing@example.com' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
      exitCode: ExitCode.NOT_FOUND,
    });
  });

  test('covers setting and user auth edge branches', async () => {
    installGhostFixtureFetchMock({
      onRequest: ({ pathname, method }) => {
        if (pathname.endsWith('/ghost/api/admin/settings/') && method === 'PUT') {
          return jsonResponse(
            {
              errors: [{ message: 'Forbidden', context: 'No permission' }],
            },
            403,
          );
        }

        if (pathname.endsWith('/ghost/api/admin/users/me/') && method === 'GET') {
          return jsonResponse(
            {
              errors: [{ message: 'Not found', context: 'No current user' }],
            },
            404,
          );
        }

        return undefined;
      },
    });

    await expect(getSetting({}, 'missing-key')).rejects.toMatchObject({
      code: 'NOT_FOUND',
      exitCode: ExitCode.NOT_FOUND,
    });
    await expect(setSetting({}, 'title', 'Denied')).rejects.toMatchObject({
      code: 'AUTH_ERROR',
      exitCode: ExitCode.AUTH_ERROR,
    });
    await expect(getCurrentUser({})).rejects.toMatchObject({
      code: 'AUTH_ERROR',
      exitCode: ExitCode.AUTH_ERROR,
    });
    await expect(getUser({}, {})).rejects.toMatchObject({
      code: 'USAGE_ERROR',
      exitCode: ExitCode.USAGE_ERROR,
    });

    installGhostFixtureFetchMock({
      onRequest: ({ pathname, method }) => {
        if (pathname.endsWith('/ghost/api/admin/settings/') && method === 'PUT') {
          return jsonResponse(
            {
              errors: [{ message: 'Validation failed', context: 'Bad setting value' }],
            },
            422,
          );
        }
        return undefined;
      },
    });
    await expect(setSetting({}, 'title', 'bad')).rejects.toMatchObject({
      code: 'GHOST_API_ERROR',
      exitCode: ExitCode.VALIDATION_ERROR,
    });
  });
});
