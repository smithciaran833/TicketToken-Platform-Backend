"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EventSchema = void 0;
const mongodb_1 = require("../../config/mongodb");
const uuid_1 = require("uuid");
class EventSchema {
    static collectionName = 'analytics_events';
    static getCollection() {
        const db = (0, mongodb_1.getMongoDB)();
        return db.collection(this.collectionName);
    }
    static async createEvent(event) {
        const collection = this.getCollection();
        const eventWithId = {
            id: (0, uuid_1.v4)(),
            ...event,
            timestamp: new Date()
        };
        await collection.insertOne(eventWithId);
        return eventWithId;
    }
    static async bulkCreateEvents(events) {
        const collection = this.getCollection();
        const eventsWithIds = events.map(event => ({
            id: (0, uuid_1.v4)(),
            ...event,
            timestamp: new Date()
        }));
        await collection.insertMany(eventsWithIds);
    }
    static async getEvents(venueId, filters = {}) {
        const collection = this.getCollection();
        const query = { venueId };
        if (filters.eventType) {
            query.eventType = filters.eventType;
        }
        if (filters.userId) {
            query.userId = filters.userId;
        }
        if (filters.eventId) {
            query.eventId = filters.eventId;
        }
        if (filters.startDate || filters.endDate) {
            query.timestamp = {};
            if (filters.startDate) {
                query.timestamp.$gte = filters.startDate;
            }
            if (filters.endDate) {
                query.timestamp.$lte = filters.endDate;
            }
        }
        return await collection
            .find(query)
            .sort({ timestamp: -1 })
            .limit(filters.limit || 1000)
            .toArray();
    }
    static async aggregateEvents(venueId, pipeline) {
        const collection = this.getCollection();
        const fullPipeline = [
            { $match: { venueId } },
            ...pipeline
        ];
        return await collection.aggregate(fullPipeline).toArray();
    }
    static async getEventCounts(venueId, groupBy, startDate, endDate) {
        const pipeline = [];
        if (startDate || endDate) {
            const dateMatch = {};
            if (startDate)
                dateMatch.$gte = startDate;
            if (endDate)
                dateMatch.$lte = endDate;
            pipeline.push({ $match: { timestamp: dateMatch } });
        }
        pipeline.push({ $group: { _id: `$${groupBy}`, count: { $sum: 1 } } }, { $sort: { count: -1 } });
        return await this.aggregateEvents(venueId, pipeline);
    }
}
exports.EventSchema = EventSchema;
//# sourceMappingURL=event.schema.js.map