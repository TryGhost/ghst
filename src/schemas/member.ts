import { z } from 'zod';

const EmailTypeSchema = z.enum(['signin', 'signup', 'subscribe']);
const BulkActionSchema = z.enum(['unsubscribe', 'add-label', 'remove-label', 'delete']);

export const MemberListInputSchema = z.object({
  limit: z.union([z.number().int().positive().max(100), z.literal('all')]).optional(),
  page: z.number().int().positive().optional(),
  filter: z.string().optional(),
  status: z.enum(['free', 'paid', 'comped', 'gift']).optional(),
  search: z.string().optional(),
  include: z.string().optional(),
  fields: z.string().optional(),
  order: z.string().optional(),
});

export const MemberGetInputSchema = z
  .object({
    id: z.string().min(1).optional(),
    email: z.email().optional(),
    include: z.string().optional(),
    fields: z.string().optional(),
  })
  .refine((data) => Boolean(data.id || data.email), {
    message: 'Provide an id argument or --email.',
    path: ['id'],
  })
  .refine((data) => !(data.id && data.email), {
    message: 'Use either id argument or --email, not both.',
    path: ['id'],
  });

export const MemberCreateInputSchema = z
  .object({
    email: z.email(),
    name: z.string().min(1).optional(),
    note: z.string().optional(),
    labels: z.string().optional(),
    newsletters: z.string().optional(),
    subscribed: z.boolean().optional(),
    sendEmail: z.boolean().optional(),
    emailType: EmailTypeSchema.optional(),
    comp: z.boolean().optional(),
    tier: z.string().min(1).optional(),
  })
  .refine((data) => !(data.comp && !data.tier), {
    message: '--tier is required when --comp is set.',
    path: ['tier'],
  });

export const MemberUpdateInputSchema = z
  .object({
    id: z.string().min(1).optional(),
    email: z.email().optional(),
    name: z.string().min(1).optional(),
    note: z.string().optional(),
    labels: z.string().optional(),
    newsletters: z.string().optional(),
    subscribed: z.boolean().optional(),
    comp: z.boolean().optional(),
    tier: z.string().min(1).optional(),
    expiry: z.string().datetime().optional(),
    clearTiers: z.boolean().optional(),
  })
  .refine((data) => Boolean(data.id || data.email), {
    message: 'Provide an id argument or --email.',
    path: ['id'],
  })
  .refine((data) => !(data.id && data.email), {
    message: 'Use either id argument or --email, not both.',
    path: ['id'],
  })
  .refine(
    (data) =>
      Boolean(
        data.name !== undefined ||
          data.note !== undefined ||
          data.labels !== undefined ||
          data.newsletters !== undefined ||
          data.subscribed !== undefined ||
          data.comp !== undefined ||
          data.tier !== undefined ||
          data.expiry !== undefined ||
          data.clearTiers,
      ),
    {
      message: 'Provide at least one update field.',
    },
  )
  .refine((data) => !(data.comp && !data.tier && !data.clearTiers), {
    message: '--tier is required when --comp is set unless --clear-tiers is used.',
    path: ['tier'],
  })
  .refine((data) => !(data.expiry && !data.tier), {
    message: '--tier is required when --expiry is set.',
    path: ['tier'],
  });

export const MemberDeleteInputSchema = z.object({
  id: z.string().min(1),
  yes: z.boolean().optional(),
  cancel: z.boolean().optional(),
});

export const MemberImportInputSchema = z.object({
  filePath: z.string().min(1),
  labels: z.string().optional(),
});

export const MemberExportInputSchema = z.object({
  limit: z.union([z.number().int().positive().max(100), z.literal('all')]).optional(),
  filter: z.string().optional(),
  search: z.string().optional(),
  output: z.string().min(1).optional(),
});

export const MemberBulkInputSchema = z
  .object({
    action: BulkActionSchema.optional(),
    update: z.boolean().optional(),
    delete: z.boolean().optional(),
    all: z.boolean().optional(),
    filter: z.string().optional(),
    search: z.string().optional(),
    labelId: z.string().min(1).optional(),
    labels: z.string().optional(),
    yes: z.boolean().optional(),
  })
  .refine(
    (data) => {
      const selected = [
        data.action !== undefined,
        data.update === true,
        data.delete === true,
      ].filter(Boolean);
      return selected.length === 1;
    },
    {
      message: 'Select exactly one action via --action, --update, or --delete.',
      path: ['action'],
    },
  )
  .refine((data) => Boolean(data.all || data.filter || data.search), {
    message: 'Provide one of --all, --filter, or --search.',
    path: ['all'],
  })
  .refine((data) => !(data.all && (data.filter || data.search)), {
    message: '--all cannot be combined with --filter or --search.',
    path: ['all'],
  })
  .refine(
    (data) => {
      if (data.action === 'add-label' || data.action === 'remove-label') {
        return Boolean(data.labelId);
      }

      return true;
    },
    {
      message: '--label-id is required for add-label/remove-label actions.',
      path: ['labelId'],
    },
  )
  .refine((data) => (data.update ? Boolean(data.labels) : true), {
    message: '--labels is required with --update.',
    path: ['labels'],
  })
  .refine((data) => (data.delete || data.action === 'delete' ? data.yes === true : true), {
    message: '--delete/--action delete requires --yes.',
    path: ['yes'],
  });
