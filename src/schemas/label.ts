import { z } from 'zod';

export const LabelListInputSchema = z.object({
  limit: z.union([z.number().int().positive().max(100), z.literal('all')]).optional(),
  page: z.number().int().positive().optional(),
  filter: z.string().optional(),
  include: z.string().optional(),
  fields: z.string().optional(),
  order: z.string().optional(),
});

export const LabelGetInputSchema = z
  .object({
    id: z.string().min(1).optional(),
    slug: z.string().min(1).optional(),
    include: z.string().optional(),
    fields: z.string().optional(),
  })
  .refine((data) => Boolean(data.id || data.slug), {
    message: 'Provide an id argument or --slug.',
    path: ['id'],
  })
  .refine((data) => !(data.id && data.slug), {
    message: 'Use either id argument or --slug, not both.',
    path: ['id'],
  });

export const LabelCreateInputSchema = z.object({
  name: z.string().min(1),
});

export const LabelUpdateInputSchema = z
  .object({
    id: z.string().min(1).optional(),
    slugLookup: z.string().min(1).optional(),
    name: z.string().min(1).optional(),
  })
  .refine((data) => Boolean(data.id || data.slugLookup), {
    message: 'Provide an id argument or --slug.',
    path: ['id'],
  })
  .refine((data) => !(data.id && data.slugLookup), {
    message: 'Use either id argument or --slug, not both.',
    path: ['id'],
  })
  .refine((data) => Boolean(data.name), {
    message: 'Provide at least one update field.',
  });

export const LabelDeleteInputSchema = z.object({
  id: z.string().min(1),
  yes: z.boolean().optional(),
});

export const LabelBulkInputSchema = z
  .object({
    filter: z.string().min(1),
    action: z.enum(['update', 'delete']),
    name: z.string().min(1).optional(),
    yes: z.boolean().optional(),
  })
  .refine((data) => data.action !== 'delete' || data.yes === true, {
    message: 'Bulk delete requires --yes.',
    path: ['yes'],
  })
  .refine((data) => data.action !== 'update' || Boolean(data.name), {
    message: 'Bulk update requires --name.',
    path: ['name'],
  });
