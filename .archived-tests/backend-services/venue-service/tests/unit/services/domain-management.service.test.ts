import { DomainManagementService } from '../../../src/services/domain-management.service';
import * as dns from 'dns/promises';

// Mock the database module
jest.mock('../../../src/config/database', () => ({
  db: jest.fn()
}));

// Mock the logger module
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn()
  }
}));

// Mock dns/promises
jest.mock('dns/promises');

describe('Domain Management Service', () => {
  let domainService: DomainManagementService;
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();

    // Suppress console errors
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

    domainService = new DomainManagementService();
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  // =============================================================================
  // Add Custom Domain Tests
  // =============================================================================

  describe('addCustomDomain', () => {
    it('should create domain with verification token', async () => {
      const { db } = require('../../../src/config/database');

      let callCount = 0;
      db.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          // Check venue exists
          return {
            where: jest.fn().mockReturnThis(),
            first: jest.fn().mockResolvedValue({
              id: 'venue-123',
              pricing_tier: 'white_label'
            })
          };
        } else if (callCount === 2) {
          // Count existing domains
          return {
            where: jest.fn().mockReturnThis(),
            count: jest.fn().mockResolvedValue([{ count: '0' }])
          };
        } else if (callCount === 3) {
          // Get tier config
          return {
            where: jest.fn().mockReturnThis(),
            first: jest.fn().mockResolvedValue({
              tier_name: 'white_label',
              max_custom_domains: 3
            })
          };
        } else if (callCount === 4) {
          // Check domain not registered
          return {
            where: jest.fn().mockReturnThis(),
            first: jest.fn().mockResolvedValue(null)
          };
        } else {
          // Insert domain
          return {
            insert: jest.fn().mockReturnThis(),
            returning: jest.fn().mockResolvedValue([{
              id: 'domain-123',
              venue_id: 'venue-123',
              domain: 'custom.com',
              verification_token: 'token123',
              verification_method: 'dns_txt',
              is_verified: false,
              ssl_status: 'pending',
              ssl_provider: 'letsencrypt',
              status: 'pending'
            }])
          };
        }
      });

      const result = await domainService.addCustomDomain('venue-123', 'custom.com');

      expect(result).toHaveProperty('domain', 'custom.com');
      expect(result).toHaveProperty('verificationToken');
      expect(result).toHaveProperty('isVerified', false);
      expect(result).toHaveProperty('status', 'pending');
    });

    it('should throw error for venue not found', async () => {
      const { db } = require('../../../src/config/database');
      const mockChain = {
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(null)
      };
      db.mockReturnValue(mockChain);

      await expect(
        domainService.addCustomDomain('nonexistent', 'custom.com')
      ).rejects.toThrow('Venue not found');
    });

    it('should throw error for standard tier venues', async () => {
      const { db } = require('../../../src/config/database');
      const mockChain = {
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue({
          id: 'venue-123',
          pricing_tier: 'standard'
        })
      };
      db.mockReturnValue(mockChain);

      await expect(
        domainService.addCustomDomain('venue-123', 'custom.com')
      ).rejects.toThrow('requires white-label or enterprise tier');
    });

    it('should validate domain format', async () => {
      await expect(
        domainService.addCustomDomain('venue-123', 'invalid domain')
      ).rejects.toThrow('Invalid domain format');
    });

    it('should reject tickettoken.com domains', async () => {
      await expect(
        domainService.addCustomDomain('venue-123', 'tickettoken.com')
      ).rejects.toThrow('Cannot use tickettoken.com domains');

      await expect(
        domainService.addCustomDomain('venue-123', 'sub.tickettoken.com')
      ).rejects.toThrow('Cannot use tickettoken.com domains');
    });

    it('should throw error when domain already registered', async () => {
      const { db } = require('../../../src/config/database');

      let callCount = 0;
      db.mockImplementation(() => {
        callCount++;
        if (callCount <= 3) {
          return {
            where: jest.fn().mockReturnThis(),
            first: jest.fn().mockResolvedValue(callCount === 1 ? {
              id: 'venue-123',
              pricing_tier: 'white_label'
            } : null),
            count: jest.fn().mockResolvedValue([{ count: '0' }])
          };
        } else if (callCount === 4) {
          // Domain already exists
          return {
            where: jest.fn().mockReturnThis(),
            first: jest.fn().mockResolvedValue({ domain: 'custom.com' })
          };
        }
      });

      await expect(
        domainService.addCustomDomain('venue-123', 'custom.com')
      ).rejects.toThrow('Domain already registered');
    });

    it('should enforce domain limit for tier', async () => {
      const { db } = require('../../../src/config/database');

      let callCount = 0;
      db.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return {
            where: jest.fn().mockReturnThis(),
            first: jest.fn().mockResolvedValue({
              id: 'venue-123',
              pricing_tier: 'white_label'
            })
          };
        } else if (callCount === 2) {
          return {
            where: jest.fn().mockReturnThis(),
            count: jest.fn().mockResolvedValue([{ count: '3' }])
          };
        } else if (callCount === 3) {
          return {
            where: jest.fn().mockReturnThis(),
            first: jest.fn().mockResolvedValue({
              tier_name: 'white_label',
              max_custom_domains: 3
            })
          };
        }
      });

      await expect(
        domainService.addCustomDomain('venue-123', 'custom.com')
      ).rejects.toThrow('Domain limit reached');
    });
  });

  // =============================================================================
  // Verify Domain Tests
  // =============================================================================

  describe('verifyDomain', () => {
    it('should verify domain with correct TXT record', async () => {
      const { db } = require('../../../src/config/database');

      let callCount = 0;
      db.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          // Get domain
          return {
            where: jest.fn().mockReturnThis(),
            first: jest.fn().mockResolvedValue({
              id: 'domain-123',
              domain: 'custom.com',
              verification_token: 'token123',
              is_verified: false,
              venue_id: 'venue-123'
            })
          };
        } else if (callCount === 2) {
          // Update domain as verified
          return {
            where: jest.fn().mockReturnThis(),
            update: jest.fn().mockResolvedValue(undefined)
          };
        } else if (callCount === 3) {
          // Update venue
          return {
            where: jest.fn().mockReturnThis(),
            update: jest.fn().mockResolvedValue(undefined)
          };
        } else {
          // Update SSL status
          return {
            where: jest.fn().mockReturnThis(),
            update: jest.fn().mockResolvedValue(undefined)
          };
        }
      });

      (dns.resolveTxt as jest.Mock).mockResolvedValue([['token123']]);

      const result = await domainService.verifyDomain('domain-123');

      expect(result).toBe(true);
      expect(dns.resolveTxt).toHaveBeenCalledWith('_tickettoken-verify.custom.com');
    });

    it('should return false when TXT record not found', async () => {
      const { db } = require('../../../src/config/database');

      let callCount = 0;
      db.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return {
            where: jest.fn().mockReturnThis(),
            first: jest.fn().mockResolvedValue({
              id: 'domain-123',
              domain: 'custom.com',
              verification_token: 'token123',
              is_verified: false
            })
          };
        } else {
          return {
            where: jest.fn().mockReturnThis(),
            update: jest.fn().mockResolvedValue(undefined)
          };
        }
      });

      (dns.resolveTxt as jest.Mock).mockResolvedValue([['wrong-token']]);

      const result = await domainService.verifyDomain('domain-123');

      expect(result).toBe(false);
    });

    it('should handle DNS lookup failures', async () => {
      const { db } = require('../../../src/config/database');

      let callCount = 0;
      db.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return {
            where: jest.fn().mockReturnThis(),
            first: jest.fn().mockResolvedValue({
              id: 'domain-123',
              domain: 'custom.com',
              verification_token: 'token123',
              is_verified: false
            })
          };
        } else {
          return {
            where: jest.fn().mockReturnThis(),
            update: jest.fn().mockResolvedValue(undefined)
          };
        }
      });

      (dns.resolveTxt as jest.Mock).mockRejectedValue(new Error('ENOTFOUND'));

      const result = await domainService.verifyDomain('domain-123');

      expect(result).toBe(false);
    });

    it('should return true if already verified', async () => {
      const { db } = require('../../../src/config/database');
      const mockChain = {
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue({
          id: 'domain-123',
          is_verified: true
        })
      };
      db.mockReturnValue(mockChain);

      const result = await domainService.verifyDomain('domain-123');

      expect(result).toBe(true);
      expect(dns.resolveTxt).not.toHaveBeenCalled();
    });

    it('should throw error when domain not found', async () => {
      const { db } = require('../../../src/config/database');
      const mockChain = {
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(null)
      };
      db.mockReturnValue(mockChain);

      await expect(
        domainService.verifyDomain('nonexistent')
      ).rejects.toThrow('Domain not found');
    });
  });

  // =============================================================================
  // Get Domain Status Tests
  // =============================================================================

  describe('getDomainStatus', () => {
    it('should return domain status', async () => {
      const mockDomain = {
        id: 'domain-123',
        venue_id: 'venue-123',
        domain: 'custom.com',
        verification_token: 'token123',
        verification_method: 'dns_txt',
        is_verified: true,
        ssl_status: 'active',
        ssl_provider: 'letsencrypt',
        status: 'active'
      };

      const { db } = require('../../../src/config/database');
      const mockChain = {
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(mockDomain)
      };
      db.mockReturnValue(mockChain);

      const result = await domainService.getDomainStatus('domain-123');

      expect(result).toHaveProperty('domain', 'custom.com');
      expect(result).toHaveProperty('isVerified', true);
      expect(result).toHaveProperty('sslStatus', 'active');
    });

    it('should throw error when domain not found', async () => {
      const { db } = require('../../../src/config/database');
      const mockChain = {
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(null)
      };
      db.mockReturnValue(mockChain);

      await expect(
        domainService.getDomainStatus('nonexistent')
      ).rejects.toThrow('Domain not found');
    });
  });

  // =============================================================================
  // Get Venue Domains Tests
  // =============================================================================

  describe('getVenueDomains', () => {
    it('should return all domains for venue', async () => {
      const mockDomains = [
        {
          id: 'domain-1',
          venue_id: 'venue-123',
          domain: 'custom1.com',
          is_verified: true,
          status: 'active'
        },
        {
          id: 'domain-2',
          venue_id: 'venue-123',
          domain: 'custom2.com',
          is_verified: false,
          status: 'pending'
        }
      ];

      const { db } = require('../../../src/config/database');
      const mockChain = {
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockResolvedValue(mockDomains)
      };
      db.mockReturnValue(mockChain);

      const result = await domainService.getVenueDomains('venue-123');

      expect(result).toHaveLength(2);
      expect(result[0]).toHaveProperty('domain', 'custom1.com');
      expect(result[1]).toHaveProperty('domain', 'custom2.com');
    });

    it('should return empty array when no domains', async () => {
      const { db } = require('../../../src/config/database');
      const mockChain = {
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockResolvedValue([])
      };
      db.mockReturnValue(mockChain);

      const result = await domainService.getVenueDomains('venue-123');

      expect(result).toEqual([]);
    });
  });

  // =============================================================================
  // Remove Domain Tests
  // =============================================================================

  describe('removeDomain', () => {
    it('should suspend domain and clear venue custom_domain', async () => {
      const { db } = require('../../../src/config/database');

      let callCount = 0;
      db.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return {
            where: jest.fn().mockReturnThis(),
            first: jest.fn().mockResolvedValue({
              id: 'domain-123',
              venue_id: 'venue-123',
              domain: 'custom.com'
            })
          };
        } else if (callCount === 2) {
          return {
            where: jest.fn().mockReturnThis(),
            update: jest.fn().mockResolvedValue(undefined)
          };
        } else {
          return {
            where: jest.fn().mockReturnThis(),
            update: jest.fn().mockResolvedValue(undefined)
          };
        }
      });

      await domainService.removeDomain('domain-123');

      expect(db).toHaveBeenCalledTimes(3);
    });

    it('should throw error when domain not found', async () => {
      const { db } = require('../../../src/config/database');
      const mockChain = {
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(null)
      };
      db.mockReturnValue(mockChain);

      await expect(
        domainService.removeDomain('nonexistent')
      ).rejects.toThrow('Domain not found');
    });
  });
});
