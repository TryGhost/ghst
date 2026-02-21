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
