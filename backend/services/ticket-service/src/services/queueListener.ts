import { PaymentEventHandler } from './paymentEventHandler';
import { logger } from '../utils/logger';

const log = logger.child({ component: 'QueueListener' });

class QueueListenerClass {
  async start() {
    // For now, expose endpoints that payment service can call
    // In production, this would consume from RabbitMQ
    log.info('Queue listener ready (webhook mode)');
  }
  
  // These will be called via webhook/REST for now
  async processPaymentSuccess(orderId: string, paymentId: string) {
    await PaymentEventHandler.handlePaymentSucceeded(orderId, paymentId);
  }
  
  async processPaymentFailure(orderId: string, reason: string) {
    await PaymentEventHandler.handlePaymentFailed(orderId, reason);
  }
}

export const QueueListener = new QueueListenerClass();
