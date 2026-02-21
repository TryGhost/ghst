import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { ExitCode } from '../src/lib/errors.js';
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
  createNewsletter,
  getNewsletter,
  listNewsletters,
  updateNewsletter,
} from '../src/lib/newsletters.js';
import { createOffer, getOffer, listOffers, updateOffer } from '../src/lib/offers.js';
import { createPage, deletePage, getPage, listPages, updatePage } from '../src/lib/pages.js';
import {
  createPost,
  deletePost,
  getPost,
  listPosts,
  publishPost,
  updatePost,
} from '../src/lib/posts.js';
import { createTag, deleteTag, getTag, listTags, updateTag } from '../src/lib/tags.js';
import { createTier, getTier, listTiers, updateTier } from '../src/lib/tiers.js';
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
  });

  afterEach(() => {
    vi.restoreAllMocks();
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

    const postItems = posts.posts as Array<{ id?: string }>;
    const pageItems = pages.pages as Array<{ id?: string }>;
    const tagItems = tags.tags as Array<{ id?: string }>;
    const memberItems = members.members as Array<{ id?: string }>;
    const newsletterItems = newsletters.newsletters as Array<{ id?: string }>;
    const tierItems = tiers.tiers as Array<{ id?: string }>;
    const offerItems = offers.offers as Array<{ id?: string }>;
    const labelItems = labels.labels as Array<{ id?: string }>;

    expect(postItems.map((post) => post.id)).toEqual(['post-1', 'post-2']);
    expect(pageItems.map((page) => page.id)).toEqual(['page-1', 'page-2']);
    expect(tagItems.map((tag) => tag.id)).toEqual(['tag-1', 'tag-2']);
    expect(memberItems.map((member) => member.id)).toEqual(['member-1', 'member-2']);
    expect(newsletterItems.map((item) => item.id)).toEqual(['newsletter-1', 'newsletter-2']);
    expect(tierItems.map((item) => item.id)).toEqual(['tier-1', 'tier-2']);
    expect(offerItems.map((item) => item.id)).toEqual(['offer-1', 'offer-2']);
    expect(labelItems.map((item) => item.id)).toEqual(['label-1', 'label-2']);
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
});
