/**
 * Redis Session Manager
 * 
 * Manages user sessions using Redis Hash for efficient storage.
 * Includes session limiting, TTL management, and multi-device tracking.
 */

import { getRedisClient } from '../connection-manager';
import { getHashOps } from '../operations/hash';
import { getKeyBuilder } from '../utils/key-builder';
import { executeScript } from '../lua/script-loader';
import { SESSION_LIMIT_SCRIPT } from '../lua/scripts/session-limit.lua';
import { SessionData, SessionConfig, RedisOperationError } from '../types';
import { DEFAULT_TTL, SESSION_DEFAULTS } from '../config';

/**
 * Session Manager Class
 */
export class SessionManager {
  private hashOps = getHashOps();
  private keyBuilder = getKeyBuilder();
  private config: Required<SessionConfig>;
  
  constructor(config?: SessionConfig) {
    this.config = {
      ttl: config?.ttl || SESSION_DEFAULTS.TTL,
      maxSessionsPerUser: config?.maxSessionsPerUser || SESSION_DEFAULTS.MAX_PER_USER,
      useHash: config?.useHash !== undefined ? config.useHash : SESSION_DEFAULTS.USE_HASH,
    };
  }
  
  /**
   * Create a new session
   */
  async createSession(
    sessionId: string,
    userId: string,
    data: Partial<SessionData> = {},
    ttl?: number
  ): Promise<{ success: boolean; sessionCount?: number; error?: string }> {
    try {
      const sessionTTL = ttl || this.config.ttl;
      const sessionKey = this.keyBuilder.session(sessionId);
      const userSessionsKey = this.keyBuilder.userSessions(userId);
      
      // Check session limit using Lua script for atomicity
      const result = await executeScript<[number, number]>(
        'session-limit',
        SESSION_LIMIT_SCRIPT,
        [userSessionsKey, sessionKey],
        [this.config.maxSessionsPerUser, sessionId, sessionTTL]
      );
      
      const [allowed, sessionCount] = result;
      
      if (!allowed) {
        return {
          success: false,
          sessionCount,
          error: `Maximum ${this.config.maxSessionsPerUser} sessions per user exceeded`,
        };
      }
      
      // Create session data
      const sessionData: SessionData = {
        sessionId,
        userId,
        venueId: data.venueId,
        startTime: new Date(),
        lastActivity: new Date(),
        pageViews: 0,
        events: [],
        metadata: data.metadata || {},
      };
      
      // Store session using Hash
      if (this.config.useHash) {
        await this.hashOps.hmset(sessionKey, sessionData);
      } else {
        // Fallback to string storage for backwards compatibility
        const client = await getRedisClient();
        await client.set(sessionKey, JSON.stringify(sessionData));
      }
      
      // Set TTL
      const client = await getRedisClient();
      await client.expire(sessionKey, sessionTTL);
      
      return { success: true, sessionCount };
    } catch (error) {
      throw new RedisOperationError(
        'Failed to create session',
        'createSession',
        sessionId,
        error as Error
      );
    }
  }
  
  /**
   * Get session data
   */
  async getSession(sessionId: string): Promise<SessionData | null> {
    try {
      const sessionKey = this.keyBuilder.session(sessionId);
      
      if (this.config.useHash) {
        return await this.hashOps.hgetall<SessionData>(sessionKey);
      } else {
        // Fallback to string storage
        const client = await getRedisClient();
        const data = await client.get(sessionKey);
        return data ? JSON.parse(data) : null;
      }
    } catch (error) {
      throw new RedisOperationError(
        'Failed to get session',
        'getSession',
        sessionId,
        error as Error
      );
    }
  }
  
  /**
   * Update session data
   */
  async updateSession(sessionId: string, updates: Partial<SessionData>): Promise<boolean> {
    try {
      const sessionKey = this.keyBuilder.session(sessionId);
      
      // Update last activity
      updates.lastActivity = new Date();
      
      if (this.config.useHash) {
        await this.hashOps.hmset(sessionKey, updates);
        return true;
      } else {
        // Fallback: get, merge, set
        const client = await getRedisClient();
        const current = await this.getSession(sessionId);
        if (!current) return false;
        
        const updated = { ...current, ...updates };
        await client.set(sessionKey, JSON.stringify(updated));
        return true;
      }
    } catch (error) {
      throw new RedisOperationError(
        'Failed to update session',
        'updateSession',
        sessionId,
        error as Error
      );
    }
  }
  
  /**
   * Delete session
   */
  async deleteSession(sessionId: string, userId?: string): Promise<boolean> {
    try {
      const client = await getRedisClient();
      const sessionKey = this.keyBuilder.session(sessionId);
      
      // Delete session key
      const deleted = await client.del(sessionKey);
      
      // Remove from user sessions set if userId provided
      if (userId) {
        const userSessionsKey = this.keyBuilder.userSessions(userId);
        await client.srem(userSessionsKey, sessionId);
      }
      
      return deleted > 0;
    } catch (error) {
      throw new RedisOperationError(
        'Failed to delete session',
        'deleteSession',
        sessionId,
        error as Error
      );
    }
  }
  
  /**
   * Get all sessions for a user
   */
  async getUserSessions(userId: string): Promise<SessionData[]> {
    try {
      const client = await getRedisClient();
      const userSessionsKey = this.keyBuilder.userSessions(userId);
      
      // Get all session IDs for user
      const sessionIds = await client.smembers(userSessionsKey);
      
      // Fetch all sessions
      const sessions: SessionData[] = [];
      for (const sessionId of sessionIds) {
        const session = await this.getSession(sessionId);
        if (session) {
          sessions.push(session);
        }
      }
      
      return sessions;
    } catch (error) {
      throw new RedisOperationError(
        'Failed to get user sessions',
        'getUserSessions',
        userId,
        error as Error
      );
    }
  }
  
  /**
   * Touch session (refresh TTL without updating data)
   */
  async touchSession(sessionId: string, ttl?: number): Promise<boolean> {
    try {
      const client = await getRedisClient();
      const sessionKey = this.keyBuilder.session(sessionId);
      const sessionTTL = ttl || this.config.ttl;
      
      const result = await client.expire(sessionKey, sessionTTL);
      return result === 1;
    } catch (error) {
      throw new RedisOperationError(
        'Failed to touch session',
        'touchSession',
        sessionId,
        error as Error
      );
    }
  }
  
  /**
   * Delete all sessions for a user
   */
  async deleteUserSessions(userId: string): Promise<number> {
    try {
      const client = await getRedisClient();
      const userSessionsKey = this.keyBuilder.userSessions(userId);
      
      // Get all session IDs
      const sessionIds = await client.smembers(userSessionsKey);
      
      if (sessionIds.length === 0) return 0;
      
      // Delete all session keys
      const sessionKeys = sessionIds.map(id => this.keyBuilder.session(id));
      const deleted = await client.del(...sessionKeys);
      
      // Delete user sessions set
      await client.del(userSessionsKey);
      
      return deleted;
    } catch (error) {
      throw new RedisOperationError(
        'Failed to delete user sessions',
        'deleteUserSessions',
        userId,
        error as Error
      );
    }
  }
  
  /**
   * Get session count for user
   */
  async getUserSessionCount(userId: string): Promise<number> {
    try {
      const client = await getRedisClient();
      const userSessionsKey = this.keyBuilder.userSessions(userId);
      return await client.scard(userSessionsKey);
    } catch (error) {
      throw new RedisOperationError(
        'Failed to get session count',
        'getUserSessionCount',
        userId,
        error as Error
      );
    }
  }
}

// Singleton with default config
let defaultManager: SessionManager | null = null;

export function getSessionManager(config?: SessionConfig): SessionManager {
  if (!defaultManager) {
    defaultManager = new SessionManager(config);
  }
  return defaultManager;
}

export function createSessionManager(config?: SessionConfig): SessionManager {
  return new SessionManager(config);
}
