import { z } from 'zod';

export const ThemeUploadInputSchema = z.object({
  path: z.string().min(1),
  zip: z.boolean().optional(),
  activate: z.boolean().optional(),
});

export const ThemeActivateInputSchema = z.object({
  name: z.string().min(1),
});

export const ThemeValidateInputSchema = z.object({
  path: z.string().min(1),
});

export const ThemeDevInputSchema = z.object({
  path: z.string().min(1),
  watch: z.boolean().optional(),
  activate: z.boolean().optional(),
  debounceMs: z.number().int().positive().max(30_000).optional(),
});
