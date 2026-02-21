import { z } from 'zod';

export const UserListInputSchema = z.object({
  limit: z.union([z.number().int().positive().max(100), z.literal('all')]).optional(),
  page: z.number().int().positive().optional(),
  filter: z.string().optional(),
  include: z.string().optional(),
  fields: z.string().optional(),
  order: z.string().optional(),
});

export const UserGetInputSchema = z
  .object({
    id: z.string().min(1).optional(),
    slug: z.string().min(1).optional(),
    email: z.string().email().optional(),
    include: z.string().optional(),
    fields: z.string().optional(),
  })
  .refine(
    (data) => {
      const selectors = [Boolean(data.id), Boolean(data.slug), Boolean(data.email)].filter(Boolean);
      return selectors.length === 1;
    },
    {
      message: 'Provide exactly one selector: id argument, --slug, or --email.',
      path: ['id'],
    },
  );

export const UserMeInputSchema = z.object({
  include: z.string().optional(),
  fields: z.string().optional(),
});
