import { z } from 'zod';

const OfferTypeSchema = z.enum(['percent', 'fixed', 'trial', 'free_months']);
const OfferCadenceSchema = z.enum(['month', 'year']);
const OfferDurationSchema = z.enum(['once', 'forever', 'trial', 'free_months']);
const OfferStatusSchema = z.enum(['active', 'archived']);
const OfferRedemptionTypeSchema = z.enum(['signup', 'retention']);

export const OfferListInputSchema = z.object({
  limit: z.union([z.number().int().positive().max(100), z.literal('all')]).optional(),
  page: z.number().int().positive().optional(),
  filter: z.string().optional(),
});

export const OfferGetInputSchema = z.object({
  id: z.string().min(1),
});

export const OfferCreateInputSchema = z.object({
  name: z.string().min(1),
  code: z.string().min(1),
  displayTitle: z.string().optional(),
  displayDescription: z.string().optional(),
  type: OfferTypeSchema.optional(),
  cadence: OfferCadenceSchema.optional(),
  amount: z.number().int().min(0).optional(),
  duration: OfferDurationSchema.optional(),
  durationInMonths: z.number().int().min(1).optional(),
  currency: z
    .string()
    .length(3)
    .regex(/^[A-Za-z]{3}$/)
    .nullable()
    .optional(),
  status: OfferStatusSchema.optional(),
  redemptionType: OfferRedemptionTypeSchema.optional(),
  tierId: z.string().min(1).optional(),
});

export const OfferUpdateInputSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1).optional(),
    code: z.string().min(1).optional(),
    displayTitle: z.string().optional(),
    displayDescription: z.string().optional(),
    type: OfferTypeSchema.optional(),
    cadence: OfferCadenceSchema.optional(),
    amount: z.number().int().min(0).optional(),
    duration: OfferDurationSchema.optional(),
    durationInMonths: z.number().int().min(1).optional(),
    currency: z
      .string()
      .length(3)
      .regex(/^[A-Za-z]{3}$/)
      .nullable()
      .optional(),
    status: OfferStatusSchema.optional(),
    redemptionType: OfferRedemptionTypeSchema.optional(),
    tierId: z.string().min(1).optional(),
  })
  .refine(
    (data) =>
      Boolean(
        data.name !== undefined ||
          data.code !== undefined ||
          data.displayTitle !== undefined ||
          data.displayDescription !== undefined ||
          data.type !== undefined ||
          data.cadence !== undefined ||
          data.amount !== undefined ||
          data.duration !== undefined ||
          data.durationInMonths !== undefined ||
          data.currency !== undefined ||
          data.status !== undefined ||
          data.redemptionType !== undefined ||
          data.tierId !== undefined,
      ),
    {
      message: 'Provide at least one update field.',
    },
  );
