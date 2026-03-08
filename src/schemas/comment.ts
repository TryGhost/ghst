import { z } from 'zod';

const CommentListLimitSchema = z.union([z.number().int().positive().max(100), z.literal('all')]);

function rejectPageWithAll<T extends { limit?: number | 'all'; page?: number }>(
  value: T,
  ctx: z.RefinementCtx,
): void {
  if (value.limit === 'all' && value.page !== undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['page'],
      message: 'Cannot combine --page with --limit all',
    });
  }
}

export const CommentListInputSchema = z
  .object({
    limit: CommentListLimitSchema.optional(),
    page: z.number().int().positive().optional(),
    filter: z.string().optional(),
    order: z.string().optional(),
    topLevelOnly: z.boolean().optional(),
  })
  .superRefine(rejectPageWithAll);

export const CommentGetInputSchema = z.object({
  id: z.string().min(1),
});

export const CommentThreadInputSchema = z.object({
  id: z.string().min(1),
});

export const CommentRepliesInputSchema = z
  .object({
    id: z.string().min(1),
    limit: CommentListLimitSchema.optional(),
    page: z.number().int().positive().optional(),
    filter: z.string().optional(),
  })
  .superRefine(rejectPageWithAll);

export const CommentRelationListInputSchema = z
  .object({
    id: z.string().min(1),
    limit: CommentListLimitSchema.optional(),
    page: z.number().int().positive().optional(),
  })
  .superRefine(rejectPageWithAll);

export const CommentStatusInputSchema = z.object({
  id: z.string().min(1),
});

export const CommentDeleteInputSchema = z.object({
  id: z.string().min(1),
  yes: z.boolean().optional(),
});
