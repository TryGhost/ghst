import { z } from 'zod';

export const ImageUploadInputSchema = z.object({
  filePath: z.string().min(1),
  purpose: z.string().min(1).optional(),
  ref: z.string().min(1).optional(),
});
