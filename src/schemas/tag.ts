import { z } from 'zod';

export const TagListInputSchema = z.object({
  limit: z.union([z.number().int().positive().max(100), z.literal('all')]).optional(),
  page: z.number().int().positive().optional(),
  filter: z.string().optional(),
  include: z.string().optional(),
  fields: z.string().optional(),
  order: z.string().optional(),
});

export const TagGetInputSchema = z.object({
  id: z.string().min(1).optional(),
  slug: z.string().min(1).optional(),
  include: z.string().optional(),
  fields: z.string().optional(),
});

export const TagCreateInputSchema = z.object({
  name: z.string().min(1),
  slug: z.string().min(1).optional(),
  description: z.string().optional(),
  featureImage: z.string().url().optional(),
  accentColor: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/)
    .optional(),
  visibility: z.enum(['public', 'internal']).optional(),
  metaTitle: z.string().optional(),
  metaDescription: z.string().optional(),
});

export const TagUpdateInputSchema = z
  .object({
    id: z.string().min(1).optional(),
    slugLookup: z.string().min(1).optional(),
    name: z.string().min(1).optional(),
    slug: z.string().min(1).optional(),
    description: z.string().optional(),
    featureImage: z.string().url().optional(),
    accentColor: z
      .string()
      .regex(/^#[0-9A-Fa-f]{6}$/)
      .optional(),
    visibility: z.enum(['public', 'internal']).optional(),
    metaTitle: z.string().optional(),
    metaDescription: z.string().optional(),
  })
  .refine((data) => Boolean(data.id || data.slugLookup), {
    message: 'Provide an id argument or --slug.',
    path: ['id'],
  })
  .refine(
    (data) =>
      Boolean(
        data.name ||
          data.slug ||
          data.description ||
          data.featureImage ||
          data.accentColor ||
          data.visibility ||
          data.metaTitle ||
          data.metaDescription,
      ),
    {
      message: 'Provide at least one update field.',
    },
  );

export const TagDeleteInputSchema = z.object({
  id: z.string().min(1),
  yes: z.boolean().optional(),
});
