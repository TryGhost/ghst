import fs from 'node:fs';
import path from 'node:path';

const RAW_FIXTURE_PATH = path.resolve(process.cwd(), 'tests/fixtures/ghost-admin/fixtures.json');

interface FixtureDoc {
  fixtures: {
    posts: Record<string, unknown>;
    pages: Record<string, unknown>;
    tags: Record<string, unknown>;
    api: {
      admin: {
        site: Record<string, unknown>;
        settings: Record<string, unknown>;
      };
      errors: {
        unknownRoute404: Record<string, unknown>;
      };
    };
  };
}

const placeholderMap = new Map<string, string>([
  ['<postId>', 'post-id'],
  ['<postSlug>', 'welcome'],
  ['<postUuid>', '11111111-1111-4111-8111-111111111111'],
  ['<pageId>', 'page-id'],
  ['<pageSlug>', 'about'],
  ['<pageUuid>', '22222222-2222-4222-8222-222222222222'],
  ['<tagId>', 'tag-id'],
  ['<tagSlug>', 'news'],
  ['<tagUuid>', '33333333-3333-4333-8333-333333333333'],
  ['<fixture-post-title>', 'Fixture Post'],
  ['<fixture-post-updated-title>', 'Fixture Post Updated'],
  ['<fixture-page-title>', 'Fixture Page'],
  ['<fixture-page-updated-title>', 'Fixture Page Updated'],
  ['<fixture-tag-name>', 'Fixture Tag'],
  ['<fixture-tag-updated-name>', 'Fixture Tag Updated'],
  ['<datetime>', '2026-01-01T00:00:00.000Z'],
  ['<email>', 'fixture@example.com'],
  ['<error-id>', 'error-id'],
]);

function materializeValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => materializeValue(entry));
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, entry]) => {
        return [key, materializeValue(entry)];
      }),
    );
  }

  if (typeof value !== 'string') {
    return value;
  }

  let next = value;
  for (const [needle, replacement] of placeholderMap.entries()) {
    next = next.split(needle).join(replacement);
  }

  return next;
}

const raw = JSON.parse(fs.readFileSync(RAW_FIXTURE_PATH, 'utf8')) as FixtureDoc;

export const ghostFixtures = materializeValue(raw.fixtures) as FixtureDoc['fixtures'];

export const fixtureIds = {
  postId: 'post-id',
  postSlug: 'welcome',
  pageId: 'page-id',
  pageSlug: 'about',
  tagId: 'tag-id',
  tagSlug: 'news',
};

export function cloneFixture<T>(value: T): T {
  return structuredClone(value);
}
