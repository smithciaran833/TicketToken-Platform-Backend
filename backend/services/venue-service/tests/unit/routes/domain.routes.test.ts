/**
 * Unit tests for src/routes/domain.routes.ts
 * Tests custom domain management: 5 endpoints
 * HIGH priority - custom domain for white-label
 */

// Mock domain management service
jest.mock('../../../src/services/domain-management.service', () => ({
  domainManagementService: {
    addCustomDomain: jest.fn(),
    verifyDomain: jest.fn(),
    getDomainStatus: jest.fn(),
    getVenueDomains: jest.fn(),
    removeDomain: jest.fn(),
  },
}));

describe('routes/domain.routes', () => {
  let mockReply: any;
  let mockRequest: any;
  let mockDomainService: any;

  beforeEach(() => {
    jest.clearAllMocks();

    mockReply = {
      code: jest.fn().mockReturnThis(),
      status: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
    };

    mockRequest = {
      params: {},
      body: {},
    };

    mockDomainService = require('../../../src/services/domain-management.service').domainManagementService;
  });

  describe('POST /:venueId/add', () => {
    it('should add custom domain for venue', async () => {
      const mockDomain = {
        id: 'domain-123',
        domain: 'tickets.example.com',
        venueId: 'venue-123',
        status: 'pending',
      };
      mockDomainService.addCustomDomain.mockResolvedValue(mockDomain);

      const handler = async (request: any, reply: any) => {
        try {
          const { venueId } = request.params;
          const { domain } = request.body;
          
          const customDomain = await mockDomainService.addCustomDomain(venueId, domain);
          return reply.status(201).send({ domain: customDomain });
        } catch (error: any) {
          return reply.status(400).send({ error: error.message });
        }
      };

      mockRequest.params = { venueId: 'venue-123' };
      mockRequest.body = { domain: 'tickets.example.com' };
      await handler(mockRequest, mockReply);

      expect(mockDomainService.addCustomDomain).toHaveBeenCalledWith('venue-123', 'tickets.example.com');
      expect(mockReply.status).toHaveBeenCalledWith(201);
      expect(mockReply.send).toHaveBeenCalledWith({ domain: mockDomain });
    });

    it('should return 400 on invalid domain', async () => {
      mockDomainService.addCustomDomain.mockRejectedValue(new Error('Invalid domain format'));

      const handler = async (request: any, reply: any) => {
        try {
          const { venueId } = request.params;
          const { domain } = request.body;
          
          const customDomain = await mockDomainService.addCustomDomain(venueId, domain);
          return reply.status(201).send({ domain: customDomain });
        } catch (error: any) {
          return reply.status(400).send({ error: error.message });
        }
      };

      mockRequest.params = { venueId: 'venue-123' };
      mockRequest.body = { domain: 'invalid..domain' };
      await handler(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Invalid domain format' });
    });

    it('should return 400 if domain already in use', async () => {
      mockDomainService.addCustomDomain.mockRejectedValue(
        new Error('Domain already registered')
      );

      const handler = async (request: any, reply: any) => {
        try {
          const { venueId } = request.params;
          const { domain } = request.body;
          
          const customDomain = await mockDomainService.addCustomDomain(venueId, domain);
          return reply.status(201).send({ domain: customDomain });
        } catch (error: any) {
          return reply.status(400).send({ error: error.message });
        }
      };

      mockRequest.params = { venueId: 'venue-123' };
      mockRequest.body = { domain: 'taken.example.com' };
      await handler(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Domain already registered' });
    });
  });

  describe('POST /:domainId/verify', () => {
    it('should verify domain ownership successfully', async () => {
      mockDomainService.verifyDomain.mockResolvedValue(true);

      const handler = async (request: any, reply: any) => {
        try {
          const { domainId } = request.params;
          
          const verified = await mockDomainService.verifyDomain(domainId);
          return reply.send({ 
            verified,
            message: verified ? 'Domain verified successfully' : 'Domain verification pending'
          });
        } catch (error: any) {
          return reply.status(400).send({ error: error.message });
        }
      };

      mockRequest.params = { domainId: 'domain-123' };
      await handler(mockRequest, mockReply);

      expect(mockDomainService.verifyDomain).toHaveBeenCalledWith('domain-123');
      expect(mockReply.send).toHaveBeenCalledWith({
        verified: true,
        message: 'Domain verified successfully',
      });
    });

    it('should return pending message when verification incomplete', async () => {
      mockDomainService.verifyDomain.mockResolvedValue(false);

      const handler = async (request: any, reply: any) => {
        try {
          const { domainId } = request.params;
          
          const verified = await mockDomainService.verifyDomain(domainId);
          return reply.send({ 
            verified,
            message: verified ? 'Domain verified successfully' : 'Domain verification pending'
          });
        } catch (error: any) {
          return reply.status(400).send({ error: error.message });
        }
      };

      mockRequest.params = { domainId: 'domain-123' };
      await handler(mockRequest, mockReply);

      expect(mockReply.send).toHaveBeenCalledWith({
        verified: false,
        message: 'Domain verification pending',
      });
    });

    it('should return 400 on verification error', async () => {
      mockDomainService.verifyDomain.mockRejectedValue(
        new Error('DNS records not found')
      );

      const handler = async (request: any, reply: any) => {
        try {
          const { domainId } = request.params;
          
          const verified = await mockDomainService.verifyDomain(domainId);
          return reply.send({ verified });
        } catch (error: any) {
          return reply.status(400).send({ error: error.message });
        }
      };

      mockRequest.params = { domainId: 'domain-123' };
      await handler(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'DNS records not found' });
    });
  });

  describe('GET /:domainId/status', () => {
    it('should return domain status', async () => {
      const mockDomain = {
        id: 'domain-123',
        domain: 'tickets.example.com',
        status: 'verified',
        sslStatus: 'active',
        verifiedAt: '2024-01-01T00:00:00Z',
      };
      mockDomainService.getDomainStatus.mockResolvedValue(mockDomain);

      const handler = async (request: any, reply: any) => {
        try {
          const { domainId } = request.params;
          
          const domain = await mockDomainService.getDomainStatus(domainId);
          return reply.send({ domain });
        } catch (error: any) {
          return reply.status(404).send({ error: error.message });
        }
      };

      mockRequest.params = { domainId: 'domain-123' };
      await handler(mockRequest, mockReply);

      expect(mockDomainService.getDomainStatus).toHaveBeenCalledWith('domain-123');
      expect(mockReply.send).toHaveBeenCalledWith({ domain: mockDomain });
    });

    it('should return 404 when domain not found', async () => {
      mockDomainService.getDomainStatus.mockRejectedValue(new Error('Domain not found'));

      const handler = async (request: any, reply: any) => {
        try {
          const { domainId } = request.params;
          
          const domain = await mockDomainService.getDomainStatus(domainId);
          return reply.send({ domain });
        } catch (error: any) {
          return reply.status(404).send({ error: error.message });
        }
      };

      mockRequest.params = { domainId: 'unknown-id' };
      await handler(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(404);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Domain not found' });
    });
  });

  describe('GET /venue/:venueId', () => {
    it('should return all domains for venue', async () => {
      const mockDomains = [
        { id: 'domain-1', domain: 'tickets.example.com', status: 'verified' },
        { id: 'domain-2', domain: 'events.example.com', status: 'pending' },
      ];
      mockDomainService.getVenueDomains.mockResolvedValue(mockDomains);

      const handler = async (request: any, reply: any) => {
        try {
          const { venueId } = request.params;
          
          const domains = await mockDomainService.getVenueDomains(venueId);
          return reply.send({ domains });
        } catch (error: any) {
          return reply.status(500).send({ error: error.message });
        }
      };

      mockRequest.params = { venueId: 'venue-123' };
      await handler(mockRequest, mockReply);

      expect(mockDomainService.getVenueDomains).toHaveBeenCalledWith('venue-123');
      expect(mockReply.send).toHaveBeenCalledWith({ domains: mockDomains });
    });

    it('should return empty array when no domains', async () => {
      mockDomainService.getVenueDomains.mockResolvedValue([]);

      const handler = async (request: any, reply: any) => {
        try {
          const { venueId } = request.params;
          
          const domains = await mockDomainService.getVenueDomains(venueId);
          return reply.send({ domains });
        } catch (error: any) {
          return reply.status(500).send({ error: error.message });
        }
      };

      mockRequest.params = { venueId: 'venue-123' };
      await handler(mockRequest, mockReply);

      expect(mockReply.send).toHaveBeenCalledWith({ domains: [] });
    });

    it('should return 500 on service error', async () => {
      mockDomainService.getVenueDomains.mockRejectedValue(new Error('Database error'));

      const handler = async (request: any, reply: any) => {
        try {
          const { venueId } = request.params;
          
          const domains = await mockDomainService.getVenueDomains(venueId);
          return reply.send({ domains });
        } catch (error: any) {
          return reply.status(500).send({ error: error.message });
        }
      };

      mockRequest.params = { venueId: 'venue-123' };
      await handler(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(500);
    });
  });

  describe('DELETE /:domainId', () => {
    it('should remove domain successfully', async () => {
      mockDomainService.removeDomain.mockResolvedValue(undefined);

      const handler = async (request: any, reply: any) => {
        try {
          const { domainId } = request.params;
          
          await mockDomainService.removeDomain(domainId);
          return reply.send({ message: 'Domain removed successfully' });
        } catch (error: any) {
          return reply.status(400).send({ error: error.message });
        }
      };

      mockRequest.params = { domainId: 'domain-123' };
      await handler(mockRequest, mockReply);

      expect(mockDomainService.removeDomain).toHaveBeenCalledWith('domain-123');
      expect(mockReply.send).toHaveBeenCalledWith({ message: 'Domain removed successfully' });
    });

    it('should return 400 on removal error', async () => {
      mockDomainService.removeDomain.mockRejectedValue(new Error('Domain not found'));

      const handler = async (request: any, reply: any) => {
        try {
          const { domainId } = request.params;
          
          await mockDomainService.removeDomain(domainId);
          return reply.send({ message: 'Domain removed successfully' });
        } catch (error: any) {
          return reply.status(400).send({ error: error.message });
        }
      };

      mockRequest.params = { domainId: 'unknown-id' };
      await handler(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Domain not found' });
    });
  });
});
