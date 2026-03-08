import { z } from 'zod';

const CommentListLimitSchema = z.union([z.number().int().positive().max(100), z.literal('all')]);

export const CommentListInputSchema = z.object({
  limit: CommentListLimitSchema.optional(),
  page: z.number().int().positive().optional(),
  filter: z.string().optional(),
  order: z.string().optional(),
  topLevelOnly: z.boolean().optional(),
});

export const CommentGetInputSchema = z.object({
  id: z.string().min(1),
});

export const CommentThreadInputSchema = z.object({
  id: z.string().min(1),
});

export const CommentRepliesInputSchema = z.object({
  id: z.string().min(1),
  limit: CommentListLimitSchema.optional(),
  page: z.number().int().positive().optional(),
  filter: z.string().optional(),
});

export const CommentRelationListInputSchema = z.object({
  id: z.string().min(1),
  limit: CommentListLimitSchema.optional(),
  page: z.number().int().positive().optional(),
});

export const CommentStatusInputSchema = z.object({
  id: z.string().min(1),
});

export const CommentDeleteInputSchema = z.object({
  id: z.string().min(1),
  yes: z.boolean().optional(),
});
