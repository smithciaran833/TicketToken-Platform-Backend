/**
 * Session Model - Migrated to @tickettoken/shared
 * 
 * 🚨 CRITICAL FIX: Replaced blocking redis.keys() with SCAN-based operations
 * Uses Hash storage for better memory efficiency (3-5x improvement)
 */

import { getSessionManager, getScanner } from '@tickettoken/shared';
import { v4 as uuidv4 } from 'uuid';
import { getRedis } from '../../config/redis';

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
  private static sessionManager = getSessionManager();
  private static scanner = getScanner();
  private static SESSION_TTL = 1800; // 30 minutes
  
  static async createSession(
    userId: string,
    venueId: string,
    metadata?: Record<string, any>
  ): Promise<AnalyticsSession> {
    const sessionId = uuidv4();
    
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
    
    // Use shared session manager with hash storage
    await this.sessionManager.createSession(
      sessionId,
      userId,
      { venueId, metadata },
      this.SESSION_TTL
    );
    
    // Add to user's active sessions set
    const redis = getRedis();
    await redis.sadd(`user:sessions:${userId}`, sessionId);
    await redis.expire(`user:sessions:${userId}`, this.SESSION_TTL);
    
    return session;
  }
  
  static async getSession(
    sessionId: string
  ): Promise<AnalyticsSession | null> {
    const sessionData = await this.sessionManager.getSession(sessionId);
    if (!sessionData) return null;
    
    // Map SessionData to AnalyticsSession
    return {
      sessionId: sessionData.sessionId,
      userId: sessionData.userId,
      venueId: sessionData.venueId || '',
      startTime: sessionData.startTime,
      lastActivity: sessionData.lastActivity,
      pageViews: sessionData.pageViews || 0,
      events: sessionData.events || [],
      metadata: sessionData.metadata
    };
  }
  
  static async updateSession(
    sessionId: string,
    updates: Partial<AnalyticsSession>
  ): Promise<void> {
    const session = await this.getSession(sessionId);
    
    if (!session) {
      throw new Error('Session not found');
    }
    
    const updated = {
      ...session,
      ...updates,
      lastActivity: new Date()
    };
    
    // Update using session manager
    await this.sessionManager.updateSession(sessionId, {
      lastActivity: updated.lastActivity,
      pageViews: updated.pageViews,
      events: updated.events,
      metadata: updated.metadata
    });
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
    const redis = getRedis();
    return await redis.smembers(`user:sessions:${userId}`);
  }
  
  static async getActiveSessions(
    venueId: string
  ): Promise<number> {
    // 🚨 FIXED: Use SCAN instead of blocking KEYS command
    const keys = await this.scanner.scanKeys('session:*');
    
    let activeCount = 0;
    
    for (const key of keys) {
      const sessionData = await this.sessionManager.getSession(key.replace('session:', ''));
      if (sessionData && sessionData.venueId === venueId) {
        activeCount++;
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
    
    const redis = getRedis();
    
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
    
    // Delete session using session manager
    await this.sessionManager.deleteSession(sessionId);
  }
  
  static async getSessionMetrics(
    venueId: string
  ): Promise<any> {
    // 🚨 FIXED: Use SCAN instead of blocking KEYS command
    const keys = await this.scanner.scanKeys('session:summary:*');
    
    const metrics = {
      totalSessions: 0,
      averageDuration: 0,
      averagePageViews: 0,
      totalDuration: 0
    };
    
    const redis = getRedis();
    
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
