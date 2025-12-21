"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CampaignSchema = void 0;
const mongodb_1 = require("../../config/mongodb");
const uuid_1 = require("uuid");
class CampaignSchema {
    static collectionName = 'campaigns';
    static touchpointsCollection = 'campaign_touchpoints';
    static getCollection() {
        const db = (0, mongodb_1.getMongoDB)();
        return db.collection(this.collectionName);
    }
    static getTouchpointsCollection() {
        const db = (0, mongodb_1.getMongoDB)();
        return db.collection(this.touchpointsCollection);
    }
    static async createCampaign(campaign) {
        const collection = this.getCollection();
        const campaignWithId = {
            id: (0, uuid_1.v4)(),
            ...campaign,
            createdAt: new Date()
        };
        await collection.insertOne(campaignWithId);
        return campaignWithId;
    }
    static async updateCampaign(id, updates) {
        const collection = this.getCollection();
        const result = await collection.findOneAndUpdate({ id }, { $set: updates }, { returnDocument: 'after' });
        return result;
    }
    static async getCampaigns(venueId, filters = {}) {
        const collection = this.getCollection();
        const query = { venueId };
        if (filters.status) {
            query.status = filters.status;
        }
        if (filters.type) {
            query.type = filters.type;
        }
        if (filters.startDate || filters.endDate) {
            query.$or = [];
            if (filters.startDate) {
                query.$or.push({ endDate: { $gte: filters.startDate } });
            }
            if (filters.endDate) {
                query.$or.push({ startDate: { $lte: filters.endDate } });
            }
        }
        return await collection
            .find(query)
            .sort({ createdAt: -1 })
            .toArray();
    }
    static async trackTouchpoint(touchpoint) {
        const collection = this.getTouchpointsCollection();
        await collection.insertOne({
            ...touchpoint,
            timestamp: new Date()
        });
    }
    static async bulkTrackTouchpoints(touchpoints) {
        const collection = this.getTouchpointsCollection();
        const touchpointsWithTimestamp = touchpoints.map(tp => ({
            ...tp,
            timestamp: new Date()
        }));
        await collection.insertMany(touchpointsWithTimestamp);
    }
    static async getCustomerTouchpoints(venueId, customerId, startDate, endDate) {
        const collection = this.getTouchpointsCollection();
        const query = { venueId, customerId };
        if (startDate || endDate) {
            query.timestamp = {};
            if (startDate)
                query.timestamp.$gte = startDate;
            if (endDate)
                query.timestamp.$lte = endDate;
        }
        return await collection
            .find(query)
            .sort({ timestamp: 1 })
            .toArray();
    }
    static async getCampaignPerformance(campaignId) {
        const collection = this.getTouchpointsCollection();
        const pipeline = [
            { $match: { campaign: campaignId } },
            {
                $group: {
                    _id: '$channel',
                    impressions: {
                        $sum: { $cond: [{ $eq: ['$action', 'impression'] }, 1, 0] }
                    },
                    clicks: {
                        $sum: { $cond: [{ $eq: ['$action', 'click'] }, 1, 0] }
                    },
                    conversions: {
                        $sum: { $cond: [{ $eq: ['$action', 'conversion'] }, 1, 0] }
                    },
                    revenue: {
                        $sum: { $cond: [{ $eq: ['$action', 'conversion'] }, '$value', 0] }
                    }
                }
            }
        ];
        return await collection.aggregate(pipeline).toArray();
    }
}
exports.CampaignSchema = CampaignSchema;
//# sourceMappingURL=campaign.schema.js.map