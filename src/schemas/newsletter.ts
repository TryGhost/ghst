import { z } from 'zod';

const NewsletterStatusSchema = z.enum(['active', 'archived']);
const NewsletterVisibilitySchema = z.enum(['all', 'members', 'paid']);

export const NewsletterListInputSchema = z.object({
  limit: z.union([z.number().int().positive().max(100), z.literal('all')]).optional(),
  page: z.number().int().positive().optional(),
  filter: z.string().optional(),
  include: z.string().optional(),
  fields: z.string().optional(),
  order: z.string().optional(),
});

export const NewsletterGetInputSchema = z.object({
  id: z.string().min(1),
  include: z.string().optional(),
  fields: z.string().optional(),
});

export const NewsletterCreateInputSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  senderName: z.string().optional(),
  senderEmail: z.email().nullable().optional(),
  senderReplyTo: z.string().optional(),
  status: NewsletterStatusSchema.optional(),
  visibility: NewsletterVisibilitySchema.optional(),
  subscribeOnSignup: z.boolean().optional(),
  optInExisting: z.boolean().optional(),
});

export const NewsletterUpdateInputSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1).optional(),
    description: z.string().optional(),
    senderName: z.string().optional(),
    senderEmail: z.email().nullable().optional(),
    senderReplyTo: z.string().optional(),
    status: NewsletterStatusSchema.optional(),
    visibility: NewsletterVisibilitySchema.optional(),
    subscribeOnSignup: z.boolean().optional(),
  })
  .refine(
    (data) =>
      Boolean(
        data.name !== undefined ||
          data.description !== undefined ||
          data.senderName !== undefined ||
          data.senderEmail !== undefined ||
          data.senderReplyTo !== undefined ||
          data.status !== undefined ||
          data.visibility !== undefined ||
          data.subscribeOnSignup !== undefined,
      ),
    {
      message: 'Provide at least one update field.',
    },
  );

export const NewsletterBulkInputSchema = z
  .object({
    filter: z.string().min(1),
    action: z.literal('update'),
    status: NewsletterStatusSchema.optional(),
    visibility: NewsletterVisibilitySchema.optional(),
  })
  .refine((data) => Boolean(data.status !== undefined || data.visibility !== undefined), {
    message: 'Bulk update requires --status or --visibility.',
    path: ['status'],
  });
