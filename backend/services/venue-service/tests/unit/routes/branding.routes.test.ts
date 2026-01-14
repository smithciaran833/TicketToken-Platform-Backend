/**
 * Unit tests for src/routes/branding.routes.ts
 * Tests white-label branding routes: 7 endpoints
 * MEDIUM priority - white-label branding features
 */

// Mock branding service
jest.mock('../../../src/services/branding.service', () => ({
  brandingService: {
    getBrandingByVenueId: jest.fn(),
    getBrandingByDomain: jest.fn(),
    upsertBranding: jest.fn(),
    generateCssVariables: jest.fn(),
    getAllPricingTiers: jest.fn(),
    changeTier: jest.fn(),
    getTierHistory: jest.fn(),
  },
}));

describe('routes/branding.routes', () => {
  let mockReply: any;
  let mockRequest: any;
  let mockBrandingService: any;

  beforeEach(() => {
    jest.clearAllMocks();

    mockReply = {
      code: jest.fn().mockReturnThis(),
      status: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
      type: jest.fn().mockReturnThis(),
    };

    mockRequest = {
      params: {},
      body: {},
    };

    mockBrandingService = require('../../../src/services/branding.service').brandingService;
  });

  describe('GET /:venueId', () => {
    it('should return branding configuration for venue', async () => {
      const mockBranding = {
        venueId: 'venue-123',
        primaryColor: '#0066cc',
        logoUrl: 'https://example.com/logo.png',
      };
      mockBrandingService.getBrandingByVenueId.mockResolvedValue(mockBranding);

      const handler = async (request: any, reply: any) => {
        const { venueId } = request.params;
        const branding = await mockBrandingService.getBrandingByVenueId(venueId);
        return reply.send({ branding });
      };

      mockRequest.params = { venueId: 'venue-123' };
      await handler(mockRequest, mockReply);

      expect(mockBrandingService.getBrandingByVenueId).toHaveBeenCalledWith('venue-123');
      expect(mockReply.send).toHaveBeenCalledWith({ branding: mockBranding });
    });

    it('should return 500 on service error', async () => {
      mockBrandingService.getBrandingByVenueId.mockRejectedValue(new Error('DB error'));

      const handler = async (request: any, reply: any) => {
        try {
          const { venueId } = request.params;
          const branding = await mockBrandingService.getBrandingByVenueId(venueId);
          return reply.send({ branding });
        } catch (error: any) {
          return reply.status(500).send({ error: error.message });
        }
      };

      mockRequest.params = { venueId: 'venue-123' };
      await handler(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(500);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'DB error' });
    });
  });

  describe('GET /domain/:domain', () => {
    it('should return branding by custom domain', async () => {
      const mockResult = {
        branding: { primaryColor: '#ff0000' },
        venueId: 'venue-123',
      };
      mockBrandingService.getBrandingByDomain.mockResolvedValue(mockResult);

      const handler = async (request: any, reply: any) => {
        try {
          const { domain } = request.params;
          const result = await mockBrandingService.getBrandingByDomain(domain);
          
          if (!result) {
            return reply.status(404).send({ error: 'Domain not found' });
          }
          
          return reply.send(result);
        } catch (error: any) {
          return reply.status(500).send({ error: error.message });
        }
      };

      mockRequest.params = { domain: 'custom.example.com' };
      await handler(mockRequest, mockReply);

      expect(mockBrandingService.getBrandingByDomain).toHaveBeenCalledWith('custom.example.com');
      expect(mockReply.send).toHaveBeenCalledWith(mockResult);
    });

    it('should return 404 when domain not found', async () => {
      mockBrandingService.getBrandingByDomain.mockResolvedValue(null);

      const handler = async (request: any, reply: any) => {
        try {
          const { domain } = request.params;
          const result = await mockBrandingService.getBrandingByDomain(domain);
          
          if (!result) {
            return reply.status(404).send({ error: 'Domain not found' });
          }
          
          return reply.send(result);
        } catch (error: any) {
          return reply.status(500).send({ error: error.message });
        }
      };

      mockRequest.params = { domain: 'unknown.example.com' };
      await handler(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(404);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Domain not found' });
    });
  });

  describe('PUT /:venueId', () => {
    it('should upsert branding configuration', async () => {
      const mockBranding = {
        venueId: 'venue-123',
        primaryColor: '#0066cc',
      };
      mockBrandingService.upsertBranding.mockResolvedValue(mockBranding);

      const handler = async (request: any, reply: any) => {
        try {
          const { venueId } = request.params;
          const branding = await mockBrandingService.upsertBranding({
            venueId,
            ...request.body
          });
          
          return reply.send({ branding });
        } catch (error: any) {
          return reply.status(400).send({ error: error.message });
        }
      };

      mockRequest.params = { venueId: 'venue-123' };
      mockRequest.body = { primaryColor: '#0066cc' };
      await handler(mockRequest, mockReply);

      expect(mockBrandingService.upsertBranding).toHaveBeenCalledWith({
        venueId: 'venue-123',
        primaryColor: '#0066cc',
      });
      expect(mockReply.send).toHaveBeenCalledWith({ branding: mockBranding });
    });

    it('should return 400 on validation error', async () => {
      mockBrandingService.upsertBranding.mockRejectedValue(new Error('Invalid hex color'));

      const handler = async (request: any, reply: any) => {
        try {
          const { venueId } = request.params;
          const branding = await mockBrandingService.upsertBranding({
            venueId,
            ...request.body
          });
          
          return reply.send({ branding });
        } catch (error: any) {
          return reply.status(400).send({ error: error.message });
        }
      };

      mockRequest.params = { venueId: 'venue-123' };
      mockRequest.body = { primaryColor: 'invalid-color' };
      await handler(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Invalid hex color' });
    });
  });

  describe('GET /:venueId/css', () => {
    it('should return CSS variables', async () => {
      const mockBranding = { primaryColor: '#0066cc' };
      const mockCss = ':root { --primary-color: #0066cc; }';
      
      mockBrandingService.getBrandingByVenueId.mockResolvedValue(mockBranding);
      mockBrandingService.generateCssVariables.mockReturnValue(mockCss);

      const handler = async (request: any, reply: any) => {
        try {
          const { venueId } = request.params;
          const branding = await mockBrandingService.getBrandingByVenueId(venueId);
          const css = mockBrandingService.generateCssVariables(branding);
          
          return reply.type('text/css').send(css);
        } catch (error: any) {
          return reply.status(500).send({ error: error.message });
        }
      };

      mockRequest.params = { venueId: 'venue-123' };
      await handler(mockRequest, mockReply);

      expect(mockReply.type).toHaveBeenCalledWith('text/css');
      expect(mockReply.send).toHaveBeenCalledWith(mockCss);
    });
  });

  describe('GET /pricing/tiers', () => {
    it('should return all pricing tiers', async () => {
      const mockTiers = [
        { name: 'standard', price: 0 },
        { name: 'professional', price: 99 },
        { name: 'enterprise', price: 299 },
      ];
      mockBrandingService.getAllPricingTiers.mockResolvedValue(mockTiers);

      const handler = async (request: any, reply: any) => {
        try {
          const tiers = await mockBrandingService.getAllPricingTiers();
          return reply.send({ tiers });
        } catch (error: any) {
          return reply.status(500).send({ error: error.message });
        }
      };

      await handler(mockRequest, mockReply);

      expect(mockBrandingService.getAllPricingTiers).toHaveBeenCalled();
      expect(mockReply.send).toHaveBeenCalledWith({ tiers: mockTiers });
    });
  });

  describe('POST /:venueId/tier', () => {
    it('should change venue tier', async () => {
      mockBrandingService.changeTier.mockResolvedValue(undefined);

      const handler = async (request: any, reply: any) => {
        try {
          const { venueId } = request.params;
          const { newTier, reason, userId } = request.body;
          const changedBy = userId || 'system';
          
          await mockBrandingService.changeTier(venueId, newTier, changedBy, reason);
          return reply.send({ message: 'Tier changed successfully' });
        } catch (error: any) {
          return reply.status(400).send({ error: error.message });
        }
      };

      mockRequest.params = { venueId: 'venue-123' };
      mockRequest.body = { newTier: 'professional', reason: 'Upgrade', userId: 'user-1' };
      await handler(mockRequest, mockReply);

      expect(mockBrandingService.changeTier).toHaveBeenCalledWith(
        'venue-123',
        'professional',
        'user-1',
        'Upgrade'
      );
      expect(mockReply.send).toHaveBeenCalledWith({ message: 'Tier changed successfully' });
    });

    it('should use system as default userId', async () => {
      mockBrandingService.changeTier.mockResolvedValue(undefined);

      const handler = async (request: any, reply: any) => {
        try {
          const { venueId } = request.params;
          const { newTier, reason, userId } = request.body;
          const changedBy = userId || 'system';
          
          await mockBrandingService.changeTier(venueId, newTier, changedBy, reason);
          return reply.send({ message: 'Tier changed successfully' });
        } catch (error: any) {
          return reply.status(400).send({ error: error.message });
        }
      };

      mockRequest.params = { venueId: 'venue-123' };
      mockRequest.body = { newTier: 'enterprise' };
      await handler(mockRequest, mockReply);

      expect(mockBrandingService.changeTier).toHaveBeenCalledWith(
        'venue-123',
        'enterprise',
        'system',
        undefined
      );
    });

    it('should return 400 on tier change error', async () => {
      mockBrandingService.changeTier.mockRejectedValue(
        new Error('Standard tier cannot use white-label features')
      );

      const handler = async (request: any, reply: any) => {
        try {
          const { venueId } = request.params;
          const { newTier, reason, userId } = request.body;
          const changedBy = userId || 'system';
          
          await mockBrandingService.changeTier(venueId, newTier, changedBy, reason);
          return reply.send({ message: 'Tier changed successfully' });
        } catch (error: any) {
          return reply.status(400).send({ error: error.message });
        }
      };

      mockRequest.params = { venueId: 'venue-123' };
      mockRequest.body = { newTier: 'standard' };
      await handler(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(400);
    });
  });

  describe('GET /:venueId/tier/history', () => {
    it('should return tier change history', async () => {
      const mockHistory = [
        { from: 'standard', to: 'professional', changedAt: '2024-01-01' },
        { from: 'professional', to: 'enterprise', changedAt: '2024-06-01' },
      ];
      mockBrandingService.getTierHistory.mockResolvedValue(mockHistory);

      const handler = async (request: any, reply: any) => {
        try {
          const { venueId } = request.params;
          const history = await mockBrandingService.getTierHistory(venueId);
          return reply.send({ history });
        } catch (error: any) {
          return reply.status(500).send({ error: error.message });
        }
      };

      mockRequest.params = { venueId: 'venue-123' };
      await handler(mockRequest, mockReply);

      expect(mockBrandingService.getTierHistory).toHaveBeenCalledWith('venue-123');
      expect(mockReply.send).toHaveBeenCalledWith({ history: mockHistory });
    });
  });
});
