"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RawAnalyticsSchema = void 0;
const mongodb_1 = require("../../config/mongodb");
const uuid_1 = require("uuid");
class RawAnalyticsSchema {
    static collectionName = 'raw_analytics';
    static getCollection() {
        const db = (0, mongodb_1.getMongoDB)();
        return db.collection(this.collectionName);
    }
    static async storeRawData(data) {
        const collection = this.getCollection();
        const rawData = {
            id: (0, uuid_1.v4)(),
            ...data,
            timestamp: new Date(),
            processed: false,
            processingAttempts: 0
        };
        await collection.insertOne(rawData);
        return rawData;
    }
    static async bulkStoreRawData(dataArray) {
        const collection = this.getCollection();
        const rawDataWithIds = dataArray.map(data => ({
            id: (0, uuid_1.v4)(),
            ...data,
            timestamp: new Date(),
            processed: false,
            processingAttempts: 0
        }));
        await collection.insertMany(rawDataWithIds);
    }
    static async getUnprocessedData(limit = 100, maxAttempts = 3) {
        const collection = this.getCollection();
        return await collection
            .find({
            processed: false,
            processingAttempts: { $lt: maxAttempts }
        })
            .sort({ timestamp: 1 })
            .limit(limit)
            .toArray();
    }
    static async markAsProcessed(id, success, error) {
        const collection = this.getCollection();
        const update = {
            $inc: { processingAttempts: 1 }
        };
        if (success) {
            update.$set = { processed: true };
        }
        else {
            update.$set = { lastProcessingError: error };
        }
        await collection.updateOne({ id }, update);
    }
    static async getRawDataByType(venueId, dataType, startDate, endDate, limit = 1000) {
        const collection = this.getCollection();
        const query = { venueId, dataType };
        if (startDate || endDate) {
            query.timestamp = {};
            if (startDate)
                query.timestamp.$gte = startDate;
            if (endDate)
                query.timestamp.$lte = endDate;
        }
        return await collection
            .find(query)
            .sort({ timestamp: -1 })
            .limit(limit)
            .toArray();
    }
    static async cleanupOldData(retentionDays) {
        const collection = this.getCollection();
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
        const result = await collection.deleteMany({
            timestamp: { $lt: cutoffDate },
            processed: true
        });
        return result.deletedCount || 0;
    }
    static async getDataStats(venueId) {
        const collection = this.getCollection();
        const pipeline = [
            { $match: { venueId } },
            {
                $group: {
                    _id: {
                        dataType: '$dataType',
                        source: '$source',
                        processed: '$processed'
                    },
                    count: { $sum: 1 },
                    oldestRecord: { $min: '$timestamp' },
                    newestRecord: { $max: '$timestamp' }
                }
            },
            { $sort: { count: -1 } }
        ];
        return await collection.aggregate(pipeline).toArray();
    }
}
exports.RawAnalyticsSchema = RawAnalyticsSchema;
//# sourceMappingURL=raw-analytics.schema.js.map