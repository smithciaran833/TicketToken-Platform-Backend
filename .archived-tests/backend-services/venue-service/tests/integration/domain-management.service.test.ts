/**
 * DomainManagementService Integration Tests
 */

import {
  setupTestApp,
  teardownTestApp,
  cleanDatabase,
  TestContext,
  TEST_TENANT_ID,
  TEST_USER_ID,
  TEST_VENUE_ID,
  createTestVenue,
  db,
  pool
} from './setup';
import { DomainManagementService } from '../../src/services/domain-management.service';
import { v4 as uuidv4 } from 'uuid';

describe('DomainManagementService', () => {
  let context: TestContext;
  let domainService: DomainManagementService;

  beforeAll(async () => {
    context = await setupTestApp();
    domainService = new DomainManagementService();
  }, 30000);

  afterAll(async () => {
    await teardownTestApp(context);
  });

  beforeEach(async () => {
    await cleanDatabase(db);
    // Clean custom_domains table
    await pool.query('DELETE FROM custom_domains WHERE venue_id = $1', [TEST_VENUE_ID]);
    // Set venue to white_label tier for most tests
    await pool.query(
      'UPDATE venues SET pricing_tier = $1, custom_domain = NULL WHERE id = $2',
      ['white_label', TEST_VENUE_ID]
    );
  });

  // ==========================================================================
  // addCustomDomain
  // ==========================================================================
  describe('addCustomDomain', () => {
    it('should add a custom domain for white_label venue', async () => {
      const result = await domainService.addCustomDomain(TEST_VENUE_ID, 'mytickets.example.com');

      expect(result).toBeDefined();
      expect(result.domain).toBe('mytickets.example.com');
      expect(result.venueId).toBe(TEST_VENUE_ID);
      expect(result.isVerified).toBe(false);
      expect(result.status).toBe('pending');
      expect(result.verificationToken).toBeDefined();
      expect(result.verificationMethod).toBe('dns_txt');
    });

    it('should generate verification token', async () => {
      const result = await domainService.addCustomDomain(TEST_VENUE_ID, 'verified.example.com');

      expect(result.verificationToken).toBeDefined();
      expect(result.verificationToken.length).toBe(64); // 32 bytes = 64 hex chars
    });

    it('should throw error for standard tier venue', async () => {
      await pool.query(
        'UPDATE venues SET pricing_tier = $1 WHERE id = $2',
        ['standard', TEST_VENUE_ID]
      );

      await expect(
        domainService.addCustomDomain(TEST_VENUE_ID, 'standard.example.com')
      ).rejects.toThrow('Custom domains require white-label or enterprise tier');
    });

    it('should throw error for non-existent venue', async () => {
      const fakeId = uuidv4();

      await expect(
        domainService.addCustomDomain(fakeId, 'fake.example.com')
      ).rejects.toThrow('Venue not found');
    });

    it('should throw error for invalid domain format', async () => {
      await expect(
        domainService.addCustomDomain(TEST_VENUE_ID, 'not a valid domain')
      ).rejects.toThrow('Invalid domain format');
    });

    it('should throw error for tickettoken.com domains', async () => {
      await expect(
        domainService.addCustomDomain(TEST_VENUE_ID, 'tickettoken.com')
      ).rejects.toThrow('Cannot use tickettoken.com domains');

      await expect(
        domainService.addCustomDomain(TEST_VENUE_ID, 'myevents.tickettoken.com')
      ).rejects.toThrow('Cannot use tickettoken.com domains');
    });

    it('should throw error for already registered domain', async () => {
      await domainService.addCustomDomain(TEST_VENUE_ID, 'unique.example.com');

      await expect(
        domainService.addCustomDomain(TEST_VENUE_ID, 'unique.example.com')
      ).rejects.toThrow('Domain already registered');
    });

    it('should enforce domain limit for tier with active domains', async () => {
      // white_label tier allows 1 domain - need to have an ACTIVE domain to hit limit
      // First, add a domain and mark it as active
      const firstDomain = await domainService.addCustomDomain(TEST_VENUE_ID, 'first.example.com');
      await pool.query(
        `UPDATE custom_domains SET status = 'active', is_verified = true WHERE id = $1`,
        [firstDomain.id]
      );

      // Now trying to add another should fail
      await expect(
        domainService.addCustomDomain(TEST_VENUE_ID, 'second.example.com')
      ).rejects.toThrow('Domain limit reached');
    });

    it('should allow more domains for enterprise tier', async () => {
      await pool.query(
        'UPDATE venues SET pricing_tier = $1 WHERE id = $2',
        ['enterprise', TEST_VENUE_ID]
      );

      // Enterprise allows 5 domains
      await domainService.addCustomDomain(TEST_VENUE_ID, 'ent1.example.com');
      await domainService.addCustomDomain(TEST_VENUE_ID, 'ent2.example.com');

      const domains = await domainService.getVenueDomains(TEST_VENUE_ID);
      expect(domains.length).toBe(2);
    });
  });

  // ==========================================================================
  // getDomainStatus
  // ==========================================================================
  describe('getDomainStatus', () => {
    it('should return domain status', async () => {
      const domain = await domainService.addCustomDomain(TEST_VENUE_ID, 'status.example.com');

      const result = await domainService.getDomainStatus(domain.id);

      expect(result).toBeDefined();
      expect(result.id).toBe(domain.id);
      expect(result.domain).toBe('status.example.com');
      expect(result.status).toBe('pending');
    });

    it('should throw error for non-existent domain', async () => {
      const fakeId = uuidv4();

      await expect(
        domainService.getDomainStatus(fakeId)
      ).rejects.toThrow('Domain not found');
    });
  });

  // ==========================================================================
  // getVenueDomains
  // ==========================================================================
  describe('getVenueDomains', () => {
    it('should return all domains for a venue', async () => {
      await pool.query(
        'UPDATE venues SET pricing_tier = $1 WHERE id = $2',
        ['enterprise', TEST_VENUE_ID]
      );

      await domainService.addCustomDomain(TEST_VENUE_ID, 'domain1.example.com');
      await domainService.addCustomDomain(TEST_VENUE_ID, 'domain2.example.com');

      const domains = await domainService.getVenueDomains(TEST_VENUE_ID);

      expect(domains.length).toBe(2);
      expect(domains.map(d => d.domain)).toContain('domain1.example.com');
      expect(domains.map(d => d.domain)).toContain('domain2.example.com');
    });

    it('should return empty array for venue with no domains', async () => {
      const domains = await domainService.getVenueDomains(TEST_VENUE_ID);

      expect(domains).toEqual([]);
    });

    it('should order domains by created_at descending', async () => {
      await pool.query(
        'UPDATE venues SET pricing_tier = $1 WHERE id = $2',
        ['enterprise', TEST_VENUE_ID]
      );

      await domainService.addCustomDomain(TEST_VENUE_ID, 'older.example.com');
      await new Promise(resolve => setTimeout(resolve, 50)); // Small delay
      await domainService.addCustomDomain(TEST_VENUE_ID, 'newer.example.com');

      const domains = await domainService.getVenueDomains(TEST_VENUE_ID);

      expect(domains[0].domain).toBe('newer.example.com');
      expect(domains[1].domain).toBe('older.example.com');
    });
  });

  // ==========================================================================
  // removeDomain
  // ==========================================================================
  describe('removeDomain', () => {
    it('should suspend domain and clear from venue', async () => {
      const domain = await domainService.addCustomDomain(TEST_VENUE_ID, 'remove.example.com');

      // Simulate verified domain
      await pool.query(
        `UPDATE custom_domains SET is_verified = true, status = 'active' WHERE id = $1`,
        [domain.id]
      );
      await pool.query(
        `UPDATE venues SET custom_domain = $1 WHERE id = $2`,
        ['remove.example.com', TEST_VENUE_ID]
      );

      await domainService.removeDomain(domain.id);

      // Check domain is suspended
      const updatedDomain = await pool.query(
        'SELECT status FROM custom_domains WHERE id = $1',
        [domain.id]
      );
      expect(updatedDomain.rows[0].status).toBe('suspended');

      // Check venue custom_domain is cleared
      const venue = await pool.query(
        'SELECT custom_domain FROM venues WHERE id = $1',
        [TEST_VENUE_ID]
      );
      expect(venue.rows[0].custom_domain).toBeNull();
    });

    it('should throw error for non-existent domain', async () => {
      const fakeId = uuidv4();

      await expect(
        domainService.removeDomain(fakeId)
      ).rejects.toThrow('Domain not found');
    });
  });

  // ==========================================================================
  // verifyDomain
  // ==========================================================================
  describe('verifyDomain', () => {
    it('should return true for already verified domain', async () => {
      const domain = await domainService.addCustomDomain(TEST_VENUE_ID, 'preverified.example.com');

      // Mark as verified
      await pool.query(
        `UPDATE custom_domains SET is_verified = true WHERE id = $1`,
        [domain.id]
      );

      const result = await domainService.verifyDomain(domain.id);

      expect(result).toBe(true);
    });

    it('should throw error for non-existent domain', async () => {
      const fakeId = uuidv4();

      await expect(
        domainService.verifyDomain(fakeId)
      ).rejects.toThrow('Domain not found');
    });

    it('should return false when DNS verification fails', async () => {
      const domain = await domainService.addCustomDomain(TEST_VENUE_ID, 'unverifiable.example.com');

      // This will fail because the DNS record doesn't exist
      const result = await domainService.verifyDomain(domain.id);

      expect(result).toBe(false);

      // Check error message was recorded
      const updated = await pool.query(
        'SELECT error_message, last_checked_at FROM custom_domains WHERE id = $1',
        [domain.id]
      );
      expect(updated.rows[0].error_message).toBeDefined();
      expect(updated.rows[0].last_checked_at).toBeDefined();
    });
  });

  // ==========================================================================
  // Domain format validation
  // ==========================================================================
  describe('domain format validation', () => {
    const validDomains = [
      'example.com',
      'sub.example.com',
      'my-tickets.example.com',
      'tickets123.example.co.uk',
    ];

    const invalidDomains = [
      'not a domain',
      'http://example.com',
      'example',
      '-invalid.com',
      'invalid-.com',
      '.example.com',
      'example.com.',
    ];

    validDomains.forEach(domain => {
      it(`should accept valid domain: ${domain}`, async () => {
        await pool.query(
          'UPDATE venues SET pricing_tier = $1 WHERE id = $2',
          ['enterprise', TEST_VENUE_ID]
        );

        const result = await domainService.addCustomDomain(TEST_VENUE_ID, domain);
        expect(result.domain).toBe(domain);

        // Cleanup for next iteration
        await pool.query('DELETE FROM custom_domains WHERE domain = $1', [domain]);
      });
    });

    invalidDomains.forEach(domain => {
      it(`should reject invalid domain: ${domain}`, async () => {
        await expect(
          domainService.addCustomDomain(TEST_VENUE_ID, domain)
        ).rejects.toThrow('Invalid domain format');
      });
    });
  });
});
