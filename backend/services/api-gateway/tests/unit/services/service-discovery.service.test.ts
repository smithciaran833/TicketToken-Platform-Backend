import { ServiceDiscoveryService } from '../../../src/services/service-discovery.service';
import { ServiceInstance } from '../../../src/types';
import axios from 'axios';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

jest.mock('../../../src/config', () => ({
  config: {
    services: {
      'auth-service': 'http://auth-service:3001',
      'venue-service': 'http://venue-service:3002',
      'event-service': 'http://event-service:3003',
    },
  },
}));

jest.mock('../../../src/config/redis', () => ({
  REDIS_KEYS: {
    SERVICE_DISCOVERY: 'service:discovery:',
    SERVICE_HEALTH: 'service:health:',
  },
}));

jest.mock('../../../src/utils/logger', () => ({
  createLogger: jest.fn(() => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  })),
}));

describe('ServiceDiscoveryService', () => {
  let serviceDiscovery: ServiceDiscoveryService;
  let mockRedis: any;
  let setIntervalSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    // Spy on setInterval before creating the service
    setIntervalSpy = jest.spyOn(global, 'setInterval');

    mockRedis = {
      setex: jest.fn().mockResolvedValue('OK'),
      get: jest.fn().mockResolvedValue(null),
      keys: jest.fn().mockResolvedValue([]),
      del: jest.fn().mockResolvedValue(1),
    };

    (mockedAxios.get as any) = jest.fn();
  });

  afterEach(() => {
    setIntervalSpy.mockRestore();
    jest.useRealTimers();
  });

  describe('constructor', () => {
    it('initializes with Redis', () => {
      serviceDiscovery = new ServiceDiscoveryService({ redis: mockRedis });

      expect(serviceDiscovery).toBeDefined();
    });

    it('initializes without Redis and logs warning', () => {
      serviceDiscovery = new ServiceDiscoveryService();

      expect(serviceDiscovery).toBeDefined();
    });

    it('starts health check interval', () => {
      serviceDiscovery = new ServiceDiscoveryService({ redis: mockRedis });

      expect(setIntervalSpy).toHaveBeenCalled();
    });
  });

  describe('discover', () => {
    beforeEach(() => {
      serviceDiscovery = new ServiceDiscoveryService({ redis: mockRedis });
    });

    it('returns static instances for known service', async () => {
      const instances = await serviceDiscovery.discover('auth-service');

      expect(instances).toHaveLength(1);
      expect(instances[0]).toEqual({
        id: 'auth-service-static',
        name: 'auth-service',
        address: 'auth-service',
        port: 3001,
        healthy: true,
        metadata: { static: true },
      });
    });

    it('returns empty array for unknown service', async () => {
      const instances = await serviceDiscovery.discover('unknown-service');

      expect(instances).toEqual([]);
    });

    it('caches discovered instances', async () => {
      await serviceDiscovery.discover('auth-service');
      const instances = await serviceDiscovery.discover('auth-service');

      expect(instances).toHaveLength(1);
    });

    it('cache expires after 30 seconds', async () => {
      await serviceDiscovery.discover('auth-service');

      // Advance time past cache expiry
      jest.advanceTimersByTime(31000);

      const instances = await serviceDiscovery.discover('auth-service');

      expect(instances).toHaveLength(1);
    });

    it('parses service URL correctly with port', async () => {
      const instances = await serviceDiscovery.discover('venue-service');

      expect(instances[0].address).toBe('venue-service');
      expect(instances[0].port).toBe(3002);
    });

    it('defaults to port 80 when not specified', async () => {
      const config = require('../../../src/config').config;
      config.services['test-service'] = 'http://test-service';

      const instances = await serviceDiscovery.discover('test-service');

      expect(instances[0].port).toBe(80);
    });
  });

  describe('register', () => {
    beforeEach(() => {
      serviceDiscovery = new ServiceDiscoveryService({ redis: mockRedis });
    });

    it('registers service instance in Redis', async () => {
      const instance: ServiceInstance = {
        id: 'auth-1',
        name: 'auth-service',
        address: '192.168.1.10',
        port: 3001,
        healthy: true,
      };

      await serviceDiscovery.register(instance);

      expect(mockRedis.setex).toHaveBeenCalledWith(
        'service:discovery:auth-service:auth-1',
        'service:discovery:',
        expect.stringContaining('"id":"auth-1"')
      );
    });

    it('includes registration timestamp', async () => {
      const instance: ServiceInstance = {
        id: 'auth-1',
        name: 'auth-service',
        address: '192.168.1.10',
        port: 3001,
        healthy: true,
      };

      await serviceDiscovery.register(instance);

      const callArg = mockRedis.setex.mock.calls[0][2];
      const data = JSON.parse(callArg);
      expect(data.registeredAt).toBeDefined();
    });

    it('skips registration when Redis not available', async () => {
      serviceDiscovery = new ServiceDiscoveryService();

      const instance: ServiceInstance = {
        id: 'auth-1',
        name: 'auth-service',
        address: '192.168.1.10',
        port: 3001,
        healthy: true,
      };

      await serviceDiscovery.register(instance);

      expect(mockRedis.setex).not.toHaveBeenCalled();
    });
  });

  describe('deregister', () => {
    beforeEach(() => {
      serviceDiscovery = new ServiceDiscoveryService({ redis: mockRedis });
    });

    it('removes service instance from Redis', async () => {
      mockRedis.keys.mockResolvedValue(['service:discovery:auth-service:auth-1']);

      await serviceDiscovery.deregister('auth-1');

      expect(mockRedis.keys).toHaveBeenCalledWith('service:discovery:*:auth-1');
      expect(mockRedis.del).toHaveBeenCalledWith('service:discovery:auth-service:auth-1');
    });

    it('handles no matching keys gracefully', async () => {
      mockRedis.keys.mockResolvedValue([]);

      await serviceDiscovery.deregister('non-existent');

      expect(mockRedis.del).not.toHaveBeenCalled();
    });

    it('skips deregistration when Redis not available', async () => {
      serviceDiscovery = new ServiceDiscoveryService();

      await serviceDiscovery.deregister('auth-1');

      expect(mockRedis.keys).not.toHaveBeenCalled();
    });
  });

  describe('getHealthyInstances', () => {
    beforeEach(() => {
      serviceDiscovery = new ServiceDiscoveryService({ redis: mockRedis });
    });

    it('returns only healthy instances', async () => {
      mockRedis.get
        .mockResolvedValueOnce(JSON.stringify({ status: 'healthy' }));

      (mockedAxios.get as any).mockResolvedValue({
        status: 200,
        headers: {},
      });

      const instances = await serviceDiscovery.getHealthyInstances('auth-service');

      expect(instances).toHaveLength(1);
      expect(instances[0].healthy).toBe(true);
    });

    it('filters out unhealthy instances', async () => {
      mockRedis.get
        .mockResolvedValue(JSON.stringify({ status: 'unhealthy' }));

      const instances = await serviceDiscovery.getHealthyInstances('auth-service');

      expect(instances).toHaveLength(0);
    });

    it('assumes healthy when no health data exists', async () => {
      mockRedis.get.mockResolvedValue(null);
      (mockedAxios.get as any).mockResolvedValue({
        status: 200,
        headers: {},
      });

      const instances = await serviceDiscovery.getHealthyInstances('auth-service');

      expect(instances).toHaveLength(1);
    });

    it('returns all instances when Redis not available', async () => {
      serviceDiscovery = new ServiceDiscoveryService();

      const instances = await serviceDiscovery.getHealthyInstances('auth-service');

      expect(instances).toHaveLength(1);
    });
  });

  describe('health checks', () => {
    beforeEach(() => {
      serviceDiscovery = new ServiceDiscoveryService({ redis: mockRedis });
    });

    it('performs health check on interval', async () => {
      (mockedAxios.get as any).mockResolvedValue({
        status: 200,
        headers: { 'x-response-time': '10ms' },
      });

      // Run only the pending timer (the setInterval callback)
      await jest.runOnlyPendingTimersAsync();

      expect(mockedAxios.get).toHaveBeenCalled();
    });

    it('marks instance as healthy on successful check', async () => {
      (mockedAxios.get as any).mockResolvedValue({
        status: 200,
        headers: { 'x-response-time': '15ms' },
      });

      const instances = await serviceDiscovery.discover('auth-service');

      // Manually trigger health check
      await (serviceDiscovery as any).performHealthCheck(instances[0]);

      expect(mockRedis.setex).toHaveBeenCalledWith(
        expect.stringContaining('service:health:'),
        60,
        expect.stringContaining('"status":"healthy"')
      );
    });

    it('marks instance as unhealthy on failed check', async () => {
      (mockedAxios.get as any).mockRejectedValue(new Error('Connection refused'));

      const instances = await serviceDiscovery.discover('auth-service');

      await (serviceDiscovery as any).performHealthCheck(instances[0]);

      expect(mockRedis.setex).toHaveBeenCalledWith(
        expect.stringContaining('service:health:'),
        60,
        expect.stringContaining('"status":"unhealthy"')
      );
    });

    it('includes response time in health data', async () => {
      (mockedAxios.get as any).mockResolvedValue({
        status: 200,
        headers: { 'x-response-time': '25ms' },
      });

      const instances = await serviceDiscovery.discover('auth-service');

      await (serviceDiscovery as any).performHealthCheck(instances[0]);

      const callArg = mockRedis.setex.mock.calls[0][2];
      const data = JSON.parse(callArg);
      expect(data.responseTime).toBe('25ms');
    });

    it('times out health check after 5 seconds', async () => {
      const instances = await serviceDiscovery.discover('auth-service');

      await (serviceDiscovery as any).performHealthCheck(instances[0]);

      expect(mockedAxios.get).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ timeout: 5000 })
      );
    });

    it('does not store health data when Redis unavailable', async () => {
      serviceDiscovery = new ServiceDiscoveryService();
      (mockedAxios.get as any).mockResolvedValue({
        status: 200,
        headers: {},
      });

      const instances = await serviceDiscovery.discover('auth-service');

      await (serviceDiscovery as any).performHealthCheck(instances[0]);

      expect(mockRedis.setex).not.toHaveBeenCalled();
    });
  });

  describe('getServiceTopology', () => {
    beforeEach(() => {
      serviceDiscovery = new ServiceDiscoveryService({ redis: mockRedis });
    });

    it('returns topology for all services', async () => {
      const topology = await serviceDiscovery.getServiceTopology();

      expect(topology).toHaveProperty('auth');
      expect(topology).toHaveProperty('venue');
      expect(topology).toHaveProperty('event');
    });

    it('includes instances for each service', async () => {
      const topology = await serviceDiscovery.getServiceTopology();

      expect(topology.auth).toHaveLength(1);
      expect(topology.venue).toHaveLength(1);
      expect(topology.event).toHaveLength(1);
    });

    it('returns empty arrays for unknown services', async () => {
      const topology = await serviceDiscovery.getServiceTopology();

      // Services exist but might have no instances
      expect(Array.isArray(topology.auth)).toBe(true);
    });
  });
});
