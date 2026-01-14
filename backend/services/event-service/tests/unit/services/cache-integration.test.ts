/**
 * Unit tests for ServiceCache (cache-integration)
 * Tests caching operations, pattern matching, and error handling
 */

// Mock ioredis before importing the service
const mockRedisInstance = {
  get: jest.fn().mockResolvedValue(null),
  setex: jest.fn().mockResolvedValue('OK'),
  del: jest.fn().mockResolvedValue(1),
  keys: jest.fn().mockResolvedValue([]),
  flushdb: jest.fn().mockResolvedValue('OK'),
  status: 'ready',
};

jest.mock('ioredis', () => {
  return jest.fn().mockImplementation(() => mockRedisInstance);
});

// Mock logger
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

// Import after mocks are set up
import { serviceCache } from '../../../src/services/cache-integration';

describe('ServiceCache', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRedisInstance.get.mockResolvedValue(null);
    mockRedisInstance.setex.mockResolvedValue('OK');
    mockRedisInstance.del.mockResolvedValue(1);
    mockRedisInstance.keys.mockResolvedValue([]);
    mockRedisInstance.status = 'ready';
  });

  describe('get', () => {
    it('should return parsed JSON value', async () => {
      const data = { id: '123', name: 'Test Event' };
      mockRedisInstance.get.mockResolvedValue(JSON.stringify(data));

      const result = await serviceCache.get('event:123');

      expect(mockRedisInstance.get).toHaveBeenCalledWith('event:123');
      expect(result).toEqual(data);
    });

    it('should return null for missing key', async () => {
      mockRedisInstance.get.mockResolvedValue(null);

      const result = await serviceCache.get('non-existent');

      expect(result).toBeNull();
    });

    it('should handle complex objects', async () => {
      const complexData = {
        event: { id: '123', name: 'Concert' },
        schedules: [{ starts_at: '2026-01-01' }],
        nested: { deep: { value: 42 } },
      };
      mockRedisInstance.get.mockResolvedValue(JSON.stringify(complexData));

      const result = await serviceCache.get('complex-key');

      expect(result).toEqual(complexData);
    });

    it('should handle arrays', async () => {
      const arrayData = [{ id: 1 }, { id: 2 }, { id: 3 }];
      mockRedisInstance.get.mockResolvedValue(JSON.stringify(arrayData));

      const result = await serviceCache.get('array-key');

      expect(result).toEqual(arrayData);
    });

    it('should return null on Redis error', async () => {
      mockRedisInstance.get.mockRejectedValue(new Error('Connection refused'));

      const result = await serviceCache.get('error-key');

      expect(result).toBeNull();
    });

    it('should return null on JSON parse error', async () => {
      mockRedisInstance.get.mockResolvedValue('invalid json {');

      const result = await serviceCache.get('invalid-json');

      expect(result).toBeNull();
    });
  });

  describe('set', () => {
    it('should set value with default TTL', async () => {
      const data = { id: '123' };

      await serviceCache.set('key', data);

      expect(mockRedisInstance.setex).toHaveBeenCalledWith(
        'key',
        3600, // default TTL
        JSON.stringify(data)
      );
    });

    it('should set value with custom TTL', async () => {
      const data = { id: '123' };

      await serviceCache.set('key', data, 7200);

      expect(mockRedisInstance.setex).toHaveBeenCalledWith(
        'key',
        7200,
        JSON.stringify(data)
      );
    });

    it('should serialize objects to JSON', async () => {
      const complexData = {
        nested: { value: true },
        array: [1, 2, 3],
      };

      await serviceCache.set('complex', complexData);

      expect(mockRedisInstance.setex).toHaveBeenCalledWith(
        'complex',
        3600,
        JSON.stringify(complexData)
      );
    });

    it('should handle Redis errors gracefully', async () => {
      mockRedisInstance.setex.mockRejectedValue(new Error('Connection refused'));

      // Should not throw
      await expect(serviceCache.set('key', { data: 'test' })).resolves.not.toThrow();
    });

    it('should handle null values', async () => {
      await serviceCache.set('null-key', null);

      expect(mockRedisInstance.setex).toHaveBeenCalledWith(
        'null-key',
        3600,
        'null'
      );
    });

    it('should handle primitive values', async () => {
      await serviceCache.set('number-key', 42);

      expect(mockRedisInstance.setex).toHaveBeenCalledWith(
        'number-key',
        3600,
        '42'
      );
    });
  });

  describe('delete', () => {
    it('should delete single key', async () => {
      await serviceCache.delete('single-key');

      expect(mockRedisInstance.del).toHaveBeenCalledWith('single-key');
    });

    it('should delete multiple keys', async () => {
      await serviceCache.delete(['key1', 'key2', 'key3']);

      expect(mockRedisInstance.del).toHaveBeenCalledTimes(3);
      expect(mockRedisInstance.del).toHaveBeenCalledWith('key1');
      expect(mockRedisInstance.del).toHaveBeenCalledWith('key2');
      expect(mockRedisInstance.del).toHaveBeenCalledWith('key3');
    });

    it('should handle wildcard patterns', async () => {
      mockRedisInstance.keys.mockResolvedValue(['event:1', 'event:2', 'event:3']);

      await serviceCache.delete('event:*');

      expect(mockRedisInstance.keys).toHaveBeenCalledWith('event:*');
      expect(mockRedisInstance.del).toHaveBeenCalledWith('event:1', 'event:2', 'event:3');
    });

    it('should not call del when no keys match pattern', async () => {
      mockRedisInstance.keys.mockResolvedValue([]);

      await serviceCache.delete('non-existent:*');

      expect(mockRedisInstance.keys).toHaveBeenCalledWith('non-existent:*');
      expect(mockRedisInstance.del).not.toHaveBeenCalled();
    });

    it('should handle mixed patterns and keys', async () => {
      mockRedisInstance.keys.mockResolvedValue(['pattern:1', 'pattern:2']);

      await serviceCache.delete(['exact-key', 'pattern:*']);

      expect(mockRedisInstance.del).toHaveBeenCalledWith('exact-key');
      expect(mockRedisInstance.keys).toHaveBeenCalledWith('pattern:*');
    });

    it('should handle Redis errors gracefully', async () => {
      mockRedisInstance.del.mockRejectedValue(new Error('Connection refused'));

      // Should not throw
      await expect(serviceCache.delete('key')).resolves.not.toThrow();
    });
  });

  describe('invalidateCache', () => {
    it('should call delete for single pattern', async () => {
      mockRedisInstance.keys.mockResolvedValue(['venue:1', 'venue:2']);

      await serviceCache.invalidateCache('venue:*');

      expect(mockRedisInstance.keys).toHaveBeenCalledWith('venue:*');
    });

    it('should call delete for multiple patterns', async () => {
      mockRedisInstance.keys
        .mockResolvedValueOnce(['event:1'])
        .mockResolvedValueOnce(['venue:1']);

      await serviceCache.invalidateCache(['event:*', 'venue:*']);

      expect(mockRedisInstance.keys).toHaveBeenCalledWith('event:*');
      expect(mockRedisInstance.keys).toHaveBeenCalledWith('venue:*');
    });
  });

  describe('flush', () => {
    it('should flush entire cache', async () => {
      await serviceCache.flush();

      expect(mockRedisInstance.flushdb).toHaveBeenCalled();
    });

    it('should handle Redis errors gracefully', async () => {
      mockRedisInstance.flushdb.mockRejectedValue(new Error('Not authorized'));

      // Should not throw
      await expect(serviceCache.flush()).resolves.not.toThrow();
    });
  });

  describe('getStats', () => {
    it('should return connected true when ready', () => {
      mockRedisInstance.status = 'ready';

      const result = serviceCache.getStats();

      expect(result.connected).toBe(true);
    });

    it('should return connected false when not ready', () => {
      mockRedisInstance.status = 'connecting';

      const result = serviceCache.getStats();

      expect(result.connected).toBe(false);
    });

    it('should return connected false when disconnected', () => {
      mockRedisInstance.status = 'end';

      const result = serviceCache.getStats();

      expect(result.connected).toBe(false);
    });
  });

  describe('caching patterns', () => {
    it('should cache event data', async () => {
      const eventData = {
        id: 'event-123',
        name: 'Concert',
        venue_id: 'venue-1',
        status: 'PUBLISHED',
      };

      await serviceCache.set('event:event-123', eventData);
      mockRedisInstance.get.mockResolvedValue(JSON.stringify(eventData));

      const result = await serviceCache.get('event:event-123');

      expect(result).toEqual(eventData);
    });

    it('should cache venue events list', async () => {
      const venueEvents = [
        { id: 'event-1', name: 'Event 1' },
        { id: 'event-2', name: 'Event 2' },
      ];

      await serviceCache.set('venue:events:venue-123', venueEvents);
      mockRedisInstance.get.mockResolvedValue(JSON.stringify(venueEvents));

      const result = await serviceCache.get('venue:events:venue-123');

      expect(result).toEqual(venueEvents);
    });

    it('should invalidate on event update', async () => {
      mockRedisInstance.keys.mockResolvedValue(['venue:events:venue-123']);

      await serviceCache.delete(['event:event-123', 'venue:events:*']);

      expect(mockRedisInstance.del).toHaveBeenCalledWith('event:event-123');
    });
  });

  describe('edge cases', () => {
    it('should handle empty string value', async () => {
      mockRedisInstance.get.mockResolvedValue('""');

      const result = await serviceCache.get('empty-string');

      expect(result).toBe('');
    });

    it('should handle boolean values', async () => {
      await serviceCache.set('bool-key', true);

      expect(mockRedisInstance.setex).toHaveBeenCalledWith(
        'bool-key',
        3600,
        'true'
      );
    });

    it('should handle zero TTL (immediate expiry)', async () => {
      await serviceCache.set('zero-ttl', { data: 'test' }, 0);

      expect(mockRedisInstance.setex).toHaveBeenCalledWith(
        'zero-ttl',
        0,
        expect.any(String)
      );
    });

    it('should handle very long keys', async () => {
      const longKey = 'a'.repeat(1000);

      await serviceCache.set(longKey, { data: 'test' });

      expect(mockRedisInstance.setex).toHaveBeenCalledWith(
        longKey,
        3600,
        expect.any(String)
      );
    });

    it('should handle special characters in keys', async () => {
      const specialKey = 'event:123:schedule:456:pricing';

      await serviceCache.set(specialKey, { price: 50 });

      expect(mockRedisInstance.setex).toHaveBeenCalledWith(
        specialKey,
        3600,
        expect.any(String)
      );
    });
  });
});
