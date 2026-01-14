/**
 * Unit Tests for SellerOnboardingController
 * Tests HTTP handlers for Stripe Connect seller onboarding
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import { SellerOnboardingController, sellerOnboardingController } from '../../../src/controllers/seller-onboarding.controller';
import { sellerOnboardingService } from '../../../src/services/seller-onboarding.service';

// Mock dependencies
jest.mock('../../../src/services/seller-onboarding.service');
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    child: jest.fn().mockReturnThis(),
  },
}));

describe('SellerOnboardingController', () => {
  let controller: SellerOnboardingController;
  let mockRequest: Partial<FastifyRequest>;
  let mockReply: Partial<FastifyReply>;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new SellerOnboardingController();

    mockRequest = {
      user: { id: 'user-123', email: 'seller@example.com' },
      params: {},
      query: {},
      body: {},
    } as any;

    mockReply = {
      send: jest.fn().mockReturnThis(),
      status: jest.fn().mockReturnThis(),
      code: jest.fn().mockReturnThis(),
    };

    // Set environment variable for tests
    process.env.FRONTEND_URL = 'http://localhost:3000';
  });

  afterEach(() => {
    delete process.env.FRONTEND_URL;
  });

  describe('startOnboarding', () => {
    it('should start onboarding with default URLs', async () => {
      const mockResult = {
        accountId: 'acct_123',
        onboardingUrl: 'https://connect.stripe.com/onboarding/abc',
        accountStatus: 'pending',
      };

      mockRequest.body = {};

      (sellerOnboardingService.createConnectAccountAndOnboardingLink as jest.Mock).mockResolvedValue(mockResult);

      await controller.startOnboarding(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(sellerOnboardingService.createConnectAccountAndOnboardingLink).toHaveBeenCalledWith(
        'user-123',
        'seller@example.com',
        'http://localhost:3000/seller/onboarding/complete',
        'http://localhost:3000/seller/onboarding'
      );

      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        data: {
          accountId: 'acct_123',
          onboardingUrl: 'https://connect.stripe.com/onboarding/abc',
          accountStatus: 'pending',
        },
      });
    });

    it('should start onboarding with custom URLs', async () => {
      const mockResult = {
        accountId: 'acct_456',
        onboardingUrl: 'https://connect.stripe.com/onboarding/xyz',
        accountStatus: 'pending',
      };

      mockRequest.body = {
        returnUrl: 'https://custom.com/return',
        refreshUrl: 'https://custom.com/refresh',
      };

      (sellerOnboardingService.createConnectAccountAndOnboardingLink as jest.Mock).mockResolvedValue(mockResult);

      await controller.startOnboarding(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(sellerOnboardingService.createConnectAccountAndOnboardingLink).toHaveBeenCalledWith(
        'user-123',
        'seller@example.com',
        'https://custom.com/return',
        'https://custom.com/refresh'
      );
    });

    it('should return 401 if user is not authenticated', async () => {
      (mockRequest as any).user = undefined;

      await controller.startOnboarding(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(401);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Authentication required' });
    });

    it('should return 401 if user email is missing', async () => {
      (mockRequest as any).user = { id: 'user-123' };

      await controller.startOnboarding(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(401);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Authentication required' });
    });

    it('should return 500 on service error', async () => {
      (sellerOnboardingService.createConnectAccountAndOnboardingLink as jest.Mock).mockRejectedValue(
        new Error('Stripe API error')
      );

      await controller.startOnboarding(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(500);
      expect(mockReply.send).toHaveBeenCalledWith({
        error: 'Failed to start onboarding',
        message: 'Stripe API error',
      });
    });
  });

  describe('getStatus', () => {
    it('should return account status', async () => {
      const mockStatus = {
        accountId: 'acct_123',
        chargesEnabled: true,
        payoutsEnabled: true,
        onboardingComplete: true,
        requirements: [],
      };

      (sellerOnboardingService.getAccountStatus as jest.Mock).mockResolvedValue(mockStatus);

      await controller.getStatus(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(sellerOnboardingService.getAccountStatus).toHaveBeenCalledWith('user-123');
      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        data: mockStatus,
      });
    });

    it('should return 401 if user is not authenticated', async () => {
      (mockRequest as any).user = undefined;

      await controller.getStatus(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(401);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Authentication required' });
    });

    it('should return 500 on service error', async () => {
      (sellerOnboardingService.getAccountStatus as jest.Mock).mockRejectedValue(
        new Error('Account not found')
      );

      await controller.getStatus(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(500);
      expect(mockReply.send).toHaveBeenCalledWith({
        error: 'Failed to retrieve account status',
        message: 'Account not found',
      });
    });
  });

  describe('refreshOnboardingLink', () => {
    it('should refresh onboarding link with default URLs', async () => {
      mockRequest.body = {};

      (sellerOnboardingService.refreshOnboardingLink as jest.Mock).mockResolvedValue(
        'https://connect.stripe.com/onboarding/new-link'
      );

      await controller.refreshOnboardingLink(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(sellerOnboardingService.refreshOnboardingLink).toHaveBeenCalledWith(
        'user-123',
        'http://localhost:3000/seller/onboarding/complete',
        'http://localhost:3000/seller/onboarding'
      );

      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        data: {
          onboardingUrl: 'https://connect.stripe.com/onboarding/new-link',
        },
      });
    });

    it('should refresh onboarding link with custom URLs', async () => {
      mockRequest.body = {
        returnUrl: 'https://custom.com/return',
        refreshUrl: 'https://custom.com/refresh',
      };

      (sellerOnboardingService.refreshOnboardingLink as jest.Mock).mockResolvedValue(
        'https://connect.stripe.com/onboarding/custom'
      );

      await controller.refreshOnboardingLink(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(sellerOnboardingService.refreshOnboardingLink).toHaveBeenCalledWith(
        'user-123',
        'https://custom.com/return',
        'https://custom.com/refresh'
      );
    });

    it('should return 401 if user is not authenticated', async () => {
      (mockRequest as any).user = undefined;

      await controller.refreshOnboardingLink(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(401);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Authentication required' });
    });

    it('should return 500 on service error', async () => {
      (sellerOnboardingService.refreshOnboardingLink as jest.Mock).mockRejectedValue(
        new Error('No account found')
      );

      await controller.refreshOnboardingLink(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(500);
      expect(mockReply.send).toHaveBeenCalledWith({
        error: 'Failed to refresh onboarding link',
        message: 'No account found',
      });
    });
  });

  describe('canAcceptFiat', () => {
    it('should return true when seller can accept fiat payments', async () => {
      (sellerOnboardingService.canAcceptFiatPayments as jest.Mock).mockResolvedValue(true);

      await controller.canAcceptFiat(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(sellerOnboardingService.canAcceptFiatPayments).toHaveBeenCalledWith('user-123');
      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        data: {
          canAcceptFiatPayments: true,
        },
      });
    });

    it('should return false when seller cannot accept fiat payments', async () => {
      (sellerOnboardingService.canAcceptFiatPayments as jest.Mock).mockResolvedValue(false);

      await controller.canAcceptFiat(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        data: {
          canAcceptFiatPayments: false,
        },
      });
    });

    it('should return 401 if user is not authenticated', async () => {
      (mockRequest as any).user = undefined;

      await controller.canAcceptFiat(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(401);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Authentication required' });
    });

    it('should return 500 on service error', async () => {
      (sellerOnboardingService.canAcceptFiatPayments as jest.Mock).mockRejectedValue(
        new Error('Database error')
      );

      await controller.canAcceptFiat(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(500);
      expect(mockReply.send).toHaveBeenCalledWith({
        error: 'Failed to check eligibility',
        message: 'Database error',
      });
    });
  });

  describe('exported instance', () => {
    it('should export controller instance', () => {
      expect(sellerOnboardingController).toBeInstanceOf(SellerOnboardingController);
    });
  });
});
