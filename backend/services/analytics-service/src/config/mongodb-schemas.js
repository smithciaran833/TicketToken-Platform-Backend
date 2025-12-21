"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.applyMongoSchemas = applyMongoSchemas;
const logger_1 = require("../utils/logger");
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
async function applyMongoSchemas(db) {
    for (const [collectionName, schema] of Object.entries(schemas)) {
        try {
            const collections = await db.listCollections({ name: collectionName }).toArray();
            if (collections.length === 0) {
                await db.createCollection(collectionName, {
                    validator: schema,
                    validationLevel: 'moderate',
                    validationAction: 'warn'
                });
                logger_1.logger.info(`Created collection ${collectionName} with schema validation`);
            }
            else {
                await db.command({
                    collMod: collectionName,
                    validator: schema,
                    validationLevel: 'moderate',
                    validationAction: 'warn'
                });
                logger_1.logger.info(`Updated schema validation for ${collectionName}`);
            }
            await createMongoIndexes(db, collectionName);
        }
        catch (error) {
            logger_1.logger.error(`Failed to apply schema for ${collectionName}:`, error);
        }
    }
}
async function createMongoIndexes(db, collectionName) {
    const collection = db.collection(collectionName);
    switch (collectionName) {
        case 'raw_analytics':
            await collection.createIndex({ venue_id: 1, timestamp: -1 });
            await collection.createIndex({ event_type: 1, timestamp: -1 });
            await collection.createIndex({ timestamp: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });
            break;
        case 'user_behavior':
            await collection.createIndex({ venue_id: 1, session_id: 1 });
            await collection.createIndex({ venue_id: 1, user_hash: 1, timestamp: -1 });
            await collection.createIndex({ timestamp: 1 }, { expireAfterSeconds: 180 * 24 * 60 * 60 });
            break;
        case 'campaign_performance':
            await collection.createIndex({ venue_id: 1, campaign_id: 1, date: -1 });
            await collection.createIndex({ venue_id: 1, date: -1 });
            break;
    }
    logger_1.logger.info(`Created indexes for ${collectionName}`);
}
exports.default = schemas;
//# sourceMappingURL=mongodb-schemas.js.map