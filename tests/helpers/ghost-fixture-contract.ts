import { cloneFixture, fixtureIds, ghostFixtures } from './ghost-fixtures.js';

export interface GhostFixtureContract<T = unknown> {
  path: string;
  usedBy: readonly string[];
  getFixture: () => T;
  validate: (value: T) => void;
}

function fail(message: string): never {
  throw new Error(message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function requireRecord(value: unknown, path: string): Record<string, unknown> {
  if (!isRecord(value)) {
    fail(`${path} must contain an object.`);
  }

  return value;
}

function requireArrayKey(
  value: unknown,
  key: string,
  path: string,
): Array<Record<string, unknown>> {
  const record = requireRecord(value, path);
  if (!Array.isArray(record[key])) {
    fail(`${path} must contain an array at "${key}".`);
  }

  return record[key] as Array<Record<string, unknown>>;
}

function requireString(value: unknown, path: string): string {
  if (typeof value !== 'string') {
    fail(`${path} must contain a string.`);
  }

  return value;
}

function requireNumberField(value: unknown, field: string, path: string): number {
  const record = requireRecord(value, path);
  const fieldValue = record[field];
  if (typeof fieldValue !== 'number' || Number.isNaN(fieldValue)) {
    fail(`${path} must contain numeric field "${field}".`);
  }

  return fieldValue;
}

function assertIncludesId(
  collection: Array<Record<string, unknown>>,
  id: string,
  path: string,
): void {
  if (!collection.some((entry) => entry.id === id)) {
    fail(`${path} must contain fixture id "${id}".`);
  }
}

function validateResourceArray(
  value: unknown,
  key: string,
  path: string,
  requiredIds: string[] = [],
): void {
  const collection = requireArrayKey(value, key, path);
  for (const id of requiredIds) {
    assertIncludesId(collection, id, path);
  }
}

function validateErrorFixture(value: unknown, path: string, status: number): void {
  const record = requireRecord(value, path);
  if (record.status !== status) {
    fail(`${path} must contain status ${status}.`);
  }

  const payload = requireRecord(record.payload, path);
  if (!Array.isArray(payload.errors) || payload.errors.length === 0) {
    fail(`${path} must contain payload.errors.`);
  }
}

function validateStringFixture(value: unknown, path: string): void {
  if (requireString(value, path).length === 0) {
    fail(`${path} must not be empty.`);
  }
}

function validateWebhooksDeleteFixture(value: unknown, path: string): void {
  requireRecord(value, path);
}

function validateBulkMetaFixture(value: unknown, path: string, key: 'bulk' | 'meta'): void {
  const root = requireRecord(value, path);
  const meta =
    key === 'bulk'
      ? requireRecord(requireRecord(root.bulk, path).meta, path)
      : requireRecord(root.meta, path);
  requireRecord(meta.stats, path);
}

function validateDbExportFixture(value: unknown, path: string): void {
  const bytes = requireNumberField(value, 'bytes', path);
  if (bytes <= 0) {
    fail(`${path} must contain a positive byte count.`);
  }
}

function validateApiSiteFixture(value: unknown, path: string): void {
  const site = requireRecord(requireRecord(value, path).site, path);
  if (typeof site.title !== 'string' || typeof site.url !== 'string') {
    fail(`${path} must contain site.title and site.url.`);
  }
}

function validateCommentTopLevelFixture(value: unknown, path: string): void {
  const comments = requireArrayKey(value, 'comments', path);
  assertIncludesId(comments, fixtureIds.commentId, path);
  if (comments.some((entry) => entry.id === fixtureIds.commentReplyId)) {
    fail(`${path} must not include the reply fixture.`);
  }
}

function validateCommentModerationReadFixture(value: unknown, path: string): void {
  const comments = requireArrayKey(value, 'comments', path);
  assertIncludesId(comments, fixtureIds.commentId, path);
  const first = comments[0];
  const post = requireRecord(first?.post, path);
  if (post.id !== fixtureIds.postId) {
    fail(`${path} must include the related post fixture.`);
  }
}

function validateCommentStatusFixture(
  value: unknown,
  path: string,
  status: 'hidden' | 'published' | 'deleted',
): void {
  const comments = requireArrayKey(value, 'comments', path);
  const first = comments[0];
  if (first?.status !== status) {
    fail(`${path} must return a ${status} comment.`);
  }
}

function contract<T>(
  path: string,
  usedBy: readonly string[],
  getFixture: () => T,
  validate: (value: T) => void,
): GhostFixtureContract<T> {
  return { path, usedBy, getFixture, validate };
}

export const ghostFixtureContracts = {
  apiAdminSite: contract(
    'api/admin/site.json',
    ['GET /ghost/api/admin/site/'],
    () => ghostFixtures.api.admin.site,
    (value) => validateApiSiteFixture(value, 'api/admin/site.json'),
  ),
  apiAdminSettings: contract(
    'api/admin/settings.json',
    ['GET /ghost/api/admin/settings/'],
    () => ghostFixtures.api.admin.settings,
    (value) => validateResourceArray(value, 'settings', 'api/admin/settings.json'),
  ),
  apiUnknownRoute404: contract(
    'api/errors/unknown-route-404.json',
    ['fallback unknown route response'],
    () => ghostFixtures.api.errors.unknownRoute404,
    (value) => validateErrorFixture(value, 'api/errors/unknown-route-404.json', 404),
  ),
  postsBrowse: contract(
    'posts/browse.json',
    ['GET /ghost/api/admin/posts/'],
    () => ghostFixtures.posts.browse,
    (value) => validateResourceArray(value, 'posts', 'posts/browse.json', [fixtureIds.postId]),
  ),
  postsRead: contract(
    'posts/read.json',
    ['GET /ghost/api/admin/posts/:id/', 'GET /ghost/api/admin/posts/slug/:slug/'],
    () => ghostFixtures.posts.read,
    (value) => validateResourceArray(value, 'posts', 'posts/read.json', [fixtureIds.postId]),
  ),
  postsCreate: contract(
    'posts/create.json',
    ['POST /ghost/api/admin/posts/'],
    () => ghostFixtures.posts.create,
    (value) => validateResourceArray(value, 'posts', 'posts/create.json', [fixtureIds.postId]),
  ),
  postsUpdate: contract(
    'posts/update.json',
    ['PUT /ghost/api/admin/posts/:id/'],
    () => ghostFixtures.posts.update,
    (value) => validateResourceArray(value, 'posts', 'posts/update.json', [fixtureIds.postId]),
  ),
  postsCopy: contract(
    'posts/copy.json',
    ['POST /ghost/api/admin/posts/:id/copy/'],
    () => ghostFixtures.posts.copy,
    (value) => validateResourceArray(value, 'posts', 'posts/copy.json'),
  ),
  postsConflict409: contract(
    'posts/conflict-409.json',
    ['PUT /ghost/api/admin/posts/:id/ (conflict branch)'],
    () => ghostFixtures.posts.conflict409,
    (value) => validateErrorFixture(value, 'posts/conflict-409.json', 409),
  ),
  postsNotFound404: contract(
    'posts/not-found-404.json',
    ['direct fixture consumers in tests'],
    () => ghostFixtures.posts.notFound404,
    (value) => validateErrorFixture(value, 'posts/not-found-404.json', 404),
  ),
  postsValidation422: contract(
    'posts/validation-422.json',
    ['direct fixture consumers in tests'],
    () => ghostFixtures.posts.validation422,
    (value) => validateErrorFixture(value, 'posts/validation-422.json', 422),
  ),
  pagesBrowse: contract(
    'pages/browse.json',
    ['GET /ghost/api/admin/pages/'],
    () => ghostFixtures.pages.browse,
    (value) => validateResourceArray(value, 'pages', 'pages/browse.json', [fixtureIds.pageId]),
  ),
  pagesRead: contract(
    'pages/read.json',
    ['GET /ghost/api/admin/pages/:id/', 'GET /ghost/api/admin/pages/slug/:slug/'],
    () => ghostFixtures.pages.read,
    (value) => validateResourceArray(value, 'pages', 'pages/read.json', [fixtureIds.pageId]),
  ),
  pagesCreate: contract(
    'pages/create.json',
    ['POST /ghost/api/admin/pages/'],
    () => ghostFixtures.pages.create,
    (value) => validateResourceArray(value, 'pages', 'pages/create.json', [fixtureIds.pageId]),
  ),
  pagesUpdate: contract(
    'pages/update.json',
    ['PUT /ghost/api/admin/pages/:id/'],
    () => ghostFixtures.pages.update,
    (value) => validateResourceArray(value, 'pages', 'pages/update.json', [fixtureIds.pageId]),
  ),
  pagesCopy: contract(
    'pages/copy.json',
    ['POST /ghost/api/admin/pages/:id/copy/'],
    () => ghostFixtures.pages.copy,
    (value) => validateResourceArray(value, 'pages', 'pages/copy.json'),
  ),
  tagsBrowse: contract(
    'tags/browse.json',
    ['GET /ghost/api/admin/tags/'],
    () => ghostFixtures.tags.browse,
    (value) => validateResourceArray(value, 'tags', 'tags/browse.json', [fixtureIds.tagId]),
  ),
  tagsRead: contract(
    'tags/read.json',
    ['GET /ghost/api/admin/tags/:id/', 'GET /ghost/api/admin/tags/slug/:slug/'],
    () => ghostFixtures.tags.read,
    (value) => validateResourceArray(value, 'tags', 'tags/read.json', [fixtureIds.tagId]),
  ),
  tagsCreate: contract(
    'tags/create.json',
    ['POST /ghost/api/admin/tags/'],
    () => ghostFixtures.tags.create,
    (value) => validateResourceArray(value, 'tags', 'tags/create.json', [fixtureIds.tagId]),
  ),
  tagsUpdate: contract(
    'tags/update.json',
    ['PUT /ghost/api/admin/tags/:id/'],
    () => ghostFixtures.tags.update,
    (value) => validateResourceArray(value, 'tags', 'tags/update.json', [fixtureIds.tagId]),
  ),
  membersBrowse: contract(
    'members/browse.json',
    ['GET /ghost/api/admin/members/'],
    () => ghostFixtures.members.browse,
    (value) =>
      validateResourceArray(value, 'members', 'members/browse.json', [fixtureIds.memberId]),
  ),
  membersRead: contract(
    'members/read.json',
    ['GET /ghost/api/admin/members/:id/'],
    () => ghostFixtures.members.read,
    (value) => validateResourceArray(value, 'members', 'members/read.json', [fixtureIds.memberId]),
  ),
  membersCreate: contract(
    'members/create.json',
    ['POST /ghost/api/admin/members/'],
    () => ghostFixtures.members.create,
    (value) =>
      validateResourceArray(value, 'members', 'members/create.json', [fixtureIds.memberId]),
  ),
  membersUpdate: contract(
    'members/update.json',
    ['PUT /ghost/api/admin/members/:id/'],
    () => ghostFixtures.members.update,
    (value) =>
      validateResourceArray(value, 'members', 'members/update.json', [fixtureIds.memberId]),
  ),
  membersNotFound404: contract(
    'members/not-found-404.json',
    ['direct fixture consumers in tests'],
    () => ghostFixtures.members.notFound404,
    (value) => validateErrorFixture(value, 'members/not-found-404.json', 404),
  ),
  membersBulkEdit: contract(
    'members/bulk-edit.json',
    ['PUT /ghost/api/admin/members/bulk/'],
    () => ghostFixtures.members.bulkEdit,
    (value) => validateBulkMetaFixture(value, 'members/bulk-edit.json', 'bulk'),
  ),
  membersBulkDestroy: contract(
    'members/bulk-destroy.json',
    ['DELETE /ghost/api/admin/members/'],
    () => ghostFixtures.members.bulkDestroy,
    (value) => validateBulkMetaFixture(value, 'members/bulk-destroy.json', 'meta'),
  ),
  membersExportCsv: contract(
    'members/export-csv.json',
    ['GET /ghost/api/admin/members/upload/'],
    () => ghostFixtures.members.exportCsv,
    (value) => validateStringFixture(value, 'members/export-csv.json'),
  ),
  membersImportCsv: contract(
    'members/import-csv.json',
    ['POST /ghost/api/admin/members/upload/'],
    () => ghostFixtures.members.importCsv,
    (value) =>
      validateResourceArray(value, 'members', 'members/import-csv.json', [fixtureIds.memberId]),
  ),
  membersImportValidation422: contract(
    'members/import-validation-422.json',
    ['direct fixture consumers in tests'],
    () => ghostFixtures.members.importValidation422,
    (value) => validateErrorFixture(value, 'members/import-validation-422.json', 422),
  ),
  newslettersBrowse: contract(
    'newsletters/browse.json',
    ['GET /ghost/api/admin/newsletters/'],
    () => ghostFixtures.newsletters.browse,
    (value) =>
      validateResourceArray(value, 'newsletters', 'newsletters/browse.json', [
        fixtureIds.newsletterId,
      ]),
  ),
  newslettersRead: contract(
    'newsletters/read.json',
    ['GET /ghost/api/admin/newsletters/:id/'],
    () => ghostFixtures.newsletters.read,
    (value) =>
      validateResourceArray(value, 'newsletters', 'newsletters/read.json', [
        fixtureIds.newsletterId,
      ]),
  ),
  newslettersCreate: contract(
    'newsletters/create.json',
    ['POST /ghost/api/admin/newsletters/'],
    () => ghostFixtures.newsletters.create,
    (value) =>
      validateResourceArray(value, 'newsletters', 'newsletters/create.json', [
        fixtureIds.newsletterId,
      ]),
  ),
  newslettersUpdate: contract(
    'newsletters/update.json',
    ['PUT /ghost/api/admin/newsletters/:id/'],
    () => ghostFixtures.newsletters.update,
    (value) =>
      validateResourceArray(value, 'newsletters', 'newsletters/update.json', [
        fixtureIds.newsletterId,
      ]),
  ),
  newslettersNotFound404: contract(
    'newsletters/not-found-404.json',
    ['direct fixture consumers in tests'],
    () => ghostFixtures.newsletters.notFound404,
    (value) => validateErrorFixture(value, 'newsletters/not-found-404.json', 404),
  ),
  tiersBrowse: contract(
    'tiers/browse.json',
    ['GET /ghost/api/admin/tiers/'],
    () => ghostFixtures.tiers.browse,
    (value) => validateResourceArray(value, 'tiers', 'tiers/browse.json', [fixtureIds.tierId]),
  ),
  tiersRead: contract(
    'tiers/read.json',
    ['GET /ghost/api/admin/tiers/:id/'],
    () => ghostFixtures.tiers.read,
    (value) => validateResourceArray(value, 'tiers', 'tiers/read.json', [fixtureIds.tierId]),
  ),
  tiersCreate: contract(
    'tiers/create.json',
    ['POST /ghost/api/admin/tiers/'],
    () => ghostFixtures.tiers.create,
    (value) => validateResourceArray(value, 'tiers', 'tiers/create.json', [fixtureIds.tierId]),
  ),
  tiersUpdate: contract(
    'tiers/update.json',
    ['PUT /ghost/api/admin/tiers/:id/'],
    () => ghostFixtures.tiers.update,
    (value) => validateResourceArray(value, 'tiers', 'tiers/update.json', [fixtureIds.tierId]),
  ),
  tiersNotFoundLike500: contract(
    'tiers/not-found-like-500.json',
    ['direct fixture consumers in tests'],
    () => ghostFixtures.tiers.notFoundLike500,
    (value) => validateErrorFixture(value, 'tiers/not-found-like-500.json', 500),
  ),
  offersBrowse: contract(
    'offers/browse.json',
    ['GET /ghost/api/admin/offers/'],
    () => ghostFixtures.offers.browse,
    (value) => validateResourceArray(value, 'offers', 'offers/browse.json', [fixtureIds.offerId]),
  ),
  offersRead: contract(
    'offers/read.json',
    ['GET /ghost/api/admin/offers/:id/'],
    () => ghostFixtures.offers.read,
    (value) => validateResourceArray(value, 'offers', 'offers/read.json', [fixtureIds.offerId]),
  ),
  offersCreate: contract(
    'offers/create.json',
    ['POST /ghost/api/admin/offers/'],
    () => ghostFixtures.offers.create,
    (value) => validateResourceArray(value, 'offers', 'offers/create.json', [fixtureIds.offerId]),
  ),
  offersUpdate: contract(
    'offers/update.json',
    ['PUT /ghost/api/admin/offers/:id/'],
    () => ghostFixtures.offers.update,
    (value) => validateResourceArray(value, 'offers', 'offers/update.json', [fixtureIds.offerId]),
  ),
  offersNotFound404: contract(
    'offers/not-found-404.json',
    ['direct fixture consumers in tests'],
    () => ghostFixtures.offers.notFound404,
    (value) => validateErrorFixture(value, 'offers/not-found-404.json', 404),
  ),
  labelsBrowse: contract(
    'labels/browse.json',
    ['GET /ghost/api/admin/labels/'],
    () => ghostFixtures.labels.browse,
    (value) => validateResourceArray(value, 'labels', 'labels/browse.json', [fixtureIds.labelId]),
  ),
  labelsRead: contract(
    'labels/read.json',
    ['GET /ghost/api/admin/labels/:id/', 'GET /ghost/api/admin/labels/slug/:slug/'],
    () => ghostFixtures.labels.read,
    (value) => validateResourceArray(value, 'labels', 'labels/read.json', [fixtureIds.labelId]),
  ),
  labelsCreate: contract(
    'labels/create.json',
    ['POST /ghost/api/admin/labels/'],
    () => ghostFixtures.labels.create,
    (value) => validateResourceArray(value, 'labels', 'labels/create.json', [fixtureIds.labelId]),
  ),
  labelsUpdate: contract(
    'labels/update.json',
    ['PUT /ghost/api/admin/labels/:id/'],
    () => ghostFixtures.labels.update,
    (value) => validateResourceArray(value, 'labels', 'labels/update.json', [fixtureIds.labelId]),
  ),
  labelsNotFound404: contract(
    'labels/not-found-404.json',
    ['direct fixture consumers in tests'],
    () => ghostFixtures.labels.notFound404,
    (value) => validateErrorFixture(value, 'labels/not-found-404.json', 404),
  ),
  commentsBrowse: contract(
    'comments/list.json',
    ['GET /ghost/api/admin/comments/'],
    () => ghostFixtures.comments.browse,
    (value) =>
      validateResourceArray(value, 'comments', 'comments/list.json', [
        fixtureIds.commentId,
        fixtureIds.commentReplyId,
      ]),
  ),
  commentsBrowseTopLevel: contract(
    'comments/list-top-level.json',
    ['GET /ghost/api/admin/comments/?include_nested=false'],
    () => ghostFixtures.comments.browseTopLevel,
    (value) => validateCommentTopLevelFixture(value, 'comments/list-top-level.json'),
  ),
  commentsRead: contract(
    'comments/read.json',
    ['GET /ghost/api/admin/comments/:id/'],
    () => ghostFixtures.comments.read,
    (value) =>
      validateResourceArray(value, 'comments', 'comments/read.json', [fixtureIds.commentId]),
  ),
  commentsReadModeration: contract(
    'comments/read-moderation.json',
    ['GET /ghost/api/admin/comments/:id/?include=member,post,...'],
    () => ghostFixtures.comments.readModeration,
    (value) => validateCommentModerationReadFixture(value, 'comments/read-moderation.json'),
  ),
  commentsThread: contract(
    'comments/thread.json',
    [
      'GET /ghost/api/admin/comments/?filter=(parent_id:...+in_reply_to_id:null),in_reply_to_id:...',
    ],
    () => ghostFixtures.comments.thread,
    (value) =>
      validateResourceArray(value, 'comments', 'comments/thread.json', [fixtureIds.commentReplyId]),
  ),
  commentsReplies: contract(
    'comments/replies.json',
    ['GET /ghost/api/admin/comments/:id/replies/'],
    () => ghostFixtures.comments.replies,
    (value) =>
      validateResourceArray(value, 'comments', 'comments/replies.json', [
        fixtureIds.commentReplyId,
      ]),
  ),
  commentsLikes: contract(
    'comments/likes.json',
    ['GET /ghost/api/admin/comments/:id/likes/'],
    () => ghostFixtures.comments.likes,
    (value) =>
      validateResourceArray(value, 'comment_likes', 'comments/likes.json', [
        fixtureIds.commentLikeId,
      ]),
  ),
  commentsReports: contract(
    'comments/reports.json',
    ['GET /ghost/api/admin/comments/:id/reports/'],
    () => ghostFixtures.comments.reports,
    (value) =>
      validateResourceArray(value, 'comment_reports', 'comments/reports.json', [
        fixtureIds.commentReportId,
      ]),
  ),
  commentsHide: contract(
    'comments/hide.json',
    ['PUT /ghost/api/admin/comments/:id/ (hidden)'],
    () => ghostFixtures.comments.hide,
    (value) => validateCommentStatusFixture(value, 'comments/hide.json', 'hidden'),
  ),
  commentsShow: contract(
    'comments/show.json',
    ['PUT /ghost/api/admin/comments/:id/ (published)'],
    () => ghostFixtures.comments.show,
    (value) => validateCommentStatusFixture(value, 'comments/show.json', 'published'),
  ),
  commentsDelete: contract(
    'comments/delete.json',
    ['PUT /ghost/api/admin/comments/:id/ (deleted)'],
    () => ghostFixtures.comments.delete,
    (value) => validateCommentStatusFixture(value, 'comments/delete.json', 'deleted'),
  ),
  usersBrowse: contract(
    'users/browse.json',
    ['GET /ghost/api/admin/users/'],
    () => ghostFixtures.users.browse,
    (value) => validateResourceArray(value, 'users', 'users/browse.json', [fixtureIds.userId]),
  ),
  usersReadById: contract(
    'users/read-by-id.json',
    ['GET /ghost/api/admin/users/:id/'],
    () => ghostFixtures.users.readById,
    (value) => validateResourceArray(value, 'users', 'users/read-by-id.json', [fixtureIds.userId]),
  ),
  usersReadBySlug: contract(
    'users/read-by-slug.json',
    ['GET /ghost/api/admin/users/slug/:slug/'],
    () => ghostFixtures.users.readBySlug,
    (value) =>
      validateResourceArray(value, 'users', 'users/read-by-slug.json', [fixtureIds.userId]),
  ),
  usersReadByEmail: contract(
    'users/read-by-email.json',
    ['GET /ghost/api/admin/users/email/:email/'],
    () => ghostFixtures.users.readByEmail,
    (value) =>
      validateResourceArray(value, 'users', 'users/read-by-email.json', [fixtureIds.userId]),
  ),
  usersMe: contract(
    'users/me.json',
    ['GET /ghost/api/admin/users/me/'],
    () => ghostFixtures.users.me,
    (value) => validateResourceArray(value, 'users', 'users/me.json', [fixtureIds.userId]),
  ),
  webhooksCreate: contract(
    'webhooks/create.json',
    ['POST /ghost/api/admin/webhooks/'],
    () => ghostFixtures.webhooks.create,
    (value) =>
      validateResourceArray(value, 'webhooks', 'webhooks/create.json', [fixtureIds.webhookId]),
  ),
  webhooksUpdate: contract(
    'webhooks/update.json',
    ['PUT /ghost/api/admin/webhooks/:id/'],
    () => ghostFixtures.webhooks.update,
    (value) =>
      validateResourceArray(value, 'webhooks', 'webhooks/update.json', [fixtureIds.webhookId]),
  ),
  webhooksDelete: contract(
    'webhooks/delete.json',
    ['DELETE /ghost/api/admin/webhooks/:id/'],
    () => ghostFixtures.webhooks.delete,
    (value) => validateWebhooksDeleteFixture(value, 'webhooks/delete.json'),
  ),
  imagesUpload: contract(
    'images/upload.json',
    ['POST /ghost/api/admin/images/upload/'],
    () => ghostFixtures.images.upload,
    (value) => validateResourceArray(value, 'images', 'images/upload.json'),
  ),
  themesBrowse: contract(
    'themes/browse.json',
    ['GET /ghost/api/admin/themes/'],
    () => ghostFixtures.themes.browse,
    (value) => validateResourceArray(value, 'themes', 'themes/browse.json'),
  ),
  themesActive: contract(
    'themes/active.json',
    ['GET /ghost/api/admin/themes/active/'],
    () => ghostFixtures.themes.active,
    (value) => validateResourceArray(value, 'themes', 'themes/active.json'),
  ),
  themesUpload: contract(
    'themes/upload.json',
    ['POST /ghost/api/admin/themes/upload/'],
    () => ghostFixtures.themes.upload,
    (value) => validateResourceArray(value, 'themes', 'themes/upload.json'),
  ),
  themesActivate: contract(
    'themes/activate.json',
    [
      'PUT /ghost/api/admin/themes/:name/activate/',
      'PUT /ghost/api/admin/themes/uploaded-theme/activate/',
    ],
    () => ghostFixtures.themes.activate,
    (value) => validateResourceArray(value, 'themes', 'themes/activate.json'),
  ),
  settingsAdminList: contract(
    'settings-admin/list.json',
    ['direct fixture consumers in tests'],
    () => ghostFixtures.settingsAdmin.list,
    (value) => validateResourceArray(value, 'settings', 'settings-admin/list.json'),
  ),
  settingsAdminEdit: contract(
    'settings-admin/edit.json',
    ['direct fixture consumers in tests'],
    () => ghostFixtures.settingsAdmin.edit,
    (value) => validateResourceArray(value, 'settings', 'settings-admin/edit.json'),
  ),
  dbExport: contract(
    'db/export.json',
    ['GET /ghost/api/admin/db/'],
    () => ghostFixtures.db.export,
    (value) => validateDbExportFixture(value, 'db/export.json'),
  ),
  dbImportSuccess: contract(
    'db/import-success.json',
    ['POST /ghost/api/admin/db/'],
    () => ghostFixtures.db.importSuccess,
    (value) => validateResourceArray(value, 'db', 'db/import-success.json'),
  ),
  dbImportValidation: contract(
    'db/import-validation.json',
    ['direct fixture consumers in tests'],
    () => ghostFixtures.db.importValidation,
    (value) => validateErrorFixture(value, 'db/import-validation.json', 422),
  ),
} as const;

export type GhostFixtureContractName = keyof typeof ghostFixtureContracts;

export const ghostFixtureContractEntries = Object.entries(ghostFixtureContracts) as Array<
  [GhostFixtureContractName, (typeof ghostFixtureContracts)[GhostFixtureContractName]]
>;

export const ghostFixtureContractPaths = ghostFixtureContractEntries
  .map(([, contract]) => contract.path)
  .sort();

export function getContractFixture<Name extends GhostFixtureContractName>(
  name: Name,
): ReturnType<(typeof ghostFixtureContracts)[Name]['getFixture']> {
  return ghostFixtureContracts[name].getFixture() as ReturnType<
    (typeof ghostFixtureContracts)[Name]['getFixture']
  >;
}

export function cloneContractFixture<Name extends GhostFixtureContractName>(
  name: Name,
): ReturnType<(typeof ghostFixtureContracts)[Name]['getFixture']> {
  return cloneFixture(getContractFixture(name)) as ReturnType<
    (typeof ghostFixtureContracts)[Name]['getFixture']
  >;
}
