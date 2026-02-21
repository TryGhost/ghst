import { z } from 'zod';

export const UrlSchema = z.url();

export const SiteAliasSchema = z
  .string()
  .min(1)
  .regex(/^[a-z0-9][a-z0-9-]*$/i, 'site alias may include letters, numbers, and hyphens');

export const ApiVersionSchema = z.string().regex(/^v\d+\.\d+$/, 'api version must look like v6.0');

export const AdminApiKeySchema = z
  .string()
  .regex(/^[A-Za-z0-9]+:[A-Fa-f0-9]+$/, 'key must use the format {id}:{hex-secret}')
  .refine((value) => {
    const secret = value.split(':')[1] ?? '';
    return secret.length % 2 === 0;
  }, 'hex secret must have even length');
