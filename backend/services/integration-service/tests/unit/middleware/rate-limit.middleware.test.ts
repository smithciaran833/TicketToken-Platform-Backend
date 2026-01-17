// Mock fastify-rate-limit BEFORE imports
const mockRegister = jest.fn();

jest.mock('@fastify/rate-limit', () => {
  return jest.fn();
});

describe('rate-limit.middleware', () => {
  let mockFastify: any;

  beforeEach(() => {
    jest.clearAllMocks();

    mockFastify = {
      register: mockRegister.mockResolvedValue(undefined),
    };

    // Reset environment variables
    delete process.env.RATE_LIMIT_MAX_REQUESTS;
    delete process.env.RATE_LIMIT_WINDOW_MS;
  });

  describe('registerRateLimiter', () => {
    it('should register rate limiter with default values', async () => {
      const { registerRateLimiter } = await import('../../../src/middleware/rate-limit.middleware');
      const fastifyRateLimit = (await import('@fastify/rate-limit')).default;

      await registerRateLimiter(mockFastify);

      expect(mockRegister).toHaveBeenCalledWith(
        fastifyRateLimit,
        expect.objectContaining({
          max: 100,
          timeWindow: 60000,
        })
      );
    });

    it('should use environment variables for rate limit config', async () => {
      process.env.RATE_LIMIT_MAX_REQUESTS = '50';
      process.env.RATE_LIMIT_WINDOW_MS = '30000';

      // Re-import to pick up env vars
      jest.resetModules();
      const { registerRateLimiter } = await import('../../../src/middleware/rate-limit.middleware');
      const fastifyRateLimit = (await import('@fastify/rate-limit')).default;

      await registerRateLimiter(mockFastify);

      expect(mockRegister).toHaveBeenCalledWith(
        fastifyRateLimit,
        expect.objectContaining({
          max: 50,
          timeWindow: 30000,
        })
      );
    });

    it('should have custom error response', async () => {
      const { registerRateLimiter } = await import('../../../src/middleware/rate-limit.middleware');

      await registerRateLimiter(mockFastify);

      const config = mockRegister.mock.calls[0][1];
      const errorResponse = config.errorResponseBuilder();

      expect(errorResponse).toEqual({
        success: false,
        error: 'Too many requests, please try again later',
      });
    });

    it('should parse max requests as integer', async () => {
      process.env.RATE_LIMIT_MAX_REQUESTS = '200';

      jest.resetModules();
      const { registerRateLimiter } = await import('../../../src/middleware/rate-limit.middleware');

      await registerRateLimiter(mockFastify);

      const config = mockRegister.mock.calls[0][1];
      expect(config.max).toBe(200);
      expect(typeof config.max).toBe('number');
    });

    it('should parse time window as integer', async () => {
      process.env.RATE_LIMIT_WINDOW_MS = '120000';

      jest.resetModules();
      const { registerRateLimiter } = await import('../../../src/middleware/rate-limit.middleware');

      await registerRateLimiter(mockFastify);

      const config = mockRegister.mock.calls[0][1];
      expect(config.timeWindow).toBe(120000);
      expect(typeof config.timeWindow).toBe('number');
    });
  });

  describe('registerWebhookRateLimiter', () => {
    it('should register webhook rate limiter with higher limits', async () => {
      const { registerWebhookRateLimiter } = await import('../../../src/middleware/rate-limit.middleware');
      const fastifyRateLimit = (await import('@fastify/rate-limit')).default;

      await registerWebhookRateLimiter(mockFastify);

      expect(mockRegister).toHaveBeenCalledWith(
        fastifyRateLimit,
        expect.objectContaining({
          max: 1000,
          timeWindow: 60000,
        })
      );
    });

    it('should have custom error response for webhooks', async () => {
      const { registerWebhookRateLimiter } = await import('../../../src/middleware/rate-limit.middleware');

      await registerWebhookRateLimiter(mockFastify);

      const config = mockRegister.mock.calls[0][1];
      const errorResponse = config.errorResponseBuilder();

      expect(errorResponse).toEqual({
        success: false,
        error: 'Too many webhook requests',
      });
    });

    it('should use fixed limits regardless of environment', async () => {
      process.env.RATE_LIMIT_MAX_REQUESTS = '50';
      process.env.RATE_LIMIT_WINDOW_MS = '30000';

      jest.resetModules();
      const { registerWebhookRateLimiter } = await import('../../../src/middleware/rate-limit.middleware');

      await registerWebhookRateLimiter(mockFastify);

      const config = mockRegister.mock.calls[0][1];
      expect(config.max).toBe(1000); // Should still be 1000, not 50
      expect(config.timeWindow).toBe(60000); // Should still be 60000, not 30000
    });
  });
});
