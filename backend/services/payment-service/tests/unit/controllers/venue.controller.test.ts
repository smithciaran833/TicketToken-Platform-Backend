/**
 * Unit Tests for Venue Controller
 * 
 * Tests venue balance, payout, and history endpoints.
 */

import { createMockRequest, createMockReply } from '../../setup';

// Mock dependencies
jest.mock('../../../src/services/cache-integration', () => ({
  serviceCache: {
    get: jest.fn(),
    set: jest.fn(),
    invalidate: jest.fn(),
  },
}));

jest.mock('../../../src/services/core', () => ({
  VenueBalanceService: jest.fn().mockImplementation(() => ({
    getBalance: jest.fn(),
    calculatePayoutAmount: jest.fn(),
    processPayout: jest.fn(),
  })),
}));

import { VenueController } from '../../../src/controllers/venue.controller';

describe('VenueController', () => {
  let controller: VenueController;
  let mockVenueBalanceService: any;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new VenueController();
    mockVenueBalanceService = (controller as any).venueBalanceService;
  });

  describe('getBalance', () => {
    it('should return balance and payout info for authorized user', async () => {
      const request = createMockRequest({
        params: { venueId: 'venue-123' },
        user: {
          id: 'user-123',
          venues: ['venue-123'],
          isAdmin: false,
        },
      });
      const reply = createMockReply();

      const mockBalance = {
        available: 50000,
        pending: 10000,
        currency: 'usd',
        lastUpdated: '2026-01-10T12:00:00Z',
      };

      const mockPayoutInfo = {
        availableForPayout: 50000,
        minimumPayout: 5000,
        standardFee: 0,
        instantFee: 100,
        nextPayoutDate: '2026-01-12T00:00:00Z',
      };

      mockVenueBalanceService.getBalance.mockResolvedValue(mockBalance);
      mockVenueBalanceService.calculatePayoutAmount.mockResolvedValue(mockPayoutInfo);

      await controller.getBalance(request, reply);

      expect(reply.send).toHaveBeenCalledWith({
        balance: mockBalance,
        payoutInfo: mockPayoutInfo,
      });
      expect(mockVenueBalanceService.getBalance).toHaveBeenCalledWith('venue-123');
      expect(mockVenueBalanceService.calculatePayoutAmount).toHaveBeenCalledWith('venue-123');
    });

    it('should return balance for admin user', async () => {
      const request = createMockRequest({
        params: { venueId: 'venue-456' },
        user: {
          id: 'admin-123',
          venues: [], // Admin doesn't need to be in venues list
          isAdmin: true,
        },
      });
      const reply = createMockReply();

      mockVenueBalanceService.getBalance.mockResolvedValue({ available: 100000 });
      mockVenueBalanceService.calculatePayoutAmount.mockResolvedValue({ availableForPayout: 100000 });

      await controller.getBalance(request, reply);

      expect(reply.send).toHaveBeenCalled();
      expect(mockVenueBalanceService.getBalance).toHaveBeenCalledWith('venue-456');
    });

    it('should return 401 when user is not authenticated', async () => {
      const request = createMockRequest({
        params: { venueId: 'venue-123' },
        user: null,
      });
      const reply = createMockReply();

      await controller.getBalance(request, reply);

      expect(reply.status).toHaveBeenCalledWith(401);
      expect(reply.send).toHaveBeenCalledWith({ error: 'Authentication required' });
    });

    it('should return 403 when user has no access to venue', async () => {
      const request = createMockRequest({
        params: { venueId: 'venue-not-owned' },
        user: {
          id: 'user-123',
          venues: ['venue-other'],
          isAdmin: false,
        },
      });
      const reply = createMockReply();

      await controller.getBalance(request, reply);

      expect(reply.status).toHaveBeenCalledWith(403);
      expect(reply.send).toHaveBeenCalledWith({ error: 'Access denied' });
    });

    it('should handle service errors', async () => {
      const request = createMockRequest({
        params: { venueId: 'venue-123' },
        user: {
          id: 'user-123',
          venues: ['venue-123'],
          isAdmin: false,
        },
      });
      const reply = createMockReply();

      mockVenueBalanceService.getBalance.mockRejectedValue(
        new Error('Database connection failed')
      );

      await expect(controller.getBalance(request, reply)).rejects.toThrow('Database connection failed');
    });

    it('should return zero balance for new venue', async () => {
      const request = createMockRequest({
        params: { venueId: 'venue-new' },
        user: {
          id: 'user-123',
          venues: ['venue-new'],
          isAdmin: false,
        },
      });
      const reply = createMockReply();

      mockVenueBalanceService.getBalance.mockResolvedValue({
        available: 0,
        pending: 0,
        currency: 'usd',
      });
      mockVenueBalanceService.calculatePayoutAmount.mockResolvedValue({
        availableForPayout: 0,
        minimumPayout: 5000,
      });

      await controller.getBalance(request, reply);

      const response = (reply.send as jest.Mock).mock.calls[0][0];
      expect(response.balance.available).toBe(0);
      expect(response.payoutInfo.availableForPayout).toBe(0);
    });
  });

  describe('requestPayout', () => {
    it('should initiate standard payout successfully', async () => {
      const request = createMockRequest({
        params: { venueId: 'venue-123' },
        body: {
          amount: 50000,
          instant: false,
        },
        user: {
          id: 'user-123',
          venues: ['venue-123'],
          isAdmin: false,
        },
      });
      const reply = createMockReply();

      mockVenueBalanceService.processPayout.mockResolvedValue(undefined);

      await controller.requestPayout(request, reply);

      expect(reply.send).toHaveBeenCalledWith({
        success: true,
        message: 'Payout initiated',
        amount: 50000,
        type: 'standard',
        estimatedArrival: '1-2 business days',
      });
      expect(mockVenueBalanceService.processPayout).toHaveBeenCalledWith('venue-123', 50000);
    });

    it('should initiate instant payout successfully', async () => {
      const request = createMockRequest({
        params: { venueId: 'venue-123' },
        body: {
          amount: 25000,
          instant: true,
        },
        user: {
          id: 'user-123',
          venues: ['venue-123'],
          isAdmin: false,
        },
      });
      const reply = createMockReply();

      mockVenueBalanceService.processPayout.mockResolvedValue(undefined);

      await controller.requestPayout(request, reply);

      expect(reply.send).toHaveBeenCalledWith({
        success: true,
        message: 'Payout initiated',
        amount: 25000,
        type: 'instant',
        estimatedArrival: 'Within 30 minutes',
      });
    });

    it('should return 401 when user is not authenticated', async () => {
      const request = createMockRequest({
        params: { venueId: 'venue-123' },
        body: { amount: 50000, instant: false },
        user: null,
      });
      const reply = createMockReply();

      await controller.requestPayout(request, reply);

      expect(reply.status).toHaveBeenCalledWith(401);
      expect(reply.send).toHaveBeenCalledWith({ error: 'Authentication required' });
    });

    it('should return 403 when user has no access to venue', async () => {
      const request = createMockRequest({
        params: { venueId: 'venue-not-owned' },
        body: { amount: 50000, instant: false },
        user: {
          id: 'user-123',
          venues: ['venue-other'],
          isAdmin: false,
        },
      });
      const reply = createMockReply();

      await controller.requestPayout(request, reply);

      expect(reply.status).toHaveBeenCalledWith(403);
      expect(reply.send).toHaveBeenCalledWith({ error: 'Access denied' });
    });

    it('should allow admin to request payout', async () => {
      const request = createMockRequest({
        params: { venueId: 'venue-456' },
        body: { amount: 100000, instant: false },
        user: {
          id: 'admin-123',
          venues: [],
          isAdmin: true,
        },
      });
      const reply = createMockReply();

      mockVenueBalanceService.processPayout.mockResolvedValue(undefined);

      await controller.requestPayout(request, reply);

      expect(reply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
        })
      );
    });

    it('should handle insufficient funds error', async () => {
      const request = createMockRequest({
        params: { venueId: 'venue-123' },
        body: { amount: 1000000, instant: false },
        user: {
          id: 'user-123',
          venues: ['venue-123'],
          isAdmin: false,
        },
      });
      const reply = createMockReply();

      mockVenueBalanceService.processPayout.mockRejectedValue(
        new Error('Insufficient funds')
      );

      await expect(controller.requestPayout(request, reply)).rejects.toThrow('Insufficient funds');
    });

    it('should handle payout processing errors', async () => {
      const request = createMockRequest({
        params: { venueId: 'venue-123' },
        body: { amount: 50000, instant: true },
        user: {
          id: 'user-123',
          venues: ['venue-123'],
          isAdmin: false,
        },
      });
      const reply = createMockReply();

      mockVenueBalanceService.processPayout.mockRejectedValue(
        new Error('Stripe transfer failed')
      );

      await expect(controller.requestPayout(request, reply)).rejects.toThrow('Stripe transfer failed');
    });

    it('should handle minimum payout amount validation', async () => {
      const request = createMockRequest({
        params: { venueId: 'venue-123' },
        body: { amount: 100, instant: false }, // Below minimum
        user: {
          id: 'user-123',
          venues: ['venue-123'],
          isAdmin: false,
        },
      });
      const reply = createMockReply();

      mockVenueBalanceService.processPayout.mockRejectedValue(
        new Error('Amount below minimum payout threshold')
      );

      await expect(controller.requestPayout(request, reply)).rejects.toThrow('Amount below minimum payout threshold');
    });
  });

  describe('getPayoutHistory', () => {
    it('should return payout history with default pagination', async () => {
      const request = createMockRequest({
        params: { venueId: 'venue-123' },
        query: {},
        user: {
          id: 'user-123',
          venues: ['venue-123'],
          isAdmin: false,
        },
      });
      const reply = createMockReply();

      // Note: Current implementation returns empty array due to TODO
      await controller.getPayoutHistory(request, reply);

      expect(reply.send).toHaveBeenCalledWith([]);
    });

    it('should return 401 when user is not authenticated', async () => {
      const request = createMockRequest({
        params: { venueId: 'venue-123' },
        query: {},
        user: null,
      });
      const reply = createMockReply();

      await controller.getPayoutHistory(request, reply);

      expect(reply.status).toHaveBeenCalledWith(401);
      expect(reply.send).toHaveBeenCalledWith({ error: 'Authentication required' });
    });

    it('should return 403 when user has no access to venue', async () => {
      const request = createMockRequest({
        params: { venueId: 'venue-not-owned' },
        query: {},
        user: {
          id: 'user-123',
          venues: ['venue-other'],
          isAdmin: false,
        },
      });
      const reply = createMockReply();

      await controller.getPayoutHistory(request, reply);

      expect(reply.status).toHaveBeenCalledWith(403);
      expect(reply.send).toHaveBeenCalledWith({ error: 'Access denied' });
    });

    it('should allow admin access to any venue history', async () => {
      const request = createMockRequest({
        params: { venueId: 'venue-any' },
        query: { limit: '20', offset: '0' },
        user: {
          id: 'admin-123',
          venues: [],
          isAdmin: true,
        },
      });
      const reply = createMockReply();

      await controller.getPayoutHistory(request, reply);

      expect(reply.send).toHaveBeenCalled();
    });

    it('should handle custom pagination parameters', async () => {
      const request = createMockRequest({
        params: { venueId: 'venue-123' },
        query: { limit: '25', offset: '50' },
        user: {
          id: 'user-123',
          venues: ['venue-123'],
          isAdmin: false,
        },
      });
      const reply = createMockReply();

      await controller.getPayoutHistory(request, reply);

      // Currently returns empty array, but should work without error
      expect(reply.send).toHaveBeenCalled();
    });
  });

  describe('Authorization Edge Cases', () => {
    it('should grant access when user has multiple venues and owns the requested one', async () => {
      const request = createMockRequest({
        params: { venueId: 'venue-B' },
        user: {
          id: 'user-123',
          venues: ['venue-A', 'venue-B', 'venue-C'],
          isAdmin: false,
        },
      });
      const reply = createMockReply();

      mockVenueBalanceService.getBalance.mockResolvedValue({ available: 1000 });
      mockVenueBalanceService.calculatePayoutAmount.mockResolvedValue({ availableForPayout: 1000 });

      await controller.getBalance(request, reply);

      expect(reply.send).toHaveBeenCalled();
      expect(reply.status).not.toHaveBeenCalledWith(403);
    });

    it('should handle undefined venues array gracefully', async () => {
      const request = createMockRequest({
        params: { venueId: 'venue-123' },
        user: {
          id: 'user-123',
          // venues array not defined
          isAdmin: false,
        },
      });
      const reply = createMockReply();

      await controller.getBalance(request, reply);

      expect(reply.status).toHaveBeenCalledWith(403);
    });

    it('should handle empty venues array', async () => {
      const request = createMockRequest({
        params: { venueId: 'venue-123' },
        user: {
          id: 'user-123',
          venues: [],
          isAdmin: false,
        },
      });
      const reply = createMockReply();

      await controller.getBalance(request, reply);

      expect(reply.status).toHaveBeenCalledWith(403);
    });
  });

  describe('Payout Type Determination', () => {
    it('should default to standard payout when instant is not specified', async () => {
      const request = createMockRequest({
        params: { venueId: 'venue-123' },
        body: { amount: 50000 }, // instant not specified
        user: {
          id: 'user-123',
          venues: ['venue-123'],
          isAdmin: false,
        },
      });
      const reply = createMockReply();

      mockVenueBalanceService.processPayout.mockResolvedValue(undefined);

      await controller.requestPayout(request, reply);

      const response = (reply.send as jest.Mock).mock.calls[0][0];
      expect(response.type).toBe('standard');
      expect(response.estimatedArrival).toBe('1-2 business days');
    });

    it('should handle instant payout with correct estimated arrival', async () => {
      const request = createMockRequest({
        params: { venueId: 'venue-123' },
        body: { amount: 50000, instant: true },
        user: {
          id: 'user-123',
          venues: ['venue-123'],
          isAdmin: false,
        },
      });
      const reply = createMockReply();

      mockVenueBalanceService.processPayout.mockResolvedValue(undefined);

      await controller.requestPayout(request, reply);

      const response = (reply.send as jest.Mock).mock.calls[0][0];
      expect(response.type).toBe('instant');
      expect(response.estimatedArrival).toBe('Within 30 minutes');
    });

    it('should handle explicit false for instant payout', async () => {
      const request = createMockRequest({
        params: { venueId: 'venue-123' },
        body: { amount: 50000, instant: false },
        user: {
          id: 'user-123',
          venues: ['venue-123'],
          isAdmin: false,
        },
      });
      const reply = createMockReply();

      mockVenueBalanceService.processPayout.mockResolvedValue(undefined);

      await controller.requestPayout(request, reply);

      const response = (reply.send as jest.Mock).mock.calls[0][0];
      expect(response.type).toBe('standard');
    });
  });

  describe('Amount Handling', () => {
    it('should handle large payout amounts', async () => {
      const request = createMockRequest({
        params: { venueId: 'venue-123' },
        body: { amount: 10000000, instant: false }, // $100,000
        user: {
          id: 'user-123',
          venues: ['venue-123'],
          isAdmin: false,
        },
      });
      const reply = createMockReply();

      mockVenueBalanceService.processPayout.mockResolvedValue(undefined);

      await controller.requestPayout(request, reply);

      expect(reply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          amount: 10000000,
        })
      );
    });

    it('should pass exact amount to service', async () => {
      const request = createMockRequest({
        params: { venueId: 'venue-123' },
        body: { amount: 12345, instant: false },
        user: {
          id: 'user-123',
          venues: ['venue-123'],
          isAdmin: false,
        },
      });
      const reply = createMockReply();

      mockVenueBalanceService.processPayout.mockResolvedValue(undefined);

      await controller.requestPayout(request, reply);

      expect(mockVenueBalanceService.processPayout).toHaveBeenCalledWith('venue-123', 12345);
    });
  });
});
