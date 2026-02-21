import { z } from 'zod';

const TierTypeSchema = z.enum(['free', 'paid']);
const TierVisibilitySchema = z.enum(['public', 'none']);

export const TierListInputSchema = z.object({
  limit: z.union([z.number().int().positive().max(100), z.literal('all')]).optional(),
  page: z.number().int().positive().optional(),
  filter: z.string().optional(),
  fields: z.string().optional(),
  order: z.string().optional(),
});

export const TierGetInputSchema = z.object({
  id: z.string().min(1),
});

export const TierCreateInputSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  active: z.boolean().optional(),
  type: TierTypeSchema.optional(),
  visibility: TierVisibilitySchema.optional(),
  monthlyPrice: z.number().int().min(0).optional(),
  yearlyPrice: z.number().int().min(0).optional(),
  currency: z
    .string()
    .length(3)
    .regex(/^[A-Za-z]{3}$/)
    .optional(),
  trialDays: z.number().int().min(0).nullable().optional(),
  benefits: z.string().optional(),
});

export const TierUpdateInputSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1).optional(),
    description: z.string().optional(),
    active: z.boolean().optional(),
    type: TierTypeSchema.optional(),
    visibility: TierVisibilitySchema.optional(),
    monthlyPrice: z.number().int().min(0).optional(),
    yearlyPrice: z.number().int().min(0).optional(),
    currency: z
      .string()
      .length(3)
      .regex(/^[A-Za-z]{3}$/)
      .optional(),
    trialDays: z.number().int().min(0).nullable().optional(),
    benefits: z.string().optional(),
  })
  .refine(
    (data) =>
      Boolean(
        data.name !== undefined ||
          data.description !== undefined ||
          data.active !== undefined ||
          data.type !== undefined ||
          data.visibility !== undefined ||
          data.monthlyPrice !== undefined ||
          data.yearlyPrice !== undefined ||
          data.currency !== undefined ||
          data.trialDays !== undefined ||
          data.benefits !== undefined,
      ),
    {
      message: 'Provide at least one update field.',
    },
  );
