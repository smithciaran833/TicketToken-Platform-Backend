import { buildApp } from './app';
import { env } from './config/env';
import { pool } from './config/database';
import { redis, closeRedisConnections } from './config/redis';

async function start() {
  try {
    // Test database connection
    await pool.query('SELECT NOW()');
    console.log('✅ Database connected');

    // Test Redis connection
    await redis.ping();
    console.log('✅ Redis connected');

    // Build and start Fastify app
    const app = await buildApp();
    
    await app.listen({
      port: env.PORT,
      host: '0.0.0.0',
    });

    console.log(`🚀 Auth service (Fastify) running on port ${env.PORT}`);

    // Graceful shutdown
    const signals: NodeJS.Signals[] = ['SIGTERM', 'SIGINT'];
    
    signals.forEach((signal) => {
      process.on(signal, async () => {
        console.log(`${signal} received, shutting down gracefully...`);
        
        try {
          await app.close();
          await pool.end();
          await closeRedisConnections();
          console.log('✅ Graceful shutdown complete');
          process.exit(0);
        } catch (error) {
          console.error('Error during shutdown:', error);
          process.exit(1);
        }
      });
    });

  } catch (error) {
    console.error('Failed to start auth service:', error);
    process.exit(1);
  }
}

start();
