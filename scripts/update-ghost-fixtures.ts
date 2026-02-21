import fs from 'node:fs/promises';
import path from 'node:path';
import { generateAdminToken } from '../src/lib/auth.js';
import { GhostApiError, GhostClient } from '../src/lib/client.js';
import { resolveConnectionConfig } from '../src/lib/config.js';

interface FixtureDocument {
  schemaVersion: number;
  generatedAt: string;
  source: {
    siteAlias: string | null;
    apiVersion: string;
  };
  fixtures: Record<string, unknown>;
}

const OUTPUT_PATH = path.resolve('tests/fixtures/ghost-admin/fixtures.json');
const CHECK_MODE = process.argv.includes('--check');
const ISO_DATE_REGEX = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z/g;
const EMAIL_REGEX = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const EXACT_EMAIL_REGEX = /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i;

function asRecord(value: unknown): Record<string, unknown> {
  return (value ?? {}) as Record<string, unknown>;
}

function firstResource(payload: unknown, key: string): Record<string, unknown> {
  const container = asRecord(payload)[key];
  if (!Array.isArray(container) || container.length === 0) {
    throw new Error(`Expected '${key}' array with at least one item.`);
  }

  return asRecord(container[0]);
}

function extractGhostError(error: unknown): Record<string, unknown> {
  if (error instanceof GhostApiError) {
    return {
      status: error.status,
      code: error.code,
      message: error.message,
      payload: error.payload,
    };
  }

  if (error instanceof Error) {
    return {
      status: null,
      code: 'ERROR',
      message: error.message,
      payload: null,
    };
  }

  return {
    status: null,
    code: 'ERROR',
    message: 'Unknown error',
    payload: error,
  };
}

function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(value);
}

function trySanitizeJsonString(value: string, replacements: Map<string, string>): string | null {
  const trimmed = value.trim();
  if (
    !(
      (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
      (trimmed.startsWith('[') && trimmed.endsWith(']'))
    )
  ) {
    return null;
  }

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    return JSON.stringify(sanitizeValue(parsed, replacements));
  } catch {
    return null;
  }
}

function sanitizeValue(
  value: unknown,
  replacements: Map<string, string>,
  key: string | null = null,
): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeValue(entry, replacements));
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([entryKey, entryValue]) => {
        return [entryKey, sanitizeValue(entryValue, replacements, entryKey)];
      }),
    );
  }

  if (typeof value !== 'string') {
    return value;
  }

  if (replacements.has(value)) {
    return replacements.get(value);
  }

  if (
    key === 'uuid' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  ) {
    return '<uuid>';
  }

  if (
    key === 'id' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  ) {
    return '<error-id>';
  }

  if (key === 'avatar_image' && value.includes('gravatar.com/avatar/')) {
    return value.replace(/avatar\/[^?]+/, 'avatar/<hash>');
  }

  if (key?.endsWith('_at') && isIsoDate(value)) {
    return '<datetime>';
  }

  if (isIsoDate(value)) {
    return '<datetime>';
  }

  if (!value.includes('://') && EXACT_EMAIL_REGEX.test(value)) {
    return '<email>';
  }

  let nextValue = value;
  for (const [raw, replacement] of replacements.entries()) {
    if (raw && nextValue.includes(raw)) {
      nextValue = nextValue.split(raw).join(replacement);
    }
  }

  nextValue = nextValue.replace(/([?&]key=)[^&]+/g, '$1<token>');
  nextValue = nextValue.replace(/([?&]token=)[^&]+/g, '$1<token>');

  const sanitizedJson = trySanitizeJsonString(nextValue, replacements);
  if (sanitizedJson !== null) {
    return sanitizedJson;
  }

  nextValue = nextValue.replace(ISO_DATE_REGEX, '<datetime>');
  if (!nextValue.includes('://')) {
    nextValue = nextValue.replace(EMAIL_REGEX, '<email>');
  }
  return nextValue;
}

function fallbackOffer(): Record<string, unknown> {
  return {
    offers: [
      {
        id: 'offer-id',
        name: 'Fixture Offer',
        code: 'fixture-offer',
        status: 'active',
        type: 'percent',
        amount: 10,
        cadence: 'month',
      },
    ],
    meta: {
      pagination: {
        page: 1,
        pages: 1,
        limit: 1,
        total: 1,
      },
    },
  };
}

async function captureImportValidation(
  url: string,
  key: string,
  version: string,
): Promise<Record<string, unknown>> {
  const token = await generateAdminToken(key);
  const formData = new FormData();
  const response = await fetch(`${url.replace(/\/$/, '')}/ghost/api/admin/members/upload/`, {
    method: 'POST',
    headers: {
      Authorization: `Ghost ${token}`,
      'Accept-Version': version,
    },
    body: formData,
  });

  let payload: unknown = null;
  try {
    payload = (await response.json()) as unknown;
  } catch {
    payload = null;
  }

  return {
    status: response.status,
    code: 'GHOST_API_ERROR',
    message:
      (asRecord(payload).errors as Array<{ message?: string }> | undefined)?.[0]?.message ??
      `Ghost API request failed (${response.status})`,
    payload,
  };
}

async function captureDbImportValidation(
  url: string,
  key: string,
  version: string,
): Promise<Record<string, unknown>> {
  const token = await generateAdminToken(key);
  const formData = new FormData();
  const response = await fetch(`${url.replace(/\/$/, '')}/ghost/api/admin/db/`, {
    method: 'POST',
    headers: {
      Authorization: `Ghost ${token}`,
      'Accept-Version': version,
    },
    body: formData,
  });

  let payload: unknown = null;
  try {
    payload = (await response.json()) as unknown;
  } catch {
    payload = null;
  }

  return {
    status: response.status,
    code: 'GHOST_API_ERROR',
    message:
      (asRecord(payload).errors as Array<{ message?: string }> | undefined)?.[0]?.message ??
      `Ghost API request failed (${response.status})`,
    payload,
  };
}

async function buildFixtures(): Promise<FixtureDocument> {
  const connection = await resolveConnectionConfig({});
  const client = new GhostClient({
    url: connection.url,
    key: connection.key,
    version: connection.apiVersion,
  });

  const runId = Date.now().toString(36);
  const postTitle = `Fixture Post ${runId}`;
  const postUpdatedTitle = `Fixture Post Updated ${runId}`;
  const pageTitle = `Fixture Page ${runId}`;
  const pageUpdatedTitle = `Fixture Page Updated ${runId}`;
  const tagName = `Fixture Tag ${runId}`;
  const tagUpdatedName = `Fixture Tag Updated ${runId}`;
  const memberEmail = `fixture-member-${runId}@example.com`;
  const memberName = `Fixture Member ${runId}`;
  const memberUpdatedName = `Fixture Member Updated ${runId}`;
  const newsletterName = `Fixture Newsletter ${runId}`;
  const newsletterUpdatedName = `Fixture Newsletter Updated ${runId}`;
  const tierName = `Fixture Tier ${runId}`;
  const tierUpdatedName = `Fixture Tier Updated ${runId}`;
  const offerName = `Fixture Offer ${runId}`;
  const offerUpdatedName = `Fixture Offer Updated ${runId}`;
  const labelName = `Fixture Label ${runId}`;
  const labelUpdatedName = `Fixture Label Updated ${runId}`;

  const createdIds: Record<string, string> = {};
  const replacements = new Map<string, string>();

  const fixtures: Record<string, unknown> = {};

  try {
    const siteInfo = await client.siteInfo();
    const settings = await client.rawRequest<Record<string, unknown>>('/settings/', 'GET');

    const postCreate = await client.posts.add(
      {
        title: postTitle,
        html: '<p>Fixture content</p>',
        status: 'draft',
        featured: false,
      },
      'html',
    );

    const createdPost = firstResource(postCreate, 'posts');
    createdIds.postId = String(createdPost.id ?? '');
    createdIds.postSlug = String(createdPost.slug ?? '');
    createdIds.postUuid = String(createdPost.uuid ?? '');

    const postRead = await client.posts.read(createdIds.postId, {
      params: { include: 'tags,authors' },
    });
    const postBrowse = await client.posts.browse({
      limit: 2,
      include: 'tags,authors',
      filter: `slug:${createdIds.postSlug}`,
    });

    const postUpdate = await client.posts.edit(createdIds.postId, {
      title: postUpdatedTitle,
      updated_at: String(createdPost.updated_at ?? ''),
    });

    let postConflict: Record<string, unknown> = {};
    try {
      await client.posts.edit(createdIds.postId, {
        title: 'Conflicting update',
        updated_at: '2000-01-01T00:00:00.000Z',
      });
    } catch (error) {
      postConflict = extractGhostError(error);
    }

    let postNotFound: Record<string, unknown> = {};
    try {
      await client.posts.read('000000000000000000000000');
    } catch (error) {
      postNotFound = extractGhostError(error);
    }

    let postValidation: Record<string, unknown> = {};
    try {
      await client.posts.add({ title: 'Fixture Invalid', status: 'invalid' });
    } catch (error) {
      postValidation = extractGhostError(error);
    }

    let unknownRoute404: Record<string, unknown> = {};
    try {
      await client.rawRequest('/this-route-does-not-exist/', 'GET');
    } catch (error) {
      unknownRoute404 = extractGhostError(error);
    }

    const pageCreate = await client.pages.add(
      {
        title: pageTitle,
        html: '<p>Fixture page content</p>',
        status: 'draft',
      },
      'html',
    );

    const createdPage = firstResource(pageCreate, 'pages');
    createdIds.pageId = String(createdPage.id ?? '');
    createdIds.pageSlug = String(createdPage.slug ?? '');
    createdIds.pageUuid = String(createdPage.uuid ?? '');

    const pageRead = await client.pages.read(createdIds.pageId, {
      params: { include: 'authors' },
    });
    const pageBrowse = await client.pages.browse({
      limit: 2,
      include: 'authors',
      filter: `slug:${createdIds.pageSlug}`,
    });
    const pageUpdate = await client.pages.edit(createdIds.pageId, {
      title: pageUpdatedTitle,
      updated_at: String(createdPage.updated_at ?? ''),
    });

    const tagCreate = await client.tags.add({
      name: tagName,
      description: 'Fixture description',
      accent_color: '#00aa00',
      visibility: 'public',
    });

    const createdTag = firstResource(tagCreate, 'tags');
    createdIds.tagId = String(createdTag.id ?? '');
    createdIds.tagSlug = String(createdTag.slug ?? '');
    createdIds.tagUuid = String(createdTag.uuid ?? '');

    const tagRead = await client.tags.read(createdIds.tagId, {
      params: { include: 'count.posts' },
    });
    const tagBrowse = await client.tags.browse({
      limit: 2,
      include: 'count.posts',
      filter: `slug:${createdIds.tagSlug}`,
    });
    const tagUpdate = await client.tags.edit(createdIds.tagId, {
      name: tagUpdatedName,
      updated_at: String(createdTag.updated_at ?? ''),
    });

    const memberCreate = await client.members.add({
      email: memberEmail,
      name: memberName,
      note: 'Fixture note',
    });

    const createdMember = firstResource(memberCreate, 'members');
    createdIds.memberId = String(createdMember.id ?? '');
    createdIds.memberEmail = String(createdMember.email ?? '');
    createdIds.memberUuid = String(createdMember.uuid ?? '');

    const memberRead = await client.members.read(createdIds.memberId, {
      include: 'tiers,newsletters',
    });
    const memberBrowse = await client.members.browse({
      limit: 2,
      filter: `email:'${createdIds.memberEmail}'`,
    });
    const memberUpdate = await client.members.edit(createdIds.memberId, {
      name: memberUpdatedName,
      note: 'Fixture note updated',
    });

    let memberNotFound: Record<string, unknown> = {};
    try {
      await client.members.read('000000000000000000000000');
    } catch (error) {
      memberNotFound = extractGhostError(error);
    }

    const memberBulkEdit = await client.members.bulkEdit(
      {
        action: 'unsubscribe',
      },
      {
        filter: `id:'${createdIds.memberId}'`,
      },
    );

    const memberDeleteCandidate = await client.members.add({
      email: `fixture-delete-${runId}@example.com`,
      name: 'Fixture Member Delete Candidate',
    });

    const bulkDeleteMemberId = String(firstResource(memberDeleteCandidate, 'members').id ?? '');
    const memberBulkDestroy = await client.members.bulkDestroy({
      filter: `id:'${bulkDeleteMemberId}'`,
    });

    const memberExportCsv = await client.members.exportCsv({ limit: 1 });
    const memberImportValidation = await captureImportValidation(
      connection.url,
      connection.key,
      connection.apiVersion,
    );

    const newslettersBrowse = await client.newsletters.browse({ limit: 2 });
    const firstNewsletter = firstResource(newslettersBrowse, 'newsletters');
    createdIds.newsletterId = String(firstNewsletter.id ?? '');
    createdIds.newsletterSlug = String(firstNewsletter.slug ?? '');
    createdIds.newsletterUuid = String(firstNewsletter.uuid ?? '');

    const newslettersRead = await client.newsletters.read(createdIds.newsletterId);
    const newslettersCreate = {
      newsletters: [
        {
          ...firstNewsletter,
          name: newsletterName,
        },
      ],
    };
    const newslettersUpdate = {
      newsletters: [
        {
          ...firstNewsletter,
          name: newsletterUpdatedName,
        },
      ],
    };

    let newslettersNotFound: Record<string, unknown> = {};
    try {
      await client.newsletters.read('000000000000000000000000');
    } catch (error) {
      newslettersNotFound = extractGhostError(error);
    }

    const tiersBrowse = await client.tiers.browse({ limit: 2 });
    const tierList =
      (asRecord(tiersBrowse).tiers as Array<Record<string, unknown>> | undefined) ?? [];
    const firstTier =
      tierList.find((entry) => String(entry.type ?? '') === 'paid') ??
      firstResource(tiersBrowse, 'tiers');
    createdIds.tierId = String(firstTier.id ?? '');
    createdIds.tierSlug = String(firstTier.slug ?? '');

    const tiersRead = await client.tiers.read(createdIds.tierId);
    const tiersCreate = {
      tiers: [
        {
          ...firstTier,
          name: tierName,
        },
      ],
    };
    const tiersUpdate = {
      tiers: [
        {
          ...firstTier,
          name: tierUpdatedName,
        },
      ],
    };

    let tiersNotFoundLike500: Record<string, unknown> = {};
    try {
      await client.tiers.read('000000000000000000000000');
    } catch (error) {
      tiersNotFoundLike500 = extractGhostError(error);
    }

    let offersBrowse: Record<string, unknown>;
    let offersRead: Record<string, unknown>;

    const offersBrowseRaw = await client.offers.browse({ limit: 2 });
    const offerList = asRecord(offersBrowseRaw).offers;

    if (Array.isArray(offerList) && offerList.length > 0) {
      offersBrowse = offersBrowseRaw;
      const firstOffer = offerList[0] as Record<string, unknown>;
      createdIds.offerId = String(firstOffer.id ?? '');
      createdIds.offerCode = String(firstOffer.code ?? '');
      offersRead = await client.offers.read(createdIds.offerId);
    } else {
      offersBrowse = fallbackOffer();
      offersRead = {
        offers: [(fallbackOffer().offers as Array<Record<string, unknown>>)[0]],
      };
      createdIds.offerId = 'offer-id';
      createdIds.offerCode = 'offer-code';
    }

    const firstOffer = firstResource(offersRead, 'offers');
    const offersCreate = {
      offers: [
        {
          ...firstOffer,
          name: offerName,
        },
      ],
    };
    const offersUpdate = {
      offers: [
        {
          ...firstOffer,
          name: offerUpdatedName,
        },
      ],
    };

    let offersNotFound: Record<string, unknown> = {};
    try {
      await client.offers.read('000000000000000000000000');
    } catch (error) {
      offersNotFound = extractGhostError(error);
    }

    const labelCreate = await client.labels.add({
      name: labelName,
    });

    const createdLabel = firstResource(labelCreate, 'labels');
    createdIds.labelId = String(createdLabel.id ?? '');
    createdIds.labelSlug = String(createdLabel.slug ?? '');

    const labelRead = await client.labels.read(createdIds.labelId);
    const labelBrowse = await client.labels.browse({
      limit: 2,
      filter: `slug:${createdIds.labelSlug}`,
    });
    const labelUpdate = await client.labels.edit(createdIds.labelId, {
      name: labelUpdatedName,
    });

    let labelNotFound: Record<string, unknown> = {};
    try {
      await client.labels.read('000000000000000000000000');
    } catch (error) {
      labelNotFound = extractGhostError(error);
    }

    const usersBrowse = await client.users.browse({ limit: 2 });
    const firstUser = firstResource(usersBrowse, 'users');
    createdIds.userId = String(firstUser.id ?? '');
    createdIds.userSlug = String(firstUser.slug ?? '');
    createdIds.userEmail = String(firstUser.email ?? '');

    let usersReadById: Record<string, unknown> = { users: [firstUser] };
    try {
      usersReadById = await client.users.read(createdIds.userId);
    } catch {}

    let usersReadBySlug: Record<string, unknown> = { users: [firstUser] };
    try {
      usersReadBySlug = await client.users.read(createdIds.userSlug, { bySlug: true });
    } catch {}

    let usersReadByEmail: Record<string, unknown> = { users: [firstUser] };
    if (createdIds.userEmail) {
      try {
        usersReadByEmail = await client.users.read(createdIds.userEmail, { byEmail: true });
      } catch {}
    }

    let usersMe: Record<string, unknown> = { users: [firstUser] };
    try {
      usersMe = await client.users.me();
    } catch {}

    let webhookCreate: Record<string, unknown> = {
      webhooks: [
        {
          id: 'webhook-id',
          name: `Fixture Webhook ${runId}`,
          event: 'post.published',
          target_url: 'https://example.com/webhook',
        },
      ],
    };
    let webhookUpdate: Record<string, unknown> = {
      webhooks: [
        {
          id: 'webhook-id',
          name: `Fixture Webhook Updated ${runId}`,
          event: 'post.published',
          target_url: 'https://example.com/webhook-updated',
        },
      ],
    };
    let webhookDelete: Record<string, unknown> = {};

    try {
      webhookCreate = await client.webhooks.add({
        event: 'post.published',
        name: `Fixture Webhook ${runId}`,
        target_url: 'https://example.com/webhook',
      });
      const createdWebhook = firstResource(webhookCreate, 'webhooks');
      createdIds.webhookId = String(createdWebhook.id ?? '');
      webhookUpdate = await client.webhooks.edit(createdIds.webhookId, {
        event: 'post.published',
        name: `Fixture Webhook Updated ${runId}`,
        target_url: 'https://example.com/webhook-updated',
      });
      webhookDelete = await client.webhooks.delete(createdIds.webhookId);
    } catch {}

    const imageBytes = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/w8AAgMBgJf9NfQAAAAASUVORK5CYII=',
      'base64',
    );
    const imageFormData = new FormData();
    imageFormData.append('file', new Blob([imageBytes]), 'fixture.png');
    let imageUpload: Record<string, unknown> = {
      images: [{ url: 'https://myblog.ghost.io/content/images/uploaded.jpg' }],
    };
    try {
      imageUpload = await client.images.upload(imageFormData);
    } catch {}

    let themesBrowse: Record<string, unknown> = {
      themes: [{ name: 'casper', active: true, package: { version: '1.0.0' } }],
    };
    try {
      themesBrowse = await client.themes.browse();
    } catch {}
    let themesActive: Record<string, unknown> = themesBrowse;
    try {
      themesActive = await client.themes.readActive();
    } catch {}

    const activeTheme = firstResource(themesActive, 'themes');
    createdIds.themeName = String(activeTheme.name ?? '');

    let themeActivate: Record<string, unknown> = themesActive;
    if (createdIds.themeName) {
      try {
        themeActivate = await client.themes.activate(createdIds.themeName);
      } catch {}
    }

    const themesUploadFallback = {
      themes: [
        {
          name: 'uploaded-theme',
          active: false,
          package: { version: '1.0.0' },
        },
      ],
    };

    let settingsEdit: Record<string, unknown> = {};
    const settingsList =
      (asRecord(settings).settings as Array<Record<string, unknown>> | undefined) ?? [];
    const titleSetting = settingsList.find((entry) => String(entry.key ?? '') === 'title');
    if (titleSetting) {
      try {
        settingsEdit = await client.settings.edit([{ key: 'title', value: titleSetting.value }]);
      } catch (error) {
        settingsEdit = extractGhostError(error);
      }
    }

    let dbExport: Record<string, unknown> = {};
    try {
      const dbData = await client.db.export();
      dbExport = {
        ok: true,
        bytes: dbData.length,
      };
    } catch (error) {
      dbExport = extractGhostError(error);
    }

    const dbImportValidation = await captureDbImportValidation(
      connection.url,
      connection.key,
      connection.apiVersion,
    );

    replacements.set(postTitle, '<fixture-post-title>');
    replacements.set(postUpdatedTitle, '<fixture-post-updated-title>');
    replacements.set(pageTitle, '<fixture-page-title>');
    replacements.set(pageUpdatedTitle, '<fixture-page-updated-title>');
    replacements.set(tagName, '<fixture-tag-name>');
    replacements.set(tagUpdatedName, '<fixture-tag-updated-name>');
    replacements.set(memberName, '<fixture-member-name>');
    replacements.set(memberUpdatedName, '<fixture-member-updated-name>');
    replacements.set(newsletterName, '<fixture-newsletter-name>');
    replacements.set(newsletterUpdatedName, '<fixture-newsletter-updated-name>');
    replacements.set(tierName, '<fixture-tier-name>');
    replacements.set(tierUpdatedName, '<fixture-tier-updated-name>');
    replacements.set(offerName, '<fixture-offer-name>');
    replacements.set(offerUpdatedName, '<fixture-offer-updated-name>');
    replacements.set(labelName, '<fixture-label-name>');
    replacements.set(labelUpdatedName, '<fixture-label-updated-name>');
    replacements.set(String(firstUser.name ?? ''), '<fixture-user-name>');
    replacements.set(`Fixture Webhook ${runId}`, '<fixture-webhook-name>');
    replacements.set(`Fixture Webhook Updated ${runId}`, '<fixture-webhook-name>');

    for (const [key, value] of Object.entries(createdIds)) {
      if (value) {
        replacements.set(value, `<${key}>`);
      }
    }

    fixtures.posts = {
      browse: sanitizeValue(postBrowse, replacements),
      read: sanitizeValue(postRead, replacements),
      create: sanitizeValue(postCreate, replacements),
      update: sanitizeValue(postUpdate, replacements),
      conflict409: sanitizeValue(postConflict, replacements),
      notFound404: sanitizeValue(postNotFound, replacements),
      validation422: sanitizeValue(postValidation, replacements),
    };

    fixtures.pages = {
      browse: sanitizeValue(pageBrowse, replacements),
      read: sanitizeValue(pageRead, replacements),
      create: sanitizeValue(pageCreate, replacements),
      update: sanitizeValue(pageUpdate, replacements),
    };

    fixtures.tags = {
      browse: sanitizeValue(tagBrowse, replacements),
      read: sanitizeValue(tagRead, replacements),
      create: sanitizeValue(tagCreate, replacements),
      update: sanitizeValue(tagUpdate, replacements),
    };

    fixtures.members = {
      browse: sanitizeValue(memberBrowse, replacements),
      read: sanitizeValue(memberRead, replacements),
      create: sanitizeValue(memberCreate, replacements),
      update: sanitizeValue(memberUpdate, replacements),
      notFound404: sanitizeValue(memberNotFound, replacements),
      bulkEdit: sanitizeValue(memberBulkEdit, replacements),
      bulkDestroy: sanitizeValue(memberBulkDestroy, replacements),
      exportCsv: sanitizeValue(memberExportCsv, replacements),
      importCsv: sanitizeValue(memberCreate, replacements),
      importValidation422: sanitizeValue(memberImportValidation, replacements),
    };

    fixtures.newsletters = {
      browse: sanitizeValue(newslettersBrowse, replacements),
      read: sanitizeValue(newslettersRead, replacements),
      create: sanitizeValue(newslettersCreate, replacements),
      update: sanitizeValue(newslettersUpdate, replacements),
      notFound404: sanitizeValue(newslettersNotFound, replacements),
    };

    fixtures.tiers = {
      browse: sanitizeValue(tiersBrowse, replacements),
      read: sanitizeValue(tiersRead, replacements),
      create: sanitizeValue(tiersCreate, replacements),
      update: sanitizeValue(tiersUpdate, replacements),
      notFoundLike500: sanitizeValue(tiersNotFoundLike500, replacements),
    };

    fixtures.offers = {
      browse: sanitizeValue(offersBrowse, replacements),
      read: sanitizeValue(offersRead, replacements),
      create: sanitizeValue(offersCreate, replacements),
      update: sanitizeValue(offersUpdate, replacements),
      notFound404: sanitizeValue(offersNotFound, replacements),
    };

    fixtures.labels = {
      browse: sanitizeValue(labelBrowse, replacements),
      read: sanitizeValue(labelRead, replacements),
      create: sanitizeValue(labelCreate, replacements),
      update: sanitizeValue(labelUpdate, replacements),
      notFound404: sanitizeValue(labelNotFound, replacements),
    };

    fixtures.users = {
      browse: sanitizeValue(usersBrowse, replacements),
      readById: sanitizeValue(usersReadById, replacements),
      readBySlug: sanitizeValue(usersReadBySlug, replacements),
      readByEmail: sanitizeValue(usersReadByEmail, replacements),
      me: sanitizeValue(usersMe, replacements),
    };

    fixtures.webhooks = {
      create: sanitizeValue(webhookCreate, replacements),
      update: sanitizeValue(webhookUpdate, replacements),
      delete: sanitizeValue(webhookDelete, replacements),
    };

    fixtures.images = {
      upload: sanitizeValue(imageUpload, replacements),
    };

    fixtures.themes = {
      browse: sanitizeValue(themesBrowse, replacements),
      active: sanitizeValue(themesActive, replacements),
      upload: sanitizeValue(themesUploadFallback, replacements),
      activate: sanitizeValue(themeActivate, replacements),
    };

    fixtures.settingsAdmin = {
      list: sanitizeValue(settings, replacements),
      edit: sanitizeValue(settingsEdit, replacements),
    };

    fixtures.db = {
      export: sanitizeValue(dbExport, replacements),
      importSuccess: sanitizeValue({ db: [{ status: 'imported' }] }, replacements),
      importValidation: sanitizeValue(dbImportValidation, replacements),
    };

    fixtures.api = {
      admin: {
        site: sanitizeValue(siteInfo, replacements),
        settings: sanitizeValue(settings, replacements),
      },
      errors: {
        unknownRoute404: sanitizeValue(unknownRoute404, replacements),
      },
    };
  } finally {
    if (createdIds.postId) {
      try {
        await client.posts.delete(createdIds.postId);
      } catch {}
    }

    if (createdIds.pageId) {
      try {
        await client.pages.delete(createdIds.pageId);
      } catch {}
    }

    if (createdIds.tagId) {
      try {
        await client.tags.delete(createdIds.tagId);
      } catch {}
    }

    if (createdIds.memberId) {
      try {
        await client.members.delete(createdIds.memberId);
      } catch {}
    }

    if (createdIds.labelId) {
      try {
        await client.labels.delete(createdIds.labelId);
      } catch {}
    }
  }

  return {
    schemaVersion: 3,
    generatedAt: new Date().toISOString(),
    source: {
      siteAlias: connection.siteAlias ?? null,
      apiVersion: connection.apiVersion,
    },
    fixtures,
  };
}

async function main(): Promise<void> {
  const outputDir = path.dirname(OUTPUT_PATH);
  const nextDoc = await buildFixtures();
  const nextJson = `${JSON.stringify(nextDoc, null, 2)}\n`;

  if (CHECK_MODE) {
    const current = await fs.readFile(OUTPUT_PATH, 'utf8');
    const currentDoc = JSON.parse(current) as FixtureDocument;
    const normalizedCurrent = {
      ...currentDoc,
      generatedAt: '<datetime>',
    };
    const normalizedNext = {
      ...nextDoc,
      generatedAt: '<datetime>',
    };

    if (JSON.stringify(normalizedCurrent) !== JSON.stringify(normalizedNext)) {
      console.error('Ghost fixtures are out of date. Run: pnpm fixtures:ghost:update');
      process.exitCode = 1;
      return;
    }

    console.log('Ghost fixtures are up to date.');
    return;
  }

  await fs.mkdir(outputDir, { recursive: true });
  await fs.writeFile(OUTPUT_PATH, nextJson, 'utf8');
  console.log(`Updated fixtures at ${OUTPUT_PATH}`);
}

void main();
