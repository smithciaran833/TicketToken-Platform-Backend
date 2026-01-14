/**
 * Unit tests for src/integrations/verification-adapters.ts
 * Tests external verification adapters: Stripe Identity, Plaid, Tax, Business
 * CRITICAL: Security-sensitive, handles external verification
 */

import {
  StripeIdentityAdapter,
  PlaidAdapter,
  TaxVerificationAdapter,
  BusinessVerificationAdapter,
  VerificationAdapterFactory,
} from '../../../src/integrations/verification-adapters';

// Mock axios
jest.mock('axios', () => ({
  create: jest.fn().mockReturnValue({
    post: jest.fn(),
    get: jest.fn(),
  }),
}));

// Mock database
jest.mock('../../../src/config/database', () => ({
  db: jest.fn(),
}));

// Mock logger
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

describe('integrations/verification-adapters', () => {
  let mockDb: any;
  let mockAxiosInstance: any;

  const setupDbMock = () => {
    const chainMock: any = {
      where: jest.fn().mockReturnThis(),
      first: jest.fn(),
      insert: jest.fn().mockReturnThis(),
      update: jest.fn().mockResolvedValue(1),
      returning: jest.fn().mockResolvedValue([{ id: 'verification-123' }]),
    };

    mockDb = jest.fn((tableName: string) => chainMock);
    mockDb._chain = chainMock;

    const dbModule = require('../../../src/config/database');
    dbModule.db = mockDb;

    return chainMock;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.STRIPE_SECRET_KEY = 'sk_test_123';
    process.env.PLAID_CLIENT_ID = 'plaid_client_123';
    process.env.PLAID_SECRET = 'plaid_secret_123';
    process.env.PLAID_ENV = 'sandbox';
    process.env.API_BASE_URL = 'https://api.tickettoken.com';

    const axios = require('axios');
    mockAxiosInstance = {
      post: jest.fn(),
      get: jest.fn(),
    };
    axios.create.mockReturnValue(mockAxiosInstance);
  });

  describe('StripeIdentityAdapter', () => {
    let adapter: StripeIdentityAdapter;

    beforeEach(() => {
      adapter = new StripeIdentityAdapter();
    });

    describe('verify()', () => {
      const verifyData = {
        venueId: 'venue-123',
        documentType: 'drivers_license',
        documentData: { name: 'John Doe' },
      };

      it('should create verification session on success', async () => {
        const chain = setupDbMock();
        mockAxiosInstance.post.mockResolvedValue({
          data: {
            id: 'vs_123',
            url: 'https://verify.stripe.com/session',
            client_secret: 'cs_123',
          },
        });

        const result = await adapter.verify(verifyData);

        expect(result.success).toBe(true);
        expect(result.verificationId).toBe('vs_123');
        expect(result.status).toBe('pending');
        expect(result.details).toHaveProperty('sessionUrl');
        expect(result.details).toHaveProperty('clientSecret');
      });

      it('should store verification reference in database', async () => {
        const chain = setupDbMock();
        mockAxiosInstance.post.mockResolvedValue({
          data: { id: 'vs_123', url: 'https://verify.stripe.com', client_secret: 'cs_123' },
        });

        await adapter.verify(verifyData);

        expect(mockDb).toHaveBeenCalledWith('external_verifications');
        expect(chain.insert).toHaveBeenCalledWith(
          expect.objectContaining({
            venue_id: 'venue-123',
            provider: 'stripe_identity',
            verification_type: 'identity',
            external_id: 'vs_123',
            status: 'pending',
          })
        );
      });

      it('should return failed status on API error', async () => {
        setupDbMock();
        mockAxiosInstance.post.mockRejectedValue(new Error('API Error'));

        const result = await adapter.verify(verifyData);

        expect(result.success).toBe(false);
        expect(result.status).toBe('failed');
        expect(result.error).toBe('API Error');
      });

      it('should log verification attempt', async () => {
        const { logger } = require('../../../src/utils/logger');
        setupDbMock();
        mockAxiosInstance.post.mockResolvedValue({
          data: { id: 'vs_123', url: 'https://verify.stripe.com', client_secret: 'cs_123' },
        });

        await adapter.verify(verifyData);

        expect(logger.info).toHaveBeenCalledWith(
          expect.objectContaining({ venueId: 'venue-123', documentType: 'drivers_license' }),
          expect.any(String)
        );
      });
    });

    describe('checkStatus()', () => {
      it('should return verified status', async () => {
        mockAxiosInstance.get.mockResolvedValue({
          data: {
            status: 'verified',
            last_verification_report: { verified_at: 1704067200 },
          },
        });

        const result = await adapter.checkStatus('vs_123');

        expect(result.status).toBe('verified');
        expect(result.completedAt).toBeDefined();
      });

      it('should return pending for requires_input status', async () => {
        mockAxiosInstance.get.mockResolvedValue({
          data: { status: 'requires_input' },
        });

        const result = await adapter.checkStatus('vs_123');

        expect(result.status).toBe('pending');
      });

      it('should return pending for processing status', async () => {
        mockAxiosInstance.get.mockResolvedValue({
          data: { status: 'processing' },
        });

        const result = await adapter.checkStatus('vs_123');

        expect(result.status).toBe('pending');
      });

      it('should return failed for canceled status', async () => {
        mockAxiosInstance.get.mockResolvedValue({
          data: { status: 'canceled' },
        });

        const result = await adapter.checkStatus('vs_123');

        expect(result.status).toBe('failed');
      });

      it('should return requires_manual_review for unknown status', async () => {
        mockAxiosInstance.get.mockResolvedValue({
          data: { status: 'unknown_status' },
        });

        const result = await adapter.checkStatus('vs_123');

        expect(result.status).toBe('requires_manual_review');
      });

      it('should throw on API error', async () => {
        mockAxiosInstance.get.mockRejectedValue(new Error('API Error'));

        await expect(adapter.checkStatus('vs_123')).rejects.toThrow('API Error');
      });
    });
  });

  describe('PlaidAdapter', () => {
    let adapter: PlaidAdapter;

    beforeEach(() => {
      adapter = new PlaidAdapter();
    });

    describe('verify()', () => {
      const verifyData = {
        venueId: 'venue-123',
        accountData: { accountNumber: '123456' },
      };

      it('should create link token on success', async () => {
        const chain = setupDbMock();
        mockAxiosInstance.post.mockResolvedValue({
          data: {
            link_token: 'link-sandbox-123',
            expiration: '2024-01-15T12:00:00Z',
          },
        });

        const result = await adapter.verify(verifyData);

        expect(result.success).toBe(true);
        expect(result.verificationId).toBe('link-sandbox-123');
        expect(result.status).toBe('pending');
        expect(result.details).toHaveProperty('linkToken');
        expect(result.details).toHaveProperty('expiresAt');
      });

      it('should store verification reference in database', async () => {
        const chain = setupDbMock();
        mockAxiosInstance.post.mockResolvedValue({
          data: { link_token: 'link-sandbox-123', expiration: '2024-01-15' },
        });

        await adapter.verify(verifyData);

        expect(mockDb).toHaveBeenCalledWith('external_verifications');
        expect(chain.insert).toHaveBeenCalledWith(
          expect.objectContaining({
            venue_id: 'venue-123',
            provider: 'plaid',
            verification_type: 'bank_account',
            status: 'pending',
          })
        );
      });

      it('should return failed status on API error', async () => {
        setupDbMock();
        mockAxiosInstance.post.mockRejectedValue(new Error('Plaid API Error'));

        const result = await adapter.verify(verifyData);

        expect(result.success).toBe(false);
        expect(result.status).toBe('failed');
        expect(result.error).toBe('Plaid API Error');
      });
    });

    describe('checkStatus()', () => {
      it('should return verification status from database', async () => {
        const chain = setupDbMock();
        chain.first.mockResolvedValue({
          status: 'verified',
          completed_at: new Date(),
          metadata: { accounts: [] },
        });

        const result = await adapter.checkStatus('link-123');

        expect(result.status).toBe('verified');
      });

      it('should throw when verification not found', async () => {
        const chain = setupDbMock();
        chain.first.mockResolvedValue(null);

        await expect(adapter.checkStatus('link-123')).rejects.toThrow('Verification not found');
      });
    });

    describe('exchangePublicToken()', () => {
      it('should exchange token and update verification', async () => {
        const chain = setupDbMock();
        mockAxiosInstance.post
          .mockResolvedValueOnce({ data: { access_token: 'access-123' } })
          .mockResolvedValueOnce({
            data: {
              accounts: [{ id: 'acc-123' }],
              numbers: { ach: [] },
            },
          });

        await adapter.exchangePublicToken('public_token', 'venue-123');

        expect(mockDb).toHaveBeenCalledWith('external_verifications');
        expect(chain.update).toHaveBeenCalledWith(
          expect.objectContaining({
            status: 'verified',
          })
        );
      });

      it('should throw on exchange error', async () => {
        setupDbMock();
        mockAxiosInstance.post.mockRejectedValue(new Error('Exchange failed'));

        await expect(
          adapter.exchangePublicToken('public_token', 'venue-123')
        ).rejects.toThrow('Exchange failed');
      });
    });
  });

  describe('TaxVerificationAdapter', () => {
    let adapter: TaxVerificationAdapter;

    beforeEach(() => {
      adapter = new TaxVerificationAdapter();
    });

    describe('verify()', () => {
      it('should validate EIN format (XX-XXXXXXX)', async () => {
        const chain = setupDbMock();

        const result = await adapter.verify({
          venueId: 'venue-123',
          taxId: '12-3456789',
          businessName: 'Test Business',
        });

        expect(result.success).toBe(true);
        expect(result.status).toBe('requires_manual_review');
      });

      it('should validate SSN format (XXX-XX-XXXX)', async () => {
        const chain = setupDbMock();

        const result = await adapter.verify({
          venueId: 'venue-123',
          taxId: '123-45-6789',
          businessName: 'Test Business',
        });

        expect(result.success).toBe(true);
        expect(result.status).toBe('requires_manual_review');
      });

      it('should reject invalid tax ID format', async () => {
        setupDbMock();

        const result = await adapter.verify({
          venueId: 'venue-123',
          taxId: '123456789', // No dashes
          businessName: 'Test Business',
        });

        expect(result.success).toBe(false);
        expect(result.status).toBe('failed');
        expect(result.error).toBe('Invalid tax ID format');
      });

      it('should mask tax ID in stored metadata', async () => {
        const chain = setupDbMock();

        await adapter.verify({
          venueId: 'venue-123',
          taxId: '12-3456789',
          businessName: 'Test Business',
        });

        expect(chain.insert).toHaveBeenCalledWith(
          expect.objectContaining({
            metadata: expect.objectContaining({
              taxId: expect.stringMatching(/\*+/), // Contains asterisks
            }),
          })
        );
      });

      it('should queue for manual review', async () => {
        const chain = setupDbMock();

        await adapter.verify({
          venueId: 'venue-123',
          taxId: '12-3456789',
          businessName: 'Test Business',
        });

        expect(mockDb).toHaveBeenCalledWith('manual_review_queue');
      });

      it('should return estimated review time', async () => {
        const chain = setupDbMock();

        const result = await adapter.verify({
          venueId: 'venue-123',
          taxId: '12-3456789',
          businessName: 'Test Business',
        });

        expect(result.details).toHaveProperty('estimatedReviewTime');
      });
    });

    describe('checkStatus()', () => {
      it('should return status from database', async () => {
        const chain = setupDbMock();
        chain.first.mockResolvedValue({
          status: 'verified',
          completed_at: new Date(),
          metadata: {},
        });

        const result = await adapter.checkStatus('verification-123');

        expect(result.status).toBe('verified');
      });

      it('should throw when not found', async () => {
        const chain = setupDbMock();
        chain.first.mockResolvedValue(null);

        await expect(adapter.checkStatus('verification-123')).rejects.toThrow('Verification not found');
      });
    });
  });

  describe('BusinessVerificationAdapter', () => {
    let adapter: BusinessVerificationAdapter;

    beforeEach(() => {
      adapter = new BusinessVerificationAdapter();
    });

    describe('verify()', () => {
      it('should require businessName field', async () => {
        setupDbMock();

        const result = await adapter.verify({
          venueId: 'venue-123',
          businessInfo: {
            address: '123 Main St',
            businessType: 'LLC',
          },
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('businessName');
      });

      it('should require address field', async () => {
        setupDbMock();

        const result = await adapter.verify({
          venueId: 'venue-123',
          businessInfo: {
            businessName: 'Test Corp',
            businessType: 'LLC',
          },
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('address');
      });

      it('should require businessType field', async () => {
        setupDbMock();

        const result = await adapter.verify({
          venueId: 'venue-123',
          businessInfo: {
            businessName: 'Test Corp',
            address: '123 Main St',
          },
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('businessType');
      });

      it('should succeed with all required fields', async () => {
        const chain = setupDbMock();

        const result = await adapter.verify({
          venueId: 'venue-123',
          businessInfo: {
            businessName: 'Test Corp',
            address: '123 Main St',
            businessType: 'LLC',
          },
        });

        expect(result.success).toBe(true);
        expect(result.status).toBe('requires_manual_review');
      });

      it('should queue for manual review', async () => {
        const chain = setupDbMock();

        await adapter.verify({
          venueId: 'venue-123',
          businessInfo: {
            businessName: 'Test Corp',
            address: '123 Main St',
            businessType: 'LLC',
          },
        });

        expect(mockDb).toHaveBeenCalledWith('manual_review_queue');
      });

      it('should store business info in metadata', async () => {
        const chain = setupDbMock();
        const businessInfo = {
          businessName: 'Test Corp',
          address: '123 Main St',
          businessType: 'LLC',
        };

        await adapter.verify({
          venueId: 'venue-123',
          businessInfo,
        });

        expect(chain.insert).toHaveBeenCalledWith(
          expect.objectContaining({
            metadata: businessInfo,
          })
        );
      });
    });

    describe('checkStatus()', () => {
      it('should return status from database', async () => {
        const chain = setupDbMock();
        chain.first.mockResolvedValue({
          status: 'pending',
          metadata: {},
        });

        const result = await adapter.checkStatus('verification-123');

        expect(result.status).toBe('pending');
      });
    });
  });

  describe('VerificationAdapterFactory', () => {
    describe('create()', () => {
      it('should create StripeIdentityAdapter for identity type', () => {
        const adapter = VerificationAdapterFactory.create('identity');
        expect(adapter).toBeInstanceOf(StripeIdentityAdapter);
      });

      it('should create PlaidAdapter for bank_account type', () => {
        const adapter = VerificationAdapterFactory.create('bank_account');
        expect(adapter).toBeInstanceOf(PlaidAdapter);
      });

      it('should create TaxVerificationAdapter for tax_id type', () => {
        const adapter = VerificationAdapterFactory.create('tax_id');
        expect(adapter).toBeInstanceOf(TaxVerificationAdapter);
      });

      it('should create BusinessVerificationAdapter for business_info type', () => {
        const adapter = VerificationAdapterFactory.create('business_info');
        expect(adapter).toBeInstanceOf(BusinessVerificationAdapter);
      });

      it('should throw for unknown verification type', () => {
        expect(() => VerificationAdapterFactory.create('unknown' as any)).toThrow(
          'Unknown verification type: unknown'
        );
      });
    });

    describe('isConfigured()', () => {
      it('should return true for identity when STRIPE_SECRET_KEY is set', () => {
        process.env.STRIPE_SECRET_KEY = 'sk_test_123';
        expect(VerificationAdapterFactory.isConfigured('identity')).toBe(true);
      });

      it('should return false for identity when STRIPE_SECRET_KEY is not set', () => {
        delete process.env.STRIPE_SECRET_KEY;
        expect(VerificationAdapterFactory.isConfigured('identity')).toBe(false);
      });

      it('should return true for bank_account when Plaid credentials are set', () => {
        process.env.PLAID_CLIENT_ID = 'client_id';
        process.env.PLAID_SECRET = 'secret';
        expect(VerificationAdapterFactory.isConfigured('bank_account')).toBe(true);
      });

      it('should return false for bank_account when Plaid credentials are missing', () => {
        delete process.env.PLAID_CLIENT_ID;
        delete process.env.PLAID_SECRET;
        expect(VerificationAdapterFactory.isConfigured('bank_account')).toBe(false);
      });

      it('should always return true for tax_id (manual review)', () => {
        expect(VerificationAdapterFactory.isConfigured('tax_id')).toBe(true);
      });

      it('should always return true for business_info (manual review)', () => {
        expect(VerificationAdapterFactory.isConfigured('business_info')).toBe(true);
      });

      it('should return false for unknown type', () => {
        expect(VerificationAdapterFactory.isConfigured('unknown')).toBe(false);
      });
    });
  });
});
