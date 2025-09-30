import { createClient } from 'redis';
import { v4 as uuidv4 } from 'uuid';
import jwt from 'jsonwebtoken';
import { config } from '../../config';
import { query } from '../../config/database';

// SECURITY FIX: Phase 2.2 - Use cryptographically signed JWT tokens
const QUEUE_TOKEN_SECRET = process.env.QUEUE_TOKEN_SECRET || (() => {
  console.error('WARNING: QUEUE_TOKEN_SECRET not set. Using default for development only.');
  return 'dev-secret-change-in-production';
})();

export interface QueueTokenPayload {
  sub: string;      // userId
  evt: string;      // eventId  
  qid: string;      // queueId
  scope: 'queue';
  iat: number;
  exp: number;
  jti: string;      // unique token ID
}

export class WaitingRoomService {
  private redis: any; // TODO: Add proper Redis client type
  private processingRate: number = 100; // Users per minute

  constructor() {
    this.redis = createClient({
      socket: {
        host: config.redis.host,
        port: config.redis.port
      }
    });

    this.redis.connect().catch(console.error);
  }

  async joinWaitingRoom(
    eventId: string,
    userId: string,
    sessionId: string,
    priority: number = 0
  ): Promise<{
    queueId: string;
    position: number;
    estimatedWaitTime: number;
    status: string;
  }> {
    const queueKey = `waiting_room:${eventId}`;
    const queueId = uuidv4();
    const timestamp = Date.now();

    // Check if user already in queue
    const existingPosition = await this.getUserPosition(eventId, userId);
    if (existingPosition) {
      return existingPosition;
    }

    // Calculate score (lower timestamp = higher priority, with priority boost)
    const score = timestamp - (priority * 1000000); // Priority users get million-point boost

    // Add to sorted set
    await this.redis.zAdd(queueKey, {
      score: score,
      value: JSON.stringify({
        queueId,
        userId,
        sessionId,
        timestamp,
        priority
      })
    });

    // Set queue expiry (2 hours)
    await this.redis.expire(queueKey, 7200);

    // Get position and estimate
    const position = await this.getQueuePosition(queueKey, queueId);
    const estimatedWaitTime = this.calculateWaitTime(position);

    // Record queue join
    await this.recordQueueActivity(eventId, userId, 'joined', { queueId, position });

    return {
      queueId,
      position,
      estimatedWaitTime,
      status: position === 1 ? 'ready' : 'waiting'
    };
  }

  async checkPosition(
    eventId: string,
    queueId: string
  ): Promise<{
    position: number;
    estimatedWaitTime: number;
    status: string;
    accessToken?: string;
  }> {
    const queueKey = `waiting_room:${eventId}`;

    // Get current position
    const position = await this.getQueuePosition(queueKey, queueId);

    if (position === 0) {
      return {
        position: 0,
        estimatedWaitTime: 0,
        status: 'expired'
      };
    }

    // Check if user's turn
    const activeSlots = await this.getActiveSlots(eventId);

    if (position <= activeSlots) {
      // Generate access token - SECURITY FIX: Use JWT instead of predictable string
      const accessToken = await this.generateAccessToken(eventId, queueId);

      return {
        position,
        estimatedWaitTime: 0,
        status: 'ready',
        accessToken
      };
    }

    return {
      position,
      estimatedWaitTime: this.calculateWaitTime(position - activeSlots),
      status: 'waiting'
    };
  }

  async processQueue(eventId: string): Promise<{
    processed: number;
    remaining: number;
  }> {
    const queueKey = `waiting_room:${eventId}`;
    const processingKey = `processing:${eventId}`;

    // Get current queue size
    const queueSize = await this.redis.zCard(queueKey) || 0;

    if (queueSize === 0) {
      return { processed: 0, remaining: 0 };
    }

    // Calculate how many to process
    const activeCount = await this.getActiveUserCount(eventId);
    const maxActive = await this.getMaxActiveUsers(eventId);
    const toProcess = Math.min(
      maxActive - activeCount,
      this.processingRate,
      queueSize
    );

    if (toProcess <= 0) {
      return { processed: 0, remaining: queueSize };
    }

    // Get next batch of users
    const users = await this.redis.zRange(queueKey, 0, toProcess - 1) || [];

    // Process each user
    let processed = 0;
    for (const userJson of users) {
      const user = JSON.parse(userJson);

      // Move to processing
      await this.moveToProcessing(eventId, user);
      processed++;

      // Remove from queue
      await this.redis.zRem(queueKey, userJson);
    }

    return {
      processed,
      remaining: queueSize - processed
    };
  }

  private async getQueuePosition(
    queueKey: string,
    queueId: string
  ): Promise<number> {
    // Find member with this queueId
    const members = await this.redis.zRange(queueKey, 0, -1) || [];

    for (let i = 0; i < members.length; i++) {
      const member = JSON.parse(members[i]);
      if (member.queueId === queueId) {
        return i + 1; // 1-indexed position
      }
    }

    return 0; // Not found
  }

  private calculateWaitTime(position: number): number {
    // Estimate based on processing rate
    const minutes = Math.ceil(position / this.processingRate);
    return minutes;
  }

  // SECURITY FIX: Phase 2.2 - Replace predictable token with signed JWT
  private async generateAccessToken(
    eventId: string,
    queueId: string,
    userId?: string
  ): Promise<string> {
    // Get userId from queue if not provided
    if (!userId) {
      const queueKey = `waiting_room:${eventId}`;
      const members = await this.redis.zRange(queueKey, 0, -1) || [];
      for (const memberJson of members) {
        const member = JSON.parse(memberJson);
        if (member.queueId === queueId) {
          userId = member.userId;
          break;
        }
      }
    }

    const payload: QueueTokenPayload = {
      sub: userId || 'unknown',
      evt: eventId,
      qid: queueId,
      scope: 'queue',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 600, // 10 min validity
      jti: uuidv4() // Unique token ID
    };

    // Sign the token
    const token = jwt.sign(payload, QUEUE_TOKEN_SECRET, {
      algorithm: 'HS256',
      issuer: 'waiting-room'
    });

    // Still store in Redis for quick validation and revocation
    const tokenKey = `access_token:${payload.jti}`;
    await this.redis.setEx(tokenKey, 600, JSON.stringify({
      eventId,
      queueId,
      userId: userId || 'unknown',
      grantedAt: new Date()
    }));

    return token;
  }

  // SECURITY FIX: Phase 2.2 - Validate JWT signature
  async validateAccessToken(token: string): Promise<{
    valid: boolean;
    eventId?: string;
  }> {
    try {
      // Verify JWT signature
      const decoded = jwt.verify(token, QUEUE_TOKEN_SECRET, {
        algorithms: ['HS256'],
        issuer: 'waiting-room'
      }) as QueueTokenPayload;

      // Check if token scope is correct
      if (decoded.scope !== 'queue') {
        return { valid: false };
      }

      // Check if token still exists in Redis (for revocation)
      const tokenKey = `access_token:${decoded.jti}`;
      const redisData = await this.redis.get(tokenKey);

      if (!redisData) {
        // Token was revoked or expired in Redis
        return { valid: false };
      }

      return {
        valid: true,
        eventId: decoded.evt
      };
    } catch (err) {
      // Invalid signature, expired, or malformed token
      return { valid: false };
    }
  }

  private async getActiveSlots(eventId: string): Promise<number> {
    // Get event configuration
    const event = await this.getEventConfig(eventId);
    return event.maxConcurrentPurchasers || 100;
  }

  private async getActiveUserCount(eventId: string): Promise<number> {
    const activeKey = `active_users:${eventId}`;
    return await this.redis.sCard(activeKey) || 0;
  }

  private async getMaxActiveUsers(eventId: string): Promise<number> {
    const event = await this.getEventConfig(eventId);
    return event.maxConcurrentPurchasers || 100;
  }

  private async moveToProcessing(eventId: string, user: any): Promise<void> {
    const activeKey = `active_users:${eventId}`;

    await this.redis.sAdd(activeKey, user.userId);

    // Set expiry on active user (10 minutes to complete purchase)
    await this.redis.expire(activeKey, 600);
  }

  private async recordQueueActivity(
    eventId: string,
    userId: string,
    action: string,
    metadata: any
  ): Promise<void> {
    await query(
      `INSERT INTO waiting_room_activity
       (event_id, user_id, action, metadata, timestamp)
       VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)`,
      [eventId, userId, action, JSON.stringify(metadata)]
    );
  }

  private async getEventConfig(eventId: string): Promise<any> {
    // In production, get from event service
    return {
      maxConcurrentPurchasers: 100,
      processingRate: 100
    };
  }

  private async getUserPosition(
    eventId: string,
    userId: string
  ): Promise<any | null> {
    const queueKey = `waiting_room:${eventId}`;

    const members = await this.redis.zRange(queueKey, 0, -1) || [];

    for (let i = 0; i < members.length; i++) {
      const member = JSON.parse(members[i]);
      if (member.userId === userId) {
        return {
          queueId: member.queueId,
          position: i + 1,
          estimatedWaitTime: this.calculateWaitTime(i + 1),
          status: 'waiting'
        };
      }
    }

    return null;
  }

  async getQueueStats(eventId: string): Promise<{
    totalInQueue: number;
    activeUsers: number;
    processingRate: number;
    averageWaitTime: number;
    abandonmentRate: number;
  }> {
    const queueKey = `waiting_room:${eventId}`;
    const activeKey = `active_users:${eventId}`;

    const [queueSize, activeCount] = await Promise.all([
      this.redis.zCard(queueKey),
      this.redis.sCard(activeKey)
    ]);

    // Calculate abandonment rate from activity logs
    const abandonmentStats = await query(
      `SELECT
        COUNT(*) FILTER (WHERE action = 'abandoned') as abandoned,
        COUNT(*) FILTER (WHERE action = 'joined') as joined
       FROM waiting_room_activity
       WHERE event_id = $1
         AND timestamp > CURRENT_TIMESTAMP - INTERVAL '1 hour'`,
      [eventId]
    );

    const abandoned = parseInt(abandonmentStats.rows[0].abandoned);
    const joined = parseInt(abandonmentStats.rows[0].joined);
    const abandonmentRate = joined > 0 ? (abandoned / joined) * 100 : 0;

    return {
      totalInQueue: queueSize || 0,
      activeUsers: activeCount || 0,
      processingRate: this.processingRate,
      averageWaitTime: queueSize && queueSize > 0 ? Math.ceil(queueSize / this.processingRate) : 0,
      abandonmentRate
    };
  }
}
