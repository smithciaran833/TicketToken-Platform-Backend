import { serviceCache } from '../services/cache-integration';
import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { PaymentService } from '../services/paymentService';
import { percentOfCents } from '../../utils/money';
import { logger } from '../utils/logger';

const log = logger.child({ component: 'IntentsController' });

const createIntentSchema = z.object({
  orderId: z.string().uuid(),
  amount: z.number().positive().int(), // Amount in cents (integer)
  venueId: z.string().uuid().optional(),
  metadata: z.record(z.string(), z.any()).optional()
});

export class IntentsController {
  async createIntent(req: Request, res: Response, next: NextFunction) {
    try {
      const user = (req as any).user;
      const tenantId = (req as any).tenantId;

      if (!user) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      if (!tenantId) {
        return res.status(403).json({ error: 'Tenant context required' });
      }

      const validated = createIntentSchema.parse(req.body);

      // Calculate platform fee: 2.5% = 250 basis points
      const platformFeeCents = percentOfCents(validated.amount, 250);

      // Create payment intent (amounts in cents)
      const intent = await PaymentService.createPaymentIntent({
        orderId: validated.orderId,
        amount: validated.amount,
        platformFee: platformFeeCents,
        venueId: validated.venueId,
        metadata: {
          ...validated.metadata,
          tenantId,
          userId: user.id
        }
      });

      log.info('Payment intent created', {
        orderId: validated.orderId,
        intentId: intent.id,
        tenantId,
        userId: user.id
      });

      res.json({
        intentId: intent.id,
        clientSecret: intent.clientSecret,
        amount: intent.amount,
        platformFee: intent.platformFee
      });
    } catch (error) {
      log.error('Failed to create payment intent', error);
      return next(error);
    }
  }
}

export const intentsController = new IntentsController();
