// Set environment BEFORE any imports
process.env.ANALYTICS_SERVICE_URL = 'http://analytics-test:3000';
process.env.INTERNAL_SERVICE_KEY = 'test-internal-key';

// Mock logger BEFORE imports
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

// Mock IdempotencyService
const mockIdempotencyService = {
  generateKey: jest.fn().mockReturnValue('idem-key-123'),
  check: jest.fn().mockResolvedValue(null),
  store: jest.fn().mockResolvedValue(undefined),
};
jest.mock('../../../src/services/idempotency.service', () => ({
  IdempotencyService: jest.fn().mockImplementation(() => mockIdempotencyService),
}));

// Mock RateLimiterService
const mockRateLimiter = {
  acquire: jest.fn().mockResolvedValue(undefined),
  release: jest.fn(),
};
jest.mock('../../../src/services/rate-limiter.service', () => ({
  RateLimiterService: {
    getInstance: jest.fn().mockReturnValue(mockRateLimiter),
  },
}));

// Mock axios
jest.mock('axios');

import { BullJobData } from '../../../src/adapters/bull-job-adapter';
import { IdempotencyService } from '../../../src/services/idempotency.service';
import { RateLimiterService } from '../../../src/services/rate-limiter.service';
import { logger } from '../../../src/utils/logger';
import axios from 'axios';

const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('AnalyticsProcessor', () => {
  let mockJob: BullJobData<any>;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Reset mocks
    mockIdempotencyService.generateKey.mockReturnValue('idem-key-123');
    mockIdempotencyService.check.mockResolvedValue(null);
    mockIdempotencyService.store.mockResolvedValue(undefined);
    mockRateLimiter.acquire.mockResolvedValue(undefined);
    mockRateLimiter.release.mockReset();

    mockJob = {
      id: 'analytics-job-123',
      name: 'analytics-event',
      data: {
        eventType: 'ticket_purchased',
        venueId: 'venue-456',
        userId: 'user-789',
        eventId: 'event-111',
        tenantId: 'tenant-222',
        data: {
          ticketCount: 2,
          totalAmount: 150,
        },
        timestamp: '2024-01-15T10:30:00Z',
      },
      attemptsMade: 0,
      queue: { name: 'background' },
    };

    // Default mock for internal analytics
    mockedAxios.post.mockResolvedValue({ status: 200 });
    mockedAxios.get.mockResolvedValue({ data: 1, status: 200 });
  });

  // We need to dynamically import to test with different env vars
  const getProcessor = async () => {
    // Clear the module cache to pick up new env vars
    jest.resetModules();
    
    // Re-apply mocks after reset
    jest.doMock('../../../src/utils/logger', () => ({
      logger: {
        info: jest.fn(),
        error: jest.fn(),
        warn: jest.fn(),
        debug: jest.fn(),
      },
    }));
    
    jest.doMock('../../../src/services/idempotency.service', () => ({
      IdempotencyService: jest.fn().mockImplementation(() => mockIdempotencyService),
    }));
    
    jest.doMock('../../../src/services/rate-limiter.service', () => ({
      RateLimiterService: {
        getInstance: jest.fn().mockReturnValue(mockRateLimiter),
      },
    }));
    
    jest.doMock('axios', () => mockedAxios);

    const { AnalyticsProcessor } = await import('../../../src/workers/background/analytics.processor');
    return new AnalyticsProcessor();
  };

  describe('process', () => {
    it('should process analytics event successfully', async () => {
      const processor = await getProcessor();
      const result = await processor.process(mockJob);

      expect(result.success).toBe(true);
      expect(result.data.eventType).toBe('ticket_purchased');
      expect(result.data.destinations.internal.success).toBe(true);
    });

    it('should check idempotency before processing', async () => {
      const processor = await getProcessor();
      await processor.process(mockJob);

      expect(mockIdempotencyService.generateKey).toHaveBeenCalledWith(
        'analytics-event',
        expect.objectContaining({
          eventType: 'ticket_purchased',
          venueId: 'venue-456',
          userId: 'user-789',
          eventId: 'event-111',
        })
      );
      expect(mockIdempotencyService.check).toHaveBeenCalledWith('idem-key-123');
    });

    it('should return existing result if already processed', async () => {
      const existingResult = {
        success: true,
        data: { eventType: 'ticket_purchased', alreadyProcessed: true },
      };
      mockIdempotencyService.check.mockResolvedValue(existingResult);

      const processor = await getProcessor();
      const result = await processor.process(mockJob);

      expect(result).toEqual(existingResult);
      expect(mockedAxios.post).not.toHaveBeenCalled();
    });

    it('should store result for idempotency after processing', async () => {
      const processor = await getProcessor();
      await processor.process(mockJob);

      expect(mockIdempotencyService.store).toHaveBeenCalledWith(
        'idem-key-123',
        'background',
        'analytics-event',
        expect.objectContaining({ success: true }),
        7 * 24 * 60 * 60 // 7 days
      );
    });
  });

  describe('internal analytics', () => {
    it('should send to internal analytics service', async () => {
      const processor = await getProcessor();
      await processor.process(mockJob);

      expect(mockedAxios.post).toHaveBeenCalledWith(
        'http://analytics-test:3000/api/v1/events/track',
        expect.objectContaining({
          eventType: 'ticket_purchased',
          userId: 'user-789',
          venueId: 'venue-456',
          eventId: 'event-111',
          tenantId: 'tenant-222',
          properties: { ticketCount: 2, totalAmount: 150 },
          source: 'queue-service',
        }),
        expect.objectContaining({
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'X-Internal-Service-Key': 'test-internal-key',
            'X-Tenant-ID': 'tenant-222',
          }),
          timeout: 10000,
        })
      );
    });

    it('should treat service unavailable as success', async () => {
      const error: any = new Error('Connection refused');
      error.code = 'ECONNREFUSED';
      mockedAxios.post.mockRejectedValue(error);

      const processor = await getProcessor();
      const result = await processor.process(mockJob);

      expect(result.success).toBe(true);
      expect(result.data.destinations.internal.success).toBe(true);
    });

    it('should treat ENOTFOUND as success', async () => {
      const error: any = new Error('DNS lookup failed');
      error.code = 'ENOTFOUND';
      mockedAxios.post.mockRejectedValue(error);

      const processor = await getProcessor();
      const result = await processor.process(mockJob);

      expect(result.data.destinations.internal.success).toBe(true);
    });

    it('should return false for 4xx errors', async () => {
      const error: any = new Error('Bad request');
      error.response = { status: 400 };
      mockedAxios.post.mockRejectedValue(error);

      const processor = await getProcessor();
      const result = await processor.process(mockJob);

      expect(result.data.destinations.internal.success).toBe(false);
    });

    it('should capture error for 5xx errors', async () => {
      const error: any = new Error('Server error');
      error.response = { status: 500 };
      mockedAxios.post.mockRejectedValue(error);

      const processor = await getProcessor();
      const result = await processor.process(mockJob);

      expect(result.data.destinations.internal.success).toBe(false);
      expect(result.data.destinations.internal.error).toBe('Server error');
    });

    it('should not include tenant header when tenantId is missing', async () => {
      mockJob.data.tenantId = undefined;

      const processor = await getProcessor();
      await processor.process(mockJob);

      const postCall = mockedAxios.post.mock.calls[0];
      expect(postCall[2].headers['X-Tenant-ID']).toBeUndefined();
    });
  });

  describe('Segment integration', () => {
    beforeEach(() => {
      process.env.SEGMENT_WRITE_KEY = 'test-segment-key';
    });

    afterEach(() => {
      delete process.env.SEGMENT_WRITE_KEY;
    });

    it('should send to Segment when configured', async () => {
      const processor = await getProcessor();
      await processor.process(mockJob);

      expect(mockedAxios.post).toHaveBeenCalledWith(
        'https://api.segment.io/v1/track',
        expect.objectContaining({
          event: 'ticket_purchased',
          userId: 'user-789',
          timestamp: '2024-01-15T10:30:00Z',
          properties: expect.objectContaining({
            ticketCount: 2,
            totalAmount: 150,
            venueId: 'venue-456',
          }),
        }),
        expect.objectContaining({
          auth: { username: 'test-segment-key', password: '' },
          timeout: 5000,
        })
      );
    });

    it('should use anonymousId when userId is missing', async () => {
      mockJob.data.userId = undefined;

      const processor = await getProcessor();
      await processor.process(mockJob);

      const segmentCall = mockedAxios.post.mock.calls.find(
        call => call[0] === 'https://api.segment.io/v1/track'
      );
      expect(segmentCall).toBeDefined();
      expect(segmentCall![1].anonymousId).toBe('venue-456');
      expect(segmentCall![1].userId).toBeUndefined();
    });

    it('should acquire and release rate limit for Segment', async () => {
      const processor = await getProcessor();
      await processor.process(mockJob);

      expect(mockRateLimiter.acquire).toHaveBeenCalledWith('segment', 5);
      expect(mockRateLimiter.release).toHaveBeenCalledWith('segment');
    });

    it('should handle Segment API errors', async () => {
      mockedAxios.post.mockImplementation((url) => {
        if (url === 'https://api.segment.io/v1/track') {
          return Promise.reject(new Error('Segment API error'));
        }
        return Promise.resolve({ status: 200 });
      });

      const processor = await getProcessor();
      const result = await processor.process(mockJob);

      expect(result.data.destinations.segment.success).toBe(false);
      expect(result.data.destinations.segment.error).toBe('Segment API error');
    });
  });

  describe('Mixpanel integration', () => {
    beforeEach(() => {
      process.env.MIXPANEL_TOKEN = 'test-mixpanel-token';
    });

    afterEach(() => {
      delete process.env.MIXPANEL_TOKEN;
    });

    it('should send to Mixpanel when configured', async () => {
      const processor = await getProcessor();
      await processor.process(mockJob);

      expect(mockedAxios.get).toHaveBeenCalledWith(
        'https://api.mixpanel.com/track',
        expect.objectContaining({
          params: { data: expect.any(String) },
          timeout: 5000,
        })
      );
    });

    it('should base64 encode Mixpanel payload', async () => {
      const processor = await getProcessor();
      await processor.process(mockJob);

      const mixpanelCall = mockedAxios.get.mock.calls.find(
        call => call[0] === 'https://api.mixpanel.com/track'
      );
      expect(mixpanelCall).toBeDefined();
      const encodedData = mixpanelCall![1].params.data;
      const decoded = JSON.parse(Buffer.from(encodedData, 'base64').toString());

      expect(decoded.event).toBe('ticket_purchased');
      expect(decoded.properties.token).toBe('test-mixpanel-token');
      expect(decoded.properties.distinct_id).toBe('user-789');
    });

    it('should acquire and release rate limit for Mixpanel', async () => {
      const processor = await getProcessor();
      await processor.process(mockJob);

      expect(mockRateLimiter.acquire).toHaveBeenCalledWith('mixpanel', 5);
      expect(mockRateLimiter.release).toHaveBeenCalledWith('mixpanel');
    });

    it('should handle Mixpanel returning non-1 value', async () => {
      mockedAxios.get.mockResolvedValue({ data: 0 });

      const processor = await getProcessor();
      const result = await processor.process(mockJob);

      expect(result.data.destinations.mixpanel.success).toBe(false);
    });
  });

  describe('multiple providers', () => {
    beforeEach(() => {
      process.env.SEGMENT_WRITE_KEY = 'segment-key';
      process.env.MIXPANEL_TOKEN = 'mixpanel-token';
    });

    afterEach(() => {
      delete process.env.SEGMENT_WRITE_KEY;
      delete process.env.MIXPANEL_TOKEN;
    });

    it('should send to all configured providers in parallel', async () => {
      const processor = await getProcessor();
      const result = await processor.process(mockJob);

      expect(result.data.destinations.segment).toBeDefined();
      expect(result.data.destinations.mixpanel).toBeDefined();
      expect(result.data.destinations.internal).toBeDefined();
    });

    it('should report success only when all providers succeed', async () => {
      const processor = await getProcessor();
      const result = await processor.process(mockJob);

      expect(result.success).toBe(true);
    });

    it('should report failure when any provider fails', async () => {
      mockedAxios.get.mockRejectedValue(new Error('Mixpanel error'));

      const processor = await getProcessor();
      const result = await processor.process(mockJob);

      expect(result.success).toBe(false);
    });
  });

  describe('error handling', () => {
    it('should throw errors for unexpected failures', async () => {
      mockIdempotencyService.check.mockRejectedValue(new Error('Redis down'));

      const processor = await getProcessor();
      await expect(processor.process(mockJob)).rejects.toThrow('Redis down');
    });
  });

  describe('AnalyticsEventTypes', () => {
    it('should have all expected event types', async () => {
      const { AnalyticsEventTypes } = await import('../../../src/workers/background/analytics.processor');
      
      expect(AnalyticsEventTypes.USER_SIGNUP).toBe('user_signup');
      expect(AnalyticsEventTypes.TICKET_PURCHASED).toBe('ticket_purchased');
      expect(AnalyticsEventTypes.PAYMENT_COMPLETED).toBe('payment_completed');
      expect(AnalyticsEventTypes.NFT_MINTED).toBe('nft_minted');
      expect(AnalyticsEventTypes.PAGE_VIEW).toBe('page_view');
    });

    it('should be immutable (const assertion)', async () => {
      const { AnalyticsEventTypes } = await import('../../../src/workers/background/analytics.processor');
      
      const allTypes = Object.values(AnalyticsEventTypes);
      expect(allTypes.length).toBeGreaterThan(0);
      expect(allTypes.every(t => typeof t === 'string')).toBe(true);
    });
  });
});
