import { z } from 'zod';

const HandleSchema = z
  .string()
  .min(1)
  .refine((value) => value === 'me' || /^@?[^@\s]+@[^@\s]+$/.test(value), {
    message: 'handle must be me or a federated handle like @user@domain',
  });

const UrlSchema = z.string().url();

const CursorSchema = z.string().min(1);
const LimitSchema = z.number().int().positive().max(100);

const PaginationSchema = z
  .object({
    limit: LimitSchema.optional(),
    next: CursorSchema.optional(),
    all: z.boolean().optional(),
  })
  .superRefine((value, context) => {
    if (value.all && value.next) {
      context.addIssue({
        code: 'custom',
        message: '--all cannot be combined with --next.',
        path: ['all'],
      });
    }
  });

export const SocialWebStatusInputSchema = z.object({});

export const SocialWebProfileInputSchema = z.object({
  handle: HandleSchema.default('me'),
});

export const SocialWebProfileUpdateInputSchema = z
  .object({
    name: z.string().min(1).optional(),
    username: z.string().min(1).optional(),
    bio: z.string().optional(),
    avatarUrl: UrlSchema.optional(),
    bannerImageUrl: UrlSchema.optional(),
  })
  .refine(
    (value) =>
      value.name !== undefined ||
      value.username !== undefined ||
      value.bio !== undefined ||
      value.avatarUrl !== undefined ||
      value.bannerImageUrl !== undefined,
    {
      message: 'Provide at least one profile field to update.',
      path: ['name'],
    },
  );

export const SocialWebSearchInputSchema = z.object({
  query: z.string().min(1),
});

export const SocialWebPaginatedInputSchema = PaginationSchema;

export const SocialWebFollowsInputSchema = z
  .object({
    handle: HandleSchema.default('me'),
    limit: LimitSchema.optional(),
    next: CursorSchema.optional(),
    all: z.boolean().optional(),
  })
  .superRefine((value, context) => {
    if (value.all && value.next) {
      context.addIssue({
        code: 'custom',
        message: '--all cannot be combined with --next.',
        path: ['all'],
      });
    }
  });

export const SocialWebHandleActionInputSchema = z.object({
  handle: HandleSchema.refine((value) => value !== 'me', {
    message: 'handle must be a federated handle like @user@domain',
  }),
});

export const SocialWebIdInputSchema = z.object({
  id: UrlSchema,
});

export const SocialWebBlockDomainInputSchema = z.object({
  url: UrlSchema,
});

export const SocialWebUploadInputSchema = z.object({
  filePath: z.string().min(1),
});

export const SocialWebContentInputSchema = z
  .object({
    content: z.string().min(1).optional(),
    stdin: z.boolean().optional(),
    imageFile: z.string().min(1).optional(),
    imageUrl: UrlSchema.optional(),
    imageAlt: z.string().min(1).optional(),
  })
  .superRefine((value, context) => {
    const contentSources = [value.content !== undefined, value.stdin === true].filter(
      Boolean,
    ).length;
    if (contentSources !== 1) {
      context.addIssue({
        code: 'custom',
        message: 'Provide exactly one content source with --content or --stdin.',
        path: ['content'],
      });
    }

    const imageSources = [value.imageFile !== undefined, value.imageUrl !== undefined].filter(
      Boolean,
    ).length;
    if (imageSources > 1) {
      context.addIssue({
        code: 'custom',
        message: 'Provide at most one image source with --image-file or --image-url.',
        path: ['imageFile'],
      });
    }
  });

export const SocialWebReplyInputSchema = SocialWebContentInputSchema.extend({
  id: UrlSchema,
});
