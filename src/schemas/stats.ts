import { z } from 'zod';

const RangePresetSchema = z.enum(['7d', '30d', '90d', '365d', 'all']);
const AudienceSchema = z.enum(['all', 'free', 'paid']);
const DeviceSchema = z.enum(['desktop', 'mobile-ios', 'mobile-android', 'bot', 'unknown']);

function isValidDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(value);
}

function isValidTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

const DateSchema = z.string().refine(isValidDate, {
  message: 'Dates must use YYYY-MM-DD format.',
});

const TimezoneSchema = z.string().min(1).refine(isValidTimeZone, {
  message: 'Timezone must be a valid IANA timezone name.',
});

const LimitSchema = z.number().int().positive().max(100);

const RangeFieldsSchema = z.object({
  range: RangePresetSchema.optional(),
  from: DateSchema.optional(),
  to: DateSchema.optional(),
  timezone: TimezoneSchema.optional(),
});

function withRangeValidation<T extends z.ZodTypeAny>(schema: T): T {
  return schema.superRefine((data, context) => {
    const rangeData = data as { from?: string; to?: string };
    if (!rangeData.from || !rangeData.to) {
      return;
    }

    if (rangeData.from > rangeData.to) {
      context.addIssue({
        code: 'custom',
        message: '--from must be on or before --to.',
        path: ['from'],
      });
    }
  }) as T;
}

const RangeInputSchema = withRangeValidation(RangeFieldsSchema);

const WebFilterSchema = z.object({
  audience: AudienceSchema.optional(),
  source: z.string().min(1).optional(),
  location: z
    .string()
    .trim()
    .min(2)
    .max(3)
    .transform((value) => value.toUpperCase())
    .optional(),
  device: DeviceSchema.optional(),
  utmSource: z.string().min(1).optional(),
  utmMedium: z.string().min(1).optional(),
  utmCampaign: z.string().min(1).optional(),
  utmContent: z.string().min(1).optional(),
  utmTerm: z.string().min(1).optional(),
  limit: LimitSchema.optional(),
});

export const StatsOverviewInputSchema = RangeInputSchema;

export const StatsGrowthInputSchema = withRangeValidation(
  RangeFieldsSchema.extend({
    limit: LimitSchema.optional(),
  }),
);

export const StatsWebInputSchema = withRangeValidation(RangeFieldsSchema.merge(WebFilterSchema));

export const StatsWebTableInputSchema = withRangeValidation(
  RangeFieldsSchema.merge(WebFilterSchema).extend({
    limit: LimitSchema.default(10),
  }),
);

export const StatsNewslettersInputSchema = withRangeValidation(
  RangeFieldsSchema.extend({
    newsletterId: z.string().min(1).optional(),
    limit: LimitSchema.default(10),
  }),
);

export const StatsPostsInputSchema = withRangeValidation(
  RangeFieldsSchema.extend({
    limit: LimitSchema.default(5),
  }),
);

export const StatsNewsletterClicksInputSchema = withRangeValidation(
  RangeFieldsSchema.extend({
    newsletterId: z.string().min(1),
    postIds: z.array(z.string().min(1)).optional(),
    limit: LimitSchema.default(10),
  }),
);

export const StatsNewsletterSubscribersInputSchema = withRangeValidation(
  RangeFieldsSchema.extend({
    newsletterId: z.string().min(1).optional(),
  }),
);

export const StatsPostInputSchema = withRangeValidation(
  RangeFieldsSchema.extend({
    id: z.string().min(1),
  }),
);

export const StatsPostGrowthInputSchema = StatsPostInputSchema;

export const StatsPostNewsletterInputSchema = StatsPostInputSchema;

export const StatsPostReferrersInputSchema = withRangeValidation(
  RangeFieldsSchema.extend({
    id: z.string().min(1),
    limit: LimitSchema.default(10),
  }),
);

export const StatsPostWebInputSchema = withRangeValidation(
  RangeFieldsSchema.extend({
    id: z.string().min(1),
  }).merge(WebFilterSchema),
);

export type StatsOverviewInput = z.infer<typeof StatsOverviewInputSchema>;
export type StatsGrowthInput = z.infer<typeof StatsGrowthInputSchema>;
export type StatsWebInput = z.infer<typeof StatsWebInputSchema>;
export type StatsWebTableInput = z.infer<typeof StatsWebTableInputSchema>;
export type StatsNewslettersInput = z.infer<typeof StatsNewslettersInputSchema>;
export type StatsPostsInput = z.infer<typeof StatsPostsInputSchema>;
export type StatsNewsletterClicksInput = z.infer<typeof StatsNewsletterClicksInputSchema>;
export type StatsNewsletterSubscribersInput = z.infer<typeof StatsNewsletterSubscribersInputSchema>;
export type StatsPostInput = z.infer<typeof StatsPostInputSchema>;
export type StatsPostGrowthInput = z.infer<typeof StatsPostGrowthInputSchema>;
export type StatsPostNewsletterInput = z.infer<typeof StatsPostNewsletterInputSchema>;
export type StatsPostReferrersInput = z.infer<typeof StatsPostReferrersInputSchema>;
export type StatsPostWebInput = z.infer<typeof StatsPostWebInputSchema>;
