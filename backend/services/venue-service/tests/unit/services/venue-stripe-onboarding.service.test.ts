/**
 * Unit tests for VenueStripeOnboardingService
 * SECURITY TESTS: ST8 (locked API version), DS4 (circuit breaker), PF4 (idempotency)
 */

import { createKnexMock, configureMockReturn } from '../../__mocks__/knex.mock';

// Mock dependencies before imports
jest.mock('../../../src/config/database', () => ({
  db: createKnexMock(),
}));

jest.mock('../../../src/config/index', () => ({
  getConfig: jest.fn().mockReturnValue({
    stripe: {
      secretKey: 'sk_test_mock_key_12345',
    },
  }),
}));

jest.mock('../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    child: jest.fn().mockReturnValue({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    }),
  },
}));

// Mock Stripe
const mockStripeAccounts = {
  create: jest.fn(),
  retrieve: jest.fn(),
};

const mockStripeAccountLinks = {
  create: jest.fn(),
};

jest.mock('stripe', () => {
  return jest.fn().mockImplementation(() => ({
    accounts: mockStripeAccounts,
    accountLinks: mockStripeAccountLinks,
  }));
});

import {
  VenueStripeOnboardingService,
  createStripeClient,
  stripeCircuitBreaker,
  STRIPE_API_VERSION,
} from '../../../src/services/venue-stripe-onboarding.service';
import { db } from '../../../src/config/database';
import { getConfig } from '../../../src/config/index';
import Stripe from 'stripe';

describe('VenueStripeOnboardingService', () => {
  let service: VenueStripeOnboardingService;
  let mockDb: any;

  const mockVenueId = '123e4567-e89b-12d3-a456-426614174000';
  const mockAccountId = 'acct_1234567890';
  const mockEmail = 'venue@example.com';
  const mockReturnUrl = 'https://example.com/return';
  const mockRefreshUrl = 'https://example.com/refresh';

  beforeEach(() => {
    jest.clearAllMocks();

    // Get the mocked db
    mockDb = db as any;
    
    // Reset stripe mocks
    mockStripeAccounts.create.mockResolvedValue({
      id: mockAccountId,
    });
    mockStripeAccounts.retrieve.mockResolvedValue({
      id: mockAccountId,
      charges_enabled: true,
      payouts_enabled: true,
      details_submitted: true,
      capabilities: {},
      country: 'US',
      requirements: {
        currently_due: [],
        eventually_due: [],
        past_due: [],
      },
    });
    mockStripeAccountLinks.create.mockResolvedValue({
      url: 'https://connect.stripe.com/onboarding/mock',
    });

    service = new VenueStripeOnboardingService();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('STRIPE_API_VERSION', () => {
    it('should have a locked API version (ST8)', () => {
      expect(STRIPE_API_VERSION).toBe('2025-12-15.clover');
    });
  });

  describe('createStripeClient', () => {
    it('should create Stripe client with locked API version (ST8)', () => {
      createStripeClient();
      
      expect(Stripe).toHaveBeenCalledWith('sk_test_mock_key_12345', {
        apiVersion: STRIPE_API_VERSION,
        timeout: 30000,
        maxNetworkRetries: 2,
      });
    });

    it('should throw error if STRIPE_SECRET_KEY not configured', () => {
      (getConfig as jest.Mock).mockReturnValueOnce({
        stripe: {
          secretKey: '',
        },
      });

      expect(() => createStripeClient()).toThrow('STRIPE_SECRET_KEY not configured');
    });
  });

  describe('StripeCircuitBreaker', () => {
    it('should execute operation successfully', async () => {
      const mockOperation = jest.fn().mockResolvedValue('success');
      
      const result = await stripeCircuitBreaker.execute(mockOperation, 'testOperation');
      
      expect(result).toBe('success');
      expect(mockOperation).toHaveBeenCalled();
    });

    it('should return circuit breaker state', () => {
      const state = stripeCircuitBreaker.getState();
      
      expect(state).toHaveProperty('isOpen');
      expect(state).toHaveProperty('failures');
      expect(state).toHaveProperty('lastFailure');
    });
  });

  describe('createConnectAccountAndOnboardingLink', () => {
    it('should create new Connect account when none exists', async () => {
      // Mock no existing account
      mockDb._mockChain.first.mockResolvedValue(null);
      mockDb._mockChain.update.mockResolvedValue(1);

      const result = await service.createConnectAccountAndOnboardingLink(
        mockVenueId,
        mockEmail,
        mockReturnUrl,
        mockRefreshUrl
      );

      expect(result).toHaveProperty('accountId', mockAccountId);
      expect(result).toHaveProperty('onboardingUrl');
      expect(result).toHaveProperty('accountStatus');
      expect(mockStripeAccounts.create).toHaveBeenCalled();
    });

    it('should use existing Connect account if present', async () => {
      // Mock existing account
      mockDb._mockChain.first.mockResolvedValue({
        stripe_connect_account_id: mockAccountId,
        stripe_connect_status: 'pending',
      });

      const result = await service.createConnectAccountAndOnboardingLink(
        mockVenueId,
        mockEmail,
        mockReturnUrl,
        mockRefreshUrl
      );

      expect(result.accountId).toBe(mockAccountId);
      expect(mockStripeAccounts.create).not.toHaveBeenCalled();
      expect(mockStripeAccountLinks.create).toHaveBeenCalled();
    });

    it('should include idempotency key for account creation (PF4)', async () => {
      mockDb._mockChain.first.mockResolvedValue(null);
      mockDb._mockChain.update.mockResolvedValue(1);

      await service.createConnectAccountAndOnboardingLink(
        mockVenueId,
        mockEmail,
        mockReturnUrl,
        mockRefreshUrl
      );

      expect(mockStripeAccounts.create).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          idempotencyKey: `connect-create:${mockVenueId}`,
        })
      );
    });

    it('should handle Stripe errors gracefully', async () => {
      mockDb._mockChain.first.mockResolvedValue(null);
      mockStripeAccounts.create.mockRejectedValueOnce(new Error('Stripe API Error'));

      await expect(
        service.createConnectAccountAndOnboardingLink(mockVenueId, mockEmail, mockReturnUrl, mockRefreshUrl)
      ).rejects.toThrow('Stripe Connect onboarding failed');
    });
  });

  describe('getAccountStatus', () => {
    it('should return not_started status when no account exists', async () => {
      mockDb._mockChain.first.mockResolvedValue(null);

      const result = await service.getAccountStatus(mockVenueId);

      expect(result).toEqual({
        accountId: null,
        status: 'not_started',
        chargesEnabled: false,
        payoutsEnabled: false,
        detailsSubmitted: false,
        requirements: {
          currentlyDue: [],
          eventuallyDue: [],
          pastDue: [],
        },
      });
    });

    it('should return enabled status when charges and payouts enabled', async () => {
      mockDb._mockChain.first.mockResolvedValue({
        stripe_connect_account_id: mockAccountId,
        stripe_connect_status: 'enabled',
      });
      mockDb._mockChain.update.mockResolvedValue(1);

      const result = await service.getAccountStatus(mockVenueId);

      expect(result.status).toBe('enabled');
      expect(result.chargesEnabled).toBe(true);
      expect(result.payoutsEnabled).toBe(true);
    });

    it('should return pending status when details not submitted', async () => {
      mockDb._mockChain.first.mockResolvedValue({
        stripe_connect_account_id: mockAccountId,
      });
      mockDb._mockChain.update.mockResolvedValue(1);

      mockStripeAccounts.retrieve.mockResolvedValueOnce({
        id: mockAccountId,
        charges_enabled: false,
        payouts_enabled: false,
        details_submitted: false,
        requirements: {
          currently_due: ['individual.first_name'],
          eventually_due: [],
          past_due: [],
        },
      });

      const result = await service.getAccountStatus(mockVenueId);

      expect(result.status).toBe('pending');
      expect(result.requirements.currentlyDue).toContain('individual.first_name');
    });

    it('should return disabled status when account has disabled_reason', async () => {
      mockDb._mockChain.first.mockResolvedValue({
        stripe_connect_account_id: mockAccountId,
      });
      mockDb._mockChain.update.mockResolvedValue(1);

      mockStripeAccounts.retrieve.mockResolvedValueOnce({
        id: mockAccountId,
        charges_enabled: false,
        payouts_enabled: false,
        details_submitted: false,
        requirements: {
          disabled_reason: 'requirements.past_due',
          currently_due: [],
          eventually_due: [],
          past_due: ['external_account'],
        },
      });

      const result = await service.getAccountStatus(mockVenueId);

      expect(result.status).toBe('disabled');
    });
  });

  describe('refreshOnboardingLink', () => {
    it('should generate new onboarding link', async () => {
      mockDb._mockChain.first.mockResolvedValue({
        stripe_connect_account_id: mockAccountId,
      });

      const result = await service.refreshOnboardingLink(mockVenueId, mockReturnUrl, mockRefreshUrl);

      expect(result).toBe('https://connect.stripe.com/onboarding/mock');
      expect(mockStripeAccountLinks.create).toHaveBeenCalledWith(
        expect.objectContaining({
          account: mockAccountId,
          type: 'account_onboarding',
        }),
        expect.any(Object)
      );
    });

    it('should throw error if venue has no Connect account', async () => {
      mockDb._mockChain.first.mockResolvedValue(null);

      await expect(
        service.refreshOnboardingLink(mockVenueId, mockReturnUrl, mockRefreshUrl)
      ).rejects.toThrow('Venue does not have a Stripe Connect account');
    });
  });

  describe('handleAccountUpdated', () => {
    it('should update venue status from webhook', async () => {
      mockDb._mockChain.update.mockResolvedValue(1);

      const mockAccount = {
        id: mockAccountId,
        charges_enabled: true,
        payouts_enabled: true,
        details_submitted: true,
        capabilities: { card_payments: 'active' },
        country: 'US',
        metadata: { venue_id: mockVenueId },
      } as unknown as Stripe.Account;

      await service.handleAccountUpdated(mockAccount);

      expect(mockDb._mockChain.update).toHaveBeenCalled();
    });

    it('should skip if venue_id not in metadata', async () => {
      const mockAccount = {
        id: mockAccountId,
        metadata: {},
      } as unknown as Stripe.Account;

      await service.handleAccountUpdated(mockAccount);

      // Should not throw and db.update should not be called for actual update
      expect(mockDb._mockChain.update).not.toHaveBeenCalled();
    });
  });

  describe('canAcceptPayments', () => {
    it('should return true if charges and payouts enabled', async () => {
      mockDb._mockChain.first.mockResolvedValue({
        stripe_connect_charges_enabled: true,
        stripe_connect_payouts_enabled: true,
      });

      const result = await service.canAcceptPayments(mockVenueId);

      expect(result).toBe(true);
    });

    it('should return false if charges not enabled', async () => {
      mockDb._mockChain.first.mockResolvedValue({
        stripe_connect_charges_enabled: false,
        stripe_connect_payouts_enabled: true,
      });

      const result = await service.canAcceptPayments(mockVenueId);

      expect(result).toBe(false);
    });

    it('should return false if payouts not enabled', async () => {
      mockDb._mockChain.first.mockResolvedValue({
        stripe_connect_charges_enabled: true,
        stripe_connect_payouts_enabled: false,
      });

      const result = await service.canAcceptPayments(mockVenueId);

      expect(result).toBe(false);
    });

    it('should return false on database error', async () => {
      mockDb._mockChain.first.mockRejectedValue(new Error('DB Error'));

      const result = await service.canAcceptPayments(mockVenueId);

      expect(result).toBe(false);
    });
  });
});

