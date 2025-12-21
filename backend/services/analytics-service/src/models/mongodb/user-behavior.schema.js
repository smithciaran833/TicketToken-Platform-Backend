"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UserBehaviorSchema = void 0;
const mongodb_1 = require("../../config/mongodb");
const uuid_1 = require("uuid");
class UserBehaviorSchema {
    static collectionName = 'user_behavior';
    static getCollection() {
        const db = (0, mongodb_1.getMongoDB)();
        return db.collection(this.collectionName);
    }
    static async trackBehavior(behavior) {
        const collection = this.getCollection();
        const behaviorWithId = {
            id: (0, uuid_1.v4)(),
            ...behavior,
            timestamp: new Date()
        };
        await collection.insertOne(behaviorWithId);
        return behaviorWithId;
    }
    static async getUserJourney(venueId, userId, limit = 100) {
        const collection = this.getCollection();
        return await collection
            .find({ venueId, userId })
            .sort({ timestamp: -1 })
            .limit(limit)
            .toArray();
    }
    static async getSessionActivity(sessionId) {
        const collection = this.getCollection();
        return await collection
            .find({ sessionId })
            .sort({ timestamp: 1 })
            .toArray();
    }
    static async aggregateUserBehavior(venueId, pipeline) {
        const collection = this.getCollection();
        const fullPipeline = [
            { $match: { venueId } },
            ...pipeline
        ];
        return await collection.aggregate(fullPipeline).toArray();
    }
    static async getPageViews(venueId, startDate, endDate) {
        const pipeline = [];
        if (startDate || endDate) {
            const dateMatch = {};
            if (startDate)
                dateMatch.$gte = startDate;
            if (endDate)
                dateMatch.$lte = endDate;
            pipeline.push({ $match: { timestamp: dateMatch } });
        }
        pipeline.push({
            $group: {
                _id: '$pageUrl',
                views: { $sum: 1 },
                uniqueUsers: { $addToSet: '$userId' }
            }
        }, {
            $project: {
                _id: 1,
                views: 1,
                uniqueUsers: { $size: '$uniqueUsers' }
            }
        }, { $sort: { views: -1 } });
        return await this.aggregateUserBehavior(venueId, pipeline);
    }
    static async getDeviceStats(venueId, startDate, endDate) {
        const pipeline = [];
        if (startDate || endDate) {
            const dateMatch = {};
            if (startDate)
                dateMatch.$gte = startDate;
            if (endDate)
                dateMatch.$lte = endDate;
            pipeline.push({ $match: { timestamp: dateMatch } });
        }
        pipeline.push({
            $group: {
                _id: {
                    type: '$deviceInfo.type',
                    os: '$deviceInfo.os',
                    browser: '$deviceInfo.browser'
                },
                count: { $sum: 1 },
                uniqueUsers: { $addToSet: '$userId' }
            }
        }, {
            $project: {
                _id: 1,
                count: 1,
                uniqueUsers: { $size: '$uniqueUsers' }
            }
        }, { $sort: { count: -1 } });
        return await this.aggregateUserBehavior(venueId, pipeline);
    }
}
exports.UserBehaviorSchema = UserBehaviorSchema;
//# sourceMappingURL=user-behavior.schema.js.map