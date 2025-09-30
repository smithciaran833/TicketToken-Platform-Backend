import { getRedis } from '../../config/redis';
import { v4 as uuidv4 } from 'uuid';

export interface AnalyticsSession {
  sessionId: string;
  userId: string;
  venueId: string;
  startTime: Date;
  lastActivity: Date;
  pageViews: number;
  events: Array<{
    type: string;
    timestamp: Date;
    data?: any;
  }>;
  metadata?: Record<string, any>;
}

export class SessionModel {
  private static redis = getRedis;
  private static SESSION_TTL = 1800; // 30 minutes
  
  static async createSession(
    userId: string,
    venueId: string,
    metadata?: Record<string, any>
  ): Promise<AnalyticsSession> {
    const redis = this.redis();
    const sessionId = uuidv4();
    const key = `session:${sessionId}`;
    
    const session: AnalyticsSession = {
      sessionId,
      userId,
      venueId,
      startTime: new Date(),
      lastActivity: new Date(),
      pageViews: 0,
      events: [],
      metadata
    };
    
    await redis.set(key, JSON.stringify(session));
    await redis.expire(key, this.SESSION_TTL);
    
    // Add to user's active sessions
    await redis.sadd(`user:sessions:${userId}`, sessionId);
    await redis.expire(`user:sessions:${userId}`, this.SESSION_TTL);
    
    return session;
  }
  
  static async getSession(
    sessionId: string
  ): Promise<AnalyticsSession | null> {
    const redis = this.redis();
    const key = `session:${sessionId}`;
    const data = await redis.get(key);
    
    return data ? JSON.parse(data) : null;
  }
  
  static async updateSession(
    sessionId: string,
    updates: Partial<AnalyticsSession>
  ): Promise<void> {
    const session = await this.getSession(sessionId);
    
    if (!session) {
      throw new Error('Session not found');
    }
    
    const redis = this.redis();
    const key = `session:${sessionId}`;
    
    const updated = {
      ...session,
      ...updates,
      lastActivity: new Date()
    };
    
    await redis.set(key, JSON.stringify(updated));
    await redis.expire(key, this.SESSION_TTL);
  }
  
  static async trackEvent(
    sessionId: string,
    eventType: string,
    eventData?: any
  ): Promise<void> {
    const session = await this.getSession(sessionId);
    
    if (!session) {
      throw new Error('Session not found');
    }
    
    session.events.push({
      type: eventType,
      timestamp: new Date(),
      data: eventData
    });
    
    await this.updateSession(sessionId, {
      events: session.events,
      pageViews: eventType === 'page_view' ? session.pageViews + 1 : session.pageViews
    });
  }
  
  static async getUserSessions(
    userId: string
  ): Promise<string[]> {
    const redis = this.redis();
    return await redis.smembers(`user:sessions:${userId}`);
  }
  
  static async getActiveSessions(
    venueId: string
  ): Promise<number> {
    const redis = this.redis();
    const pattern = `session:*`;
    const keys = await redis.keys(pattern);
    
    let activeCount = 0;
    
    for (const key of keys) {
      const sessionData = await redis.get(key);
      if (sessionData) {
        const session = JSON.parse(sessionData);
        if (session.venueId === venueId) {
          activeCount++;
        }
      }
    }
    
    return activeCount;
  }
  
  static async endSession(
    sessionId: string
  ): Promise<void> {
    const session = await this.getSession(sessionId);
    
    if (!session) {
      return;
    }
    
    const redis = this.redis();
    
    // Remove from active sessions
    await redis.srem(`user:sessions:${session.userId}`, sessionId);
    
    // Store session summary for analytics
    const summaryKey = `session:summary:${sessionId}`;
    const summary = {
      sessionId,
      userId: session.userId,
      venueId: session.venueId,
      startTime: session.startTime,
      endTime: new Date(),
      duration: new Date().getTime() - new Date(session.startTime).getTime(),
      pageViews: session.pageViews,
      eventCount: session.events.length
    };
    
    await redis.set(summaryKey, JSON.stringify(summary));
    await redis.expire(summaryKey, 86400); // Keep for 24 hours
    
    // Delete session
    await redis.del(`session:${sessionId}`);
  }
  
  static async getSessionMetrics(
    venueId: string
  ): Promise<any> {
    const redis = this.redis();
    const pattern = `session:summary:*`;
    const keys = await redis.keys(pattern);
    
    const metrics = {
      totalSessions: 0,
      averageDuration: 0,
      averagePageViews: 0,
      totalDuration: 0
    };
    
    for (const key of keys) {
      const summaryData = await redis.get(key);
      if (summaryData) {
        const summary = JSON.parse(summaryData);
        if (summary.venueId === venueId) {
          metrics.totalSessions++;
          metrics.totalDuration += summary.duration;
          metrics.averagePageViews += summary.pageViews;
        }
      }
    }
    
    if (metrics.totalSessions > 0) {
      metrics.averageDuration = metrics.totalDuration / metrics.totalSessions;
      metrics.averagePageViews = metrics.averagePageViews / metrics.totalSessions;
    }
    
    return metrics;
  }
}
