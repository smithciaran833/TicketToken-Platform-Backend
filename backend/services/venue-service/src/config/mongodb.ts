import mongoose, { Connection } from 'mongoose';
import { logger } from '../utils/logger';

let mongoConnection: Connection | null = null;

/**
 * MongoDB configuration for venue-service
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
 * Initialize MongoDB connection
 */
export async function initializeMongoDB(): Promise<Connection> {
  try {
    if (mongoConnection && mongoConnection.readyState === 1) {
      logger.info('[MongoDB] Already connected');
      return mongoConnection;
    }

    logger.info('[MongoDB] Connecting to MongoDB...', {
      uri: mongoConfig.uri.replace(/\/\/(.+):(.+)@/, '//***:***@'), // Hide credentials in logs
    });

    await mongoose.connect(mongoConfig.uri, mongoConfig.options);
    mongoConnection = mongoose.connection;

    mongoConnection.on('connected', () => {
      logger.info('[MongoDB] Connected successfully');
    });

    mongoConnection.on('error', (error) => {
      logger.error('[MongoDB] Connection error:', error);
    });

    mongoConnection.on('disconnected', () => {
      logger.warn('[MongoDB] Disconnected');
    });

    // Handle process termination
    process.on('SIGINT', async () => {
      await closeMongoDB();
      process.exit(0);
    });

    logger.info('[MongoDB] Initialization complete');
    return mongoConnection;
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
    if (!mongoConnection || !mongoConnection.db) return false;
    
    const adminDb = mongoConnection.db.admin();
    const ping = await adminDb.ping();
    
    return ping.ok === 1 && mongoConnection.readyState === 1;
  } catch (error) {
    logger.error('[MongoDB] Health check failed:', error);
    return false;
  }
}
