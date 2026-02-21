import { z } from 'zod';

export const PostListInputSchema = z.object({
  limit: z.number().int().positive().max(100).optional(),
  page: z.number().int().positive().optional(),
  filter: z.string().optional(),
  status: z.string().optional(),
  include: z.string().optional(),
  fields: z.string().optional(),
  order: z.string().optional(),
});

export const PostGetInputSchema = z.object({
  id: z.string().min(1).optional(),
  slug: z.string().min(1).optional(),
  include: z.string().optional(),
  fields: z.string().optional(),
  formats: z.string().optional(),
});
