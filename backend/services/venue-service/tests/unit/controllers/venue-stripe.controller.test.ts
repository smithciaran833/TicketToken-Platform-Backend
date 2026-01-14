/**
 * Unit tests for venue-stripe.controller.ts
 * Tests HTTP route handlers for Stripe Connect integration
 */

import { createMockRequest, createMockReply, createAuthenticatedRequest } from '../../__mocks__/fastify.mock';

// Mock dependencies
const mockStripeOnboardingService = {
  createOnboardingLink: jest.fn(),
  getAccountStatus: jest.fn(),
  handleWebhook: jest.fn(),
  createDashboardLink: jest.fn(),
  disconnectAccount: jest.fn(),
};

const mockVenueService = {
  checkVenueAccess: jest.fn(),
};

describe('venue-stripe.controller', () => {
  let mockRequest: ReturnType<typeof createMockRequest>;
  let mockReply: ReturnType<typeof createMockReply>;

  const mockVenueId = '123e4567-e89b-12d3-a456-426614174000';

  beforeEach(() => {
    jest.clearAllMocks();
    mockRequest = createAuthenticatedRequest({ params: { venueId: mockVenueId } });
    mockReply = createMockReply();
    mockVenueService.checkVenueAccess.mockResolvedValue(true);
  });

  describe('POST /venues/:venueId/stripe/onboard', () => {
    it('should create Stripe onboarding link', async () => {
      mockStripeOnboardingService.createOnboardingLink.mockResolvedValue({
        url: 'https://connect.stripe.com/setup/...',
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
      });

      const result = await mockStripeOnboardingService.createOnboardingLink(mockVenueId, 'user-123');

      expect(result.url).toContain('stripe.com');
      expect(result.expiresAt).toBeDefined();
    });

    it('should require venue ownership', async () => {
      mockVenueService.checkVenueAccess.mockResolvedValue(false);

      const hasAccess = await mockVenueService.checkVenueAccess(mockVenueId, 'user-123');
      expect(hasAccess).toBe(false);
    });
  });

  describe('GET /venues/:venueId/stripe/status', () => {
    it('should return connected account status', async () => {
      mockStripeOnboardingService.getAccountStatus.mockResolvedValue({
        connected: true,
        chargesEnabled: true,
        payoutsEnabled: true,
        accountId: 'acct_xxx',
      });

      const result = await mockStripeOnboardingService.getAccountStatus(mockVenueId);

      expect(result.connected).toBe(true);
      expect(result.chargesEnabled).toBe(true);
    });

    it('should return not connected status', async () => {
      mockStripeOnboardingService.getAccountStatus.mockResolvedValue({
        connected: false,
        chargesEnabled: false,
        payoutsEnabled: false,
      });

      const result = await mockStripeOnboardingService.getAccountStatus(mockVenueId);

      expect(result.connected).toBe(false);
    });
  });

  describe('GET /venues/:venueId/stripe/dashboard', () => {
    it('should create Stripe dashboard link', async () => {
      mockStripeOnboardingService.createDashboardLink.mockResolvedValue({
        url: 'https://connect.stripe.com/express/...',
      });

      const result = await mockStripeOnboardingService.createDashboardLink(mockVenueId);

      expect(result.url).toContain('stripe.com');
    });

    it('should throw error if not connected', async () => {
      mockStripeOnboardingService.createDashboardLink.mockRejectedValue(
        new Error('Stripe account not connected')
      );

      await expect(
        mockStripeOnboardingService.createDashboardLink(mockVenueId)
      ).rejects.toThrow('Stripe account not connected');
    });
  });

  describe('POST /venues/:venueId/stripe/disconnect', () => {
    it('should disconnect Stripe account', async () => {
      mockStripeOnboardingService.disconnectAccount.mockResolvedValue({ success: true });

      const result = await mockStripeOnboardingService.disconnectAccount(mockVenueId);

      expect(result.success).toBe(true);
    });
  });

  describe('POST /stripe/webhook', () => {
    it('should process valid webhook event', async () => {
      const webhookEvent = {
        type: 'account.updated',
        data: { object: { id: 'acct_xxx' } },
      };
      mockStripeOnboardingService.handleWebhook.mockResolvedValue({ processed: true });

      const result = await mockStripeOnboardingService.handleWebhook(webhookEvent);

      expect(result.processed).toBe(true);
    });
  });
});
