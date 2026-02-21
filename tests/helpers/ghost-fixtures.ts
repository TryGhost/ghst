import fs from 'node:fs';
import path from 'node:path';

const RAW_FIXTURE_PATH = path.resolve(process.cwd(), 'tests/fixtures/ghost-admin/fixtures.json');

interface FixtureDoc {
  fixtures: {
    posts: Record<string, unknown>;
    pages: Record<string, unknown>;
    tags: Record<string, unknown>;
    members: Record<string, unknown>;
    newsletters: Record<string, unknown>;
    tiers: Record<string, unknown>;
    offers: Record<string, unknown>;
    labels: Record<string, unknown>;
    users: Record<string, unknown>;
    webhooks: Record<string, unknown>;
    images: Record<string, unknown>;
    themes: Record<string, unknown>;
    settingsAdmin: Record<string, unknown>;
    db: Record<string, unknown>;
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
  ['<memberId>', 'member-id'],
  ['<memberEmail>', 'member@example.com'],
  ['<memberUuid>', '44444444-4444-4444-8444-444444444444'],
  ['<newsletterId>', 'newsletter-id'],
  ['<newsletterSlug>', 'default-newsletter'],
  ['<newsletterUuid>', '55555555-5555-4555-8555-555555555555'],
  ['<tierId>', 'tier-id'],
  ['<tierSlug>', 'default-product'],
  ['<offerId>', 'offer-id'],
  ['<offerCode>', 'offer-code'],
  ['<labelId>', 'label-id'],
  ['<labelSlug>', 'test-label'],
  ['<userId>', 'user-id'],
  ['<userSlug>', 'owner'],
  ['<userEmail>', 'owner@example.com'],
  ['<webhookId>', 'webhook-id'],
  ['<themeName>', 'casper'],
  ['<fixture-post-title>', 'Fixture Post'],
  ['<fixture-post-updated-title>', 'Fixture Post Updated'],
  ['<fixture-page-title>', 'Fixture Page'],
  ['<fixture-page-updated-title>', 'Fixture Page Updated'],
  ['<fixture-tag-name>', 'Fixture Tag'],
  ['<fixture-tag-updated-name>', 'Fixture Tag Updated'],
  ['<fixture-member-name>', 'Fixture Member'],
  ['<fixture-member-updated-name>', 'Fixture Member Updated'],
  ['<fixture-label-name>', 'Fixture Label'],
  ['<fixture-label-updated-name>', 'Fixture Label Updated'],
  ['<fixture-user-name>', 'Site Owner'],
  ['<fixture-webhook-name>', 'Publish Hook'],
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
  memberId: 'member-id',
  memberEmail: 'member@example.com',
  newsletterId: 'newsletter-id',
  tierId: 'tier-id',
  offerId: 'offer-id',
  labelId: 'label-id',
  labelSlug: 'test-label',
  userId: 'user-id',
  userSlug: 'owner',
  userEmail: 'owner@example.com',
  webhookId: 'webhook-id',
  themeName: 'casper',
};

export function cloneFixture<T>(value: T): T {
  return structuredClone(value);
}
