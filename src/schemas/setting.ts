import { z } from 'zod';

export const SettingGetInputSchema = z.object({
  key: z.string().min(1),
});

export const SettingSetInputSchema = z.object({
  key: z.string().min(1),
  value: z.string().min(1),
});
