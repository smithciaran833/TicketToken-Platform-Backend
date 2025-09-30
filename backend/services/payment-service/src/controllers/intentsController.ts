import { Request, Response } from 'express';
import Stripe from 'stripe';
import { config } from '../config';
import { percentOfCents } from '../utils/money';

const stripe = new Stripe(config.stripe.secretKey, {
  apiVersion: '2023-10-16'
});

export class IntentsController {
  async createIntent(req: Request, res: Response) {  // Changed from 'create' to 'createIntent'
    try {
      const { amount, currency = 'usd' } = req.body;
      
      // Calculate fees
      const platformFeeCents = percentOfCents(amount, 250); // 2.5%
      
      const intent = await stripe.paymentIntents.create({
        amount,
        currency,
        metadata: {
          platformFee: platformFeeCents.toString()
        }
      });

      res.json({ 
        clientSecret: intent.client_secret,
        intentId: intent.id 
      });
    } catch (error) {
      console.error('Payment intent creation error:', error);
      res.status(500).json({ error: 'Failed to create payment intent' });
    }
  }
}

// Export instance as expected by routes
export const intentsController = new IntentsController();
