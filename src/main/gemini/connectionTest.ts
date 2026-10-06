import { z } from 'zod';

export const connectionTestSchema = z.object({
  model: z.string().trim().min(1).max(200).optional(),
  apiKey: z.string().trim().min(1).max(512).optional()
}).strict();
