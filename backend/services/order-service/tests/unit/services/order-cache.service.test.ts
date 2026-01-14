/**
 * Unit Tests: Order Cache Service
 * Tests caching layer with metrics tracking
 */

jest.mock('../../../src/services/redis.service', () => ({
  RedisService: {
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
    getClient: jest.fn(() => ({ incr: jest.fn().mockResolvedValue(1), expire: jest.fn(), keys: jest.fn().mockResolvedValue([]), del: jest.fn(), flushdb: jest.fn() })),
  },
}));

jest.mock('../../../src/utils/logger', () => ({
  logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));

import { OrderCacheService } from '../../../src/services/order-cache.service';
import { RedisService } from '../../../src/services/redis.service';

describe('OrderCacheService', () => {
  let service: OrderCacheService;
  const mockRedis = RedisService as jest.Mocked<typeof RedisService>;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new OrderCacheService();
  });

  describe('getOrder', () => {
    it('should return cached order on hit', async () => {
      const orderData = { order: { id: 'order-123' }, items: [] };
      mockRedis.get.mockResolvedValue(JSON.stringify(orderData));

      const result = await service.getOrder('order-123');

      expect(result).toEqual(orderData);
      expect(mockRedis.get).toHaveBeenCalledWith('order:order-123');
    });

    it('should return null on miss', async () => {
      mockRedis.get.mockResolvedValue(null);

      const result = await service.getOrder('order-123');

      expect(result).toBeNull();
    });

    it('should return null on error', async () => {
      mockRedis.get.mockRejectedValue(new Error('Redis down'));

      const result = await service.getOrder('order-123');

      expect(result).toBeNull();
    });
  });

  describe('setOrder', () => {
    it('should cache order with TTL', async () => {
      const order = { id: 'order-123' } as any;
      const items = [] as any;

      await service.setOrder('order-123', order, items);

      expect(mockRedis.set).toHaveBeenCalledWith('order:order-123', JSON.stringify({ order, items }), 300);
    });
  });

  describe('getUserOrders', () => {
    it('should return cached user orders', async () => {
      const orders = [{ id: 'order-1' }, { id: 'order-2' }];
      mockRedis.get.mockResolvedValue(JSON.stringify(orders));

      const result = await service.getUserOrders('user-123', 'tenant-456');

      expect(result).toEqual(orders);
      expect(mockRedis.get).toHaveBeenCalledWith('user:orders:tenant-456:user-123');
    });
  });

  describe('setUserOrders', () => {
    it('should cache user orders with TTL', async () => {
      const orders = [{ id: 'order-1' }] as any;

      await service.setUserOrders('user-123', 'tenant-456', orders);

      expect(mockRedis.set).toHaveBeenCalledWith('user:orders:tenant-456:user-123', JSON.stringify(orders), 120);
    });
  });

  describe('getUserOrderCount', () => {
    it('should return cached count', async () => {
      mockRedis.get.mockResolvedValue('5');

      const result = await service.getUserOrderCount('user-123', 'tenant-456');

      expect(result).toBe(5);
    });

    it('should return null on miss', async () => {
      mockRedis.get.mockResolvedValue(null);

      const result = await service.getUserOrderCount('user-123', 'tenant-456');

      expect(result).toBeNull();
    });
  });

  describe('incrementUserOrderCount', () => {
    it('should increment and set expiry', async () => {
      const mockClient = { incr: jest.fn().mockResolvedValue(6), expire: jest.fn() };
      mockRedis.getClient.mockReturnValue(mockClient as any);

      const result = await service.incrementUserOrderCount('user-123', 'tenant-456');

      expect(result).toBe(6);
      expect(mockClient.incr).toHaveBeenCalled();
      expect(mockClient.expire).toHaveBeenCalled();
    });
  });

  describe('getRateLimitCount', () => {
    it('should return hourly rate limit count', async () => {
      mockRedis.get.mockResolvedValue('3');

      const result = await service.getRateLimitCount('user-123', 'hourly');

      expect(result).toBe(3);
      expect(mockRedis.get).toHaveBeenCalledWith('ratelimit:hourly:user-123');
    });

    it('should return daily rate limit count', async () => {
      mockRedis.get.mockResolvedValue('15');

      const result = await service.getRateLimitCount('user-123', 'daily');

      expect(result).toBe(15);
      expect(mockRedis.get).toHaveBeenCalledWith('ratelimit:daily:user-123');
    });

    it('should return 0 on miss', async () => {
      mockRedis.get.mockResolvedValue(null);

      const result = await service.getRateLimitCount('user-123', 'hourly');

      expect(result).toBe(0);
    });
  });

  describe('incrementRateLimitCount', () => {
    it('should increment with correct TTL for hourly', async () => {
      const mockClient = { incr: jest.fn().mockResolvedValue(4), expire: jest.fn() };
      mockRedis.getClient.mockReturnValue(mockClient as any);

      const result = await service.incrementRateLimitCount('user-123', 'hourly');

      expect(result).toBe(4);
      expect(mockClient.expire).toHaveBeenCalledWith('ratelimit:hourly:user-123', 3600);
    });

    it('should increment with correct TTL for daily', async () => {
      const mockClient = { incr: jest.fn().mockResolvedValue(10), expire: jest.fn() };
      mockRedis.getClient.mockReturnValue(mockClient as any);

      const result = await service.incrementRateLimitCount('user-123', 'daily');

      expect(result).toBe(10);
      expect(mockClient.expire).toHaveBeenCalledWith('ratelimit:daily:user-123', 86400);
    });
  });

  describe('getAvailability', () => {
    it('should return cached availability', async () => {
      const availability = { 'type-1': 100, 'type-2': 50 };
      mockRedis.get.mockResolvedValue(JSON.stringify(availability));

      const result = await service.getAvailability('event-123');

      expect(result).toEqual(availability);
    });
  });

  describe('setAvailability', () => {
    it('should cache availability with short TTL', async () => {
      const availability = { 'type-1': 100 };

      await service.setAvailability('event-123', availability);

      expect(mockRedis.set).toHaveBeenCalledWith('availability:event-123', JSON.stringify(availability), 30);
    });
  });

  describe('delete operations', () => {
    it('should delete cached order', async () => {
      await service.deleteOrder('order-123');
      expect(mockRedis.del).toHaveBeenCalledWith('order:order-123');
    });

    it('should delete cached user orders', async () => {
      await service.deleteUserOrders('user-123', 'tenant-456');
      expect(mockRedis.del).toHaveBeenCalledWith('user:orders:tenant-456:user-123');
    });

    it('should delete cached availability', async () => {
      await service.deleteAvailability('event-123');
      expect(mockRedis.del).toHaveBeenCalledWith('availability:event-123');
    });
  });

  describe('deleteByPattern', () => {
    it('should delete keys matching pattern', async () => {
      const mockClient = { keys: jest.fn().mockResolvedValue(['key1', 'key2']), del: jest.fn().mockResolvedValue(2) };
      mockRedis.getClient.mockReturnValue(mockClient as any);

      const result = await service.deleteByPattern('order:*');

      expect(result).toBe(2);
      expect(mockClient.keys).toHaveBeenCalledWith('order:*');
      expect(mockClient.del).toHaveBeenCalledWith('key1', 'key2');
    });

    it('should return 0 when no keys match', async () => {
      const mockClient = { keys: jest.fn().mockResolvedValue([]) };
      mockRedis.getClient.mockReturnValue(mockClient as any);

      const result = await service.deleteByPattern('nonexistent:*');

      expect(result).toBe(0);
    });
  });

  describe('getStats', () => {
    it('should return cache statistics', async () => {
      // Perform some operations to generate stats
      mockRedis.get.mockResolvedValueOnce('cached');
      await service.getOrder('order-1');
      mockRedis.get.mockResolvedValueOnce(null);
      await service.getOrder('order-2');

      const stats = service.getStats();

      expect(stats).toHaveProperty('hitRate');
      expect(stats).toHaveProperty('missRate');
      expect(stats).toHaveProperty('totalOperations');
      expect(stats).toHaveProperty('metrics');
    });
  });

  describe('resetMetrics', () => {
    it('should reset all metrics', async () => {
      mockRedis.get.mockResolvedValue('cached');
      await service.getOrder('order-1');

      service.resetMetrics();
      const stats = service.getStats();

      expect(stats.totalOperations).toBe(0);
    });
  });
});
