import { z } from 'zod';

const StatusSchema = z.enum(['draft', 'published', 'scheduled']);
const VisibilitySchema = z.enum(['public', 'members', 'paid', 'tiers']);

function withSingleContentSource<T extends z.ZodTypeAny>(schema: T): T {
  return schema.superRefine((value, ctx) => {
    const data = value as Record<string, unknown>;
    const contentSources = [data.html, data.htmlFile, data.lexicalFile].filter(
      (entry) => entry !== undefined,
    );

    if (contentSources.length > 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Use only one of --html, --html-file, or --lexical-file.',
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
      title: z.string().min(1),
      status: StatusSchema.default('draft'),
      publishAt: z.string().datetime().optional(),
      html: z.string().optional(),
      htmlFile: z.string().min(1).optional(),
      lexicalFile: z.string().min(1).optional(),
      tags: z.string().optional(),
      authors: z.string().optional(),
      featured: z.boolean().optional(),
      visibility: VisibilitySchema.optional(),
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
      tags: z.string().optional(),
      authors: z.string().optional(),
      featured: z.boolean().optional(),
      visibility: VisibilitySchema.optional(),
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
            data.tags ||
            data.authors ||
            data.featured !== undefined ||
            data.visibility,
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

export const PostDeleteInputSchema = z.object({
  id: z.string().min(1),
  yes: z.boolean().optional(),
});

export const PostPublishInputSchema = z.object({
  id: z.string().min(1),
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
    action: z.enum(['update', 'delete']),
    status: StatusSchema.optional(),
    tags: z.string().optional(),
    yes: z.boolean().optional(),
  })
  .refine((data) => data.action !== 'delete' || data.yes === true, {
    message: 'Bulk delete requires --yes.',
    path: ['yes'],
  })
  .refine(
    (data) =>
      data.action !== 'update' || Boolean(data.status !== undefined || data.tags !== undefined),
    {
      message: 'Bulk update requires at least one of --status or --tags.',
      path: ['status'],
    },
  );
