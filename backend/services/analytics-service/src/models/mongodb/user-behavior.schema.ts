import { getMongoDB } from '../../config/mongodb';
import { v4 as uuidv4 } from 'uuid';

export interface UserBehavior {
  id: string;
  venueId: string;
  userId: string; // Hashed user ID
  sessionId: string;
  timestamp: Date;
  eventType: string;
  pageUrl?: string;
  referrer?: string;
  deviceInfo?: {
    type: string;
    os: string;
    browser: string;
    userAgent: string;
  };
  geoInfo?: {
    country: string;
    region: string;
    city: string;
  };
  properties?: Record<string, any>;
  duration?: number;
}

export class UserBehaviorSchema {
  private static collectionName = 'user_behavior';
  
  static getCollection() {
    const db = getMongoDB();
    return db.collection<UserBehavior>(this.collectionName);
  }
  
  static async trackBehavior(behavior: Omit<UserBehavior, 'id'>): Promise<UserBehavior> {
    const collection = this.getCollection();
    const behaviorWithId = {
      id: uuidv4(),
      ...behavior,
      timestamp: new Date()
    };
    
    await collection.insertOne(behaviorWithId);
    return behaviorWithId;
  }
  
  static async getUserJourney(
    venueId: string,
    userId: string,
    limit: number = 100
  ): Promise<UserBehavior[]> {
    const collection = this.getCollection();
    
    return await collection
      .find({ venueId, userId })
      .sort({ timestamp: -1 })
      .limit(limit)
      .toArray();
  }
  
  static async getSessionActivity(
    sessionId: string
  ): Promise<UserBehavior[]> {
    const collection = this.getCollection();
    
    return await collection
      .find({ sessionId })
      .sort({ timestamp: 1 })
      .toArray();
  }
  
  static async aggregateUserBehavior(
    venueId: string,
    pipeline: any[]
  ): Promise<any[]> {
    const collection = this.getCollection();
    
    const fullPipeline = [
      { $match: { venueId } },
      ...pipeline
    ];
    
    return await collection.aggregate(fullPipeline).toArray();
  }
  
  static async getPageViews(
    venueId: string,
    startDate?: Date,
    endDate?: Date
  ): Promise<Array<{ _id: string; views: number; uniqueUsers: number }>> {
    const pipeline: any[] = [];
    
    if (startDate || endDate) {
      const dateMatch: any = {};
      if (startDate) dateMatch.$gte = startDate;
      if (endDate) dateMatch.$lte = endDate;
      pipeline.push({ $match: { timestamp: dateMatch } });
    }
    
    pipeline.push(
      {
        $group: {
          _id: '$pageUrl',
          views: { $sum: 1 },
          uniqueUsers: { $addToSet: '$userId' }
        }
      },
      {
        $project: {
          _id: 1,
          views: 1,
          uniqueUsers: { $size: '$uniqueUsers' }
        }
      },
      { $sort: { views: -1 } }
    );
    
    return await this.aggregateUserBehavior(venueId, pipeline);
  }
  
  static async getDeviceStats(
    venueId: string,
    startDate?: Date,
    endDate?: Date
  ): Promise<any[]> {
    const pipeline: any[] = [];
    
    if (startDate || endDate) {
      const dateMatch: any = {};
      if (startDate) dateMatch.$gte = startDate;
      if (endDate) dateMatch.$lte = endDate;
      pipeline.push({ $match: { timestamp: dateMatch } });
    }
    
    pipeline.push(
      {
        $group: {
          _id: {
            type: '$deviceInfo.type',
            os: '$deviceInfo.os',
            browser: '$deviceInfo.browser'
          },
          count: { $sum: 1 },
          uniqueUsers: { $addToSet: '$userId' }
        }
      },
      {
        $project: {
          _id: 1,
          count: 1,
          uniqueUsers: { $size: '$uniqueUsers' }
        }
      },
      { $sort: { count: -1 } }
    );
    
    return await this.aggregateUserBehavior(venueId, pipeline);
  }
}
