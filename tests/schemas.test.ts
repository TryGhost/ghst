import { describe, expect, test } from 'vitest';
import type { ZodTypeAny } from 'zod';
import {
  CommentDeleteInputSchema,
  CommentGetInputSchema,
  CommentListInputSchema,
  CommentRelationListInputSchema,
  CommentRepliesInputSchema,
} from '../src/schemas/comment.js';
import { UserConfigSchema } from '../src/schemas/config.js';
import { ImageUploadInputSchema } from '../src/schemas/image.js';
import {
  LabelBulkInputSchema,
  LabelCreateInputSchema,
  LabelGetInputSchema,
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
  NewsletterUpdateInputSchema,
} from '../src/schemas/newsletter.js';
import {
  OfferBulkInputSchema,
  OfferCreateInputSchema,
  OfferGetInputSchema,
  OfferUpdateInputSchema,
} from '../src/schemas/offer.js';
import {
  PageBulkInputSchema,
  PageCopyInputSchema,
  PageCreateInputSchema,
  PageUpdateInputSchema,
} from '../src/schemas/page.js';
import {
  PostBulkInputSchema,
  PostCreateInputSchema,
  PostDeleteInputSchema,
  PostScheduleInputSchema,
  PostUpdateInputSchema,
} from '../src/schemas/post.js';
import { SettingGetInputSchema, SettingSetInputSchema } from '../src/schemas/setting.js';
import { SiteInfoInputSchema } from '../src/schemas/site.js';
import {
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
  StatsPostReferrersInputSchema,
  StatsPostsInputSchema,
  StatsWebInputSchema,
  StatsWebTableInputSchema,
} from '../src/schemas/stats.js';
import {
  TagBulkInputSchema,
  TagCreateInputSchema,
  TagGetInputSchema,
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
  TierUpdateInputSchema,
} from '../src/schemas/tier.js';
import { UserGetInputSchema, UserListInputSchema, UserMeInputSchema } from '../src/schemas/user.js';
import {
  WebhookCreateInputSchema,
  WebhookDeleteInputSchema,
  WebhookListenInputSchema,
  WebhookUpdateInputSchema,
} from '../src/schemas/webhook.js';

function expectValid<T>(schema: ZodTypeAny, input: unknown): T {
  return schema.parse(input) as T;
}

function expectInvalid(schema: ZodTypeAny, input: unknown, message?: string): void {
  const result = schema.safeParse(input);
  expect(result.success).toBe(false);
  if (!result.success && message) {
    expect(result.error.issues.map((issue) => issue.message).join(' | ')).toContain(message);
  }
}

describe('post schemas', () => {
  test('allow json imports but enforce scheduling and content-source guardrails', () => {
    expectValid<{ fromJson: string }>(PostCreateInputSchema, {
      fromJson: './post.json',
    });
    expectValid<{ at: string; emailOnly?: boolean }>(PostScheduleInputSchema, {
      id: 'post-1',
      at: '2026-03-01T10:00:00Z',
      emailOnly: true,
    });

    expectInvalid(PostCreateInputSchema, { title: 'Hello', status: 'scheduled' }, 'publish-at');
    expectInvalid(
      PostCreateInputSchema,
      { title: 'Hello', html: '<p>hi</p>', markdownFile: './post.md' },
      'Use only one content source',
    );
  });

  test('require a selector and a real patch for updates', () => {
    expectValid<{ title: string }>(PostUpdateInputSchema, {
      slug: 'welcome',
      title: 'Updated',
    });

    expectInvalid(PostUpdateInputSchema, { id: 'post-1' }, 'Provide at least one update field');
    expectInvalid(PostUpdateInputSchema, { title: 'Updated' }, 'Provide an id argument or --slug');
    expectInvalid(
      PostUpdateInputSchema,
      { id: 'post-1', html: '<p>hi</p>', htmlFile: './post.html' },
      'Use only one content source',
    );
  });

  test('protect destructive delete and bulk operations', () => {
    expectValid<{ filter: string }>(PostDeleteInputSchema, { filter: 'status:draft', yes: true });
    expectValid<{ action?: string; delete?: boolean; yes?: boolean }>(PostBulkInputSchema, {
      filter: 'status:draft',
      action: 'delete',
      yes: true,
    });

    expectInvalid(PostDeleteInputSchema, { id: 'post-1', filter: 'status:draft' }, 'Use either');
    expectInvalid(PostBulkInputSchema, { filter: 'status:draft', action: 'delete' }, '--yes');
    expectInvalid(
      PostBulkInputSchema,
      { filter: 'status:draft', action: 'update' },
      'Bulk update requires at least one',
    );
  });
});

describe('page and tag schemas', () => {
  test('default page creation state and require publishAt for scheduled pages', () => {
    expect(expectValid<{ status: string }>(PageCreateInputSchema, { title: 'About' }).status).toBe(
      'draft',
    );
    expectValid<{ id: string }>(PageCopyInputSchema, { id: 'page-1' });

    expectInvalid(PageCreateInputSchema, { title: 'About', status: 'scheduled' }, 'publish-at');
    expectInvalid(
      PageUpdateInputSchema,
      { id: 'page-1', html: '<p>hi</p>', htmlFile: './page.html' },
      'Use only one of --html, --html-file, or --lexical-file.',
    );
    expectInvalid(PageBulkInputSchema, { filter: 'status:draft', action: 'delete' }, '--yes');
  });

  test('enforce tag selector, update fields, and color validation', () => {
    expectValid<{ name: string }>(TagCreateInputSchema, { name: 'News', accentColor: '#ffffff' });
    expectValid<{ slugLookup?: string; name?: string }>(TagUpdateInputSchema, {
      slugLookup: 'news',
      name: 'Newsroom',
    });
    expectValid<{ slug?: string }>(TagGetInputSchema, { slug: 'news' });

    expectInvalid(TagCreateInputSchema, { name: 'News', accentColor: 'red' });
    expectInvalid(TagUpdateInputSchema, { id: 'tag-1' }, 'Provide at least one update field');
    expectInvalid(
      TagBulkInputSchema,
      { filter: 'visibility:public', action: 'update' },
      '--visibility',
    );
  });
});

describe('member schemas', () => {
  test('require tiers for complimentary and expiry flows', () => {
    expectValid<{ email: string }>(MemberCreateInputSchema, {
      email: 'x@example.com',
      comp: true,
      tier: 'tier-1',
    });
    expectValid<{ id?: string; expiry?: string }>(MemberUpdateInputSchema, {
      id: 'member-1',
      tier: 'tier-1',
      expiry: '2027-01-01T00:00:00Z',
    });

    expectInvalid(MemberCreateInputSchema, { email: 'x@example.com', comp: true }, '--tier');
    expectInvalid(
      MemberUpdateInputSchema,
      { email: 'x@example.com', expiry: '2027-01-01T00:00:00Z' },
      '--tier',
    );
    expectInvalid(MemberUpdateInputSchema, { id: 'member-1' }, 'Provide at least one update field');
  });

  test('accepts gift alongside the existing member statuses on list input', () => {
    for (const status of ['free', 'paid', 'comped', 'gift'] as const) {
      expectValid<{ status?: string }>(MemberListInputSchema, { status });
    }
    expectInvalid(MemberListInputSchema, { status: 'unknown' });
  });

  test('enforce member selectors and bulk destructive safeguards', () => {
    expectValid<{ email?: string }>(MemberGetInputSchema, { email: 'x@example.com' });
    expectValid<{ update?: boolean; labels?: string }>(MemberBulkInputSchema, {
      update: true,
      all: true,
      labels: 'VIP',
    });

    expectInvalid(MemberGetInputSchema, { id: 'member-1', email: 'x@example.com' }, 'Use either');
    expectInvalid(MemberBulkInputSchema, { delete: true, all: true }, '--yes');
    expectInvalid(
      MemberBulkInputSchema,
      { action: 'add-label', filter: "id:'member-1'" },
      '--label-id is required',
    );
    expectInvalid(
      MemberBulkInputSchema,
      { action: 'unsubscribe', all: true, filter: 'status:paid' },
      '--all',
    );
  });
});

describe('newsletter, tier, offer, and label schemas', () => {
  test('require real updates for newsletters, tiers, offers, and labels', () => {
    expectValid<{ id: string }>(NewsletterGetInputSchema, { id: 'newsletter-1' });
    expectValid<{ senderEmail?: string | null }>(NewsletterCreateInputSchema, {
      name: 'Weekly',
      senderEmail: null,
    });
    expectValid<{ name: string }>(TierCreateInputSchema, { name: 'Premium', monthlyPrice: 500 });
    expectValid<{ code: string }>(OfferCreateInputSchema, { name: 'Sale', code: 'sale' });
    expectValid<{ slug?: string }>(LabelGetInputSchema, { slug: 'vip' });
    expectValid<{ name: string }>(LabelCreateInputSchema, { name: 'VIP' });

    expectInvalid(
      NewsletterUpdateInputSchema,
      { id: 'newsletter-1' },
      'Provide at least one update field',
    );
    expectInvalid(
      NewsletterBulkInputSchema,
      { filter: 'status:active', action: 'update' },
      '--status or --visibility',
    );
    expectInvalid(TierUpdateInputSchema, { id: 'tier-1' }, 'Provide at least one update field');
    expectInvalid(
      TierBulkInputSchema,
      { filter: 'type:paid', action: 'update' },
      'at least one update field',
    );
    expectInvalid(OfferUpdateInputSchema, { id: 'offer-1' }, 'Provide at least one update field');
    expectInvalid(OfferBulkInputSchema, { filter: 'status:active', action: 'update' }, '--status');
    expectInvalid(LabelUpdateInputSchema, { id: 'label-1' }, 'Provide at least one update field');
    expectInvalid(LabelBulkInputSchema, { filter: "name:'VIP'", action: 'delete' }, '--yes');
  });

  test('validate identity selectors and basic value formats', () => {
    expectValid<{ id: string }>(TierGetInputSchema, { id: 'tier-1' });
    expectValid<{ id: string }>(OfferGetInputSchema, { id: 'offer-1' });

    expectInvalid(LabelGetInputSchema, {}, 'Provide an id argument or --slug');
    expectInvalid(LabelGetInputSchema, { id: 'label-1', slug: 'vip' }, 'Use either');
    expectInvalid(TierCreateInputSchema, { name: 'Premium', currency: 'US' });
    expectInvalid(OfferCreateInputSchema, { name: 'Sale', code: 'sale', amount: -1 });
  });
});

describe('phase 3 schemas', () => {
  test('enforce user selectors plus webhook and theme mutation requirements', () => {
    expectValid<{ limit?: number | string }>(UserListInputSchema, { limit: 'all' });
    expectValid<{ email?: string }>(UserGetInputSchema, { email: 'owner@example.com' });
    expectValid<{ include?: string }>(UserMeInputSchema, { include: 'roles' });
    expectValid<{ event: string }>(WebhookCreateInputSchema, {
      event: 'post.published',
      targetUrl: 'https://example.com/hook',
    });
    expectValid<{ id: string }>(WebhookDeleteInputSchema, { id: 'hook-1', yes: true });
    expectValid<{ filePath: string }>(ImageUploadInputSchema, { filePath: './image.jpg' });
    expectValid<{ path: string }>(ThemeUploadInputSchema, { path: './theme.zip', activate: true });
    expectValid<{ name: string }>(ThemeActivateInputSchema, { name: 'casper' });
    expectValid<{ path: string }>(ThemeValidateInputSchema, { path: './theme' });
    expectValid<{ key: string }>(SettingGetInputSchema, { key: 'title' });
    expectValid<{ value: string }>(SettingSetInputSchema, { key: 'title', value: 'My Blog' });

    expectInvalid(UserGetInputSchema, {}, 'Provide exactly one selector');
    expectInvalid(
      UserGetInputSchema,
      { id: 'user-1', slug: 'owner' },
      'Provide exactly one selector',
    );
    expectInvalid(WebhookUpdateInputSchema, { id: 'hook-1' }, 'Provide at least one update field');
    expectInvalid(WebhookListenInputSchema, { publicUrl: 'https://example.com/hook' });
    expectInvalid(ThemeDevInputSchema, { path: './theme', debounceMs: 0 });
  });

  test('validate config auth requirements and migration file/url inputs', () => {
    expect(
      expectValid<{ version: number }>(UserConfigSchema, {
        sites: {
          demo: {
            url: 'https://demo.example.com',
            credentialRef: 'site:demo',
            addedAt: '2026-03-01T00:00:00.000Z',
          },
        },
      }).version,
    ).toBe(2);
    expectValid<{ file: string }>(MigrateWordpressInputSchema, { file: './wp.xml' });
    expectValid<{ file: string }>(MigrateMediumInputSchema, { file: './medium.zip' });
    expectValid<{ url: string }>(MigrateSubstackInputSchema, {
      file: './substack.zip',
      url: 'https://example.com',
    });
    expectValid<{ file: string }>(MigrateCsvInputSchema, { file: './posts.csv' });
    expectValid<{ file: string }>(MigrateJsonInputSchema, { file: './import.json' });
    expectValid<{ output: string }>(MigrateExportInputSchema, { output: './backup.zip' });

    expectInvalid(
      UserConfigSchema,
      {
        sites: {
          demo: {
            url: 'https://demo.example.com',
            addedAt: '2026-03-01T00:00:00.000Z',
          },
        },
      },
      'site config must include staffAccessToken or credentialRef',
    );
    expectInvalid(MigrateSubstackInputSchema, { file: './substack.zip', url: 'not-a-url' });
  });
});

describe('comment schemas', () => {
  test('allow list pagination and require ids for targeted moderation flows', () => {
    expectValid<{ limit?: number | string }>(CommentListInputSchema, { limit: 'all' });
    expectValid<{ id: string }>(CommentGetInputSchema, { id: 'comment-1' });
    expectValid<{ filter?: string }>(CommentRepliesInputSchema, {
      id: 'comment-1',
      filter: 'status:published',
    });
    expectValid<{ yes?: boolean }>(CommentDeleteInputSchema, { id: 'comment-1', yes: true });
    expectValid<{ page?: number }>(CommentRelationListInputSchema, { id: 'comment-1', page: 2 });

    expectInvalid(CommentListInputSchema, { limit: 101 });
    expectInvalid(CommentListInputSchema, { limit: 'all', page: 2 }, '--page with --limit all');
    expectInvalid(CommentGetInputSchema, { id: '' });
    expectInvalid(CommentRepliesInputSchema, { id: '', page: 1 });
    expectInvalid(
      CommentRepliesInputSchema,
      { id: 'comment-1', limit: 'all', page: 2 },
      '--page with --limit all',
    );
    expectInvalid(CommentDeleteInputSchema, { id: '' });
    expectInvalid(CommentRelationListInputSchema, { id: 'comment-1', page: 0 });
    expectInvalid(
      CommentRelationListInputSchema,
      { id: 'comment-1', limit: 'all', page: 2 },
      '--page with --limit all',
    );
  });
});

describe('socialweb schemas', () => {
  test('default to the local profile and enforce federated handles elsewhere', () => {
    expect(expectValid<{ handle: string }>(SocialWebProfileInputSchema, {}).handle).toBe('me');
    expectValid<{ query: string }>(SocialWebSearchInputSchema, { query: 'alice' });
    expectValid<{ filePath: string }>(SocialWebUploadInputSchema, { filePath: './photo.jpg' });

    expectInvalid(SocialWebHandleActionInputSchema, { handle: 'me' }, 'federated handle');
    expectInvalid(SocialWebHandleActionInputSchema, { handle: 'alice' }, 'federated handle');
    expectInvalid(SocialWebIdInputSchema, { id: 'not-a-url' });
  });

  test('enforce pagination, profile updates, and content-source exclusivity', () => {
    expectValid<{ limit?: number; all?: boolean }>(SocialWebPaginatedInputSchema, {
      limit: 25,
      all: true,
    });
    expectValid<{ handle: string }>(SocialWebFollowsInputSchema, { handle: 'me', limit: 10 });
    expectValid<{ username?: string }>(SocialWebProfileUpdateInputSchema, {
      username: 'alice',
      avatarUrl: 'https://remote.example/avatar.png',
    });
    expectValid<{ content?: string; imageAlt?: string }>(SocialWebContentInputSchema, {
      content: 'hello social web',
      imageUrl: 'https://remote.example/image.png',
      imageAlt: 'Alt text',
    });
    expectValid<{ id: string }>(SocialWebReplyInputSchema, {
      id: 'https://remote.example/posts/1',
      stdin: true,
    });

    expectInvalid(
      SocialWebPaginatedInputSchema,
      { all: true, next: 'cursor' },
      '--all cannot be combined',
    );
    expectInvalid(
      SocialWebFollowsInputSchema,
      { handle: 'me', all: true, next: 'cursor' },
      '--all cannot be combined',
    );
    expectInvalid(SocialWebProfileUpdateInputSchema, {}, 'Provide at least one profile field');
    expectInvalid(
      SocialWebContentInputSchema,
      { content: 'hello', stdin: true },
      'Provide exactly one content source',
    );
    expectInvalid(
      SocialWebContentInputSchema,
      { stdin: true, imageFile: './photo.jpg', imageUrl: 'https://remote.example/image.png' },
      'Provide at most one image source',
    );
  });
});

describe('stats schemas', () => {
  test('normalize analytics filters and apply default limits where the commands expect them', () => {
    expect(
      expectValid<{ location?: string }>(StatsWebInputSchema, {
        location: 'us',
        audience: 'paid',
      }).location,
    ).toBe('US');
    expect(expectValid<{ limit: number }>(StatsWebTableInputSchema, {}).limit).toBe(10);
    expect(
      expectValid<{ limit: number }>(StatsNewsletterClicksInputSchema, {
        newsletterId: 'newsletter-id',
      }).limit,
    ).toBe(10);
    expect(expectValid<{ limit: number }>(StatsPostsInputSchema, {}).limit).toBe(5);
    expectValid<{ id: string }>(StatsPostInputSchema, { id: 'post-1', range: '7d' });
    expect(
      expectValid<{ limit: number }>(StatsPostReferrersInputSchema, { id: 'post-1' }).limit,
    ).toBe(10);
  });

  test('reject invalid ranges, timezones, and required identifiers', () => {
    expectInvalid(
      StatsWebInputSchema,
      { from: '2026-03-01', to: '2026-02-01' },
      '--from must be on or before --to',
    );
    expectInvalid(
      StatsWebInputSchema,
      { timezone: 'Mars/Phobos' },
      'Timezone must be a valid IANA timezone name',
    );
    expectInvalid(StatsNewsletterClicksInputSchema, { newsletterId: '' });
    expectInvalid(StatsPostInputSchema, { id: '' });
  });
});

describe('site schema', () => {
  test('accepts an empty input object', () => {
    expect(SiteInfoInputSchema.parse({})).toEqual({});
  });
});
