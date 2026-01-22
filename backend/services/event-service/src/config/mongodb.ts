import mongoose, { Connection } from 'mongoose';
import { logger } from '../utils/logger';

let mongoConnection: Connection | null = null;

/**
 * MongoDB configuration for event-service
 */
export const mongoConfig = {
  uri: process.env.MONGODB_URI || 'mongodb://localhost:27017/tickettoken_content',
  options: {
    maxPoolSize: 10,
    minPoolSize: 2,
    socketTimeoutMS: 45000,
    serverSelectionTimeoutMS: 5000,
    family: 4, // Use IPv4
  },
};

/**
 * Sleep for a specified duration with jitter
 * Jitter helps prevent thundering herd when multiple instances retry simultaneously
 */
async function sleepWithJitter(baseMs: number): Promise<void> {
  const jitter = Math.random() * 0.5 * baseMs; // 0-50% jitter
  const totalMs = baseMs + jitter;
  return new Promise(resolve => setTimeout(resolve, totalMs));
}

/**
 * Attempt to connect to MongoDB with retry logic
 */
async function connectWithRetry(maxRetries: number = 5): Promise<Connection> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      logger.info(`[MongoDB] Connection attempt ${attempt}/${maxRetries}`, {
        uri: mongoConfig.uri.replace(/\/\/(.+):(.+)@/, '//***:***@'), // Hide credentials in logs
      });

      await mongoose.connect(mongoConfig.uri, mongoConfig.options);
      mongoConnection = mongoose.connection;

      // Set up event handlers
      mongoConnection.on('connected', () => {
        logger.info('[MongoDB] Connected successfully');
      });

      mongoConnection.on('error', (error) => {
        logger.error('[MongoDB] Connection error:', error);
      });

      mongoConnection.on('disconnected', () => {
        logger.warn('[MongoDB] Disconnected');
      });

      logger.info('[MongoDB] Connection established successfully', {
        attempt,
        readyState: mongoConnection.readyState,
      });

      return mongoConnection;
    } catch (error: any) {
      lastError = error;
      
      logger.warn(`[MongoDB] Connection attempt ${attempt}/${maxRetries} failed`, {
        error: error.message,
        code: error.code,
        name: error.name,
      });

      // If this was the last attempt, don't sleep
      if (attempt === maxRetries) {
        break;
      }

      // Calculate exponential backoff: 2s * attempt (2s, 4s, 6s, 8s)
      const baseDelayMs = 2000 * attempt;
      logger.info(`[MongoDB] Retrying in ${baseDelayMs}ms (with jitter)...`);
      
      await sleepWithJitter(baseDelayMs);
    }
  }

  // All retries exhausted
  logger.error('[MongoDB] All connection attempts failed', {
    attempts: maxRetries,
    lastError: lastError?.message,
  });

  throw new Error(
    `Failed to connect to MongoDB after ${maxRetries} attempts: ${lastError?.message || 'Unknown error'}`
  );
}

/**
 * Initialize MongoDB connection with retry logic
 * CRITICAL FIX: Added retry logic matching database.ts pattern
 * - 5 retry attempts with exponential backoff
 * - Jitter to prevent thundering herd
 * - Proper error logging between retries
 */
export async function initializeMongoDB(): Promise<Connection> {
  try {
    if (mongoConnection && mongoConnection.readyState === 1) {
      logger.info('[MongoDB] Already connected');
      return mongoConnection;
    }

    logger.info('[MongoDB] Initializing MongoDB connection with retry logic...');

    const connection = await connectWithRetry(5);

    // MEDIUM FIX (Issue #6): Register with centralized shutdown manager instead of individual SIGINT handler
    // Shutdown handler will be registered by main application using registerShutdownHandler()

    logger.info('[MongoDB] Initialization complete');
    return connection;
  } catch (error) {
    logger.error('[MongoDB] Failed to initialize:', error);
    throw error;
  }
}

/**
 * Get active MongoDB connection
 */
export function getMongoDB(): Connection {
  if (!mongoConnection || mongoConnection.readyState !== 1) {
    throw new Error('MongoDB not initialized. Call initializeMongoDB() first.');
  }
  return mongoConnection;
}

/**
 * Close MongoDB connection
 */
export async function closeMongoDB(): Promise<void> {
  try {
    if (mongoConnection) {
      await mongoConnection.close();
      mongoConnection = null;
      logger.info('[MongoDB] Connection closed');
    }
  } catch (error) {
    logger.error('[MongoDB] Error closing connection:', error);
    throw error;
  }
}

/**
 * Check MongoDB health
 */
export async function checkMongoDBHealth(): Promise<boolean> {
  try {
    if (!mongoConnection?.db) return false;
    
    const adminDb = mongoConnection.db.admin();
    const ping = await adminDb.ping();
    
    return ping.ok === 1 && mongoConnection.readyState === 1;
  } catch (error) {
    logger.error('[MongoDB] Health check failed:', error);
    return false;
  }
}
