import { v4 as uuidv4 } from 'uuid';
import { withLock, LockKeys } from '@tickettoken/shared';
import { logger } from '../../utils/logger';

export class PaymentProcessorService {
  private stripe: any;
  private db: any;
  
  constructor(stripe: any, db: any) {
    this.stripe = stripe;
    this.db = db;
  }

  async processPayment(data: {
    userId: string;
    orderId: string;
    amountCents: number;
    currency: string;
    idempotencyKey?: string;
    tenantId?: string;
  }): Promise<any> {
    const userLockKey = LockKeys.userPurchase(data.userId);
    
    return await withLock(userLockKey, 15000, async () => {
      const paymentIntent = await this.stripe.paymentIntents.create({
        amount: data.amountCents,
        currency: data.currency,
        metadata: {
          orderId: data.orderId,
          userId: data.userId,
          tenantId: data.tenantId || 'default'
        }
      }, {
        idempotencyKey: data.idempotencyKey
      });

      const [transaction] = await this.db('payment_transactions')
        .insert({
          id: uuidv4(),
          order_id: data.orderId,
          user_id: data.userId,
          amount: data.amountCents,
          currency: data.currency,
          stripe_payment_intent_id: paymentIntent.id,
          status: paymentIntent.status,
          idempotency_key: data.idempotencyKey,
          tenant_id: data.tenantId || 'default',
          created_at: new Date()
        })
        .returning('*');

      logger.info(`Payment processed for user ${data.userId}, order ${data.orderId}`);
      
      return {
        transactionId: transaction.id,
        paymentIntentId: paymentIntent.id,
        status: paymentIntent.status,
        clientSecret: paymentIntent.client_secret
      };
    });
  }

  async confirmPayment(paymentIntentId: string, userId: string): Promise<any> {
    const userLockKey = LockKeys.userPurchase(userId);
    
    return await withLock(userLockKey, 10000, async () => {
      const paymentIntent = await this.stripe.paymentIntents.confirm(paymentIntentId);
      
      await this.db('payment_transactions')
        .where({ stripe_payment_intent_id: paymentIntentId })
        .update({
          status: paymentIntent.status,
          confirmed_at: new Date()
        });
      
      logger.info(`Payment confirmed for intent ${paymentIntentId}`);
      
      return {
        status: paymentIntent.status,
        confirmedAt: new Date()
      };
    });
  }
}

export default PaymentProcessorService;
