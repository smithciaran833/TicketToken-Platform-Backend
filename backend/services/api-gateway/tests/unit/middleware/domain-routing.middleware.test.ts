import { FastifyRequest, FastifyReply } from 'fastify';
import axios from 'axios';
import { domainRoutingMiddleware } from '../../../src/middleware/domain-routing.middleware';

jest.mock('axios');

describe('domain-routing.middleware', () => {
  let mockRequest: any;
  let mockReply: any;
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };

    mockRequest = {
      id: 'test-request-id',
      hostname: 'custom-venue.com',
      log: {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
      },
    };

    mockReply = {};
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('skip conditions', () => {
    it('skips processing for tickettoken.com', async () => {
      mockRequest.hostname = 'tickettoken.com';

      await domainRoutingMiddleware(mockRequest, mockReply);

      expect(axios.get).not.toHaveBeenCalled();
      expect(mockRequest.venue).toBeUndefined();
    });

    it('skips processing for localhost', async () => {
      mockRequest.hostname = 'localhost';

      await domainRoutingMiddleware(mockRequest, mockReply);

      expect(axios.get).not.toHaveBeenCalled();
      expect(mockRequest.venue).toBeUndefined();
    });

    it('skips processing for 127.0.0.1', async () => {
      mockRequest.hostname = '127.0.0.1';

      await domainRoutingMiddleware(mockRequest, mockReply);

      expect(axios.get).not.toHaveBeenCalled();
      expect(mockRequest.venue).toBeUndefined();
    });

    it('skips processing for tickettoken.com subdomains', async () => {
      mockRequest.hostname = 'app.tickettoken.com';

      await domainRoutingMiddleware(mockRequest, mockReply);

      expect(axios.get).not.toHaveBeenCalled();
      expect(mockRequest.venue).toBeUndefined();
    });

    it('skips processing for deep tickettoken.com subdomains', async () => {
      mockRequest.hostname = 'api.staging.tickettoken.com';

      await domainRoutingMiddleware(mockRequest, mockReply);

      expect(axios.get).not.toHaveBeenCalled();
      expect(mockRequest.venue).toBeUndefined();
    });
  });

  describe('custom domain lookup', () => {
    it('makes request to venue service with correct URL', async () => {
      process.env.VENUE_SERVICE_URL = 'http://venue-service:3002';
      mockRequest.hostname = 'custom-venue.com';

      (axios.get as jest.Mock).mockResolvedValue({
        data: {
          venue: {
            id: 'venue-123',
            hide_platform_branding: true,
            pricing_tier: 'premium',
          },
          branding: {
            logo: 'logo.png',
          },
        },
      });

      await domainRoutingMiddleware(mockRequest, mockReply);

      expect(axios.get).toHaveBeenCalledWith(
        'http://venue-service:3002/api/v1/branding/domain/custom-venue.com',
        expect.any(Object)
      );
    });

    it('uses default venue service URL when env var not set', async () => {
      delete process.env.VENUE_SERVICE_URL;
      mockRequest.hostname = 'custom-venue.com';

      (axios.get as jest.Mock).mockResolvedValue({
        data: {
          venue: {
            id: 'venue-123',
            hide_platform_branding: false,
            pricing_tier: 'basic',
          },
          branding: {},
        },
      });

      await domainRoutingMiddleware(mockRequest, mockReply);

      expect(axios.get).toHaveBeenCalledWith(
        'http://venue-service:3002/api/v1/branding/domain/custom-venue.com',
        expect.any(Object)
      );
    });

    it('passes request ID in headers', async () => {
      mockRequest.id = 'custom-request-id-456';

      (axios.get as jest.Mock).mockResolvedValue({
        data: {
          venue: { id: 'venue-123', hide_platform_branding: false, pricing_tier: 'basic' },
          branding: {},
        },
      });

      await domainRoutingMiddleware(mockRequest, mockReply);

      expect(axios.get).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: {
            'X-Request-ID': 'custom-request-id-456',
          },
        })
      );
    });

    it('sets 2000ms timeout', async () => {
      (axios.get as jest.Mock).mockResolvedValue({
        data: {
          venue: { id: 'venue-123', hide_platform_branding: false, pricing_tier: 'basic' },
          branding: {},
        },
      });

      await domainRoutingMiddleware(mockRequest, mockReply);

      expect(axios.get).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          timeout: 2000,
        })
      );
    });
  });

  describe('successful venue lookup', () => {
    const venueData = {
      venue: {
        id: 'venue-123',
        name: 'Test Venue',
        hide_platform_branding: true,
        pricing_tier: 'premium',
      },
      branding: {
        logo: 'logo.png',
        primary_color: '#FF0000',
      },
    };

    beforeEach(() => {
      (axios.get as jest.Mock).mockResolvedValue({ data: venueData });
    });

    it('attaches venue data to request object', async () => {
      await domainRoutingMiddleware(mockRequest, mockReply);

      expect(mockRequest.venue).toEqual(venueData.venue);
    });

    it('attaches branding data to request object', async () => {
      await domainRoutingMiddleware(mockRequest, mockReply);

      expect(mockRequest.branding).toEqual(venueData.branding);
    });

    it('attaches isWhiteLabel flag from venue data', async () => {
      await domainRoutingMiddleware(mockRequest, mockReply);

      expect(mockRequest.isWhiteLabel).toBe(true);
    });

    it('sets isWhiteLabel to false when hide_platform_branding is false', async () => {
      (axios.get as jest.Mock).mockResolvedValue({
        data: {
          venue: {
            id: 'venue-456',
            hide_platform_branding: false,
            pricing_tier: 'basic',
          },
          branding: {},
        },
      });

      await domainRoutingMiddleware(mockRequest, mockReply);

      expect(mockRequest.isWhiteLabel).toBe(false);
    });

    it('attaches domainVenueContext to request object', async () => {
      await domainRoutingMiddleware(mockRequest, mockReply);

      expect(mockRequest.domainVenueContext).toEqual({
        venueId: 'venue-123',
        isWhiteLabel: true,
        pricingTier: 'premium',
        source: 'domain-lookup',
      });
    });

    it('sets source to domain-lookup in context', async () => {
      await domainRoutingMiddleware(mockRequest, mockReply);

      expect(mockRequest.domainVenueContext.source).toBe('domain-lookup');
    });

    it('logs info message with venue ID and domain', async () => {
      mockRequest.hostname = 'my-custom-domain.com';

      await domainRoutingMiddleware(mockRequest, mockReply);

      expect(mockRequest.log.info).toHaveBeenCalledWith(
        {
          venueId: 'venue-123',
          domain: 'my-custom-domain.com',
        },
        'White-label domain detected'
      );
    });

    it('does not modify headers', async () => {
      mockRequest.headers = {};

      await domainRoutingMiddleware(mockRequest, mockReply);

      expect(mockRequest.headers).toEqual({});
    });
  });

  describe('error handling - 404 not found', () => {
    it('continues without logging warning on 404 error', async () => {
      const error404 = new Error('Not found');
      (error404 as any).response = { status: 404 };
      (axios.get as jest.Mock).mockRejectedValue(error404);

      await domainRoutingMiddleware(mockRequest, mockReply);

      expect(mockRequest.log.warn).not.toHaveBeenCalled();
      expect(mockRequest.venue).toBeUndefined();
    });

    it('does not attach venue data on 404', async () => {
      const error404 = new Error('Not found');
      (error404 as any).response = { status: 404 };
      (axios.get as jest.Mock).mockRejectedValue(error404);

      await domainRoutingMiddleware(mockRequest, mockReply);

      expect(mockRequest.venue).toBeUndefined();
      expect(mockRequest.branding).toBeUndefined();
      expect(mockRequest.domainVenueContext).toBeUndefined();
    });
  });

  describe('error handling - non-404 errors', () => {
    it('logs warning on 500 error', async () => {
      const error500 = new Error('Internal server error');
      (error500 as any).response = { status: 500 };
      (axios.get as jest.Mock).mockRejectedValue(error500);

      await domainRoutingMiddleware(mockRequest, mockReply);

      expect(mockRequest.log.warn).toHaveBeenCalledWith(
        {
          error: 'Internal server error',
          hostname: 'custom-venue.com',
        },
        'Error loading venue by domain'
      );
    });

    it('logs warning on network timeout', async () => {
      const timeoutError = new Error('Timeout');
      (timeoutError as any).response = { status: 408 };
      (axios.get as jest.Mock).mockRejectedValue(timeoutError);

      await domainRoutingMiddleware(mockRequest, mockReply);

      expect(mockRequest.log.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Timeout',
          hostname: 'custom-venue.com',
        }),
        'Error loading venue by domain'
      );
    });

    it('continues without venue data on non-404 error', async () => {
      const error500 = new Error('Server error');
      (error500 as any).response = { status: 500 };
      (axios.get as jest.Mock).mockRejectedValue(error500);

      await domainRoutingMiddleware(mockRequest, mockReply);

      expect(mockRequest.venue).toBeUndefined();
      expect(mockRequest.branding).toBeUndefined();
      expect(mockRequest.domainVenueContext).toBeUndefined();
    });

    it('logs warning for axios errors without response', async () => {
      const networkError = new Error('Network error');
      (axios.get as jest.Mock).mockRejectedValue(networkError);

      await domainRoutingMiddleware(mockRequest, mockReply);

      expect(mockRequest.log.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Network error',
        }),
        'Error loading venue by domain'
      );
    });
  });

  describe('error handling - general errors', () => {
    it('logs error and continues on unexpected error', async () => {
      const unexpectedError = new Error('Unexpected error');
      (axios.get as jest.Mock).mockRejectedValue(unexpectedError);
      
      // Simulate outer try-catch error by making hostname throw
      Object.defineProperty(mockRequest, 'hostname', {
        get: () => {
          throw new Error('Hostname error');
        },
        configurable: true,
      });

      await domainRoutingMiddleware(mockRequest, mockReply);

      expect(mockRequest.log.error).toHaveBeenCalled();
    });

    it('does not throw error on failure', async () => {
      const error = new Error('Service error');
      (axios.get as jest.Mock).mockRejectedValue(error);

      await expect(
        domainRoutingMiddleware(mockRequest, mockReply)
      ).resolves.not.toThrow();
    });
  });

  describe('security - venue context', () => {
    it('attaches venue context to request object not headers', async () => {
      mockRequest.headers = {};

      (axios.get as jest.Mock).mockResolvedValue({
        data: {
          venue: {
            id: 'venue-123',
            hide_platform_branding: true,
            pricing_tier: 'premium',
          },
          branding: {},
        },
      });

      await domainRoutingMiddleware(mockRequest, mockReply);

      expect(mockRequest.domainVenueContext).toBeDefined();
      expect(mockRequest.headers).not.toHaveProperty('X-Venue-ID');
      expect(mockRequest.headers).not.toHaveProperty('X-Venue-Context');
    });

    it('marks venue context source as domain-lookup for trust verification', async () => {
      (axios.get as jest.Mock).mockResolvedValue({
        data: {
          venue: {
            id: 'venue-123',
            hide_platform_branding: false,
            pricing_tier: 'basic',
          },
          branding: {},
        },
      });

      await domainRoutingMiddleware(mockRequest, mockReply);

      expect(mockRequest.domainVenueContext.source).toBe('domain-lookup');
    });
  });

  describe('different pricing tiers', () => {
    it('handles basic pricing tier', async () => {
      (axios.get as jest.Mock).mockResolvedValue({
        data: {
          venue: {
            id: 'venue-basic',
            hide_platform_branding: false,
            pricing_tier: 'basic',
          },
          branding: {},
        },
      });

      await domainRoutingMiddleware(mockRequest, mockReply);

      expect(mockRequest.domainVenueContext.pricingTier).toBe('basic');
    });

    it('handles premium pricing tier', async () => {
      (axios.get as jest.Mock).mockResolvedValue({
        data: {
          venue: {
            id: 'venue-premium',
            hide_platform_branding: true,
            pricing_tier: 'premium',
          },
          branding: {},
        },
      });

      await domainRoutingMiddleware(mockRequest, mockReply);

      expect(mockRequest.domainVenueContext.pricingTier).toBe('premium');
    });

    it('handles enterprise pricing tier', async () => {
      (axios.get as jest.Mock).mockResolvedValue({
        data: {
          venue: {
            id: 'venue-enterprise',
            hide_platform_branding: true,
            pricing_tier: 'enterprise',
          },
          branding: {},
        },
      });

      await domainRoutingMiddleware(mockRequest, mockReply);

      expect(mockRequest.domainVenueContext.pricingTier).toBe('enterprise');
    });
  });
});
