import { settingsRoutes } from '../../../src/controllers/settings.controller';
import { ForbiddenError } from '../../../src/utils/errors';

// Mock dependencies
jest.mock('../../../src/services/cache-integration', () => ({
  cache: {
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
  },
}));

jest.mock('../../../src/utils/metrics', () => ({
  venueOperations: {
    inc: jest.fn(),
  },
}));

describe('Settings Controller', () => {
  let mockFastify: any;
  let mockDb: any;
  let mockVenueService: any;
  let mockLogger: any;
  let mockQueryBuilder: any;

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock database query builder
    mockQueryBuilder = {
      where: jest.fn().mockReturnThis(),
      first: jest.fn(),
      update: jest.fn(),
    };

    mockDb = jest.fn(() => mockQueryBuilder);

    mockVenueService = {
      checkVenueAccess: jest.fn(),
      getAccessDetails: jest.fn(),
    };

    mockLogger = {
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    };

    // Mock Fastify instance
    mockFastify = {
      get: jest.fn(),
      put: jest.fn(),
      container: {
        cradle: {
          db: mockDb,
          venueService: mockVenueService,
          logger: mockLogger,
        },
      },
    };
  });

  // Helper to create mock reply
  const createMockReply = () => ({
    send: jest.fn().mockReturnThis(),
    status: jest.fn().mockReturnThis(),
    code: jest.fn().mockReturnThis(),
  });

  // =============================================================================
  // GET / - Get Venue Settings - 3 test cases
  // =============================================================================

  describe('GET / - Get Venue Settings', () => {
    let handler: any;
    let mockRequest: any;
    let mockReply: any;

    beforeEach(async () => {
      await settingsRoutes(mockFastify as any);
      handler = mockFastify.get.mock.calls.find(
        (call: any) => call[0] === '/'
      )[2];

      mockRequest = {
        params: { venueId: 'venue-1' },
        user: { id: 'user-1' },
        tenantId: 'tenant-1',
      };

      mockReply = createMockReply();
      mockVenueService.checkVenueAccess.mockResolvedValue(true);
    });

    it('should get settings successfully', async () => {
      const mockSettings = {
        venue_id: 'venue-1',
        accepted_currencies: ['USD', 'EUR'],
        ticket_resale_allowed: true,
        max_tickets_per_order: 10,
        allow_print_at_home: true,
        allow_mobile_tickets: true,
        require_id_verification: false,
        ticket_transfer_allowed: true,
        service_fee_percentage: 5.5,
        facility_fee_amount: 2.0,
        processing_fee_percentage: 2.9,
        payment_methods: ['credit_card', 'paypal'],
        payout_frequency: 'weekly',
        minimum_payout_amount: 100,
      };

      mockQueryBuilder.first.mockResolvedValue(mockSettings);

      await handler(mockRequest, mockReply);

      expect(mockVenueService.checkVenueAccess).toHaveBeenCalledWith('venue-1', 'user-1');
      expect(mockReply.send).toHaveBeenCalledWith({
        general: {
          timezone: 'UTC',
          currency: 'USD',
          language: 'en',
        },
        ticketing: {
          allowRefunds: true,
          refundWindow: 24,
          maxTicketsPerOrder: 10,
          allowPrintAtHome: true,
          allowMobileTickets: true,
          requireIdVerification: false,
          ticketTransferAllowed: true,
        },
        fees: {
          serviceFeePercentage: 5.5,
          facilityFeeAmount: 2.0,
          processingFeePercentage: 2.9,
        },
        payment: {
          methods: ['credit_card', 'paypal'],
          acceptedCurrencies: ['USD', 'EUR'],
          payoutFrequency: 'weekly',
          minimumPayoutAmount: 100,
        },
      });
    });

    it('should return defaults if no settings exist', async () => {
      mockQueryBuilder.first.mockResolvedValue(null);

      await handler(mockRequest, mockReply);

      expect(mockReply.send).toHaveBeenCalledWith({
        general: {
          timezone: 'UTC',
          currency: 'USD',
          language: 'en',
        },
        ticketing: {
          allowRefunds: true,
          refundWindow: 24,
          maxTicketsPerOrder: 10,
        },
      });
    });

    it('should return 403 for forbidden access', async () => {
      mockVenueService.checkVenueAccess.mockResolvedValue(false);

      await expect(handler(mockRequest, mockReply)).rejects.toThrow(ForbiddenError);
    });
  });

  // =============================================================================
  // PUT / - Update Venue Settings - 4 test cases
  // =============================================================================

  describe('PUT / - Update Venue Settings', () => {
    let handler: any;
    let mockRequest: any;
    let mockReply: any;

    beforeEach(async () => {
      await settingsRoutes(mockFastify as any);
      handler = mockFastify.put.mock.calls.find(
        (call: any) => call[0] === '/'
      )[2];

      mockRequest = {
        params: { venueId: 'venue-1' },
        user: { id: 'user-1' },
        tenantId: 'tenant-1',
        body: {
          general: { currency: 'EUR' },
          ticketing: { maxTicketsPerOrder: 15, allowRefunds: false },
        },
      };

      mockReply = createMockReply();
      mockVenueService.checkVenueAccess.mockResolvedValue(true);
      mockVenueService.getAccessDetails.mockResolvedValue({ role: 'owner' });
    });

    it('should update settings successfully', async () => {
      mockQueryBuilder.update.mockResolvedValue(1);

      await handler(mockRequest, mockReply);

      expect(mockVenueService.checkVenueAccess).toHaveBeenCalledWith('venue-1', 'user-1');
      expect(mockQueryBuilder.update).toHaveBeenCalledWith(
        expect.objectContaining({
          accepted_currencies: ['EUR'],
          max_tickets_per_order: 15,
          ticket_resale_allowed: false,
          updated_at: expect.any(Date),
        })
      );
      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        message: 'Settings updated',
      });
    });

    it('should return 403 for insufficient permissions', async () => {
      mockVenueService.getAccessDetails.mockResolvedValue({ role: 'staff' });

      await expect(handler(mockRequest, mockReply)).rejects.toThrow(ForbiddenError);
    });

    it('should handle partial updates', async () => {
      mockRequest.body = {
        general: { currency: 'GBP' },
      };

      mockQueryBuilder.update.mockResolvedValue(1);

      await handler(mockRequest, mockReply);

      expect(mockQueryBuilder.update).toHaveBeenCalledWith(
        expect.objectContaining({
          accepted_currencies: ['GBP'],
          updated_at: expect.any(Date),
        })
      );
    });

    it('should log settings update', async () => {
      mockQueryBuilder.update.mockResolvedValue(1);

      await handler(mockRequest, mockReply);

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          venueId: 'venue-1',
          userId: 'user-1',
        }),
        'Settings updated'
      );
    });
  });
});
