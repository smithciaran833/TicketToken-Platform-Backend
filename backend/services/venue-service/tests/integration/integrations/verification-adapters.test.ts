/**
 * Verification Adapters Integration Tests
 *
 * Tests verification adapter factory and adapters.
 * Note: External API calls (Stripe, Plaid) are not made in tests.
 */

import {
  StripeIdentityAdapter,
  PlaidAdapter,
  TaxVerificationAdapter,
  BusinessVerificationAdapter,
  VerificationAdapterFactory
} from '../../../src/integrations/verification-adapters';
import {
  setupTestApp,
  teardownTestApp,
  cleanDatabase,
  TestContext,
  TEST_VENUE_ID,
  db,
  pool
} from '../setup';

describe('Verification Adapters Integration Tests', () => {
  let context: TestContext;

  beforeAll(async () => {
    context = await setupTestApp();
  }, 30000);

  afterAll(async () => {
    await teardownTestApp(context);
  });

  beforeEach(async () => {
    await cleanDatabase(db);
    // Clean verification tables
    await pool.query('DELETE FROM external_verifications WHERE venue_id = $1', [TEST_VENUE_ID]).catch(() => {});
    await pool.query('DELETE FROM manual_review_queue WHERE venue_id = $1', [TEST_VENUE_ID]).catch(() => {});
  });

  // ==========================================================================
  // VerificationAdapterFactory Tests
  // ==========================================================================
  describe('VerificationAdapterFactory', () => {
    describe('create', () => {
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
        expect(() => {
          VerificationAdapterFactory.create('unknown' as any);
        }).toThrow('Unknown verification type');
      });
    });

    describe('isConfigured', () => {
      it('should return boolean for identity check', () => {
        const result = VerificationAdapterFactory.isConfigured('identity');
        expect(typeof result).toBe('boolean');
      });

      it('should return boolean for bank_account check', () => {
        const result = VerificationAdapterFactory.isConfigured('bank_account');
        expect(typeof result).toBe('boolean');
      });

      it('should return true for tax_id (always available)', () => {
        const result = VerificationAdapterFactory.isConfigured('tax_id');
        expect(result).toBe(true);
      });

      it('should return true for business_info (always available)', () => {
        const result = VerificationAdapterFactory.isConfigured('business_info');
        expect(result).toBe(true);
      });

      it('should return false for unknown type', () => {
        const result = VerificationAdapterFactory.isConfigured('unknown');
        expect(result).toBe(false);
      });
    });
  });

  // ==========================================================================
  // StripeIdentityAdapter Tests
  // ==========================================================================
  describe('StripeIdentityAdapter', () => {
    let adapter: StripeIdentityAdapter;

    beforeEach(() => {
      adapter = new StripeIdentityAdapter();
    });

    it('should have verify method', () => {
      expect(typeof adapter.verify).toBe('function');
    });

    it('should have checkStatus method', () => {
      expect(typeof adapter.checkStatus).toBe('function');
    });

    it('should return failed result when API key not configured', async () => {
      const result = await adapter.verify({
        venueId: TEST_VENUE_ID,
        documentType: 'passport',
        documentData: {}
      });

      // Without valid API key, should fail
      expect(result.success).toBe(false);
      expect(result.status).toBe('failed');
    });
  });

  // ==========================================================================
  // PlaidAdapter Tests
  // ==========================================================================
  describe('PlaidAdapter', () => {
    let adapter: PlaidAdapter;

    beforeEach(() => {
      adapter = new PlaidAdapter();
    });

    it('should have verify method', () => {
      expect(typeof adapter.verify).toBe('function');
    });

    it('should have checkStatus method', () => {
      expect(typeof adapter.checkStatus).toBe('function');
    });

    it('should have exchangePublicToken method', () => {
      expect(typeof adapter.exchangePublicToken).toBe('function');
    });

    it('should return failed result when credentials not configured', async () => {
      const result = await adapter.verify({
        venueId: TEST_VENUE_ID,
        accountData: {}
      });

      // Without valid credentials, should fail
      expect(result.success).toBe(false);
      expect(result.status).toBe('failed');
    });
  });

  // ==========================================================================
  // TaxVerificationAdapter Tests
  // ==========================================================================
  describe('TaxVerificationAdapter', () => {
    let adapter: TaxVerificationAdapter;

    beforeEach(() => {
      adapter = new TaxVerificationAdapter();
    });

    it('should have verify method', () => {
      expect(typeof adapter.verify).toBe('function');
    });

    it('should have checkStatus method', () => {
      expect(typeof adapter.checkStatus).toBe('function');
    });

    it('should fail for invalid EIN format', async () => {
      const result = await adapter.verify({
        venueId: TEST_VENUE_ID,
        taxId: 'invalid-tax-id',
        businessName: 'Test Business'
      });

      expect(result.success).toBe(false);
      expect(result.status).toBe('failed');
      expect(result.error).toContain('Invalid tax ID format');
    });

    it('should accept valid EIN format (XX-XXXXXXX)', async () => {
      const result = await adapter.verify({
        venueId: TEST_VENUE_ID,
        taxId: '12-3456789',
        businessName: 'Test Business'
      });

      expect(result.success).toBe(true);
      expect(result.status).toBe('requires_manual_review');
    });

    it('should accept valid SSN format (XXX-XX-XXXX)', async () => {
      const result = await adapter.verify({
        venueId: TEST_VENUE_ID,
        taxId: '123-45-6789',
        businessName: 'Sole Proprietor'
      });

      expect(result.success).toBe(true);
      expect(result.status).toBe('requires_manual_review');
    });

    it('should mask tax ID in stored metadata', async () => {
      await adapter.verify({
        venueId: TEST_VENUE_ID,
        taxId: '12-3456789',
        businessName: 'Test Business'
      });

      const verification = await pool.query(
        "SELECT metadata FROM external_verifications WHERE venue_id = $1 AND provider = 'tax_verification'",
        [TEST_VENUE_ID]
      );

      expect(verification.rows.length).toBe(1);
      const metadata = verification.rows[0].metadata;
      expect(metadata.taxId).toContain('*');
      expect(metadata.taxId).not.toBe('12-3456789');
    });

    it('should queue for manual review', async () => {
      await adapter.verify({
        venueId: TEST_VENUE_ID,
        taxId: '12-3456789',
        businessName: 'Test Business'
      });

      const queue = await pool.query(
        "SELECT * FROM manual_review_queue WHERE venue_id = $1 AND review_type = 'tax_id'",
        [TEST_VENUE_ID]
      );

      expect(queue.rows.length).toBe(1);
      expect(queue.rows[0].priority).toBe('high');
      expect(queue.rows[0].status).toBe('pending');
    });

    it('should check status of existing verification', async () => {
      const verifyResult = await adapter.verify({
        venueId: TEST_VENUE_ID,
        taxId: '12-3456789',
        businessName: 'Test Business'
      });

      const status = await adapter.checkStatus(verifyResult.verificationId!);

      expect(status.status).toBe('requires_manual_review');
    });

    it('should throw when checking status of non-existent verification', async () => {
      await expect(adapter.checkStatus('non-existent-id'))
        .rejects.toThrow('Verification not found');
    });
  });

  // ==========================================================================
  // BusinessVerificationAdapter Tests
  // ==========================================================================
  describe('BusinessVerificationAdapter', () => {
    let adapter: BusinessVerificationAdapter;

    beforeEach(() => {
      adapter = new BusinessVerificationAdapter();
    });

    it('should have verify method', () => {
      expect(typeof adapter.verify).toBe('function');
    });

    it('should have checkStatus method', () => {
      expect(typeof adapter.checkStatus).toBe('function');
    });

    it('should fail when missing required fields', async () => {
      const result = await adapter.verify({
        venueId: TEST_VENUE_ID,
        businessInfo: {
          businessName: 'Test'
          // Missing address and businessType
        }
      });

      expect(result.success).toBe(false);
      expect(result.status).toBe('failed');
      expect(result.error).toContain('Missing required fields');
    });

    it('should succeed with all required fields', async () => {
      const result = await adapter.verify({
        venueId: TEST_VENUE_ID,
        businessInfo: {
          businessName: 'Test Venue LLC',
          address: '123 Main St, City, ST 12345',
          businessType: 'LLC'
        }
      });

      expect(result.success).toBe(true);
      expect(result.status).toBe('requires_manual_review');
      expect(result.details.estimatedReviewTime).toBeDefined();
    });

    it('should store verification in database', async () => {
      await adapter.verify({
        venueId: TEST_VENUE_ID,
        businessInfo: {
          businessName: 'Test Venue LLC',
          address: '123 Main St',
          businessType: 'LLC'
        }
      });

      const verification = await pool.query(
        "SELECT * FROM external_verifications WHERE venue_id = $1 AND provider = 'business_verification'",
        [TEST_VENUE_ID]
      );

      expect(verification.rows.length).toBe(1);
      expect(verification.rows[0].verification_type).toBe('business_info');
    });

    it('should queue for manual review with medium priority', async () => {
      await adapter.verify({
        venueId: TEST_VENUE_ID,
        businessInfo: {
          businessName: 'Test Venue',
          address: '123 Main St',
          businessType: 'Corporation'
        }
      });

      const queue = await pool.query(
        "SELECT * FROM manual_review_queue WHERE venue_id = $1 AND review_type = 'business_info'",
        [TEST_VENUE_ID]
      );

      expect(queue.rows.length).toBe(1);
      expect(queue.rows[0].priority).toBe('medium');
    });

    it('should check status of existing verification', async () => {
      const verifyResult = await adapter.verify({
        venueId: TEST_VENUE_ID,
        businessInfo: {
          businessName: 'Test',
          address: '123 Main',
          businessType: 'LLC'
        }
      });

      const status = await adapter.checkStatus(verifyResult.verificationId!);

      expect(status.status).toBe('requires_manual_review');
    });

    it('should throw when checking status of non-existent verification', async () => {
      await expect(adapter.checkStatus('non-existent-id'))
        .rejects.toThrow('Verification not found');
    });
  });
});
