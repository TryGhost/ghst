import { z } from 'zod';

export const WebhookCreateInputSchema = z.object({
  event: z.string().min(1),
  targetUrl: z.string().url(),
  name: z.string().min(1).optional(),
  secret: z.string().optional(),
  apiVersion: z.string().optional(),
});

export const WebhookUpdateInputSchema = z
  .object({
    id: z.string().min(1),
    event: z.string().min(1).optional(),
    targetUrl: z.string().url().optional(),
    name: z.string().min(1).optional(),
    secret: z.string().optional(),
    apiVersion: z.string().optional(),
  })
  .refine(
    (data) =>
      Boolean(
        data.event !== undefined ||
          data.targetUrl !== undefined ||
          data.name !== undefined ||
          data.secret !== undefined ||
          data.apiVersion !== undefined,
      ),
    {
      message: 'Provide at least one update field.',
    },
  );

export const WebhookDeleteInputSchema = z.object({
  id: z.string().min(1),
  yes: z.boolean().optional(),
});

export const WebhookListenInputSchema = z.object({
  publicUrl: z.string().url(),
  forwardTo: z.string().url(),
  events: z.string().optional(),
  host: z.string().min(1).optional(),
  port: z.number().int().positive().optional(),
});
