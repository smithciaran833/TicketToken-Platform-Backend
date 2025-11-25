import { z } from 'zod';

export const internalMintSchema = z.object({
  ticketIds: z.array(z.string().uuid()).min(1).max(100),
  eventId: z.string().uuid(),
  userId: z.string().uuid(),
  tenantId: z.string().uuid(),
  queue: z.boolean().optional(),
  orderId: z.string().uuid().optional()
});

export type InternalMintRequest = z.infer<typeof internalMintSchema>;
