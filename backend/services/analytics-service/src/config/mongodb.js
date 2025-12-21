"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.connectMongoDB = connectMongoDB;
exports.getMongoDB = getMongoDB;
exports.getMongoClient = getMongoClient;
exports.closeMongoDB = closeMongoDB;
const mongodb_1 = require("mongodb");
const index_1 = require("./index");
const logger_1 = require("../utils/logger");
let client;
let db;
async function connectMongoDB() {
    try {
        const options = {
            useNewUrlParser: true,
            useUnifiedTopology: true,
        };
        if (index_1.config.mongodb.user && index_1.config.mongodb.password) {
            options.auth = {
                username: index_1.config.mongodb.user,
                password: index_1.config.mongodb.password,
            };
        }
        client = new mongodb_1.MongoClient(index_1.config.mongodb.uri, options);
        await client.connect();
        db = client.db();
        await createIndexes();
        logger_1.logger.info('MongoDB connected successfully');
    }
    catch (error) {
        logger_1.logger.error('Failed to connect to MongoDB:', error);
        throw error;
    }
}
async function createIndexes() {
    try {
        await db.collection('user_behavior').createIndex({ userId: 1, timestamp: -1 });
        await db.collection('user_behavior').createIndex({ venueId: 1, timestamp: -1 });
        await db.collection('event_analytics').createIndex({ eventId: 1, timestamp: -1 });
        await db.collection('event_analytics').createIndex({ venueId: 1, timestamp: -1 });
        await db.collection('application_logs').createIndex({ timestamp: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });
        logger_1.logger.info('MongoDB indexes created');
    }
    catch (error) {
        logger_1.logger.error('Failed to create MongoDB indexes:', error);
    }
}
function getMongoDB() {
    if (!db) {
        throw new Error('MongoDB not initialized');
    }
    return db;
}
function getMongoClient() {
    if (!client) {
        throw new Error('MongoDB client not initialized');
    }
    return client;
}
async function closeMongoDB() {
    if (client) {
        await client.close();
        logger_1.logger.info('MongoDB connection closed');
    }
}
//# sourceMappingURL=mongodb.js.map