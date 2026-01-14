import amqp from 'amqplib';
import axios from 'axios';
import { db } from '../config/database';
import { logger } from '../utils/logger';

const log = logger.child({ component: 'WebhookConsumer' });

const QUEUES = {
  PAYMENT_WEBHOOK: 'payment.webhook'
};

export async function startWebhookConsumer() {
  const connection = await amqp.connect(process.env.RABBITMQ_URL || 'amqp://localhost');
  const channel = await connection.createChannel();
  
  await channel.assertQueue(QUEUES.PAYMENT_WEBHOOK, { durable: true });
  
  log.info('Payment webhook consumer started');
  
  channel.consume(QUEUES.PAYMENT_WEBHOOK, async (msg) => {
    if (!msg) return;
    
    try {
      const data = JSON.parse(msg.content.toString());
      const { webhookId, source } = data;
      
      // Process webhook from database
      const webhook = await db('webhook_inbox')
        .where('id', webhookId)
        .first();
      
      if (!webhook) {
        throw new Error(`Webhook ${webhookId} not found`);
      }
      
      const payload = JSON.parse(webhook.payload);
      
      // Process based on type
      switch (payload.type) {
        case 'payment_intent.succeeded':
          await handlePaymentSuccess(payload);
          break;
        case 'payment_intent.payment_failed':
          await handlePaymentFailure(payload);
          break;
        case 'charge.refunded':
          await handleRefund(payload);
          break;
      }
      
      // Update webhook as processed
      await db('webhook_inbox')
        .where('id', webhookId)
        .update({
          processed_at: new Date(),
          status: 'processed'
        });
      
      // Acknowledge message
      channel.ack(msg);
    } catch (error) {
      log.error({ error }, 'Webhook processing error');
      // Requeue on failure
      channel.nack(msg, false, true);
    }
  });
}

async function handlePaymentSuccess(payload: any) {
  const marketplaceUrl = process.env.MARKETPLACE_SERVICE_URL || 'http://marketplace-service:3006';
  await axios.post(
    `${marketplaceUrl}/internal/events`,
    { event: 'order.completed', data: payload }
  );
}

async function handlePaymentFailure(payload: any) {
  const marketplaceUrl = process.env.MARKETPLACE_SERVICE_URL || 'http://marketplace-service:3006';
  await axios.post(
    `${marketplaceUrl}/internal/events`,
    { event: 'payment.failed', data: payload }
  );
}

async function handleRefund(payload: any) {
  const marketplaceUrl = process.env.MARKETPLACE_SERVICE_URL || 'http://marketplace-service:3006';
  await axios.post(
    `${marketplaceUrl}/internal/events`,
    { event: 'refund.processed', data: payload }
  );
}
