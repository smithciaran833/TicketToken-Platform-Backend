import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { rateLimiter } from './middleware/rate-limit.middleware';
import { errorHandler } from './middleware/error.middleware';
import { logger } from './utils/logger';

// Import routes
import { connectionRoutes } from './routes/connection.routes';
import { oauthRoutes } from './routes/oauth.routes';
import { syncRoutes } from './routes/sync.routes';
import { mappingRoutes } from './routes/mapping.routes';
import { webhookRoutes } from './routes/webhook.routes';
import { healthRoutes } from './routes/health.routes';
import { adminRoutes } from './routes/admin.routes';

export function createServer() {
  const app = express();

  // Security middleware
  app.use(helmet());
  app.use(cors());
  
  // Body parsing
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));
  
  // Logging
  app.use(morgan('combined', {
    stream: { write: (message) => logger.info(message.trim()) }
  }));

  // Rate limiting
  app.use('/api', rateLimiter);

  // Health check (no auth required) - using underscore for unused param
  app.get('/health', (_req, res) => {
    res.json({ 
      status: 'healthy', 
      service: process.env.SERVICE_NAME,
      timestamp: new Date().toISOString()
    });
  });

  // API routes
  app.use('/api/v1/integrations', connectionRoutes);
  app.use('/api/v1/integrations/oauth', oauthRoutes);
  app.use('/api/v1/integrations/sync', syncRoutes);
  app.use('/api/v1/integrations/mappings', mappingRoutes);
  app.use('/api/v1/integrations/webhooks', webhookRoutes);
  app.use('/api/v1/integrations/health', healthRoutes);
  app.use('/api/v1/integrations/admin', adminRoutes);

  // Error handling
  app.use(errorHandler);

  return app;
}
