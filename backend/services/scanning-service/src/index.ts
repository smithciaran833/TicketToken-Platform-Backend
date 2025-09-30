import dotenv from 'dotenv';
dotenv.config();

import express, { Express, Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { initializeDatabase } from './config/database';
import { initializeRedis } from './config/redis';
import logger from './utils/logger';

// Import routes
import scanRoutes from './routes/scan';
import qrRoutes from './routes/qr';
import deviceRoutes from './routes/devices';
import offlineRoutes from './routes/offline';
import policyRoutes from './routes/policies';

// Import metrics
import { register } from './utils/metrics';

async function startService(): Promise<void> {
  try {
    logger.info('🚀 Starting Scanning Service...');
    
    // Initialize connections
    await initializeDatabase();
    await initializeRedis();
    
    // Create Express app
    const app: Express = express();
    
    // Middleware
    app.use(helmet());
    app.use(cors());
    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));
    
    // Health check
    app.get('/health', (req: Request, res: Response) => {
      res.json({
        status: 'healthy',
        service: 'scanning-service',
        timestamp: new Date().toISOString()
      });
    });
    
    // Metrics endpoint
    app.get('/metrics', async (req: Request, res: Response) => {
      res.set('Content-Type', register.contentType);
      res.end(await register.metrics());
    });
    
    // API Routes
    app.use('/api/scan', scanRoutes);
    app.use('/api/qr', qrRoutes);
    app.use('/api/devices', deviceRoutes);
    app.use('/api/offline', offlineRoutes);
    app.use('/api/policies', policyRoutes);
    
    // Error handling middleware
    app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
      logger.error('Unhandled error:', err);
      res.status(500).json({
        success: false,
        error: 'INTERNAL_ERROR',
        message: 'Internal server error'
      });
    });
    
    // Start server
    const PORT = process.env.PORT || 3007;
    app.listen(PORT, () => {
      logger.info(`✅ Scanning Service running on port ${PORT}`);
    });
  } catch (error) {
    logger.error('Failed to start service:', error);
    process.exit(1);
  }
}

// Start the service
startService();
