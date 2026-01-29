/**
 * COMPONENT TEST: WaitingRoomService
 *
 * Tests waiting room queue management for high-demand events
 */

import { v4 as uuidv4 } from 'uuid';

process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'silent';
process.env.QUEUE_TOKEN_SECRET = 'test-secret-for-jwt-signing';

const mockQuery = jest.fn();
const mockRedisZadd = jest.fn();
const mockRedisZrange = jest.fn();
const mockRedisZcard = jest.fn();
const mockRedisScard = jest.fn();
const mockRedisSadd = jest.fn();
const mockRedisZrem = jest.fn();
const mockRedisExpire = jest.fn();
const mockRedisSetex = jest.fn();
const mockRedisGet = jest.fn();

jest.mock('../../../../src/config/database', () => ({
  query: mockQuery,
}));

jest.mock('../../../../src/services/redisService', () => ({
  RedisService: {
    getClient: () => ({
      zadd: mockRedisZadd,
      zrange: mockRedisZrange,
      zcard: mockRedisZcard,
      scard: mockRedisScard,
      sadd: mockRedisSadd,
      zrem: mockRedisZrem,
      expire: mockRedisExpire,
      setex: mockRedisSetex,
      get: mockRedisGet,
    }),
  },
}));

jest.mock('../../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    child: () => ({ info: jest.fn(), error: jest.fn() }),
  },
}));

import { WaitingRoomService } from '../../../../src/services/high-demand/waiting-room.service';

describe('WaitingRoomService Component Tests', () => {
  let service: WaitingRoomService;
  let eventId: string;
  let userId: string;
  let sessionId: string;

  beforeEach(() => {
    eventId = uuidv4();
    userId = uuidv4();
    sessionId = uuidv4();

    mockQuery.mockReset();
    mockRedisZadd.mockReset();
    mockRedisZrange.mockReset();
    mockRedisZcard.mockReset();
    mockRedisScard.mockReset();
    mockRedisSadd.mockReset();
    mockRedisZrem.mockReset();
    mockRedisExpire.mockReset();
    mockRedisSetex.mockReset();
    mockRedisGet.mockReset();

    // Default mocks
    mockRedisZadd.mockResolvedValue(1);
    mockRedisZrange.mockResolvedValue([]);
    mockRedisZcard.mockResolvedValue(0);
    mockRedisScard.mockResolvedValue(0);
    mockRedisExpire.mockResolvedValue(1);
    mockRedisSetex.mockResolvedValue('OK');
    mockQuery.mockResolvedValue({ rows: [] });

    service = new WaitingRoomService();
  });

  // ===========================================================================
  // JOIN WAITING ROOM
  // ===========================================================================
  describe('joinWaitingRoom()', () => {
    it('should add user to queue', async () => {
      const result = await service.joinWaitingRoom(eventId, userId, sessionId);

      expect(result.queueId).toBeDefined();
      expect(result.position).toBeDefined();
      expect(result.estimatedWaitTime).toBeDefined();
      expect(mockRedisZadd).toHaveBeenCalled();
    });

    it('should return existing position if already in queue', async () => {
      const queueId = uuidv4();
      mockRedisZrange.mockResolvedValueOnce([
        JSON.stringify({ queueId, userId, sessionId, timestamp: Date.now() })
      ]);

      const result = await service.joinWaitingRoom(eventId, userId, sessionId);

      expect(result.queueId).toBe(queueId);
      expect(result.status).toBe('waiting');
    });

    it('should apply priority boost', async () => {
      await service.joinWaitingRoom(eventId, userId, sessionId, 5);

      expect(mockRedisZadd).toHaveBeenCalledWith(
        expect.stringContaining('waiting_room'),
        expect.any(Number), // Score with priority boost
        expect.any(String)
      );
    });

    it('should set queue expiry', async () => {
      await service.joinWaitingRoom(eventId, userId, sessionId);

      expect(mockRedisExpire).toHaveBeenCalledWith(
        expect.stringContaining('waiting_room'),
        7200 // 2 hours
      );
    });

    it('should record queue activity', async () => {
      await service.joinWaitingRoom(eventId, userId, sessionId);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO waiting_room_activity'),
        expect.arrayContaining([eventId, userId, 'joined'])
      );
    });
  });

  // ===========================================================================
  // CHECK POSITION
  // ===========================================================================
  describe('checkPosition()', () => {
    it('should return current position when behind active slots', async () => {
      const queueId = uuidv4();
      // Create 150 users in queue - position 150 is beyond 100 active slots
      const queueMembers = [];
      for (let i = 0; i < 149; i++) {
        queueMembers.push(JSON.stringify({ queueId: uuidv4(), userId: uuidv4() }));
      }
      queueMembers.push(JSON.stringify({ queueId, userId, sessionId }));

      mockRedisZrange.mockResolvedValue(queueMembers);
      mockRedisScard.mockResolvedValue(100); // All active slots full

      const result = await service.checkPosition(eventId, queueId);

      expect(result.position).toBe(150);
      expect(result.status).toBe('waiting');
    });

    it('should return ready status with access token when at front', async () => {
      const queueId = uuidv4();
      mockRedisZrange.mockResolvedValue([
        JSON.stringify({ queueId, userId, sessionId }),
      ]);
      mockRedisScard.mockResolvedValue(0); // No active users

      const result = await service.checkPosition(eventId, queueId);

      expect(result.status).toBe('ready');
      expect(result.accessToken).toBeDefined();
    });

    it('should return expired if not in queue', async () => {
      mockRedisZrange.mockResolvedValue([]);

      const result = await service.checkPosition(eventId, 'nonexistent');

      expect(result.position).toBe(0);
      expect(result.status).toBe('expired');
    });
  });

  // ===========================================================================
  // PROCESS QUEUE
  // ===========================================================================
  describe('processQueue()', () => {
    it('should process users from queue', async () => {
      const user1 = { queueId: uuidv4(), userId: uuidv4(), sessionId: uuidv4() };
      const user2 = { queueId: uuidv4(), userId: uuidv4(), sessionId: uuidv4() };

      mockRedisZcard.mockResolvedValueOnce(2);
      mockRedisScard.mockResolvedValueOnce(0); // No active users
      mockRedisZrange.mockResolvedValueOnce([
        JSON.stringify(user1),
        JSON.stringify(user2),
      ]);

      const result = await service.processQueue(eventId);

      expect(result.processed).toBe(2);
      expect(result.remaining).toBe(0);
      expect(mockRedisSadd).toHaveBeenCalledTimes(2);
      expect(mockRedisZrem).toHaveBeenCalledTimes(2);
    });

    it('should return zero when queue is empty', async () => {
      mockRedisZcard.mockResolvedValueOnce(0);

      const result = await service.processQueue(eventId);

      expect(result.processed).toBe(0);
      expect(result.remaining).toBe(0);
    });

    it('should limit processing to available slots', async () => {
      mockRedisZcard.mockResolvedValueOnce(200);
      mockRedisScard.mockResolvedValueOnce(90); // 90 active, max 100
      mockRedisZrange.mockResolvedValueOnce([
        JSON.stringify({ queueId: uuidv4(), userId: uuidv4() }),
      ]);

      const result = await service.processQueue(eventId);

      // Should only process up to 10 (100 - 90)
      expect(result.processed).toBeLessThanOrEqual(10);
    });
  });

  // ===========================================================================
  // VALIDATE ACCESS TOKEN
  // ===========================================================================
  describe('validateAccessToken()', () => {
    it('should validate valid JWT token', async () => {
      // First generate a token
      const queueId = uuidv4();
      mockRedisZrange.mockResolvedValue([
        JSON.stringify({ queueId, userId, sessionId }),
      ]);
      mockRedisScard.mockResolvedValue(0);

      const checkResult = await service.checkPosition(eventId, queueId);
      const token = checkResult.accessToken!;

      // Now validate it
      mockRedisGet.mockResolvedValueOnce(JSON.stringify({ eventId, queueId, userId }));

      const result = await service.validateAccessToken(token);

      expect(result.valid).toBe(true);
      expect(result.eventId).toBe(eventId);
    });

    it('should reject invalid token', async () => {
      const result = await service.validateAccessToken('invalid-token');

      expect(result.valid).toBe(false);
    });

    it('should reject revoked token (not in Redis)', async () => {
      // Generate token
      const queueId = uuidv4();
      mockRedisZrange.mockResolvedValue([
        JSON.stringify({ queueId, userId, sessionId }),
      ]);
      mockRedisScard.mockResolvedValue(0);

      const checkResult = await service.checkPosition(eventId, queueId);
      const token = checkResult.accessToken!;

      // Token not in Redis (revoked)
      mockRedisGet.mockResolvedValueOnce(null);

      const result = await service.validateAccessToken(token);

      expect(result.valid).toBe(false);
    });
  });

  // ===========================================================================
  // GET QUEUE STATS
  // ===========================================================================
  describe('getQueueStats()', () => {
    it('should return queue statistics', async () => {
      mockRedisZcard.mockResolvedValueOnce(150);
      mockRedisScard.mockResolvedValueOnce(75);
      mockQuery.mockResolvedValueOnce({
        rows: [{ abandoned: '10', joined: '200' }]
      });

      const result = await service.getQueueStats(eventId);

      expect(result.totalInQueue).toBe(150);
      expect(result.activeUsers).toBe(75);
      expect(result.processingRate).toBe(100);
      expect(result.abandonmentRate).toBe(5); // 10/200 * 100
    });

    it('should calculate average wait time', async () => {
      mockRedisZcard.mockResolvedValueOnce(200);
      mockRedisScard.mockResolvedValueOnce(50);
      mockQuery.mockResolvedValueOnce({ rows: [{ abandoned: '0', joined: '0' }] });

      const result = await service.getQueueStats(eventId);

      expect(result.averageWaitTime).toBe(2); // 200 / 100 (processing rate)
    });
  });
});
