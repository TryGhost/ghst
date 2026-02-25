import { z } from 'zod';
import { ApiVersionSchema, SiteAliasSchema, StaffAccessTokenSchema, UrlSchema } from './common.js';

export const SiteConfigSchema = z
  .object({
    url: UrlSchema,
    staffAccessToken: StaffAccessTokenSchema.optional(),
    credentialRef: z.string().min(1).optional(),
    apiVersion: ApiVersionSchema.default('v6.0'),
    addedAt: z.string().datetime(),
  })
  .refine((site) => Boolean(site.staffAccessToken || site.credentialRef), {
    message: 'site config must include staffAccessToken or credentialRef',
  });

export const UserConfigSchema = z.object({
  $schema: z.string().optional(),
  version: z.number().int().min(1).default(2),
  active: SiteAliasSchema.optional(),
  sites: z.record(SiteAliasSchema, SiteConfigSchema).default({}),
  defaults: z
    .object({
      format: z.string().optional(),
      limit: z.number().int().positive().optional(),
      editor: z.string().optional(),
    })
    .optional(),
});

export const ProjectConfigSchema = z.object({
  site: SiteAliasSchema,
  defaults: z.record(z.string(), z.unknown()).optional(),
});

export type GhstUserConfig = z.infer<typeof UserConfigSchema>;
export type GhstProjectConfig = z.infer<typeof ProjectConfigSchema>;
