import { describe, expect, test } from 'vitest';
import { ImageUploadInputSchema } from '../src/schemas/image.js';
import {
  LabelCreateInputSchema,
  LabelGetInputSchema,
  LabelListInputSchema,
  LabelUpdateInputSchema,
} from '../src/schemas/label.js';
import {
  MemberBulkInputSchema,
  MemberCreateInputSchema,
  MemberGetInputSchema,
  MemberListInputSchema,
  MemberUpdateInputSchema,
} from '../src/schemas/member.js';
import {
  MigrateCsvInputSchema,
  MigrateExportInputSchema,
  MigrateJsonInputSchema,
  MigrateMediumInputSchema,
  MigrateSubstackInputSchema,
  MigrateWordpressInputSchema,
} from '../src/schemas/migrate.js';
import {
  NewsletterCreateInputSchema,
  NewsletterGetInputSchema,
  NewsletterListInputSchema,
  NewsletterUpdateInputSchema,
} from '../src/schemas/newsletter.js';
import {
  OfferCreateInputSchema,
  OfferGetInputSchema,
  OfferListInputSchema,
  OfferUpdateInputSchema,
} from '../src/schemas/offer.js';
import {
  PageBulkInputSchema,
  PageCopyInputSchema,
  PageCreateInputSchema,
  PageGetInputSchema,
  PageListInputSchema,
  PageUpdateInputSchema,
} from '../src/schemas/page.js';
import {
  PostBulkInputSchema,
  PostCopyInputSchema,
  PostCreateInputSchema,
  PostGetInputSchema,
  PostListInputSchema,
  PostScheduleInputSchema,
  PostUnscheduleInputSchema,
  PostUpdateInputSchema,
} from '../src/schemas/post.js';
import { SettingGetInputSchema, SettingSetInputSchema } from '../src/schemas/setting.js';
import {
  TagBulkInputSchema,
  TagCreateInputSchema,
  TagGetInputSchema,
  TagListInputSchema,
  TagUpdateInputSchema,
} from '../src/schemas/tag.js';
import {
  ThemeActivateInputSchema,
  ThemeDevInputSchema,
  ThemeUploadInputSchema,
  ThemeValidateInputSchema,
} from '../src/schemas/theme.js';
import {
  TierCreateInputSchema,
  TierGetInputSchema,
  TierListInputSchema,
  TierUpdateInputSchema,
} from '../src/schemas/tier.js';
import { UserGetInputSchema, UserListInputSchema } from '../src/schemas/user.js';
import {
  WebhookCreateInputSchema,
  WebhookDeleteInputSchema,
  WebhookListenInputSchema,
  WebhookUpdateInputSchema,
} from '../src/schemas/webhook.js';

describe('post schemas', () => {
  test('validates list/get/create/update', () => {
    expect(PostListInputSchema.parse({ limit: 'all', status: 'draft' }).limit).toBe('all');
    expect(PostGetInputSchema.parse({ slug: 'welcome' }).slug).toBe('welcome');

    expect(
      PostCreateInputSchema.parse({
        title: 'hello',
        status: 'draft',
        html: '<p>hi</p>',
      }).title,
    ).toBe('hello');

    expect(
      PostUpdateInputSchema.parse({
        id: 'id1',
        title: 'new',
      }).title,
    ).toBe('new');

    expect(() =>
      PostCreateInputSchema.parse({ title: 'bad', html: 'x', lexicalFile: 'y' }),
    ).toThrow();
    expect(() => PostUpdateInputSchema.parse({ id: 'id1' })).toThrow();
    expect(PostScheduleInputSchema.parse({ id: 'id1', at: '2026-03-01T10:00:00Z' }).id).toBe('id1');
    expect(PostUnscheduleInputSchema.parse({ id: 'id1' }).id).toBe('id1');
    expect(PostCopyInputSchema.parse({ id: 'id1' }).id).toBe('id1');
    expect(
      PostBulkInputSchema.parse({
        filter: 'status:draft',
        action: 'update',
        status: 'published',
      }).action,
    ).toBe('update');
    expect(() => PostBulkInputSchema.parse({ filter: 'status:draft', action: 'delete' })).toThrow();
  });
});

describe('page schemas', () => {
  test('validates list/get/create/update', () => {
    expect(PageListInputSchema.parse({ limit: 5 }).limit).toBe(5);
    expect(PageGetInputSchema.parse({ id: 'id1' }).id).toBe('id1');
    expect(PageCreateInputSchema.parse({ title: 'About', status: 'draft' }).title).toBe('About');
    expect(PageUpdateInputSchema.parse({ id: 'id1', title: 'New' }).title).toBe('New');

    expect(() => PageUpdateInputSchema.parse({ slug: 'about' })).toThrow();
    expect(PageCopyInputSchema.parse({ id: 'id1' }).id).toBe('id1');
    expect(
      PageBulkInputSchema.parse({
        filter: 'status:draft',
        action: 'update',
        status: 'published',
      }).action,
    ).toBe('update');
  });
});

describe('tag schemas', () => {
  test('validates list/get/create/update', () => {
    expect(TagListInputSchema.parse({ limit: 'all' }).limit).toBe('all');
    expect(TagGetInputSchema.parse({ slug: 'news' }).slug).toBe('news');
    expect(TagCreateInputSchema.parse({ name: 'News', accentColor: '#ffffff' }).name).toBe('News');
    expect(TagUpdateInputSchema.parse({ id: 'id1', name: 'Updated' }).name).toBe('Updated');

    expect(() => TagCreateInputSchema.parse({ name: 'x', accentColor: 'red' })).toThrow();
    expect(() => TagUpdateInputSchema.parse({ id: 'id1' })).toThrow();
    expect(
      TagBulkInputSchema.parse({
        filter: 'visibility:public',
        action: 'update',
        visibility: 'internal',
      }).action,
    ).toBe('update');
  });
});

describe('member schemas', () => {
  test('validates list/get/create/update/bulk', () => {
    expect(MemberListInputSchema.parse({ limit: 5 }).limit).toBe(5);
    expect(MemberGetInputSchema.parse({ email: 'x@example.com' }).email).toBe('x@example.com');
    expect(
      MemberCreateInputSchema.parse({
        email: 'x@example.com',
        name: 'X',
      }).email,
    ).toBe('x@example.com');
    expect(
      MemberUpdateInputSchema.parse({
        id: 'id1',
        note: 'Updated',
      }).note,
    ).toBe('Updated');

    expect(
      MemberBulkInputSchema.parse({
        action: 'unsubscribe',
        all: true,
      }).action,
    ).toBe('unsubscribe');

    expect(() => MemberGetInputSchema.parse({})).toThrow();
    expect(() =>
      MemberBulkInputSchema.parse({ action: 'unsubscribe', all: true, filter: "id:'id1'" }),
    ).toThrow();
    expect(() =>
      MemberBulkInputSchema.parse({ action: 'add-label', filter: "id:'id1'" }),
    ).toThrow();
  });
});

describe('newsletter schemas', () => {
  test('validates list/get/create/update', () => {
    expect(NewsletterListInputSchema.parse({ limit: 'all' }).limit).toBe('all');
    expect(NewsletterGetInputSchema.parse({ id: 'id1' }).id).toBe('id1');
    expect(
      NewsletterCreateInputSchema.parse({
        name: 'Weekly',
        status: 'active',
      }).name,
    ).toBe('Weekly');
    expect(
      NewsletterUpdateInputSchema.parse({
        id: 'id1',
        name: 'Updated',
      }).name,
    ).toBe('Updated');
  });
});

describe('tier schemas', () => {
  test('validates list/get/create/update', () => {
    expect(TierListInputSchema.parse({ limit: 1 }).limit).toBe(1);
    expect(TierGetInputSchema.parse({ id: 'id1' }).id).toBe('id1');
    expect(
      TierCreateInputSchema.parse({
        name: 'Premium',
        monthlyPrice: 500,
      }).name,
    ).toBe('Premium');
    expect(
      TierUpdateInputSchema.parse({
        id: 'id1',
        trialDays: 14,
      }).trialDays,
    ).toBe(14);
  });
});

describe('offer schemas', () => {
  test('validates list/get/create/update', () => {
    expect(OfferListInputSchema.parse({ filter: 'status:active' }).filter).toBe('status:active');
    expect(OfferGetInputSchema.parse({ id: 'id1' }).id).toBe('id1');
    expect(
      OfferCreateInputSchema.parse({
        name: 'Sale',
        code: 'sale',
      }).code,
    ).toBe('sale');
    expect(
      OfferUpdateInputSchema.parse({
        id: 'id1',
        status: 'archived',
      }).status,
    ).toBe('archived');

    expect(() => OfferUpdateInputSchema.parse({ id: 'id1' })).toThrow();
  });
});

describe('label schemas', () => {
  test('validates list/get/create/update', () => {
    expect(LabelListInputSchema.parse({ limit: 'all' }).limit).toBe('all');
    expect(LabelGetInputSchema.parse({ slug: 'vip' }).slug).toBe('vip');
    expect(LabelCreateInputSchema.parse({ name: 'VIP' }).name).toBe('VIP');
    expect(LabelUpdateInputSchema.parse({ id: 'id1', name: 'VIP 2' }).name).toBe('VIP 2');

    expect(() => LabelGetInputSchema.parse({})).toThrow();
    expect(() => LabelGetInputSchema.parse({ id: 'id1', slug: 'vip' })).toThrow();
    expect(() =>
      LabelUpdateInputSchema.parse({ id: 'id1', slugLookup: 'vip', name: 'x' }),
    ).toThrow();
  });
});

describe('phase3 schemas', () => {
  test('validates user/webhook/image/theme/setting/migrate schemas', () => {
    expect(UserListInputSchema.parse({ limit: 'all' }).limit).toBe('all');
    expect(UserGetInputSchema.parse({ email: 'owner@example.com' }).email).toBe(
      'owner@example.com',
    );
    expect(() => UserGetInputSchema.parse({})).toThrow();
    expect(() => UserGetInputSchema.parse({ id: 'id1', slug: 'slug' })).toThrow();

    expect(
      WebhookCreateInputSchema.parse({
        event: 'post.published',
        targetUrl: 'https://example.com/hook',
      }).event,
    ).toBe('post.published');
    expect(WebhookUpdateInputSchema.parse({ id: 'id1', name: 'Updated' }).name).toBe('Updated');
    expect(() => WebhookUpdateInputSchema.parse({ id: 'id1' })).toThrow();
    expect(WebhookDeleteInputSchema.parse({ id: 'id1', yes: true }).id).toBe('id1');
    expect(
      WebhookListenInputSchema.parse({
        publicUrl: 'https://example.com/hook',
        forwardTo: 'http://localhost:3000/webhooks',
      }).publicUrl,
    ).toBe('https://example.com/hook');

    expect(ImageUploadInputSchema.parse({ filePath: './image.jpg' }).filePath).toBe('./image.jpg');

    expect(ThemeUploadInputSchema.parse({ path: './theme.zip' }).path).toBe('./theme.zip');
    expect(ThemeActivateInputSchema.parse({ name: 'casper' }).name).toBe('casper');
    expect(ThemeValidateInputSchema.parse({ path: './theme' }).path).toBe('./theme');
    expect(ThemeDevInputSchema.parse({ path: './theme', watch: true }).path).toBe('./theme');

    expect(SettingGetInputSchema.parse({ key: 'title' }).key).toBe('title');
    expect(SettingSetInputSchema.parse({ key: 'title', value: 'My Blog' }).value).toBe('My Blog');

    expect(MigrateWordpressInputSchema.parse({ file: './wp.xml' }).file).toBe('./wp.xml');
    expect(MigrateMediumInputSchema.parse({ file: './medium.zip' }).file).toBe('./medium.zip');
    expect(
      MigrateSubstackInputSchema.parse({ file: './substack.zip', url: 'https://example.com' }).url,
    ).toBe('https://example.com');
    expect(MigrateCsvInputSchema.parse({ file: './posts.csv' }).file).toBe('./posts.csv');
    expect(MigrateJsonInputSchema.parse({ file: './import.json' }).file).toBe('./import.json');
    expect(MigrateExportInputSchema.parse({ output: './backup.zip' }).output).toBe('./backup.zip');
  });
});
