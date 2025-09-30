import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import routes from './routes';
import { db } from './services/database.service';
import { redis } from './services/redis.service';
import { initializeTables } from './services/init-tables';
import { migrateTables } from './services/migrate-tables';
// import { schedulerService } from './services/scheduler.service';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3018;

// Middleware
app.use(cors());
app.use(express.json());

// Request logging  
app.use((req, res, next) => {
  console.log(`📥 ${req.method} ${req.path}`);
  next();
});

// Routes
app.use(routes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Error handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('❌ Error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Initialize services and start server
async function startServer() {
  try {
    // Connect to database
    await db.connect();
    
    // Initialize tables
    await initializeTables();
    
    // Run migrations
    await migrateTables();
    
    // Connect to Redis
    await redis.connect();
    
    // NOTE: Scheduler disabled for now - would be enabled in production
    // schedulerService.startScheduledJobs();
    console.log('⏰ Scheduled jobs disabled (enable in production)');
    
    // Start server
    app.listen(PORT, () => {
      console.log(`✅ Compliance service running on port ${PORT}`);
      console.log(`📋 Health: http://0.0.0.0:${PORT}/health`);
      console.log(`📊 Dashboard: http://0.0.0.0:${PORT}/api/v1/compliance/dashboard`);
      console.log(`🏢 Admin: http://0.0.0.0:${PORT}/api/v1/compliance/admin/pending-reviews`);
      console.log(`📄 Batch Jobs: http://0.0.0.0:${PORT}/api/v1/compliance/batch/jobs`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Handle shutdown gracefully
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully...');
  // schedulerService.stopAllJobs();
  await db.close();
  await redis.close();
  process.exit(0);
});

startServer();
