import { Request, Response, NextFunction } from 'express';
import { z, ZodSchema } from 'zod';

/**
 * Validation middleware factory
 */
export function validate(schema: ZodSchema) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Validate request body
      const validated = await schema.parseAsync(req.body);
      req.body = validated;
      return next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          error: 'Validation failed',
          details: error.issues
        });
      }
      return next(error);
    }
  };
}

/**
 * Common validation schemas
 */
export const Schemas = {
  // Purchase schema
  purchase: z.object({
    eventId: z.string().uuid(),
    ticketTypeId: z.string().uuid(),
    quantity: z.number().min(1).max(10),
    paymentMethodId: z.string().optional(),
  }),
  
  // Refund schema
  refund: z.object({
    orderId: z.string().uuid(),
    reason: z.string().optional(),
  }),
  
  // Transfer schema
  transfer: z.object({
    ticketId: z.string().uuid(),
    recipientAddress: z.string(),
  }),
};
