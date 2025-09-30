import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { env } from './config/env';
import { logger } from './config/logger';
import { errorHandler, notFoundHandler } from './middleware/error.middleware';
import notificationRoutes from './routes/notification.routes';
import consentRoutes from './routes/consent.routes';
import { webhookController } from './controllers/webhook.controller';

export const createServer = () => {
  const app = express();

  // Basic middleware
  app.use(helmet());
  app.use(cors());
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // Request logging
  app.use(morgan('combined', {
    stream: {
      write: (message) => logger.info(message.trim()),
    },
  }));

  // Health check
  app.get('/health', (_req, res) => {
    res.status(200).json({
      status: 'healthy',
      service: env.SERVICE_NAME,
      timestamp: new Date().toISOString(),
    });
  });

  // API routes
  app.use('/api/notifications', notificationRoutes);
  app.use('/api/consent', consentRoutes);

  // Webhook endpoints for providers
  app.post('/webhooks/sendgrid', express.raw({ type: 'application/json' }), 
    webhookController.handleSendGridWebhook.bind(webhookController)
  );
  
  app.post('/webhooks/twilio', 
    webhookController.handleTwilioWebhook.bind(webhookController)
  );

  // Error handling
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
};
