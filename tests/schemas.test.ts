import { describe, expect, test } from 'vitest';
import { ImageUploadInputSchema } from '../src/schemas/image.js';
import {
  LabelBulkInputSchema,
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
  NewsletterBulkInputSchema,
  NewsletterCreateInputSchema,
  NewsletterGetInputSchema,
  NewsletterListInputSchema,
  NewsletterUpdateInputSchema,
} from '../src/schemas/newsletter.js';
import {
  OfferBulkInputSchema,
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
  PostDeleteInputSchema,
  PostGetInputSchema,
  PostListInputSchema,
  PostScheduleInputSchema,
  PostUnscheduleInputSchema,
  PostUpdateInputSchema,
} from '../src/schemas/post.js';
import { SettingGetInputSchema, SettingSetInputSchema } from '../src/schemas/setting.js';
import {
  SocialWebBlockDomainInputSchema,
  SocialWebContentInputSchema,
  SocialWebFollowsInputSchema,
  SocialWebHandleActionInputSchema,
  SocialWebIdInputSchema,
  SocialWebPaginatedInputSchema,
  SocialWebProfileInputSchema,
  SocialWebProfileUpdateInputSchema,
  SocialWebReplyInputSchema,
  SocialWebSearchInputSchema,
  SocialWebUploadInputSchema,
} from '../src/schemas/socialweb.js';
import {
  StatsNewsletterClicksInputSchema,
  StatsPostInputSchema,
  StatsPostsInputSchema,
  StatsWebInputSchema,
  StatsWebTableInputSchema,
} from '../src/schemas/stats.js';
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
  TierBulkInputSchema,
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
      PostCreateInputSchema.parse({
        fromJson: './post.json',
        markdownFile: './post.md',
      }).fromJson,
    ).toBe('./post.json');
    expect(PostCreateInputSchema.parse({ fromJson: './post.json' }).status).toBeUndefined();

    expect(
      PostUpdateInputSchema.parse({
        id: 'id1',
        title: 'new',
      }).title,
    ).toBe('new');
    expect(
      PostUpdateInputSchema.parse({
        id: 'id1',
        featureImage: 'https://example.com/cat.jpg',
      }).featureImage,
    ).toBe('https://example.com/cat.jpg');

    expect(() =>
      PostCreateInputSchema.parse({ title: 'bad', html: 'x', lexicalFile: 'y' }),
    ).toThrow();
    expect(() => PostUpdateInputSchema.parse({ id: 'id1' })).toThrow();
    expect(PostScheduleInputSchema.parse({ id: 'id1', at: '2026-03-01T10:00:00Z' }).id).toBe('id1');
    expect(PostUnscheduleInputSchema.parse({ id: 'id1' }).id).toBe('id1');
    expect(PostCopyInputSchema.parse({ id: 'id1' }).id).toBe('id1');
    expect(PostDeleteInputSchema.parse({ filter: 'status:draft', yes: true }).filter).toBe(
      'status:draft',
    );
    expect(
      PostBulkInputSchema.parse({
        filter: 'status:draft',
        action: 'update',
        status: 'published',
      }).action,
    ).toBe('update');
    expect(() => PostBulkInputSchema.parse({ filter: 'status:draft', action: 'delete' })).toThrow();
    expect(() =>
      PostBulkInputSchema.parse({
        filter: 'status:draft',
        action: 'update',
        delete: true,
        status: 'published',
      }),
    ).toThrow();
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
    expect(
      MemberBulkInputSchema.parse({
        update: true,
        all: true,
        labels: 'VIP',
      }).update,
    ).toBe(true);

    expect(() => MemberGetInputSchema.parse({})).toThrow();
    expect(() =>
      MemberBulkInputSchema.parse({ action: 'unsubscribe', all: true, filter: "id:'id1'" }),
    ).toThrow();
    expect(() =>
      MemberBulkInputSchema.parse({ action: 'add-label', filter: "id:'id1'" }),
    ).toThrow();
    expect(() =>
      MemberBulkInputSchema.parse({
        delete: true,
        all: true,
      }),
    ).toThrow();
    expect(() =>
      MemberBulkInputSchema.parse({
        action: 'delete',
        all: true,
      }),
    ).toThrow();
    expect(
      MemberBulkInputSchema.parse({
        action: 'delete',
        all: true,
        yes: true,
      }).action,
    ).toBe('delete');
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
    expect(
      NewsletterBulkInputSchema.parse({
        filter: 'status:active',
        action: 'update',
        status: 'archived',
      }).status,
    ).toBe('archived');
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
    expect(
      TierBulkInputSchema.parse({
        filter: 'type:paid',
        action: 'update',
        active: true,
      }).active,
    ).toBe(true);
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
    expect(
      OfferBulkInputSchema.parse({
        filter: 'status:active',
        action: 'update',
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
    expect(
      LabelBulkInputSchema.parse({
        filter: "name:'VIP'",
        action: 'update',
        name: 'VIP 2',
      }).action,
    ).toBe('update');

    expect(() => LabelGetInputSchema.parse({})).toThrow();
    expect(() => LabelGetInputSchema.parse({ id: 'id1', slug: 'vip' })).toThrow();
    expect(() =>
      LabelUpdateInputSchema.parse({ id: 'id1', slugLookup: 'vip', name: 'x' }),
    ).toThrow();
    expect(() =>
      LabelBulkInputSchema.parse({
        filter: "name:'VIP'",
        action: 'delete',
      }),
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

describe('socialweb schemas', () => {
  test('validates socialweb profile, pagination, and note inputs', () => {
    expect(SocialWebProfileInputSchema.parse({ handle: 'me' }).handle).toBe('me');
    expect(SocialWebProfileInputSchema.parse({ handle: '@alice@remote.example' }).handle).toBe(
      '@alice@remote.example',
    );
    expect(() => SocialWebProfileInputSchema.parse({ handle: 'alice' })).toThrow();

    expect(
      SocialWebProfileUpdateInputSchema.parse({
        name: 'Alice',
        username: 'alice',
        bio: 'Remote account',
        avatarUrl: 'https://remote.example/avatar.png',
        bannerImageUrl: 'https://remote.example/banner.png',
      }).username,
    ).toBe('alice');
    expect(() => SocialWebProfileUpdateInputSchema.parse({})).toThrow();

    expect(SocialWebSearchInputSchema.parse({ query: 'alice' }).query).toBe('alice');
    expect(SocialWebPaginatedInputSchema.parse({ limit: 25, all: true }).limit).toBe(25);
    expect(() => SocialWebPaginatedInputSchema.parse({ all: true, next: 'cursor' })).toThrow();

    expect(SocialWebFollowsInputSchema.parse({ handle: 'me', limit: 10, all: true }).limit).toBe(
      10,
    );
    expect(() =>
      SocialWebFollowsInputSchema.parse({ handle: 'me', all: true, next: 'cursor' }),
    ).toThrow();
    expect(SocialWebHandleActionInputSchema.parse({ handle: '@alice@remote.example' }).handle).toBe(
      '@alice@remote.example',
    );
    expect(() => SocialWebHandleActionInputSchema.parse({ handle: 'alice' })).toThrow();
    expect(() => SocialWebHandleActionInputSchema.parse({ handle: 'me' })).toThrow();

    expect(SocialWebIdInputSchema.parse({ id: 'https://remote.example/posts/1' }).id).toBe(
      'https://remote.example/posts/1',
    );
    expect(() => SocialWebIdInputSchema.parse({ id: 'not-a-url' })).toThrow();

    expect(SocialWebBlockDomainInputSchema.parse({ url: 'https://remote.example' }).url).toBe(
      'https://remote.example',
    );
    expect(SocialWebUploadInputSchema.parse({ filePath: './photo.jpg' }).filePath).toBe(
      './photo.jpg',
    );

    expect(
      SocialWebContentInputSchema.parse({
        content: 'hello social web',
        imageUrl: 'https://remote.example/image.png',
        imageAlt: 'Alt',
      }).content,
    ).toBe('hello social web');
    expect(() =>
      SocialWebContentInputSchema.parse({
        content: 'hello',
        stdin: true,
      }),
    ).toThrow();
    expect(() =>
      SocialWebContentInputSchema.parse({
        content: 'hello',
        imageFile: './photo.jpg',
        imageUrl: 'https://remote.example/image.png',
      }),
    ).toThrow();

    expect(
      SocialWebReplyInputSchema.parse({
        id: 'https://remote.example/posts/1',
        stdin: true,
      }).id,
    ).toBe('https://remote.example/posts/1');
  });
});

describe('stats schemas', () => {
  test('validates range, filters, and scoped analytics inputs', () => {
    expect(
      StatsWebInputSchema.parse({
        range: '30d',
        audience: 'paid',
        source: 'twitter.com',
        location: 'us',
        device: 'desktop',
        utmSource: 'twitter',
      }).location,
    ).toBe('US');

    expect(
      StatsWebTableInputSchema.parse({
        from: '2026-02-01',
        to: '2026-03-01',
      }).limit,
    ).toBe(10);

    expect(
      StatsNewsletterClicksInputSchema.parse({
        newsletterId: 'newsletter-id',
        postIds: ['post-id'],
      }).newsletterId,
    ).toBe('newsletter-id');

    expect(
      StatsPostsInputSchema.parse({
        range: '30d',
      }).limit,
    ).toBe(5);

    expect(StatsPostInputSchema.parse({ id: 'post-id', range: '7d' }).id).toBe('post-id');

    expect(() =>
      StatsWebInputSchema.parse({
        from: '2026-03-01',
        to: '2026-02-01',
      }),
    ).toThrow();

    expect(() =>
      StatsWebInputSchema.parse({
        timezone: 'Mars/Phobos',
      }),
    ).toThrow();

    expect(() =>
      StatsNewsletterClicksInputSchema.parse({
        newsletterId: '',
      }),
    ).toThrow();
  });
});
