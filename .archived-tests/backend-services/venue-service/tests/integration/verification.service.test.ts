/**
 * VerificationService Integration Tests
 */

import {
  setupTestApp,
  teardownTestApp,
  cleanDatabase,
  TestContext,
  TEST_VENUE_ID,
  db,
  pool
} from './setup';
import { VerificationService } from '../../src/services/verification.service';
import { v4 as uuidv4 } from 'uuid';

describe('VerificationService', () => {
  let context: TestContext;
  let verificationService: VerificationService;

  beforeAll(async () => {
    context = await setupTestApp();
    verificationService = new VerificationService();
  }, 30000);

  afterAll(async () => {
    await teardownTestApp(context);
  });

  beforeEach(async () => {
    await cleanDatabase(db);
    // Clean verification-related tables
    await pool.query('DELETE FROM venue_documents WHERE venue_id = $1', [TEST_VENUE_ID]);
    await pool.query('DELETE FROM manual_review_queue WHERE venue_id = $1', [TEST_VENUE_ID]);
    await pool.query('DELETE FROM venue_integrations WHERE venue_id = $1', [TEST_VENUE_ID]);
    // Reset venue verification status
    await pool.query(
      'UPDATE venues SET is_verified = false, verified_at = NULL WHERE id = $1',
      [TEST_VENUE_ID]
    );
  });

  // Helper to create approved document
  async function createApprovedDocument(venueId: string, documentType: string): Promise<void> {
    await pool.query(
      `INSERT INTO venue_documents (venue_id, document_type, file_url, status, submitted_at, approved_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [venueId, documentType, 'https://example.com/doc.pdf', 'approved', new Date(), new Date()]
    );
  }

  // Helper to create payment integration
  async function createPaymentIntegration(venueId: string): Promise<void> {
    await pool.query(
      `INSERT INTO venue_integrations (id, venue_id, integration_type, config_data, is_active)
       VALUES ($1, $2, $3, $4, $5)`,
      [uuidv4(), venueId, 'stripe', '{}', true]
    );
  }

  // ==========================================================================
  // verifyVenue
  // ==========================================================================
  describe('verifyVenue', () => {
    it('should return verification result with all checks', async () => {
      const result = await verificationService.verifyVenue(TEST_VENUE_ID);

      expect(result).toBeDefined();
      expect(result.verified).toBe(false); // Not all checks pass initially
      expect(result.checks).toBeDefined();
      expect(result.checks.businessInfo).toBeDefined();
      expect(result.checks.taxInfo).toBeDefined();
      expect(result.checks.bankAccount).toBeDefined();
      expect(result.checks.identity).toBeDefined();
      expect(result.issues).toBeInstanceOf(Array);
    });

    it('should pass businessInfo check for complete venue', async () => {
      const result = await verificationService.verifyVenue(TEST_VENUE_ID);

      // Seeded venue has name, address, venue_type, max_capacity
      expect(result.checks.businessInfo).toBe(true);
    });

    it('should fail taxInfo check without approved tax document', async () => {
      const result = await verificationService.verifyVenue(TEST_VENUE_ID);

      expect(result.checks.taxInfo).toBe(false);
      expect(result.issues).toContain('Tax information not provided');
    });

    it('should pass taxInfo check with approved tax_id document', async () => {
      await createApprovedDocument(TEST_VENUE_ID, 'tax_id');

      const result = await verificationService.verifyVenue(TEST_VENUE_ID);

      expect(result.checks.taxInfo).toBe(true);
    });

    it('should pass taxInfo check with approved w9 document', async () => {
      await createApprovedDocument(TEST_VENUE_ID, 'w9');

      const result = await verificationService.verifyVenue(TEST_VENUE_ID);

      expect(result.checks.taxInfo).toBe(true);
    });

    it('should fail bankAccount check without payment integration', async () => {
      const result = await verificationService.verifyVenue(TEST_VENUE_ID);

      expect(result.checks.bankAccount).toBe(false);
      expect(result.issues).toContain('Bank account not verified');
    });

    it('should pass bankAccount check with active payment integration', async () => {
      await createPaymentIntegration(TEST_VENUE_ID);

      const result = await verificationService.verifyVenue(TEST_VENUE_ID);

      expect(result.checks.bankAccount).toBe(true);
    });

    it('should fail identity check without approved identity document', async () => {
      const result = await verificationService.verifyVenue(TEST_VENUE_ID);

      expect(result.checks.identity).toBe(false);
      expect(result.issues).toContain('Identity verification pending');
    });

    it('should pass identity check with approved drivers_license', async () => {
      await createApprovedDocument(TEST_VENUE_ID, 'drivers_license');

      const result = await verificationService.verifyVenue(TEST_VENUE_ID);

      expect(result.checks.identity).toBe(true);
    });

    it('should pass identity check with approved passport', async () => {
      await createApprovedDocument(TEST_VENUE_ID, 'passport');

      const result = await verificationService.verifyVenue(TEST_VENUE_ID);

      expect(result.checks.identity).toBe(true);
    });

    it('should mark venue as verified when all checks pass', async () => {
      // Setup all requirements
      await createApprovedDocument(TEST_VENUE_ID, 'tax_id');
      await createApprovedDocument(TEST_VENUE_ID, 'drivers_license');
      await createPaymentIntegration(TEST_VENUE_ID);

      const result = await verificationService.verifyVenue(TEST_VENUE_ID);

      expect(result.verified).toBe(true);
      expect(result.verifiedAt).toBeDefined();
      expect(result.issues).toHaveLength(0);

      // Check venue record updated
      const venue = await pool.query('SELECT is_verified, verified_at FROM venues WHERE id = $1', [TEST_VENUE_ID]);
      expect(venue.rows[0].is_verified).toBe(true);
      expect(venue.rows[0].verified_at).toBeDefined();
    });

    it('should throw error for non-existent venue', async () => {
      const fakeId = uuidv4();

      await expect(
        verificationService.verifyVenue(fakeId)
      ).rejects.toThrow('Venue not found');
    });
  });

  // ==========================================================================
  // submitDocument
  // ==========================================================================
  describe('submitDocument', () => {
    it('should create pending document record', async () => {
      await verificationService.submitDocument(TEST_VENUE_ID, 'business_license', {
        fileUrl: 'https://storage.example.com/doc.pdf'
      });

      const docs = await pool.query(
        'SELECT * FROM venue_documents WHERE venue_id = $1 AND document_type = $2',
        [TEST_VENUE_ID, 'business_license']
      );

      expect(docs.rows.length).toBe(1);
      expect(docs.rows[0].status).toBe('pending');
      expect(docs.rows[0].file_url).toBe('https://storage.example.com/doc.pdf');
    });

    it('should trigger manual review for business_license', async () => {
      await verificationService.submitDocument(TEST_VENUE_ID, 'business_license', {});

      const reviews = await pool.query(
        'SELECT * FROM manual_review_queue WHERE venue_id = $1 AND review_type = $2',
        [TEST_VENUE_ID, 'business_info']
      );

      expect(reviews.rows.length).toBe(1);
      expect(reviews.rows[0].status).toBe('pending');
      expect(reviews.rows[0].priority).toBe('medium');
    });

    it('should trigger manual review for tax documents', async () => {
      await verificationService.submitDocument(TEST_VENUE_ID, 'tax_id', {
        taxId: '12-3456789'
      });

      const reviews = await pool.query(
        'SELECT * FROM manual_review_queue WHERE venue_id = $1 AND review_type = $2',
        [TEST_VENUE_ID, 'tax_id']
      );

      expect(reviews.rows.length).toBe(1);
      expect(reviews.rows[0].priority).toBe('high');
    });

    it('should trigger manual review for identity documents', async () => {
      await verificationService.submitDocument(TEST_VENUE_ID, 'drivers_license', {});

      const reviews = await pool.query(
        'SELECT * FROM manual_review_queue WHERE venue_id = $1 AND review_type = $2',
        [TEST_VENUE_ID, 'identity']
      );

      expect(reviews.rows.length).toBe(1);
      expect(reviews.rows[0].priority).toBe('high');
    });

    it('should store metadata with document', async () => {
      const metadata = {
        taxId: '12-3456789',
        businessName: 'Test Venue Inc',
        notes: 'Submitted for verification'
      };

      await verificationService.submitDocument(TEST_VENUE_ID, 'w9', metadata);

      const docs = await pool.query(
        'SELECT metadata FROM venue_documents WHERE venue_id = $1 AND document_type = $2',
        [TEST_VENUE_ID, 'w9']
      );

      expect(docs.rows[0].metadata).toMatchObject(metadata);
    });
  });

  // ==========================================================================
  // getVerificationStatus
  // ==========================================================================
  describe('getVerificationStatus', () => {
    it('should return unverified status for new venue', async () => {
      const result = await verificationService.getVerificationStatus(TEST_VENUE_ID);

      expect(result.status).toBe('unverified');
      expect(result.completedChecks).toContain('businessInfo'); // Seeded venue has business info
      expect(result.pendingChecks.length).toBeGreaterThan(0);
    });

    it('should return pending status when documents are pending', async () => {
      await verificationService.submitDocument(TEST_VENUE_ID, 'tax_id', {});

      const result = await verificationService.getVerificationStatus(TEST_VENUE_ID);

      expect(result.status).toBe('pending');
    });

    it('should return verified status when all checks pass', async () => {
      await createApprovedDocument(TEST_VENUE_ID, 'tax_id');
      await createApprovedDocument(TEST_VENUE_ID, 'drivers_license');
      await createPaymentIntegration(TEST_VENUE_ID);

      const result = await verificationService.getVerificationStatus(TEST_VENUE_ID);

      expect(result.status).toBe('verified');
      expect(result.completedChecks).toContain('businessInfo');
      expect(result.completedChecks).toContain('taxInfo');
      expect(result.completedChecks).toContain('bankAccount');
      expect(result.completedChecks).toContain('identity');
      expect(result.pendingChecks).toHaveLength(0);
    });

    it('should return rejected status when document is rejected', async () => {
      await pool.query(
        `INSERT INTO venue_documents (venue_id, document_type, file_url, status, rejected_at, rejection_reason)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [TEST_VENUE_ID, 'tax_id', 'url.pdf', 'rejected', new Date(), 'Invalid document']
      );

      const result = await verificationService.getVerificationStatus(TEST_VENUE_ID);

      expect(result.status).toBe('rejected');
    });

    it('should return required documents for pending checks', async () => {
      const result = await verificationService.getVerificationStatus(TEST_VENUE_ID);

      // taxInfo is pending, so should suggest tax_id or w9
      if (result.pendingChecks.includes('taxInfo')) {
        expect(result.requiredDocuments).toContain('tax_id');
        expect(result.requiredDocuments).toContain('w9');
      }

      // identity is pending, so should suggest drivers_license or passport
      if (result.pendingChecks.includes('identity')) {
        expect(result.requiredDocuments).toContain('drivers_license');
        expect(result.requiredDocuments).toContain('passport');
      }
    });
  });

  // ==========================================================================
  // Full verification flow
  // ==========================================================================
  describe('full verification flow', () => {
    it('should complete verification through document submission', async () => {
      // Initial status
      let status = await verificationService.getVerificationStatus(TEST_VENUE_ID);
      expect(status.status).toBe('unverified');

      // Submit tax document
      await verificationService.submitDocument(TEST_VENUE_ID, 'tax_id', { taxId: '12-3456789' });
      
      // Simulate approval
      await pool.query(
        `UPDATE venue_documents SET status = 'approved', approved_at = $1 
         WHERE venue_id = $2 AND document_type = 'tax_id'`,
        [new Date(), TEST_VENUE_ID]
      );

      // Submit identity document
      await verificationService.submitDocument(TEST_VENUE_ID, 'drivers_license', {});
      
      // Simulate approval
      await pool.query(
        `UPDATE venue_documents SET status = 'approved', approved_at = $1 
         WHERE venue_id = $2 AND document_type = 'drivers_license'`,
        [new Date(), TEST_VENUE_ID]
      );

      // Add payment integration
      await createPaymentIntegration(TEST_VENUE_ID);

      // Final verification
      const result = await verificationService.verifyVenue(TEST_VENUE_ID);
      expect(result.verified).toBe(true);

      status = await verificationService.getVerificationStatus(TEST_VENUE_ID);
      expect(status.status).toBe('verified');
    });
  });
});
