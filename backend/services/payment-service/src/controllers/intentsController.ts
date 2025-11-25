import { FastifyRequest, FastifyReply } from 'fastify';
import Stripe from 'stripe';
import { config } from '../config';
import { percentOfCents } from '../utils/money';
import { logger } from '../utils/logger';

const log = logger.child({ component: 'IntentsController' });

const stripe = new Stripe(config.stripe.secretKey, {
  apiVersion: '2023-10-16'
});

export class IntentsController {
  async createIntent(request: FastifyRequest, reply: FastifyReply) {
    try {
      const { amount, currency = 'usd' } = request.body as { amount: number; currency?: string };
      
      // Calculate fees
      const platformFeeCents = percentOfCents(amount, 250); // 2.5%
      
      const intent = await stripe.paymentIntents.create({
        amount,
        currency,
        metadata: {
          platformFee: platformFeeCents.toString()
        }
      });

      return reply.send({ 
        clientSecret: intent.client_secret,
        intentId: intent.id 
      });
    } catch (error) {
      log.error('Payment intent creation error', { error });
      return reply.code(500).send({ error: 'Failed to create payment intent' });
    }
  }
}

// Export instance as expected by routes
export const intentsController = new IntentsController();
