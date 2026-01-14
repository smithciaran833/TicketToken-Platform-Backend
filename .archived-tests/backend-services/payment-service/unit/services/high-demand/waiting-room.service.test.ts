import { WaitingRoomService } from '../../../../src/services/high-demand/waiting-room.service';
import jwt from 'jsonwebtoken';

// Mock Redis
const mockRedis = {
  connect: jest.fn().mockResolvedValue(undefined),
  zAdd: jest.fn().mockResolvedValue(1),
  zCard: jest.fn().mockResolvedValue(0),
  zRange: jest.fn().mockResolvedValue([]),
  zRem: jest.fn().mockResolvedValue(1),
  expire: jest.fn().mockResolvedValue(1),
  sAdd: jest.fn().mockResolvedValue(1),
  sCard: jest.fn().mockResolvedValue(0),
  setEx: jest.fn().mockResolvedValue('OK'),
  get: jest.fn().mockResolvedValue(null)
};

jest.mock('redis', () => ({
  createClient: jest.fn(() => mockRedis)
}));

// Mock database
jest.mock('../../../../src/config/database', () => ({
  query: jest.fn()
}));

// Mock config
jest.mock('../../../../src/config', () => ({
  config: {
    redis: {
      host: 'localhost',
      port: 6379
    }
  }
}));

// Mock logger
jest.mock('../../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    child: jest.fn(() => ({
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn()
    }))
  }
}));

// Mock JWT
jest.mock('jsonwebtoken');

import { query } from '../../../../src/config/database';

describe('WaitingRoomService', () => {
  let service: WaitingRoomService;
  let mockQuery: jest.Mock;
  let mockJwt: jest.Mocked<typeof jwt>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockQuery = query as jest.Mock;
    mockJwt = jwt as jest.Mocked<typeof jwt>;
    service = new WaitingRoomService();
  });

  describe('joinWaitingRoom', () => {
    it('should add user to waiting room', async () => {
      mockRedis.zRange.mockResolvedValue([]);
      mockQuery.mockResolvedValue({ rows: [] });

      const result = await service.joinWaitingRoom(
        'event_1',
        'user_1',
        'session_1'
      );

      expect(result).toHaveProperty('queueId');
      expect(result).toHaveProperty('position');
      expect(result).toHaveProperty('estimatedWaitTime');
      expect(result).toHaveProperty('status');
      expect(mockRedis.zAdd).toHaveBeenCalled();
    });

    it('should assign position 1 to first user', async () => {
      mockRedis.zRange.mockResolvedValue([]);
      mockQuery.mockResolvedValue({ rows: [] });

      const result = await service.joinWaitingRoom(
        'event_1',
        'user_1',
        'session_1'
      );

      expect(result.position).toBe(1);
      expect(result.status).toBe('ready');
    });

    it('should handle priority users', async () => {
      mockRedis.zRange.mockResolvedValue([]);
      mockQuery.mockResolvedValue({ rows: [] });

      const result = await service.joinWaitingRoom(
        'event_1',
        'user_priority',
        'session_1',
        1 // Priority user
      );

      expect(result).toBeDefined();
      // Priority users get lower score (higher priority)
      const zAddCall = mockRedis.zAdd.mock.calls[0];
      expect(zAddCall).toBeDefined();
    });

    it('should return existing position if user already in queue', async () => {
      const existingUser = JSON.stringify({
        queueId: 'existing_queue',
        userId: 'user_1',
        sessionId: 'session_1',
        timestamp: Date.now(),
        priority: 0
      });

      mockRedis.zRange.mockResolvedValue([existingUser]);
      mockQuery.mockResolvedValue({ rows: [] });

      const result = await service.joinWaitingRoom(
        'event_1',
        'user_1',
        'session_2' // Different session
      );

      expect(result.queueId).toBe('existing_queue');
      // Should not add again
      expect(mockRedis.zAdd).not.toHaveBeenCalled();
    });

    it('should set queue expiry', async () => {
      mockRedis.zRange.mockResolvedValue([]);
      mockQuery.mockResolvedValue({ rows: [] });

      await service.joinWaitingRoom('event_1', 'user_1', 'session_1');

      expect(mockRedis.expire).toHaveBeenCalledWith(
        'waiting_room:event_1',
        7200 // 2 hours
      );
    });

    it('should calculate estimated wait time', async () => {
      mockRedis.zRange.mockResolvedValue([]);
      mockQuery.mockResolvedValue({ rows: [] });

      const result = await service.joinWaitingRoom(
        'event_1',
        'user_1',
        'session_1'
      );

      expect(result.estimatedWaitTime).toBeGreaterThanOrEqual(0);
    });

    it('should record queue activity in database', async () => {
      mockRedis.zRange.mockResolvedValue([]);
      mockQuery.mockResolvedValue({ rows: [] });

      await service.joinWaitingRoom('event_1', 'user_1', 'session_1');

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO waiting_room_activity'),
        expect.arrayContaining(['event_1', 'user_1', 'joined'])
      );
    });
  });

  describe('checkPosition', () => {
    it('should return current position in queue', async () => {
      const queueData = JSON.stringify({
        queueId: 'queue_1',
        userId: 'user_1',
        sessionId: 'session_1'
      });

      mockRedis.zRange.mockResolvedValue([queueData]);
      mockRedis.sCard.mockResolvedValue(0);

      const result = await service.checkPosition('event_1', 'queue_1');

      expect(result.position).toBe(1);
    });

    it('should return expired status if queue not found', async () => {
      mockRedis.zRange.mockResolvedValue([]);

      const result = await service.checkPosition('event_1', 'nonexistent');

      expect(result.status).toBe('expired');
      expect(result.position).toBe(0);
    });

    it('should generate access token when user is ready', async () => {
      const queueData = JSON.stringify({
        queueId: 'queue_1',
        userId: 'user_1',
        sessionId: 'session_1'
      });

      mockRedis.zRange.mockResolvedValue([queueData]);
      mockRedis.sCard.mockResolvedValue(50); // 50 active users, position 1 can proceed
      mockJwt.sign.mockReturnValue('mock_jwt_token');

      const result = await service.checkPosition('event_1', 'queue_1');

      expect(result.status).toBe('ready');
      expect(result.accessToken).toBeDefined();
      expect(mockJwt.sign).toHaveBeenCalled();
    });

    it('should return waiting status if not at front', async () => {
      const users = [
        JSON.stringify({ queueId: 'queue_0', userId: 'user_0' }),
        JSON.stringify({ queueId: 'queue_1', userId: 'user_1' })
      ];

      mockRedis.zRange.mockResolvedValue(users);
      mockRedis.sCard.mockResolvedValue(0);

      const result = await service.checkPosition('event_1', 'queue_1');

      expect(result.status).toBe('waiting');
      expect(result.estimatedWaitTime).toBeGreaterThan(0);
    });
  });

  describe('validateAccessToken', () => {
    it('should validate correct JWT token', async () => {
      const mockPayload = {
        sub: 'user_1',
        evt: 'event_1',
        qid: 'queue_1',
        scope: 'queue',
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 600,
        jti: 'token_id_1'
      };

      mockJwt.verify.mockReturnValue(mockPayload as any);
      mockRedis.get.mockResolvedValue(JSON.stringify({
        eventId: 'event_1',
        queueId: 'queue_1',
        userId: 'user_1'
      }));

      const result = await service.validateAccessToken('valid_token');

      expect(result.valid).toBe(true);
      expect(result.eventId).toBe('event_1');
    });

    it('should reject token with invalid signature', async () => {
      mockJwt.verify.mockImplementation(() => {
        throw new Error('Invalid signature');
      });

      const result = await service.validateAccessToken('invalid_token');

      expect(result.valid).toBe(false);
    });

    it('should reject token with wrong scope', async () => {
      const mockPayload = {
        sub: 'user_1',
        evt: 'event_1',
        qid: 'queue_1',
        scope: 'wrong_scope', // Wrong scope!
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 600,
        jti: 'token_id_1'
      };

      mockJwt.verify.mockReturnValue(mockPayload as any);

      const result = await service.validateAccessToken('token_with_wrong_scope');

      expect(result.valid).toBe(false);
    });

    it('should reject revoked token', async () => {
      const mockPayload = {
        sub: 'user_1',
        evt: 'event_1',
        qid: 'queue_1',
        scope: 'queue',
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 600,
        jti: 'revoked_token'
      };

      mockJwt.verify.mockReturnValue(mockPayload as any);
      mockRedis.get.mockResolvedValue(null); // Token doesn't exist in Redis

      const result = await service.validateAccessToken('revoked_token');

      expect(result.valid).toBe(false);
    });

    it('should reject expired token', async () => {
      mockJwt.verify.mockImplementation(() => {
        throw new Error('jwt expired');
      });

      const result = await service.validateAccessToken('expired_token');

      expect(result.valid).toBe(false);
    });
  });

  describe('processQueue', () => {
    it('should process users from queue', async () => {
      const users = [
        JSON.stringify({ queueId: 'q1', userId: 'user_1', sessionId: 's1' }),
        JSON.stringify({ queueId: 'q2', userId: 'user_2', sessionId: 's2' })
      ];

      mockRedis.zCard.mockResolvedValue(2);
      mockRedis.zRange.mockResolvedValue(users);
      mockRedis.sCard.mockResolvedValue(0);

      const result = await service.processQueue('event_1');

      expect(result.processed).toBeGreaterThan(0);
      expect(mockRedis.sAdd).toHaveBeenCalled();
    });

    it('should return zero if queue is empty', async () => {
      mockRedis.zCard.mockResolvedValue(0);

      const result = await service.processQueue('event_1');

      expect(result.processed).toBe(0);
      expect(result.remaining).toBe(0);
    });

    it('should respect max active users limit', async () => {
      const users = Array(200).fill(null).map((_, i) => 
        JSON.stringify({ queueId: `q${i}`, userId: `user_${i}` })
      );

      mockRedis.zCard.mockResolvedValue(200);
      mockRedis.zRange.mockResolvedValue(users.slice(0, 100));
      mockRedis.sCard.mockResolvedValue(90); // 90 active, max 100

      const result = await service.processQueue('event_1');

      // Should only process up to max (100 - 90 = 10)
      expect(result.processed).toBeLessThanOrEqual(10);
    });

    it('should remove processed users from queue', async () => {
      const user = JSON.stringify({ queueId: 'q1', userId: 'user_1' });

      mockRedis.zCard.mockResolvedValue(1);
      mockRedis.zRange.mockResolvedValue([user]);
      mockRedis.sCard.mockResolvedValue(0);

      await service.processQueue('event_1');

      expect(mockRedis.zRem).toHaveBeenCalledWith(
        'waiting_room:event_1',
        user
      );
    });
  });

  describe('getQueueStats', () => {
    it('should return queue statistics', async () => {
      mockRedis.zCard.mockResolvedValue(50);
      mockRedis.sCard.mockResolvedValue(25);
      mockQuery.mockResolvedValue({
        rows: [{ abandoned: 5, joined: 100 }]
      });

      const result = await service.getQueueStats('event_1');

      expect(result).toHaveProperty('totalInQueue');
      expect(result).toHaveProperty('activeUsers');
      expect(result).toHaveProperty('processingRate');
      expect(result).toHaveProperty('averageWaitTime');
      expect(result).toHaveProperty('abandonmentRate');
    });

    it('should calculate abandonment rate correctly', async () => {
      mockRedis.zCard.mockResolvedValue(10);
      mockRedis.sCard.mockResolvedValue(5);
      mockQuery.mockResolvedValue({
        rows: [{ abandoned: 10, joined: 100 }]
      });

      const result = await service.getQueueStats('event_1');

      expect(result.abandonmentRate).toBe(10); // 10/100 * 100 = 10%
    });

    it('should handle zero abandonment gracefully', async () => {
      mockRedis.zCard.mockResolvedValue(10);
      mockRedis.sCard.mockResolvedValue(5);
      mockQuery.mockResolvedValue({
        rows: [{ abandoned: 0, joined: 100 }]
      });

      const result = await service.getQueueStats('event_1');

      expect(result.abandonmentRate).toBe(0);
    });

    it('should handle empty queue', async () => {
      mockRedis.zCard.mockResolvedValue(0);
      mockRedis.sCard.mockResolvedValue(0);
      mockQuery.mockResolvedValue({
        rows: [{ abandoned: 0, joined: 0 }]
      });

      const result = await service.getQueueStats('event_1');

      expect(result.totalInQueue).toBe(0);
      expect(result.averageWaitTime).toBe(0);
    });
  });

  describe('Edge Cases', () => {
    it('should handle Redis connection errors', async () => {
      mockRedis.connect.mockRejectedValue(new Error('Connection failed'));

      const serviceWithError = new WaitingRoomService();

      // Should still create service
      expect(serviceWithError).toBeDefined();
    });

    it('should handle database errors during activity recording', async () => {
      mockRedis.zRange.mockResolvedValue([]);
      mockQuery.mockRejectedValue(new Error('Database error'));

      // Should not throw
      await expect(
        service.joinWaitingRoom('event_1', 'user_1', 'session_1')
      ).resolves.toBeDefined();
    });

    it('should handle malformed queue data', async () => {
      mockRedis.zRange.mockResolvedValue(['invalid json']);

      await expect(
        service.checkPosition('event_1', 'queue_1')
      ).rejects.toThrow();
    });

    it('should handle large queues efficiently', async () => {
      const largeQueue = Array(10000).fill(null).map((_, i) =>
        JSON.stringify({ queueId: `q${i}`, userId: `user_${i}` })
      );

      mockRedis.zRange.mockResolvedValue(largeQueue);
      mockRedis.sCard.mockResolvedValue(100);

      const result = await service.checkPosition('event_1', 'q5000');

      expect(result.position).toBe(5001);
    });
  });
});
