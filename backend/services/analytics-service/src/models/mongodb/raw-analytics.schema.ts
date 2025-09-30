import { getMongoDB } from '../../config/mongodb';
import { v4 as uuidv4 } from 'uuid';

export interface RawAnalyticsData {
  id: string;
  venueId: string;
  dataType: string;
  source: string;
  timestamp: Date;
  data: any;
  processed: boolean;
  processingAttempts: number;
  lastProcessingError?: string;
  metadata?: Record<string, any>;
}

export class RawAnalyticsSchema {
  private static collectionName = 'raw_analytics';
  
  static getCollection() {
    const db = getMongoDB();
    return db.collection<RawAnalyticsData>(this.collectionName);
  }
  
  static async storeRawData(data: Omit<RawAnalyticsData, 'id'>): Promise<RawAnalyticsData> {
    const collection = this.getCollection();
    const rawData = {
      id: uuidv4(),
      ...data,
      timestamp: new Date(),
      processed: false,
      processingAttempts: 0
    };
    
    await collection.insertOne(rawData);
    return rawData;
  }
  
  static async bulkStoreRawData(dataArray: Omit<RawAnalyticsData, 'id'>[]): Promise<void> {
    const collection = this.getCollection();
    const rawDataWithIds = dataArray.map(data => ({
      id: uuidv4(),
      ...data,
      timestamp: new Date(),
      processed: false,
      processingAttempts: 0
    }));
    
    await collection.insertMany(rawDataWithIds);
  }
  
  static async getUnprocessedData(
    limit: number = 100,
    maxAttempts: number = 3
  ): Promise<RawAnalyticsData[]> {
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
  
  static async markAsProcessed(
    id: string,
    success: boolean,
    error?: string
  ): Promise<void> {
    const collection = this.getCollection();
    
    const update: any = {
      $inc: { processingAttempts: 1 }
    };
    
    if (success) {
      update.$set = { processed: true };
    } else {
      update.$set = { lastProcessingError: error };
    }
    
    await collection.updateOne({ id }, update);
  }
  
  static async getRawDataByType(
    venueId: string,
    dataType: string,
    startDate?: Date,
    endDate?: Date,
    limit: number = 1000
  ): Promise<RawAnalyticsData[]> {
    const collection = this.getCollection();
    const query: any = { venueId, dataType };
    
    if (startDate || endDate) {
      query.timestamp = {};
      if (startDate) query.timestamp.$gte = startDate;
      if (endDate) query.timestamp.$lte = endDate;
    }
    
    return await collection
      .find(query)
      .sort({ timestamp: -1 })
      .limit(limit)
      .toArray();
  }
  
  static async cleanupOldData(
    retentionDays: number
  ): Promise<number> {
    const collection = this.getCollection();
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
    
    const result = await collection.deleteMany({
      timestamp: { $lt: cutoffDate },
      processed: true
    });
    
    return result.deletedCount || 0;
  }
  
  static async getDataStats(
    venueId: string
  ): Promise<any> {
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
