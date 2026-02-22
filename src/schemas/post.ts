import { z } from 'zod';

const StatusSchema = z.enum(['draft', 'published', 'scheduled']);
const VisibilitySchema = z.enum(['public', 'members', 'paid', 'tiers']);

function withSingleContentSource<T extends z.ZodTypeAny>(schema: T): T {
  return schema.superRefine((value, ctx) => {
    const data = value as Record<string, unknown>;
    const contentSources = [
      data.html,
      data.htmlFile,
      data.lexicalFile,
      data.markdownFile,
      data.markdownStdin,
      data.htmlRawFile,
    ].filter((entry) => entry !== undefined && entry !== false);

    if (contentSources.length > 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'Use only one content source: --html, --html-file, --lexical-file, --markdown-file, --markdown-stdin, or --html-raw-file.',
      });
    }
  }) as T;
}

export const PostListInputSchema = z.object({
  limit: z.union([z.number().int().positive().max(100), z.literal('all')]).optional(),
  page: z.number().int().positive().optional(),
  filter: z.string().optional(),
  status: StatusSchema.optional(),
  featured: z.boolean().optional(),
  include: z.string().optional(),
  fields: z.string().optional(),
  order: z.string().optional(),
  formats: z.string().optional(),
});

export const PostGetInputSchema = z.object({
  id: z.string().min(1).optional(),
  slug: z.string().min(1).optional(),
  include: z.string().optional(),
  fields: z.string().optional(),
  formats: z.string().optional(),
});

export const PostCreateInputSchema = withSingleContentSource(
  z
    .object({
      title: z.string().min(1).optional(),
      status: StatusSchema.optional(),
      publishAt: z.string().datetime().optional(),
      html: z.string().optional(),
      htmlFile: z.string().min(1).optional(),
      lexicalFile: z.string().min(1).optional(),
      markdownFile: z.string().min(1).optional(),
      markdownStdin: z.boolean().optional(),
      htmlRawFile: z.string().min(1).optional(),
      fromJson: z.string().min(1).optional(),
      tags: z.string().optional(),
      authors: z.string().optional(),
      featured: z.boolean().optional(),
      visibility: VisibilitySchema.optional(),
      tier: z.string().min(1).optional(),
      featureImage: z.string().url().optional(),
      excerpt: z.string().optional(),
      metaTitle: z.string().optional(),
      metaDescription: z.string().optional(),
      ogTitle: z.string().optional(),
      ogImage: z.string().url().optional(),
      codeInjectionHead: z.string().optional(),
      newsletter: z.string().optional(),
      emailOnly: z.boolean().optional(),
      emailSegment: z.string().optional(),
    })
    .refine((data) => Boolean(data.title || data.fromJson), {
      message: 'Provide --title or --from-json.',
      path: ['title'],
    })
    .refine((data) => !(data.status === 'scheduled' && !data.publishAt), {
      message: 'publish-at is required when status is scheduled',
      path: ['publishAt'],
    }),
);

export const PostUpdateInputSchema = withSingleContentSource(
  z
    .object({
      id: z.string().min(1).optional(),
      slug: z.string().min(1).optional(),
      title: z.string().min(1).optional(),
      status: StatusSchema.optional(),
      publishAt: z.string().datetime().optional(),
      html: z.string().optional(),
      htmlFile: z.string().min(1).optional(),
      lexicalFile: z.string().min(1).optional(),
      markdownFile: z.string().min(1).optional(),
      markdownStdin: z.boolean().optional(),
      htmlRawFile: z.string().min(1).optional(),
      fromJson: z.string().min(1).optional(),
      tags: z.string().optional(),
      authors: z.string().optional(),
      featured: z.boolean().optional(),
      visibility: VisibilitySchema.optional(),
      tier: z.string().min(1).optional(),
      featureImage: z.string().url().optional(),
      excerpt: z.string().optional(),
      metaTitle: z.string().optional(),
      metaDescription: z.string().optional(),
      ogTitle: z.string().optional(),
      ogImage: z.string().url().optional(),
      codeInjectionHead: z.string().optional(),
      newsletter: z.string().optional(),
      emailOnly: z.boolean().optional(),
      emailSegment: z.string().optional(),
    })
    .refine((data) => Boolean(data.id || data.slug), {
      message: 'Provide an id argument or --slug.',
      path: ['id'],
    })
    .refine(
      (data) =>
        Boolean(
          data.title ||
            data.status ||
            data.publishAt ||
            data.html ||
            data.htmlFile ||
            data.lexicalFile ||
            data.markdownFile ||
            data.markdownStdin ||
            data.htmlRawFile ||
            data.fromJson ||
            data.tags ||
            data.authors ||
            data.featured !== undefined ||
            data.visibility ||
            data.tier ||
            data.featureImage ||
            data.excerpt ||
            data.metaTitle ||
            data.metaDescription ||
            data.ogTitle ||
            data.ogImage ||
            data.codeInjectionHead ||
            data.newsletter ||
            data.emailOnly !== undefined ||
            data.emailSegment,
        ),
      {
        message: 'Provide at least one update field.',
      },
    )
    .refine((data) => !(data.status === 'scheduled' && !data.publishAt), {
      message: 'publish-at is required when status is scheduled',
      path: ['publishAt'],
    }),
);

export const PostDeleteInputSchema = z
  .object({
    id: z.string().min(1).optional(),
    filter: z.string().min(1).optional(),
    yes: z.boolean().optional(),
  })
  .refine((data) => Boolean(data.id || data.filter), {
    message: 'Provide <id> or --filter.',
    path: ['id'],
  })
  .refine((data) => !(data.id && data.filter), {
    message: 'Use either <id> or --filter, not both.',
    path: ['id'],
  });

export const PostPublishInputSchema = z.object({
  id: z.string().min(1),
  newsletter: z.string().optional(),
  emailOnly: z.boolean().optional(),
  emailSegment: z.string().optional(),
});

export const PostScheduleInputSchema = z.object({
  id: z.string().min(1),
  at: z.string().datetime(),
});

export const PostUnscheduleInputSchema = z.object({
  id: z.string().min(1),
});

export const PostCopyInputSchema = z.object({
  id: z.string().min(1),
});

export const PostBulkInputSchema = z
  .object({
    filter: z.string().min(1),
    action: z.enum(['update', 'delete']).optional(),
    update: z.boolean().optional(),
    delete: z.boolean().optional(),
    status: StatusSchema.optional(),
    tags: z.string().optional(),
    addTag: z.string().optional(),
    authors: z.string().optional(),
    yes: z.boolean().optional(),
  })
  .refine(
    (data) => {
      const selected = [
        data.action !== undefined,
        data.update === true,
        data.delete === true,
      ].filter(Boolean);
      return selected.length === 1;
    },
    {
      message: 'Select exactly one action via --action, --update, or --delete.',
      path: ['action'],
    },
  )
  .refine(
    (data) =>
      (data.action ?? (data.delete ? 'delete' : 'update')) !== 'delete' || data.yes === true,
    {
      message: 'Bulk delete requires --yes.',
      path: ['yes'],
    },
  )
  .refine(
    (data) => {
      const action = data.action ?? (data.delete ? 'delete' : 'update');
      if (action !== 'update') {
        return true;
      }

      return Boolean(
        data.status !== undefined ||
          data.tags !== undefined ||
          data.addTag !== undefined ||
          data.authors !== undefined,
      );
    },
    {
      message: 'Bulk update requires at least one of --status, --tags, --add-tag, or --authors.',
      path: ['status'],
    },
  );
