import { getMongoDB } from '../../config/mongodb';
import { Campaign, TouchPoint } from '../../types';
import { v4 as uuidv4 } from 'uuid';

export class CampaignSchema {
  private static collectionName = 'campaigns';
  private static touchpointsCollection = 'campaign_touchpoints';
  
  static getCollection() {
    const db = getMongoDB();
    return db.collection<Campaign>(this.collectionName);
  }
  
  static getTouchpointsCollection() {
    const db = getMongoDB();
    return db.collection<TouchPoint>(this.touchpointsCollection);
  }
  
  static async createCampaign(campaign: Omit<Campaign, 'id'>): Promise<Campaign> {
    const collection = this.getCollection();
    const campaignWithId = {
      id: uuidv4(),
      ...campaign,
      createdAt: new Date()
    };
    
    await collection.insertOne(campaignWithId);
    return campaignWithId;
  }
  
  static async updateCampaign(
    id: string,
    updates: Partial<Campaign>
  ): Promise<Campaign | null> {
    const collection = this.getCollection();
    
    const result = await collection.findOneAndUpdate(
      { id },
      { $set: updates },
      { returnDocument: 'after' }
    );
    
    return result;
  }
  
  static async getCampaigns(
    venueId: string,
    filters: {
      status?: string;
      type?: string;
      startDate?: Date;
      endDate?: Date;
    } = {}
  ): Promise<Campaign[]> {
    const collection = this.getCollection();
    const query: any = { venueId };
    
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
  
  static async trackTouchpoint(touchpoint: TouchPoint): Promise<void> {
    const collection = this.getTouchpointsCollection();
    await collection.insertOne({
      ...touchpoint,
      timestamp: new Date()
    });
  }
  
  static async bulkTrackTouchpoints(touchpoints: TouchPoint[]): Promise<void> {
    const collection = this.getTouchpointsCollection();
    const touchpointsWithTimestamp = touchpoints.map(tp => ({
      ...tp,
      timestamp: new Date()
    }));
    
    await collection.insertMany(touchpointsWithTimestamp);
  }
  
  static async getCustomerTouchpoints(
    venueId: string,
    customerId: string,
    startDate?: Date,
    endDate?: Date
  ): Promise<TouchPoint[]> {
    const collection = this.getTouchpointsCollection();
    const query: any = { venueId, customerId };
    
    if (startDate || endDate) {
      query.timestamp = {};
      if (startDate) query.timestamp.$gte = startDate;
      if (endDate) query.timestamp.$lte = endDate;
    }
    
    return await collection
      .find(query)
      .sort({ timestamp: 1 })
      .toArray();
  }
  
  static async getCampaignPerformance(
    campaignId: string
  ): Promise<any> {
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
