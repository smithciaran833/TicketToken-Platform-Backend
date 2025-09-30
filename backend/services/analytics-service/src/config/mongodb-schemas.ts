import { Db } from 'mongodb';
import { logger } from '../utils/logger';

// Define schema validators for each collection
const schemas = {
  raw_analytics: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['venue_id', 'event_type', 'timestamp'],
      properties: {
        venue_id: {
          bsonType: 'string',
          description: 'Venue ID is required'
        },
        event_type: {
          bsonType: 'string',
          enum: [
            'ticket_purchase',
            'ticket_scan',
            'page_view',
            'cart_abandonment',
            'search_query',
            'user_action'
          ],
          description: 'Event type must be valid'
        },
        timestamp: {
          bsonType: 'date',
          description: 'Timestamp is required'
        },
        metadata: {
          bsonType: 'object',
          description: 'Additional event metadata'
        }
      }
    }
  },
  
  user_behavior: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['venue_id', 'session_id', 'timestamp'],
      properties: {
        venue_id: { bsonType: 'string' },
        session_id: { bsonType: 'string' },
        user_hash: { bsonType: 'string' },
        timestamp: { bsonType: 'date' },
        events: {
          bsonType: 'array',
          items: {
            bsonType: 'object',
            required: ['action', 'timestamp'],
            properties: {
              action: { bsonType: 'string' },
              timestamp: { bsonType: 'date' },
              metadata: { bsonType: 'object' }
            }
          }
        }
      }
    }
  },
  
  campaign_performance: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['venue_id', 'campaign_id', 'date'],
      properties: {
        venue_id: { bsonType: 'string' },
        campaign_id: { bsonType: 'string' },
        date: { bsonType: 'date' },
        metrics: {
          bsonType: 'object',
          properties: {
            impressions: { bsonType: 'int' },
            clicks: { bsonType: 'int' },
            conversions: { bsonType: 'int' },
            spend: { bsonType: 'double' },
            revenue: { bsonType: 'double' }
          }
        }
      }
    }
  }
};

// Apply schema validation to collections
export async function applyMongoSchemas(db: Db): Promise<void> {
  for (const [collectionName, schema] of Object.entries(schemas)) {
    try {
      // Check if collection exists
      const collections = await db.listCollections({ name: collectionName }).toArray();
      
      if (collections.length === 0) {
        // Create collection with validation
        await db.createCollection(collectionName, {
          validator: schema,
          validationLevel: 'moderate', // Allow invalid documents but log warnings
          validationAction: 'warn'
        });
        logger.info(`Created collection ${collectionName} with schema validation`);
      } else {
        // Update existing collection validation
        await db.command({
          collMod: collectionName,
          validator: schema,
          validationLevel: 'moderate',
          validationAction: 'warn'
        });
        logger.info(`Updated schema validation for ${collectionName}`);
      }
      
      // Create indexes for better performance
      await createMongoIndexes(db, collectionName);
      
    } catch (error) {
      logger.error(`Failed to apply schema for ${collectionName}:`, error);
    }
  }
}

// Create performance indexes for MongoDB collections
async function createMongoIndexes(db: Db, collectionName: string): Promise<void> {
  const collection = db.collection(collectionName);
  
  switch (collectionName) {
    case 'raw_analytics':
      await collection.createIndex({ venue_id: 1, timestamp: -1 });
      await collection.createIndex({ event_type: 1, timestamp: -1 });
      await collection.createIndex(
        { timestamp: 1 },
        { expireAfterSeconds: 90 * 24 * 60 * 60 } // TTL: 90 days
      );
      break;
      
    case 'user_behavior':
      await collection.createIndex({ venue_id: 1, session_id: 1 });
      await collection.createIndex({ venue_id: 1, user_hash: 1, timestamp: -1 });
      await collection.createIndex(
        { timestamp: 1 },
        { expireAfterSeconds: 180 * 24 * 60 * 60 } // TTL: 180 days
      );
      break;
      
    case 'campaign_performance':
      await collection.createIndex({ venue_id: 1, campaign_id: 1, date: -1 });
      await collection.createIndex({ venue_id: 1, date: -1 });
      break;
  }
  
  logger.info(`Created indexes for ${collectionName}`);
}

export default schemas;
