import express, { Application } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { errorMiddleware } from './middleware/error.middleware';
import { loggingMiddleware } from './middleware/logging.middleware';
import { metricsMiddleware } from './middleware/metrics.middleware';
import routes from './routes';

export function createApp(): Application {
  const app = express();

  // Security middleware
  app.use(helmet());
  app.use(cors());
  
  // Parsing middleware
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));
  
  // Compression
  app.use(compression());
  
  // Custom middleware
  app.use(loggingMiddleware);
  app.use(metricsMiddleware);
  
  // API Routes
  app.use('/api/v1/queue', routes);
  
  // Root health check
  app.get('/health', (req, res) => {
    res.json({ status: 'healthy', service: 'queue-service' });
  });
  
  // Error handling (must be last)
  app.use(errorMiddleware);
  
  return app;
}
