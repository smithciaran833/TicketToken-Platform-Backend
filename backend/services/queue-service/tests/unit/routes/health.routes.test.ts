// Mock logger before imports
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

// Mock services
jest.mock('../../../src/services/stripe.service', () => ({
  stripeService: {
    getConfig: jest.fn().mockReturnValue({ webhookConfigured: true }),
  },
}));

jest.mock('../../../src/services/nft.service', () => ({
  nftService: {
    getWalletBalance: jest.fn().mockResolvedValue(1.5),
  },
}));

jest.mock('../../../src/services/email.service', () => ({
  emailService: {
    testConnection: jest.fn().mockResolvedValue(true),
  },
}));

import { FastifyInstance } from 'fastify';
import healthRoutes from '../../../src/routes/health.routes';
import { logger } from '../../../src/utils/logger';
import { stripeService } from '../../../src/services/stripe.service';
import { nftService } from '../../../src/services/nft.service';
import { emailService } from '../../../src/services/email.service';

describe('Health Routes', () => {
  let fastify: Partial<FastifyInstance>;
  let mockReply: any;
  let mockRequest: any;
  let registeredRoutes: Map<string, any>;

  beforeEach(() => {
    registeredRoutes = new Map();

    mockReply = {
      send: jest.fn().mockReturnThis(),
      code: jest.fn().mockReturnThis(),
      header: jest.fn().mockReturnThis(),
    };

    mockRequest = {};

    fastify = {
      get: jest.fn((path, handler) => {
        registeredRoutes.set(`GET:${path}`, handler);
      }),
      redis: {
        ping: jest.fn().mockResolvedValue('PONG'),
      },
    } as any;

    // Reset mocks
    (stripeService.getConfig as jest.Mock).mockReturnValue({ webhookConfigured: true });
    (nftService.getWalletBalance as jest.Mock).mockResolvedValue(1.5);
    (emailService.testConnection as jest.Mock).mockResolvedValue(true);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Route Registration', () => {
    it('should register liveness probe', async () => {
      await healthRoutes(fastify as FastifyInstance);

      expect(fastify.get).toHaveBeenCalledWith('/health/live', expect.any(Function));
    });

    it('should register readiness probe', async () => {
      await healthRoutes(fastify as FastifyInstance);

      expect(fastify.get).toHaveBeenCalledWith('/health/ready', expect.any(Function));
    });

    it('should register startup probe', async () => {
      await healthRoutes(fastify as FastifyInstance);

      expect(fastify.get).toHaveBeenCalledWith('/health/startup', expect.any(Function));
    });
  });

  describe('GET /health/live', () => {
    it('should return 200 with alive status', async () => {
      await healthRoutes(fastify as FastifyInstance);

      const handler = registeredRoutes.get('GET:/health/live');
      await handler(mockRequest, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(200);
      expect(mockReply.send).toHaveBeenCalledWith({
        status: 'alive',
        timestamp: expect.any(String),
        uptime: expect.any(Number),
      });
    });

    it('should return valid ISO timestamp', async () => {
      await healthRoutes(fastify as FastifyInstance);

      const handler = registeredRoutes.get('GET:/health/live');
      await handler(mockRequest, mockReply);

      const response = (mockReply.send as jest.Mock).mock.calls[0][0];
      expect(() => new Date(response.timestamp)).not.toThrow();
      expect(new Date(response.timestamp).toISOString()).toBe(response.timestamp);
    });

    it('should return process uptime', async () => {
      await healthRoutes(fastify as FastifyInstance);

      const handler = registeredRoutes.get('GET:/health/live');
      await handler(mockRequest, mockReply);

      const response = (mockReply.send as jest.Mock).mock.calls[0][0];
      expect(typeof response.uptime).toBe('number');
      expect(response.uptime).toBeGreaterThanOrEqual(0);
    });
  });

  describe('GET /health/ready', () => {
    it('should return 200 with healthy status when all checks pass', async () => {
      await healthRoutes(fastify as FastifyInstance);

      const handler = registeredRoutes.get('GET:/health/ready');
      await handler(mockRequest, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(200);
      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'healthy',
          checks: expect.objectContaining({
            redis: expect.objectContaining({ status: 'healthy' }),
            stripe: expect.objectContaining({ status: 'configured' }),
            solana: expect.objectContaining({ status: 'healthy' }),
            email: expect.objectContaining({ status: 'healthy' }),
          }),
        })
      );
    });

    it('should check Redis connection with latency', async () => {
      await healthRoutes(fastify as FastifyInstance);

      const handler = registeredRoutes.get('GET:/health/ready');
      await handler(mockRequest, mockReply);

      expect((fastify as any).redis.ping).toHaveBeenCalled();
      const response = (mockReply.send as jest.Mock).mock.calls[0][0];
      expect(response.checks.redis).toHaveProperty('latency');
      expect(typeof response.checks.redis.latency).toBe('number');
    });

    it('should handle missing Redis configuration', async () => {
      (fastify as any).redis = undefined;

      await healthRoutes(fastify as FastifyInstance);

      const handler = registeredRoutes.get('GET:/health/ready');
      await handler(mockRequest, mockReply);

      const response = (mockReply.send as jest.Mock).mock.calls[0][0];
      expect(response.checks.redis).toEqual({ status: 'not_configured' });
    });

    it('should return degraded status when Redis fails', async () => {
      (fastify as any).redis.ping.mockRejectedValue(new Error('Connection failed'));

      await healthRoutes(fastify as FastifyInstance);

      const handler = registeredRoutes.get('GET:/health/ready');
      await handler(mockRequest, mockReply);

      const response = (mockReply.send as jest.Mock).mock.calls[0][0];
      expect(response.status).toBe('degraded');
      expect(response.checks.redis.status).toBe('unhealthy');
      expect(logger.error).toHaveBeenCalled();
    });

    it('should check Stripe configuration', async () => {
      await healthRoutes(fastify as FastifyInstance);

      const handler = registeredRoutes.get('GET:/health/ready');
      await handler(mockRequest, mockReply);

      expect(stripeService.getConfig).toHaveBeenCalled();
      const response = (mockReply.send as jest.Mock).mock.calls[0][0];
      expect(response.checks.stripe.status).toBe('configured');
    });

    it('should handle partial Stripe configuration', async () => {
      (stripeService.getConfig as jest.Mock).mockReturnValue({ webhookConfigured: false });

      await healthRoutes(fastify as FastifyInstance);

      const handler = registeredRoutes.get('GET:/health/ready');
      await handler(mockRequest, mockReply);

      const response = (mockReply.send as jest.Mock).mock.calls[0][0];
      expect(response.checks.stripe.status).toBe('partial');
    });

    it('should check Solana wallet balance', async () => {
      await healthRoutes(fastify as FastifyInstance);

      const handler = registeredRoutes.get('GET:/health/ready');
      await handler(mockRequest, mockReply);

      expect(nftService.getWalletBalance).toHaveBeenCalled();
      const response = (mockReply.send as jest.Mock).mock.calls[0][0];
      expect(response.checks.solana.status).toBe('healthy');
    });

    it('should return degraded when Solana balance is low', async () => {
      (nftService.getWalletBalance as jest.Mock).mockResolvedValue(0.005);

      await healthRoutes(fastify as FastifyInstance);

      const handler = registeredRoutes.get('GET:/health/ready');
      await handler(mockRequest, mockReply);

      const response = (mockReply.send as jest.Mock).mock.calls[0][0];
      expect(response.status).toBe('degraded');
      expect(response.checks.solana.status).toBe('low_balance');
    });

    it('should handle Solana connection error', async () => {
      (nftService.getWalletBalance as jest.Mock).mockRejectedValue(new Error('RPC error'));

      await healthRoutes(fastify as FastifyInstance);

      const handler = registeredRoutes.get('GET:/health/ready');
      await handler(mockRequest, mockReply);

      const response = (mockReply.send as jest.Mock).mock.calls[0][0];
      expect(response.status).toBe('degraded');
      expect(response.checks.solana.status).toBe('error');
      expect(logger.error).toHaveBeenCalled();
    });

    it('should check email service connection', async () => {
      await healthRoutes(fastify as FastifyInstance);

      const handler = registeredRoutes.get('GET:/health/ready');
      await handler(mockRequest, mockReply);

      expect(emailService.testConnection).toHaveBeenCalled();
      const response = (mockReply.send as jest.Mock).mock.calls[0][0];
      expect(response.checks.email.status).toBe('healthy');
    });

    it('should handle email service failure', async () => {
      (emailService.testConnection as jest.Mock).mockResolvedValue(false);

      await healthRoutes(fastify as FastifyInstance);

      const handler = registeredRoutes.get('GET:/health/ready');
      await handler(mockRequest, mockReply);

      const response = (mockReply.send as jest.Mock).mock.calls[0][0];
      expect(response.status).toBe('degraded');
      expect(response.checks.email.status).toBe('unhealthy');
    });

    it('should handle email service not configured', async () => {
      (emailService.testConnection as jest.Mock).mockRejectedValue(new Error('Not configured'));

      await healthRoutes(fastify as FastifyInstance);

      const handler = registeredRoutes.get('GET:/health/ready');
      await handler(mockRequest, mockReply);

      const response = (mockReply.send as jest.Mock).mock.calls[0][0];
      expect(response.checks.email.status).toBe('not_configured');
      expect(logger.warn).toHaveBeenCalledWith('Email not configured');
    });

    it('should return 200 with degraded status when multiple checks fail', async () => {
      (fastify as any).redis.ping.mockRejectedValue(new Error('Failed'));
      (nftService.getWalletBalance as jest.Mock).mockRejectedValue(new Error('Failed'));
      (emailService.testConnection as jest.Mock).mockResolvedValue(false);

      await healthRoutes(fastify as FastifyInstance);

      const handler = registeredRoutes.get('GET:/health/ready');
      await handler(mockRequest, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(200);
      const response = (mockReply.send as jest.Mock).mock.calls[0][0];
      expect(response.status).toBe('degraded');
    });

    it('should include version and uptime in response', async () => {
      await healthRoutes(fastify as FastifyInstance);

      const handler = registeredRoutes.get('GET:/health/ready');
      await handler(mockRequest, mockReply);

      const response = (mockReply.send as jest.Mock).mock.calls[0][0];
      expect(response).toHaveProperty('version');
      expect(response).toHaveProperty('uptime');
      expect(response).toHaveProperty('timestamp');
    });
  });

  describe('GET /health/startup', () => {
    it('should return 200 with started status after 5 seconds uptime', async () => {
      jest.spyOn(process, 'uptime').mockReturnValue(10);

      await healthRoutes(fastify as FastifyInstance);

      const handler = registeredRoutes.get('GET:/health/startup');
      await handler(mockRequest, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(200);
      expect(mockReply.send).toHaveBeenCalledWith({
        status: 'started',
        timestamp: expect.any(String),
        uptime: 10,
      });
    });

    it('should return 503 with starting status before 5 seconds uptime', async () => {
      jest.spyOn(process, 'uptime').mockReturnValue(3);

      await healthRoutes(fastify as FastifyInstance);

      const handler = registeredRoutes.get('GET:/health/startup');
      await handler(mockRequest, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(503);
      expect(mockReply.send).toHaveBeenCalledWith({
        status: 'starting',
        timestamp: expect.any(String),
        uptime: 3,
      });
    });

    it('should return valid timestamp', async () => {
      await healthRoutes(fastify as FastifyInstance);

      const handler = registeredRoutes.get('GET:/health/startup');
      await handler(mockRequest, mockReply);

      const response = (mockReply.send as jest.Mock).mock.calls[0][0];
      expect(() => new Date(response.timestamp)).not.toThrow();
    });
  });
});
