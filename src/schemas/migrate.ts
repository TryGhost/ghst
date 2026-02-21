import { z } from 'zod';

export const MigrateWordpressInputSchema = z.object({
  file: z.string().min(1),
});

export const MigrateMediumInputSchema = z.object({
  file: z.string().min(1),
});

export const MigrateSubstackInputSchema = z.object({
  file: z.string().min(1),
  url: z.string().url(),
});

export const MigrateCsvInputSchema = z.object({
  file: z.string().min(1),
});

export const MigrateJsonInputSchema = z.object({
  file: z.string().min(1),
});

export const MigrateExportInputSchema = z.object({
  output: z.string().min(1),
});
