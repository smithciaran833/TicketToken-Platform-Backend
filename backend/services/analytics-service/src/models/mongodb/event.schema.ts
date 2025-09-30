import { getMongoDB } from '../../config/mongodb';
import { AnalyticsEvent } from '../../types';
import { v4 as uuidv4 } from 'uuid';

export class EventSchema {
  private static collectionName = 'analytics_events';
  
  static getCollection() {
    const db = getMongoDB();
    return db.collection<AnalyticsEvent>(this.collectionName);
  }
  
  static async createEvent(event: Omit<AnalyticsEvent, 'id'>): Promise<AnalyticsEvent> {
    const collection = this.getCollection();
    const eventWithId = {
      id: uuidv4(),
      ...event,
      timestamp: new Date()
    };
    
    await collection.insertOne(eventWithId);
    return eventWithId;
  }
  
  static async bulkCreateEvents(events: Omit<AnalyticsEvent, 'id'>[]): Promise<void> {
    const collection = this.getCollection();
    const eventsWithIds = events.map(event => ({
      id: uuidv4(),
      ...event,
      timestamp: new Date()
    }));
    
    await collection.insertMany(eventsWithIds);
  }
  
  static async getEvents(
    venueId: string,
    filters: {
      eventType?: string;
      startDate?: Date;
      endDate?: Date;
      userId?: string;
      eventId?: string;
      limit?: number;
    } = {}
  ): Promise<AnalyticsEvent[]> {
    const collection = this.getCollection();
    const query: any = { venueId };
    
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
  
  static async aggregateEvents(
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
  
  static async getEventCounts(
    venueId: string,
    groupBy: string,
    startDate?: Date,
    endDate?: Date
  ): Promise<Array<{ _id: string; count: number }>> {
    const pipeline: any[] = [];
    
    if (startDate || endDate) {
      const dateMatch: any = {};
      if (startDate) dateMatch.$gte = startDate;
      if (endDate) dateMatch.$lte = endDate;
      pipeline.push({ $match: { timestamp: dateMatch } });
    }
    
    pipeline.push(
      { $group: { _id: `$${groupBy}`, count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    );
    
    return await this.aggregateEvents(venueId, pipeline);
  }
}
