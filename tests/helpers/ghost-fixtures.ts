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
  ['<commentId>', 'comment-id'],
  ['<commentReplyId>', 'comment-reply-id'],
  ['<commentLikeId>', 'comment-like-id'],
  ['<commentReportId>', 'comment-report-id'],
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
  ['<fixture-comment-html>', 'Fixture comment'],
  ['<fixture-reply-html>', 'Fixture reply'],
  ['<fixture-user-name>', 'Site Owner'],
  ['<fixture-webhook-name>', 'Publish Hook'],
  ['<datetime>', '2026-01-01T00:00:00.000Z'],
  ['<email>', 'fixture@example.com'],
  ['<error-id>', 'error-id'],
]);

import api_admin_settings_raw from '../fixtures/ghost-admin/api/admin/settings.json';
import api_admin_site_raw from '../fixtures/ghost-admin/api/admin/site.json';
import api_errors_unknownRoute404_raw from '../fixtures/ghost-admin/api/errors/unknown-route-404.json';
import comments_delete_raw from '../fixtures/ghost-admin/comments/delete.json';
import comments_hide_raw from '../fixtures/ghost-admin/comments/hide.json';
import comments_likes_raw from '../fixtures/ghost-admin/comments/likes.json';
import comments_browse_raw from '../fixtures/ghost-admin/comments/list.json';
import comments_browseTopLevel_raw from '../fixtures/ghost-admin/comments/list-top-level.json';
import comments_read_raw from '../fixtures/ghost-admin/comments/read.json';
import comments_readModeration_raw from '../fixtures/ghost-admin/comments/read-moderation.json';
import comments_replies_raw from '../fixtures/ghost-admin/comments/replies.json';
import comments_reports_raw from '../fixtures/ghost-admin/comments/reports.json';
import comments_show_raw from '../fixtures/ghost-admin/comments/show.json';
import comments_thread_raw from '../fixtures/ghost-admin/comments/thread.json';
import db_export_raw from '../fixtures/ghost-admin/db/export.json';
import db_importSuccess_raw from '../fixtures/ghost-admin/db/import-success.json';
import db_importValidation_raw from '../fixtures/ghost-admin/db/import-validation.json';
import images_upload_raw from '../fixtures/ghost-admin/images/upload.json';
import labels_browse_raw from '../fixtures/ghost-admin/labels/browse.json';
import labels_create_raw from '../fixtures/ghost-admin/labels/create.json';
import labels_notFound404_raw from '../fixtures/ghost-admin/labels/not-found-404.json';
import labels_read_raw from '../fixtures/ghost-admin/labels/read.json';
import labels_update_raw from '../fixtures/ghost-admin/labels/update.json';
import members_browse_raw from '../fixtures/ghost-admin/members/browse.json';
import members_bulkDestroy_raw from '../fixtures/ghost-admin/members/bulk-destroy.json';
import members_bulkEdit_raw from '../fixtures/ghost-admin/members/bulk-edit.json';
import members_create_raw from '../fixtures/ghost-admin/members/create.json';
import members_exportCsv_raw from '../fixtures/ghost-admin/members/export-csv.json';
import members_importCsv_raw from '../fixtures/ghost-admin/members/import-csv.json';
import members_importValidation422_raw from '../fixtures/ghost-admin/members/import-validation-422.json';
import members_notFound404_raw from '../fixtures/ghost-admin/members/not-found-404.json';
import members_read_raw from '../fixtures/ghost-admin/members/read.json';
import members_update_raw from '../fixtures/ghost-admin/members/update.json';
import newsletters_browse_raw from '../fixtures/ghost-admin/newsletters/browse.json';
import newsletters_create_raw from '../fixtures/ghost-admin/newsletters/create.json';
import newsletters_notFound404_raw from '../fixtures/ghost-admin/newsletters/not-found-404.json';
import newsletters_read_raw from '../fixtures/ghost-admin/newsletters/read.json';
import newsletters_update_raw from '../fixtures/ghost-admin/newsletters/update.json';
import offers_browse_raw from '../fixtures/ghost-admin/offers/browse.json';
import offers_create_raw from '../fixtures/ghost-admin/offers/create.json';
import offers_notFound404_raw from '../fixtures/ghost-admin/offers/not-found-404.json';
import offers_read_raw from '../fixtures/ghost-admin/offers/read.json';
import offers_update_raw from '../fixtures/ghost-admin/offers/update.json';
import pages_browse_raw from '../fixtures/ghost-admin/pages/browse.json';
import pages_copy_raw from '../fixtures/ghost-admin/pages/copy.json';
import pages_create_raw from '../fixtures/ghost-admin/pages/create.json';
import pages_read_raw from '../fixtures/ghost-admin/pages/read.json';
import pages_update_raw from '../fixtures/ghost-admin/pages/update.json';
import posts_browse_raw from '../fixtures/ghost-admin/posts/browse.json';
import posts_conflict409_raw from '../fixtures/ghost-admin/posts/conflict-409.json';
import posts_copy_raw from '../fixtures/ghost-admin/posts/copy.json';
import posts_create_raw from '../fixtures/ghost-admin/posts/create.json';
import posts_notFound404_raw from '../fixtures/ghost-admin/posts/not-found-404.json';
import posts_read_raw from '../fixtures/ghost-admin/posts/read.json';
import posts_update_raw from '../fixtures/ghost-admin/posts/update.json';
import posts_validation422_raw from '../fixtures/ghost-admin/posts/validation-422.json';
import settingsAdmin_edit_raw from '../fixtures/ghost-admin/settings-admin/edit.json';
import settingsAdmin_list_raw from '../fixtures/ghost-admin/settings-admin/list.json';
import tags_browse_raw from '../fixtures/ghost-admin/tags/browse.json';
import tags_create_raw from '../fixtures/ghost-admin/tags/create.json';
import tags_read_raw from '../fixtures/ghost-admin/tags/read.json';
import tags_update_raw from '../fixtures/ghost-admin/tags/update.json';
import themes_activate_raw from '../fixtures/ghost-admin/themes/activate.json';
import themes_active_raw from '../fixtures/ghost-admin/themes/active.json';
import themes_browse_raw from '../fixtures/ghost-admin/themes/browse.json';
import themes_upload_raw from '../fixtures/ghost-admin/themes/upload.json';
import tiers_browse_raw from '../fixtures/ghost-admin/tiers/browse.json';
import tiers_create_raw from '../fixtures/ghost-admin/tiers/create.json';
import tiers_notFoundLike500_raw from '../fixtures/ghost-admin/tiers/not-found-like-500.json';
import tiers_read_raw from '../fixtures/ghost-admin/tiers/read.json';
import tiers_update_raw from '../fixtures/ghost-admin/tiers/update.json';
import users_browse_raw from '../fixtures/ghost-admin/users/browse.json';
import users_me_raw from '../fixtures/ghost-admin/users/me.json';
import users_readByEmail_raw from '../fixtures/ghost-admin/users/read-by-email.json';
import users_readById_raw from '../fixtures/ghost-admin/users/read-by-id.json';
import users_readBySlug_raw from '../fixtures/ghost-admin/users/read-by-slug.json';
import webhooks_create_raw from '../fixtures/ghost-admin/webhooks/create.json';
import webhooks_delete_raw from '../fixtures/ghost-admin/webhooks/delete.json';
import webhooks_update_raw from '../fixtures/ghost-admin/webhooks/update.json';

export const fixturePaths = [
  'posts/browse.json',
  'posts/read.json',
  'posts/create.json',
  'posts/update.json',
  'posts/copy.json',
  'posts/conflict-409.json',
  'posts/not-found-404.json',
  'posts/validation-422.json',
  'pages/browse.json',
  'pages/read.json',
  'pages/create.json',
  'pages/update.json',
  'pages/copy.json',
  'tags/browse.json',
  'tags/read.json',
  'tags/create.json',
  'tags/update.json',
  'members/browse.json',
  'members/read.json',
  'members/create.json',
  'members/update.json',
  'members/not-found-404.json',
  'members/bulk-edit.json',
  'members/bulk-destroy.json',
  'members/export-csv.json',
  'members/import-csv.json',
  'members/import-validation-422.json',
  'newsletters/browse.json',
  'newsletters/read.json',
  'newsletters/create.json',
  'newsletters/update.json',
  'newsletters/not-found-404.json',
  'tiers/browse.json',
  'tiers/read.json',
  'tiers/create.json',
  'tiers/update.json',
  'tiers/not-found-like-500.json',
  'offers/browse.json',
  'offers/read.json',
  'offers/create.json',
  'offers/update.json',
  'offers/not-found-404.json',
  'labels/browse.json',
  'labels/read.json',
  'labels/create.json',
  'labels/update.json',
  'labels/not-found-404.json',
  'comments/list.json',
  'comments/list-top-level.json',
  'comments/read.json',
  'comments/read-moderation.json',
  'comments/thread.json',
  'comments/replies.json',
  'comments/likes.json',
  'comments/reports.json',
  'comments/hide.json',
  'comments/show.json',
  'comments/delete.json',
  'users/browse.json',
  'users/read-by-id.json',
  'users/read-by-slug.json',
  'users/read-by-email.json',
  'users/me.json',
  'webhooks/create.json',
  'webhooks/update.json',
  'webhooks/delete.json',
  'images/upload.json',
  'themes/browse.json',
  'themes/active.json',
  'themes/upload.json',
  'themes/activate.json',
  'settings-admin/list.json',
  'settings-admin/edit.json',
  'db/export.json',
  'db/import-success.json',
  'db/import-validation.json',
  'api/admin/site.json',
  'api/admin/settings.json',
  'api/errors/unknown-route-404.json',
] as const;

const rawGhostFixtures = {
  posts: {
    browse: posts_browse_raw,
    read: posts_read_raw,
    create: posts_create_raw,
    update: posts_update_raw,
    copy: posts_copy_raw,
    conflict409: posts_conflict409_raw,
    notFound404: posts_notFound404_raw,
    validation422: posts_validation422_raw,
  },
  pages: {
    browse: pages_browse_raw,
    read: pages_read_raw,
    create: pages_create_raw,
    update: pages_update_raw,
    copy: pages_copy_raw,
  },
  tags: {
    browse: tags_browse_raw,
    read: tags_read_raw,
    create: tags_create_raw,
    update: tags_update_raw,
  },
  members: {
    browse: members_browse_raw,
    read: members_read_raw,
    create: members_create_raw,
    update: members_update_raw,
    notFound404: members_notFound404_raw,
    bulkEdit: members_bulkEdit_raw,
    bulkDestroy: members_bulkDestroy_raw,
    exportCsv: members_exportCsv_raw,
    importCsv: members_importCsv_raw,
    importValidation422: members_importValidation422_raw,
  },
  newsletters: {
    browse: newsletters_browse_raw,
    read: newsletters_read_raw,
    create: newsletters_create_raw,
    update: newsletters_update_raw,
    notFound404: newsletters_notFound404_raw,
  },
  tiers: {
    browse: tiers_browse_raw,
    read: tiers_read_raw,
    create: tiers_create_raw,
    update: tiers_update_raw,
    notFoundLike500: tiers_notFoundLike500_raw,
  },
  offers: {
    browse: offers_browse_raw,
    read: offers_read_raw,
    create: offers_create_raw,
    update: offers_update_raw,
    notFound404: offers_notFound404_raw,
  },
  labels: {
    browse: labels_browse_raw,
    read: labels_read_raw,
    create: labels_create_raw,
    update: labels_update_raw,
    notFound404: labels_notFound404_raw,
  },
  comments: {
    browse: comments_browse_raw,
    browseTopLevel: comments_browseTopLevel_raw,
    read: comments_read_raw,
    readModeration: comments_readModeration_raw,
    thread: comments_thread_raw,
    replies: comments_replies_raw,
    likes: comments_likes_raw,
    reports: comments_reports_raw,
    hide: comments_hide_raw,
    show: comments_show_raw,
    delete: comments_delete_raw,
  },
  users: {
    browse: users_browse_raw,
    readById: users_readById_raw,
    readBySlug: users_readBySlug_raw,
    readByEmail: users_readByEmail_raw,
    me: users_me_raw,
  },
  webhooks: {
    create: webhooks_create_raw,
    update: webhooks_update_raw,
    delete: webhooks_delete_raw,
  },
  images: {
    upload: images_upload_raw,
  },
  themes: {
    browse: themes_browse_raw,
    active: themes_active_raw,
    upload: themes_upload_raw,
    activate: themes_activate_raw,
  },
  settingsAdmin: {
    list: settingsAdmin_list_raw,
    edit: settingsAdmin_edit_raw,
  },
  db: {
    export: db_export_raw,
    importSuccess: db_importSuccess_raw,
    importValidation: db_importValidation_raw,
  },
  api: {
    admin: {
      site: api_admin_site_raw,
      settings: api_admin_settings_raw,
    },
    errors: {
      unknownRoute404: api_errors_unknownRoute404_raw,
    },
  },
} as const;

export type GhostFixtures = typeof rawGhostFixtures;

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

export const ghostFixtures = materializeValue(rawGhostFixtures) as GhostFixtures;

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
  commentId: 'comment-id',
  commentReplyId: 'comment-reply-id',
  commentLikeId: 'comment-like-id',
  commentReportId: 'comment-report-id',
  userId: 'user-id',
  userSlug: 'owner',
  userEmail: 'owner@example.com',
  webhookId: 'webhook-id',
  themeName: 'casper',
} as const;

export function cloneFixture<T>(value: T): T {
  return structuredClone(value);
}
