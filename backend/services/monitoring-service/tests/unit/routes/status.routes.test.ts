// Mock config BEFORE imports
const mockConfig = {
  serviceName: 'monitoring-service',
  env: 'test',
};

jest.mock('../../../src/config', () => ({
  config: mockConfig,
}));

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import statusRoutes from '../../../src/routes/status.routes';

describe('statusRoutes', () => {
  let mockServer: Partial<FastifyInstance>;
  let registeredRoutes: Map<string, Function>;
  let getSpy: jest.Mock;
  let originalEnv: string | undefined;

  beforeEach(() => {
    jest.clearAllMocks();
    registeredRoutes = new Map();
    originalEnv = process.env.npm_package_version;

    getSpy = jest.fn((path, handler) => {
      registeredRoutes.set(`GET ${path}`, handler);
    });

    mockServer = {
      get: getSpy,
    };

    process.env.npm_package_version = '1.2.3';
  });

  afterEach(() => {
    process.env.npm_package_version = originalEnv;
  });

  describe('route registration', () => {
    it('should register GET /', async () => {
      await statusRoutes(mockServer as FastifyInstance);

      expect(getSpy).toHaveBeenCalledWith('/', expect.any(Function));
      expect(registeredRoutes.has('GET /')).toBe(true);
    });

    it('should register exactly 1 route', async () => {
      await statusRoutes(mockServer as FastifyInstance);

      expect(getSpy).toHaveBeenCalledTimes(1);
      expect(registeredRoutes.size).toBe(1);
    });
  });

  describe('GET / handler', () => {
    let handler: Function;
    let mockRequest: Partial<FastifyRequest>;
    let mockReply: Partial<FastifyReply>;

    beforeEach(async () => {
      await statusRoutes(mockServer as FastifyInstance);
      handler = registeredRoutes.get('GET /')!;

      mockRequest = {};
      mockReply = {};
    });

    it('should return operational status', async () => {
      const result = await handler(mockRequest, mockReply);

      expect(result).toHaveProperty('status', 'operational');
    });

    it('should return service name from config', async () => {
      const result = await handler(mockRequest, mockReply);

      expect(result).toHaveProperty('service', 'monitoring-service');
    });

    it('should return version from package.json', async () => {
      const result = await handler(mockRequest, mockReply);

      expect(result).toHaveProperty('version', '1.2.3');
    });

    it('should return default version when npm_package_version not set', async () => {
      delete process.env.npm_package_version;

      const result = await handler(mockRequest, mockReply);

      expect(result).toHaveProperty('version', '1.0.0');
    });

    it('should return uptime', async () => {
      const result = await handler(mockRequest, mockReply);

      expect(result).toHaveProperty('uptime');
      expect(typeof result.uptime).toBe('number');
      expect(result.uptime).toBeGreaterThanOrEqual(0);
    });

    it('should return memory usage', async () => {
      const result = await handler(mockRequest, mockReply);

      expect(result).toHaveProperty('memory');
      expect(result.memory).toHaveProperty('rss');
      expect(result.memory).toHaveProperty('heapTotal');
      expect(result.memory).toHaveProperty('heapUsed');
      expect(result.memory).toHaveProperty('external');
    });

    it('should return timestamp in ISO format', async () => {
      const beforeTime = new Date();
      const result = await handler(mockRequest, mockReply);
      const afterTime = new Date();

      expect(result).toHaveProperty('timestamp');
      const timestamp = new Date(result.timestamp);
      expect(timestamp.getTime()).toBeGreaterThanOrEqual(beforeTime.getTime());
      expect(timestamp.getTime()).toBeLessThanOrEqual(afterTime.getTime());
    });

    it('should return environment from config', async () => {
      const result = await handler(mockRequest, mockReply);

      expect(result).toHaveProperty('environment', 'test');
    });

    it('should return connection statuses', async () => {
      const result = await handler(mockRequest, mockReply);

      expect(result).toHaveProperty('connections');
      expect(result.connections).toHaveProperty('postgres', 'connected');
      expect(result.connections).toHaveProperty('redis', 'connected');
      expect(result.connections).toHaveProperty('mongodb', 'connected');
      expect(result.connections).toHaveProperty('elasticsearch', 'connected');
      expect(result.connections).toHaveProperty('influxdb', 'connected');
    });

    it('should return all required fields', async () => {
      const result = await handler(mockRequest, mockReply);

      expect(result).toHaveProperty('status');
      expect(result).toHaveProperty('service');
      expect(result).toHaveProperty('version');
      expect(result).toHaveProperty('uptime');
      expect(result).toHaveProperty('memory');
      expect(result).toHaveProperty('timestamp');
      expect(result).toHaveProperty('environment');
      expect(result).toHaveProperty('connections');
    });

    it('should handle different service names', async () => {
      mockConfig.serviceName = 'test-monitoring';

      const result = await handler(mockRequest, mockReply);

      expect(result).toHaveProperty('service', 'test-monitoring');
    });

    it('should handle different environments', async () => {
      mockConfig.env = 'production';

      const result = await handler(mockRequest, mockReply);

      expect(result).toHaveProperty('environment', 'production');
    });
  });
});
