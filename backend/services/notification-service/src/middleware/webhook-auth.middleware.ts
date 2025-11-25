import { FastifyRequest, FastifyReply } from 'fastify';
import crypto from 'crypto';
import { env } from '../config/env';
import { logger } from '../config/logger';

export const verifyTwilioSignature = async (
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> => {
  try {
    const twilioSignature = request.headers['x-twilio-signature'] as string;

    if (!twilioSignature || !env.TWILIO_AUTH_TOKEN) {
      return reply.status(401).send({ error: 'Unauthorized webhook request' });
    }

    // Twilio signature verification logic
    const url = `${request.protocol}://${request.hostname}${request.url}`;
    const params = request.body || {};

    // Sort parameters alphabetically and concatenate
    const data = Object.keys(params)
      .sort()
      .reduce((acc, key) => acc + key + (params as any)[key], url);

    const expectedSignature = crypto
      .createHmac('sha1', env.TWILIO_AUTH_TOKEN)
      .update(Buffer.from(data, 'utf-8'))
      .digest('base64');

    if (twilioSignature !== expectedSignature) {
      logger.warn('Invalid Twilio webhook signature');
      return reply.status(401).send({ error: 'Invalid webhook signature' });
    }

    // No next() - implicit continuation
  } catch (error) {
    logger.error('Webhook verification error:', error);
    return reply.status(500).send({ error: 'Webhook verification failed' });
  }
};

export const verifySendGridSignature = async (
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> => {
  try {
    const signature = request.headers['x-twilio-email-event-webhook-signature'] as string;
    const timestamp = request.headers['x-twilio-email-event-webhook-timestamp'] as string;

    if (!signature || !timestamp || !(env as any).SENDGRID_WEBHOOK_SECRET) {
      return reply.status(401).send({ error: 'Unauthorized webhook request' });
    }

    const payload = timestamp + request.body;
    const expectedSignature = crypto
      .createHmac('sha256', (env as any).SENDGRID_WEBHOOK_SECRET)
      .update(payload)
      .digest('base64');

    if (signature !== expectedSignature) {
      logger.warn('Invalid SendGrid webhook signature');
      return reply.status(401).send({ error: 'Invalid webhook signature' });
    }

    // No next() - implicit continuation
  } catch (error) {
    logger.error('Webhook verification error:', error);
    return reply.status(500).send({ error: 'Webhook verification failed' });
  }
};
