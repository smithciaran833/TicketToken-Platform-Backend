
// Security imports
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
require('dotenv').config();
const express = require('express');
const logger = require('./utils/logger');
const { initializeDatabase } = require('./config/database');
const { initializeSolana } = require('./config/solana');
const { startMintingWorker } = require('./workers/mintingWorker');
const { initializeQueues } = require('./queues/mintQueue');
const webhookRoutes = require('./routes/webhook');
const internalMintRoutes = require('./routes/internal-mint');

async function main() {
  try {
    logger.info('🚀 Starting Minting Service...');
    
    // Initialize connections
    await initializeDatabase();
    await initializeSolana();
    await initializeQueues();
    
    // Start worker
    await startMintingWorker();
    
    logger.info('✅ Minting Service started successfully');
    logger.info(`   Port: ${process.env.MINTING_SERVICE_PORT || 3018}`);
    logger.info(`   Environment: ${process.env.NODE_ENV || 'development'}`);
    
    // Express app for webhooks and health checks
    const app = express()
// Apply security middleware
app.use(helmet());
app.use(rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  message: 'Too many requests'
}));
;
    app.use(express.json());
    
    // Health check
    app.get('/health', (req, res) => {
      res.json({ 
        status: 'healthy', 
        service: 'minting-service',
        timestamp: new Date().toISOString() 
      });
    });
    
    // Webhook routes
    app.use('/api', webhookRoutes);
    app.use('/', internalMintRoutes);
    
    const port = process.env.MINTING_SERVICE_PORT || 3018;
    app.listen(port, () => {
      logger.info(`🌐 API listening on port ${port}`);
    });
    
    // Graceful shutdown
    process.on('SIGTERM', async () => {
      logger.info('SIGTERM received, shutting down gracefully...');
      process.exit(0);
    });
    
  } catch (error) {
    logger.error('Failed to start Minting Service:', error);
    process.exit(1);
  }
}

main();
