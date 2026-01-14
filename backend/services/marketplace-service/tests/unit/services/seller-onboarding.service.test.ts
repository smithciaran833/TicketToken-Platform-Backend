/**
 * Unit Tests for seller-onboarding.service.ts
 * Tests Stripe Connect account creation and seller onboarding
 */

import { sellerOnboardingService } from '../../../src/services/seller-onboarding.service';

// Mock dependencies
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

jest.mock('../../../src/config/database', () => {
  const mockDb = jest.fn(() => mockDb);
  Object.assign(mockDb, {
    where: jest.fn().mockReturnThis(),
    first: jest.fn(),
    insert: jest.fn(),
    update: jest.fn(),
  });
  return { db: mockDb };
});

jest.mock('stripe', () => {
  return jest.fn().mockImplementation(() => ({
    accounts: {
      create: jest.fn(),
      retrieve: jest.fn(),
      update: jest.fn(),
    },
    accountLinks: {
      create: jest.fn(),
    },
  }));
});

import { db } from '../../../src/config/database';
import Stripe from 'stripe';

describe('SellerOnboardingService', () => {
  const mockDb = db as jest.MockedFunction<any>;
  let mockStripe: jest.Mocked<Stripe>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockStripe = new Stripe('test_key') as jest.Mocked<Stripe>;
  });

  describe('createConnectAccountAndOnboardingLink', () => {
    it('should create a new Stripe Connect account', async () => {
      const mockAccount = {
        id: 'acct_test123',
        type: 'express',
      };

      (mockStripe.accounts.create as jest.Mock).mockResolvedValue(mockAccount);
      (mockStripe.accountLinks.create as jest.Mock).mockResolvedValue({
        url: 'https://connect.stripe.com/onboard',
      });

      mockDb.mockReturnValue({
        insert: jest.fn().mockResolvedValue([1]),
      });

      const result = await sellerOnboardingService.createConnectAccountAndOnboardingLink(
        'user-123',
        'seller@example.com'
      );

      expect(result).toBeDefined();
      expect(result.accountId).toBeDefined();
      expect(result.onboardingUrl).toBeDefined();
    });

    it('should return existing account if already created', async () => {
      mockDb.mockReturnValue({
        where: jest.fn().mockReturnValue({
          first: jest.fn().mockResolvedValue({
            user_id: 'user-123',
            stripe_account_id: 'acct_existing',
            status: 'pending',
          }),
        }),
      });

      (mockStripe.accountLinks.create as jest.Mock).mockResolvedValue({
        url: 'https://connect.stripe.com/onboard',
      });

      const result = await sellerOnboardingService.createConnectAccountAndOnboardingLink(
        'user-123',
        'seller@example.com'
      );

      expect(result.accountId).toBe('acct_existing');
    });

    it('should handle Stripe API errors', async () => {
      mockDb.mockReturnValue({
        where: jest.fn().mockReturnValue({
          first: jest.fn().mockResolvedValue(null),
        }),
      });

      (mockStripe.accounts.create as jest.Mock).mockRejectedValue(
        new Error('Stripe API error')
      );

      await expect(
        sellerOnboardingService.createConnectAccountAndOnboardingLink(
          'user-123',
          'seller@example.com'
        )
      ).rejects.toThrow('Stripe API error');
    });
  });

  describe('getAccountStatus', () => {
    it('should return account status', async () => {
      mockDb.mockReturnValue({
        where: jest.fn().mockReturnValue({
          first: jest.fn().mockResolvedValue({
            user_id: 'user-123',
            stripe_account_id: 'acct_test123',
            status: 'verified',
            charges_enabled: true,
            payouts_enabled: true,
          }),
        }),
      });

      const status = await sellerOnboardingService.getAccountStatus('user-123');

      expect(status).toBeDefined();
      expect(status!.status).toBe('verified');
      expect(status!.charges_enabled).toBe(true);
    });

    it('should return null if no account exists', async () => {
      mockDb.mockReturnValue({
        where: jest.fn().mockReturnValue({
          first: jest.fn().mockResolvedValue(null),
        }),
      });

      const status = await sellerOnboardingService.getAccountStatus('user-123');

      expect(status).toBeNull();
    });

    it('should fetch live status from Stripe', async () => {
      mockDb.mockReturnValue({
        where: jest.fn().mockReturnValue({
          first: jest.fn().mockResolvedValue({
            user_id: 'user-123',
            stripe_account_id: 'acct_test123',
            status: 'pending',
          }),
        }),
      });

      (mockStripe.accounts.retrieve as jest.Mock).mockResolvedValue({
        id: 'acct_test123',
        charges_enabled: true,
        payouts_enabled: true,
        requirements: {
          currently_due: [],
        },
      });

      const status = await sellerOnboardingService.getAccountStatus('user-123', true);

      expect(status).toBeDefined();
    });
  });

  describe('handleAccountUpdated', () => {
    it('should update local record on webhook', async () => {
      const updateMock = jest.fn().mockResolvedValue(1);
      mockDb.mockReturnValue({
        where: jest.fn().mockReturnValue({
          update: updateMock,
        }),
      });

      await sellerOnboardingService.handleAccountUpdated({
        id: 'acct_test123',
        charges_enabled: true,
        payouts_enabled: true,
        requirements: { currently_due: [] },
      });

      expect(updateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          charges_enabled: true,
          payouts_enabled: true,
        })
      );
    });

    it('should update status to verified when complete', async () => {
      const updateMock = jest.fn().mockResolvedValue(1);
      mockDb.mockReturnValue({
        where: jest.fn().mockReturnValue({
          update: updateMock,
        }),
      });

      await sellerOnboardingService.handleAccountUpdated({
        id: 'acct_test123',
        charges_enabled: true,
        payouts_enabled: true,
        requirements: { currently_due: [] },
      });

      expect(updateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'verified',
        })
      );
    });

    it('should update status to restricted when requirements pending', async () => {
      const updateMock = jest.fn().mockResolvedValue(1);
      mockDb.mockReturnValue({
        where: jest.fn().mockReturnValue({
          update: updateMock,
        }),
      });

      await sellerOnboardingService.handleAccountUpdated({
        id: 'acct_test123',
        charges_enabled: false,
        payouts_enabled: false,
        requirements: { currently_due: ['external_account'] },
      });

      expect(updateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'restricted',
        })
      );
    });
  });

  describe('canAcceptFiatPayments', () => {
    it('should return true if charges enabled', async () => {
      mockDb.mockReturnValue({
        where: jest.fn().mockReturnValue({
          first: jest.fn().mockResolvedValue({
            user_id: 'user-123',
            stripe_account_id: 'acct_test123',
            charges_enabled: true,
            status: 'verified',
          }),
        }),
      });

      const canAccept = await sellerOnboardingService.canAcceptFiatPayments('user-123');

      expect(canAccept).toBe(true);
    });

    it('should return false if charges not enabled', async () => {
      mockDb.mockReturnValue({
        where: jest.fn().mockReturnValue({
          first: jest.fn().mockResolvedValue({
            user_id: 'user-123',
            stripe_account_id: 'acct_test123',
            charges_enabled: false,
            status: 'pending',
          }),
        }),
      });

      const canAccept = await sellerOnboardingService.canAcceptFiatPayments('user-123');

      expect(canAccept).toBe(false);
    });

    it('should return false if no account exists', async () => {
      mockDb.mockReturnValue({
        where: jest.fn().mockReturnValue({
          first: jest.fn().mockResolvedValue(null),
        }),
      });

      const canAccept = await sellerOnboardingService.canAcceptFiatPayments('user-123');

      expect(canAccept).toBe(false);
    });
  });

  describe('getOnboardingRefreshLink', () => {
    it('should generate a new onboarding link', async () => {
      mockDb.mockReturnValue({
        where: jest.fn().mockReturnValue({
          first: jest.fn().mockResolvedValue({
            user_id: 'user-123',
            stripe_account_id: 'acct_test123',
          }),
        }),
      });

      (mockStripe.accountLinks.create as jest.Mock).mockResolvedValue({
        url: 'https://connect.stripe.com/refresh',
      });

      const link = await sellerOnboardingService.getOnboardingRefreshLink('user-123');

      expect(link).toBe('https://connect.stripe.com/refresh');
    });

    it('should throw if no account exists', async () => {
      mockDb.mockReturnValue({
        where: jest.fn().mockReturnValue({
          first: jest.fn().mockResolvedValue(null),
        }),
      });

      await expect(
        sellerOnboardingService.getOnboardingRefreshLink('user-123')
      ).rejects.toThrow();
    });
  });

  describe('Service export', () => {
    it('should export sellerOnboardingService object', () => {
      expect(sellerOnboardingService).toBeDefined();
      expect(sellerOnboardingService.createConnectAccountAndOnboardingLink).toBeDefined();
      expect(sellerOnboardingService.getAccountStatus).toBeDefined();
      expect(sellerOnboardingService.handleAccountUpdated).toBeDefined();
      expect(sellerOnboardingService.canAcceptFiatPayments).toBeDefined();
    });
  });
});
