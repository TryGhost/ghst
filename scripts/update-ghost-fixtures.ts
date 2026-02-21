import fs from 'node:fs/promises';
import path from 'node:path';
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

  const createdIds: Record<string, string> = {};
  const replacements = new Map<string, string>();
  let postUpdatedAt = '';
  let pageUpdatedAt = '';
  let tagUpdatedAt = '';

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
    postUpdatedAt = String(createdPost.updated_at ?? '');

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
      updated_at: postUpdatedAt,
    });

    postUpdatedAt = String(firstResource(postUpdate, 'posts').updated_at ?? postUpdatedAt);

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
    pageUpdatedAt = String(createdPage.updated_at ?? '');

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
      updated_at: pageUpdatedAt,
    });
    pageUpdatedAt = String(firstResource(pageUpdate, 'pages').updated_at ?? pageUpdatedAt);

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
    tagUpdatedAt = String(createdTag.updated_at ?? '');

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
      updated_at: tagUpdatedAt,
    });
    tagUpdatedAt = String(firstResource(tagUpdate, 'tags').updated_at ?? tagUpdatedAt);

    replacements.set(postTitle, '<fixture-post-title>');
    replacements.set(postUpdatedTitle, '<fixture-post-updated-title>');
    replacements.set(pageTitle, '<fixture-page-title>');
    replacements.set(pageUpdatedTitle, '<fixture-page-updated-title>');
    replacements.set(tagName, '<fixture-tag-name>');
    replacements.set(tagUpdatedName, '<fixture-tag-updated-name>');

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
  }

  return {
    schemaVersion: 1,
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
