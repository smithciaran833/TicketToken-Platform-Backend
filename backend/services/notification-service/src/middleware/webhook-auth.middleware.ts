import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { env } from '../config/env';
import { logger } from '../config/logger';

export const verifyTwilioSignature = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  try {
    const twilioSignature = req.headers['x-twilio-signature'] as string;
    
    if (!twilioSignature || !env.TWILIO_AUTH_TOKEN) {
      res.status(401).json({ error: 'Unauthorized webhook request' });
      return;
    }

    // Twilio signature verification logic
    const url = `${req.protocol}://${req.get('host')}${req.originalUrl}`;
    const params = req.body || {};
    
    // Sort parameters alphabetically and concatenate
    const data = Object.keys(params)
      .sort()
      .reduce((acc, key) => acc + key + params[key], url);
    
    const expectedSignature = crypto
      .createHmac('sha1', env.TWILIO_AUTH_TOKEN)
      .update(Buffer.from(data, 'utf-8'))
      .digest('base64');
    
    if (twilioSignature !== expectedSignature) {
      logger.warn('Invalid Twilio webhook signature');
      res.status(401).json({ error: 'Invalid webhook signature' });
      return;
    }
    
    next();
  } catch (error) {
    logger.error('Webhook verification error:', error);
    res.status(500).json({ error: 'Webhook verification failed' });
  }
};

export const verifySendGridSignature = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  try {
    const signature = req.headers['x-twilio-email-event-webhook-signature'] as string;
    const timestamp = req.headers['x-twilio-email-event-webhook-timestamp'] as string;
    
    if (!signature || !timestamp || !(env as any).SENDGRID_WEBHOOK_SECRET) {
      res.status(401).json({ error: 'Unauthorized webhook request' });
      return;
    }
    
    const payload = timestamp + req.body;
    const expectedSignature = crypto
      .createHmac('sha256', (env as any).SENDGRID_WEBHOOK_SECRET)
      .update(payload)
      .digest('base64');
    
    if (signature !== expectedSignature) {
      logger.warn('Invalid SendGrid webhook signature');
      res.status(401).json({ error: 'Invalid webhook signature' });
      return;
    }
    
    next();
  } catch (error) {
    logger.error('Webhook verification error:', error);
    res.status(500).json({ error: 'Webhook verification failed' });
  }
};
