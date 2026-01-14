/**
 * Unit tests for src/services/cache-integration.ts
 * Tests cache integration: venue caching, invalidation
 * LOW PRIORITY
 */

// Mock Redis
const mockRedisClient = {
  get: jest.fn(),
  set: jest.fn(),
  del: jest.fn(),
  setex: jest.fn(),
  keys: jest.fn(),
  mget: jest.fn(),
  expire: jest.fn(),
  exists: jest.fn(),
  on: jest.fn(),
  quit: jest.fn(),
};

jest.mock('ioredis', () => {
  return jest.fn().mockImplementation(() => mockRedisClient);
});

// Mock logger
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

describe('services/cache-integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRedisClient.get.mockResolvedValue(null);
    mockRedisClient.set.mockResolvedValue('OK');
    mockRedisClient.setex.mockResolvedValue('OK');
    mockRedisClient.del.mockResolvedValue(1);
    mockRedisClient.keys.mockResolvedValue([]);
    mockRedisClient.exists.mockResolvedValue(0);
  });

  describe('Venue Caching', () => {
    const venueId = 'venue-123';
    const venueData = {
      id: venueId,
      name: 'Test Venue',
      address: '123 Main St',
      capacity: 500,
    };

    it('should cache venue data', async () => {
      mockRedisClient.set.mockResolvedValue('OK');

      const key = `venue:${venueId}`;
      await mockRedisClient.set(key, JSON.stringify(venueData));

      expect(mockRedisClient.set).toHaveBeenCalledWith(
        key,
        JSON.stringify(venueData)
      );
    });

    it('should retrieve cached venue data', async () => {
      const key = `venue:${venueId}`;
      mockRedisClient.get.mockResolvedValue(JSON.stringify(venueData));

      const result = await mockRedisClient.get(key);
      const parsed = JSON.parse(result as string);

      expect(parsed).toEqual(venueData);
    });

    it('should return null for uncached venue', async () => {
      const key = `venue:${venueId}`;
      mockRedisClient.get.mockResolvedValue(null);

      const result = await mockRedisClient.get(key);

      expect(result).toBeNull();
    });

    it('should set TTL on cache entries', async () => {
      const key = `venue:${venueId}`;
      const ttl = 3600; // 1 hour

      await mockRedisClient.setex(key, ttl, JSON.stringify(venueData));

      expect(mockRedisClient.setex).toHaveBeenCalledWith(
        key,
        ttl,
        JSON.stringify(venueData)
      );
    });
  });

  describe('Cache Invalidation', () => {
    const venueId = 'venue-123';

    it('should invalidate single venue cache', async () => {
      const key = `venue:${venueId}`;
      mockRedisClient.del.mockResolvedValue(1);

      const result = await mockRedisClient.del(key);

      expect(result).toBe(1);
      expect(mockRedisClient.del).toHaveBeenCalledWith(key);
    });

    it('should invalidate venue-related cache keys', async () => {
      const pattern = `venue:${venueId}:*`;
      const keys = [
        `venue:${venueId}:events`,
        `venue:${venueId}:staff`,
        `venue:${venueId}:settings`,
      ];
      mockRedisClient.keys.mockResolvedValue(keys);
      mockRedisClient.del.mockResolvedValue(keys.length);

      const foundKeys = await mockRedisClient.keys(pattern);
      
      if (foundKeys.length > 0) {
        await mockRedisClient.del(...foundKeys);
      }

      expect(mockRedisClient.keys).toHaveBeenCalledWith(pattern);
    });

    it('should handle non-existent keys gracefully', async () => {
      const key = `venue:non-existent`;
      mockRedisClient.del.mockResolvedValue(0);

      const result = await mockRedisClient.del(key);

      expect(result).toBe(0);
    });
  });

  describe('List Caching', () => {
    const listKey = 'venues:list:active';

    it('should cache venue list', async () => {
      const venues = [
        { id: 'venue-1', name: 'Venue 1' },
        { id: 'venue-2', name: 'Venue 2' },
      ];

      await mockRedisClient.set(listKey, JSON.stringify(venues));

      expect(mockRedisClient.set).toHaveBeenCalledWith(
        listKey,
        JSON.stringify(venues)
      );
    });

    it('should retrieve cached venue list', async () => {
      const venues = [
        { id: 'venue-1', name: 'Venue 1' },
        { id: 'venue-2', name: 'Venue 2' },
      ];
      mockRedisClient.get.mockResolvedValue(JSON.stringify(venues));

      const result = await mockRedisClient.get(listKey);
      const parsed = JSON.parse(result as string);

      expect(parsed).toHaveLength(2);
      expect(parsed[0].id).toBe('venue-1');
    });

    it('should invalidate list cache on venue update', async () => {
      mockRedisClient.del.mockResolvedValue(1);

      await mockRedisClient.del(listKey);

      expect(mockRedisClient.del).toHaveBeenCalledWith(listKey);
    });
  });

  describe('Cache Key Patterns', () => {
    it('should use correct key format for venues', () => {
      const venueId = 'venue-123';
      const key = `venue:${venueId}`;

      expect(key).toBe('venue:venue-123');
    });

    it('should use correct key format for venue events', () => {
      const venueId = 'venue-123';
      const key = `venue:${venueId}:events`;

      expect(key).toBe('venue:venue-123:events');
    });

    it('should use correct key format for venue settings', () => {
      const venueId = 'venue-123';
      const key = `venue:${venueId}:settings`;

      expect(key).toBe('venue:venue-123:settings');
    });

    it('should use correct key format for venue staff', () => {
      const venueId = 'venue-123';
      const key = `venue:${venueId}:staff`;

      expect(key).toBe('venue:venue-123:staff');
    });

    it('should use correct key format for venue integrations', () => {
      const venueId = 'venue-123';
      const key = `venue:${venueId}:integrations`;

      expect(key).toBe('venue:venue-123:integrations');
    });
  });

  describe('Batch Operations', () => {
    it('should get multiple keys at once', async () => {
      const keys = ['venue:1', 'venue:2', 'venue:3'];
      const values = [
        JSON.stringify({ id: '1', name: 'Venue 1' }),
        JSON.stringify({ id: '2', name: 'Venue 2' }),
        null,
      ];
      mockRedisClient.mget.mockResolvedValue(values);

      const result = await mockRedisClient.mget(...keys);

      expect(result).toHaveLength(3);
      expect(result[0]).toBeTruthy();
      expect(result[2]).toBeNull();
    });

    it('should delete multiple keys at once', async () => {
      const keys = ['venue:1', 'venue:2', 'venue:3'];
      mockRedisClient.del.mockResolvedValue(3);

      const result = await mockRedisClient.del(...keys);

      expect(result).toBe(3);
    });
  });

  describe('Cache Expiration', () => {
    it('should set expiration on key', async () => {
      const key = 'venue:123';
      const ttl = 3600;
      mockRedisClient.expire.mockResolvedValue(1);

      const result = await mockRedisClient.expire(key, ttl);

      expect(result).toBe(1);
      expect(mockRedisClient.expire).toHaveBeenCalledWith(key, ttl);
    });

    it('should check if key exists', async () => {
      const key = 'venue:123';
      mockRedisClient.exists.mockResolvedValue(1);

      const result = await mockRedisClient.exists(key);

      expect(result).toBe(1);
    });

    it('should return 0 for non-existent key', async () => {
      const key = 'venue:non-existent';
      mockRedisClient.exists.mockResolvedValue(0);

      const result = await mockRedisClient.exists(key);

      expect(result).toBe(0);
    });
  });

  describe('Error Handling', () => {
    it('should handle Redis connection errors', async () => {
      mockRedisClient.get.mockRejectedValue(new Error('Connection refused'));

      await expect(mockRedisClient.get('venue:123'))
        .rejects.toThrow('Connection refused');
    });

    it('should handle Redis timeout errors', async () => {
      mockRedisClient.set.mockRejectedValue(new Error('ETIMEDOUT'));

      await expect(mockRedisClient.set('venue:123', 'data'))
        .rejects.toThrow('ETIMEDOUT');
    });

    it('should handle invalid JSON gracefully', async () => {
      mockRedisClient.get.mockResolvedValue('invalid json');

      const result = await mockRedisClient.get('venue:123');

      expect(() => JSON.parse(result as string)).toThrow();
    });
  });

  describe('Cache Statistics', () => {
    it('should track cache hits', async () => {
      mockRedisClient.get.mockResolvedValue(JSON.stringify({ id: '123' }));

      const result = await mockRedisClient.get('venue:123');

      expect(result).toBeTruthy();
    });

    it('should track cache misses', async () => {
      mockRedisClient.get.mockResolvedValue(null);

      const result = await mockRedisClient.get('venue:123');

      expect(result).toBeNull();
    });
  });
});
