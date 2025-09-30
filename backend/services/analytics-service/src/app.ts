import express, { Application } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { errorHandler } from './middleware/error-handler';
import { rateLimitMiddleware } from './middleware/rate-limit.middleware';
import { router } from './routes';
import { logger } from './utils/logger';

export function createApp(): Application {
  const app = express();

  // Security middleware
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", "data:", "https:"],
      },
    },
  }));

  // CORS configuration
  app.use(cors({
    origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
    credentials: true,
  }));

  // Body parsing
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));

  // Logging
  app.use(morgan('combined', {
    stream: { write: (message) => logger.info(message.trim()) },
  }));

  // Rate limiting
  app.use(rateLimitMiddleware);

  // Health check endpoints (no auth required)
  app.get('/health', (_, res) => {
    res.json({ status: 'ok', service: 'analytics-service' });
  });

  app.get('/ws-health', (_, res) => {
    res.json({ status: 'ok', websocket: 'active' });
  });

  // API routes
  app.use('/api/v1/analytics', router);

  // Error handler
  app.use(errorHandler);

  return app;
}
