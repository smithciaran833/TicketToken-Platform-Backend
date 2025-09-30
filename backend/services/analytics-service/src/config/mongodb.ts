import { MongoClient, Db } from 'mongodb';
import { config } from './index';
import { logger } from '../utils/logger';

let client: MongoClient;
let db: Db;

export async function connectMongoDB() {
  try {
    const options: any = {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    };

    if (config.mongodb.user && config.mongodb.password) {
      options.auth = {
        username: config.mongodb.user,
        password: config.mongodb.password,
      };
    }

    client = new MongoClient(config.mongodb.uri, options);
    await client.connect();
    
    db = client.db();
    
    // Create indexes for analytics collections
    await createIndexes();
    
    logger.info('MongoDB connected successfully');
  } catch (error) {
    logger.error('Failed to connect to MongoDB:', error);
    throw error;
  }
}

async function createIndexes() {
  try {
    // User behavior indexes
    await db.collection('user_behavior').createIndex({ userId: 1, timestamp: -1 });
    await db.collection('user_behavior').createIndex({ venueId: 1, timestamp: -1 });
    
    // Event analytics indexes
    await db.collection('event_analytics').createIndex({ eventId: 1, timestamp: -1 });
    await db.collection('event_analytics').createIndex({ venueId: 1, timestamp: -1 });
    
    // Application logs indexes with TTL
    await db.collection('application_logs').createIndex(
      { timestamp: 1 },
      { expireAfterSeconds: 30 * 24 * 60 * 60 } // 30 days
    );
    
    logger.info('MongoDB indexes created');
  } catch (error) {
    logger.error('Failed to create MongoDB indexes:', error);
  }
}

export function getMongoDB(): Db {
  if (!db) {
    throw new Error('MongoDB not initialized');
  }
  return db;
}

export function getMongoClient(): MongoClient {
  if (!client) {
    throw new Error('MongoDB client not initialized');
  }
  return client;
}

export async function closeMongoDB() {
  if (client) {
    await client.close();
    logger.info('MongoDB connection closed');
  }
}
