/**
 * Session Model Unit Tests
 */

const mockSessionCreate = jest.fn();
const mockSessionGet = jest.fn();
const mockSessionUpdate = jest.fn();
const mockSessionDelete = jest.fn();

const mockSessionManager = {
  createSession: mockSessionCreate,
  getSession: mockSessionGet,
  updateSession: mockSessionUpdate,
  deleteSession: mockSessionDelete,
};

const mockScanKeys = jest.fn();
const mockScanner = {
  scanKeys: mockScanKeys,
};

const mockRedisGet = jest.fn();
const mockRedisSet = jest.fn();
const mockRedisSadd = jest.fn();
const mockRedisSrem = jest.fn();
const mockRedisSmembers = jest.fn();
const mockRedisExpire = jest.fn();

const mockRedis = {
  get: mockRedisGet,
  set: mockRedisSet,
  sadd: mockRedisSadd,
  srem: mockRedisSrem,
  smembers: mockRedisSmembers,
  expire: mockRedisExpire,
};

jest.mock('@tickettoken/shared', () => ({
  getSessionManager: () => mockSessionManager,
  getScanner: () => mockScanner,
}));

jest.mock('../../../../src/config/redis', () => ({
  getRedis: () => mockRedis,
}));

jest.mock('uuid', () => ({
  v4: jest.fn(() => 'test-session-uuid'),
}));

import { SessionModel, AnalyticsSession } from '../../../../src/models/redis/session.model';

describe('SessionModel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSessionCreate.mockResolvedValue(undefined);
    mockRedisSadd.mockResolvedValue(1);
    mockRedisExpire.mockResolvedValue(1);
    mockRedisSet.mockResolvedValue('OK');
  });

  describe('createSession', () => {
    it('should create session with generated ID', async () => {
      const result = await SessionModel.createSession('user-1', 'venue-1');

      expect(result.sessionId).toBe('test-session-uuid');
      expect(result.userId).toBe('user-1');
      expect(result.venueId).toBe('venue-1');
      expect(result.pageViews).toBe(0);
      expect(result.events).toEqual([]);
      expect(result.startTime).toBeInstanceOf(Date);
    });

    it('should store session using session manager', async () => {
      await SessionModel.createSession('user-1', 'venue-1', { source: 'web' });

      expect(mockSessionCreate).toHaveBeenCalledWith(
        'test-session-uuid',
        'user-1',
        { venueId: 'venue-1', metadata: { source: 'web' } },
        1800 // SESSION_TTL
      );
    });

    it('should add session to user sessions set', async () => {
      await SessionModel.createSession('user-1', 'venue-1');

      expect(mockRedisSadd).toHaveBeenCalledWith('user:sessions:user-1', 'test-session-uuid');
      expect(mockRedisExpire).toHaveBeenCalledWith('user:sessions:user-1', 1800);
    });

    it('should include metadata if provided', async () => {
      const metadata = { browser: 'Chrome', device: 'desktop' };

      const result = await SessionModel.createSession('user-1', 'venue-1', metadata);

      expect(result.metadata).toEqual(metadata);
    });
  });

  describe('getSession', () => {
    it('should return session data', async () => {
      const sessionData = {
        sessionId: 'session-1',
        userId: 'user-1',
        venueId: 'venue-1',
        startTime: new Date(),
        lastActivity: new Date(),
        pageViews: 5,
        events: [{ type: 'click', timestamp: new Date() }],
        metadata: {},
      };
      mockSessionGet.mockResolvedValue(sessionData);

      const result = await SessionModel.getSession('session-1');

      expect(result).toMatchObject({
        sessionId: 'session-1',
        userId: 'user-1',
        venueId: 'venue-1',
        pageViews: 5,
      });
      expect(mockSessionGet).toHaveBeenCalledWith('session-1');
    });

    it('should return null if session not found', async () => {
      mockSessionGet.mockResolvedValue(null);

      const result = await SessionModel.getSession('non-existent');

      expect(result).toBeNull();
    });

    it('should handle missing optional fields', async () => {
      mockSessionGet.mockResolvedValue({
        sessionId: 'session-1',
        userId: 'user-1',
        startTime: new Date(),
        lastActivity: new Date(),
      });

      const result = await SessionModel.getSession('session-1');

      expect(result?.venueId).toBe('');
      expect(result?.pageViews).toBe(0);
      expect(result?.events).toEqual([]);
    });
  });

  describe('updateSession', () => {
    it('should update session with new data', async () => {
      mockSessionGet.mockResolvedValue({
        sessionId: 'session-1',
        userId: 'user-1',
        venueId: 'venue-1',
        startTime: new Date(),
        lastActivity: new Date(),
        pageViews: 5,
        events: [],
      });
      mockSessionUpdate.mockResolvedValue(undefined);

      await SessionModel.updateSession('session-1', { pageViews: 10 });

      expect(mockSessionUpdate).toHaveBeenCalledWith(
        'session-1',
        expect.objectContaining({
          pageViews: 10,
          lastActivity: expect.any(Date),
        })
      );
    });

    it('should throw error if session not found', async () => {
      mockSessionGet.mockResolvedValue(null);

      await expect(SessionModel.updateSession('non-existent', {}))
        .rejects.toThrow('Session not found');
    });
  });

  describe('trackEvent', () => {
    it('should add event to session', async () => {
      mockSessionGet.mockResolvedValue({
        sessionId: 'session-1',
        userId: 'user-1',
        venueId: 'venue-1',
        startTime: new Date(),
        lastActivity: new Date(),
        pageViews: 0,
        events: [],
      });
      mockSessionUpdate.mockResolvedValue(undefined);

      await SessionModel.trackEvent('session-1', 'button_click', { button: 'submit' });

      expect(mockSessionUpdate).toHaveBeenCalledWith(
        'session-1',
        expect.objectContaining({
          events: expect.arrayContaining([
            expect.objectContaining({
              type: 'button_click',
              data: { button: 'submit' },
            }),
          ]),
        })
      );
    });

    it('should increment pageViews for page_view event', async () => {
      mockSessionGet.mockResolvedValue({
        sessionId: 'session-1',
        userId: 'user-1',
        venueId: 'venue-1',
        startTime: new Date(),
        lastActivity: new Date(),
        pageViews: 5,
        events: [],
      });
      mockSessionUpdate.mockResolvedValue(undefined);

      await SessionModel.trackEvent('session-1', 'page_view');

      expect(mockSessionUpdate).toHaveBeenCalledWith(
        'session-1',
        expect.objectContaining({
          pageViews: 6,
        })
      );
    });

    it('should not increment pageViews for non page_view events', async () => {
      mockSessionGet.mockResolvedValue({
        sessionId: 'session-1',
        userId: 'user-1',
        venueId: 'venue-1',
        startTime: new Date(),
        lastActivity: new Date(),
        pageViews: 5,
        events: [],
      });
      mockSessionUpdate.mockResolvedValue(undefined);

      await SessionModel.trackEvent('session-1', 'click');

      expect(mockSessionUpdate).toHaveBeenCalledWith(
        'session-1',
        expect.objectContaining({
          pageViews: 5,
        })
      );
    });

    it('should throw error if session not found', async () => {
      mockSessionGet.mockResolvedValue(null);

      await expect(SessionModel.trackEvent('non-existent', 'click'))
        .rejects.toThrow('Session not found');
    });
  });

  describe('getUserSessions', () => {
    it('should return user session IDs', async () => {
      mockRedisSmembers.mockResolvedValue(['session-1', 'session-2', 'session-3']);

      const result = await SessionModel.getUserSessions('user-1');

      expect(result).toEqual(['session-1', 'session-2', 'session-3']);
      expect(mockRedisSmembers).toHaveBeenCalledWith('user:sessions:user-1');
    });

    it('should return empty array if no sessions', async () => {
      mockRedisSmembers.mockResolvedValue([]);

      const result = await SessionModel.getUserSessions('user-no-sessions');

      expect(result).toEqual([]);
    });
  });

  describe('getActiveSessions', () => {
    it('should count active sessions for venue', async () => {
      mockScanKeys.mockResolvedValue(['session:s1', 'session:s2', 'session:s3']);
      mockSessionGet
        .mockResolvedValueOnce({ venueId: 'venue-1' })
        .mockResolvedValueOnce({ venueId: 'venue-2' })
        .mockResolvedValueOnce({ venueId: 'venue-1' });

      const result = await SessionModel.getActiveSessions('venue-1');

      expect(result).toBe(2);
      expect(mockScanKeys).toHaveBeenCalledWith('session:*');
    });

    it('should return 0 if no active sessions', async () => {
      mockScanKeys.mockResolvedValue([]);

      const result = await SessionModel.getActiveSessions('venue-1');

      expect(result).toBe(0);
    });
  });

  describe('endSession', () => {
    it('should end session and store summary', async () => {
      const startTime = new Date(Date.now() - 60000); // 1 minute ago
      mockSessionGet.mockResolvedValue({
        sessionId: 'session-1',
        userId: 'user-1',
        venueId: 'venue-1',
        startTime,
        lastActivity: new Date(),
        pageViews: 10,
        events: [{ type: 'click' }, { type: 'view' }],
      });
      mockRedisSrem.mockResolvedValue(1);
      mockSessionDelete.mockResolvedValue(undefined);

      await SessionModel.endSession('session-1');

      expect(mockRedisSrem).toHaveBeenCalledWith('user:sessions:user-1', 'session-1');
      expect(mockRedisSet).toHaveBeenCalledWith(
        'session:summary:session-1',
        expect.stringContaining('"pageViews":10')
      );
      expect(mockRedisExpire).toHaveBeenCalledWith('session:summary:session-1', 86400);
      expect(mockSessionDelete).toHaveBeenCalledWith('session-1');
    });

    it('should do nothing if session not found', async () => {
      mockSessionGet.mockResolvedValue(null);

      await SessionModel.endSession('non-existent');

      expect(mockRedisSrem).not.toHaveBeenCalled();
      expect(mockSessionDelete).not.toHaveBeenCalled();
    });
  });

  describe('getSessionMetrics', () => {
    it('should aggregate session metrics for venue', async () => {
      mockScanKeys.mockResolvedValue(['session:summary:s1', 'session:summary:s2']);
      mockRedisGet
        .mockResolvedValueOnce(JSON.stringify({
          venueId: 'venue-1',
          duration: 60000,
          pageViews: 5,
        }))
        .mockResolvedValueOnce(JSON.stringify({
          venueId: 'venue-1',
          duration: 120000,
          pageViews: 10,
        }));

      const result = await SessionModel.getSessionMetrics('venue-1');

      expect(result.totalSessions).toBe(2);
      expect(result.averageDuration).toBe(90000); // (60000 + 120000) / 2
      expect(result.averagePageViews).toBe(7.5); // (5 + 10) / 2
    });

    it('should exclude sessions from other venues', async () => {
      mockScanKeys.mockResolvedValue(['session:summary:s1', 'session:summary:s2']);
      mockRedisGet
        .mockResolvedValueOnce(JSON.stringify({
          venueId: 'venue-1',
          duration: 60000,
          pageViews: 5,
        }))
        .mockResolvedValueOnce(JSON.stringify({
          venueId: 'venue-2',
          duration: 120000,
          pageViews: 10,
        }));

      const result = await SessionModel.getSessionMetrics('venue-1');

      expect(result.totalSessions).toBe(1);
      expect(result.averagePageViews).toBe(5);
    });

    it('should return zeros if no sessions', async () => {
      mockScanKeys.mockResolvedValue([]);

      const result = await SessionModel.getSessionMetrics('venue-1');

      expect(result.totalSessions).toBe(0);
      expect(result.averageDuration).toBe(0);
      expect(result.averagePageViews).toBe(0);
    });
  });
});
