/**
 * Unit Tests for OFACService
 *
 * Tests OFAC sanctions screening, fuzzy matching, and caching
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// =============================================================================
// MOCKS - Must be defined before importing the module under test
// =============================================================================

const mockRedisGet = jest.fn();
const mockRedisSet = jest.fn();
jest.mock('../../../src/services/redis.service', () => ({
  redis: {
    get: mockRedisGet,
    set: mockRedisSet
  }
}));

// Mock console.log to prevent noise
const originalConsoleLog = console.log;
beforeEach(() => {
  console.log = jest.fn();
});
afterEach(() => {
  console.log = originalConsoleLog;
});

// Import module under test AFTER mocks
import { OFACService, ofacService } from '../../../src/services/ofac.service';

// =============================================================================
// TESTS
// =============================================================================

describe('OFACService', () => {
  let service: OFACService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new OFACService();
    mockRedisGet.mockResolvedValue(null); // No cache by default
    mockRedisSet.mockResolvedValue('OK');
  });

  // ===========================================================================
  // checkName - Direct Match Tests
  // ===========================================================================

  describe('checkName', () => {
    describe('exact/direct matches', () => {
      it('should detect "Bad Actor Company" as a match', async () => {
        const result = await service.checkName('Bad Actor Company');

        expect(result.isMatch).toBe(true);
        expect(result.confidence).toBe(95);
        expect(result.matchedName).toBe('Bad Actor Company');
      });

      it('should detect "Sanctioned Venue LLC" as a match', async () => {
        const result = await service.checkName('Sanctioned Venue LLC');

        expect(result.isMatch).toBe(true);
        expect(result.confidence).toBe(95);
        expect(result.matchedName).toBe('Sanctioned Venue LLC');
      });

      it('should detect "Blocked Entertainment Inc" as a match', async () => {
        const result = await service.checkName('Blocked Entertainment Inc');

        expect(result.isMatch).toBe(true);
        expect(result.confidence).toBe(95);
        expect(result.matchedName).toBe('Blocked Entertainment Inc');
      });

      it('should be case-insensitive for matches', async () => {
        const result = await service.checkName('BAD ACTOR COMPANY');

        expect(result.isMatch).toBe(true);
        expect(result.matchedName).toBe('Bad Actor Company');
      });

      it('should handle leading/trailing whitespace', async () => {
        const result = await service.checkName('  Bad Actor Company  ');

        expect(result.isMatch).toBe(true);
        expect(result.matchedName).toBe('Bad Actor Company');
      });

      it('should match partial names containing sanctioned entity', async () => {
        const result = await service.checkName('The Bad Actor Company of America');

        expect(result.isMatch).toBe(true);
        expect(result.matchedName).toBe('Bad Actor Company');
      });
    });

    describe('non-matches', () => {
      it('should return no match for legitimate business name', async () => {
        const result = await service.checkName('Acme Corporation');

        expect(result.isMatch).toBe(false);
        expect(result.confidence).toBe(0);
        expect(result.matchedName).toBeUndefined();
      });

      it('should return no match for random venue name', async () => {
        const result = await service.checkName('Happy Valley Events Center');

        expect(result.isMatch).toBe(false);
        expect(result.confidence).toBe(0);
      });

      it('should return no match for empty string', async () => {
        const result = await service.checkName('');

        expect(result.isMatch).toBe(false);
      });

      it('should return no match for whitespace only', async () => {
        const result = await service.checkName('   ');

        expect(result.isMatch).toBe(false);
      });
    });

    describe('fuzzy matching', () => {
      it('should fuzzy match names with shared significant words', async () => {
        // "Sanctioned" is a significant word (>3 chars) that overlaps
        const result = await service.checkName('Sanctioned Events');

        expect(result.isMatch).toBe(true);
        expect(result.confidence).toBe(75);
        expect(result.matchedName).toBe('Sanctioned Venue LLC');
      });

      it('should fuzzy match with "Blocked" keyword', async () => {
        const result = await service.checkName('Blocked Music Festival');

        expect(result.isMatch).toBe(true);
        expect(result.confidence).toBe(75);
        expect(result.matchedName).toBe('Blocked Entertainment Inc');
      });

      it('should fuzzy match with "Entertainment" keyword', async () => {
        const result = await service.checkName('Global Entertainment Group');

        expect(result.isMatch).toBe(true);
        expect(result.confidence).toBe(75);
        expect(result.matchedName).toBe('Blocked Entertainment Inc');
      });

      it('should NOT fuzzy match short words (<=3 chars)', async () => {
        // "LLC" and "Inc" are <= 3 chars, should not trigger fuzzy match
        const result = await service.checkName('ABC LLC');

        expect(result.isMatch).toBe(false);
      });

      it('should NOT fuzzy match completely unrelated names', async () => {
        const result = await service.checkName('Mountain View Stadium');

        expect(result.isMatch).toBe(false);
      });
    });

    describe('caching behavior', () => {
      it('should check cache before performing OFAC lookup', async () => {
        await service.checkName('Test Company');

        expect(mockRedisGet).toHaveBeenCalledWith(
          null, // tenantId is null for global OFAC
          'ofac:test company'
        );
      });

      it('should return cached result if available', async () => {
        const cachedResult = {
          isMatch: true,
          confidence: 95,
          matchedName: 'Cached Match'
        };
        mockRedisGet.mockResolvedValue(JSON.stringify(cachedResult));

        const result = await service.checkName('Some Name');

        expect(result).toEqual(cachedResult);
        // Should not call set since we got a cache hit
        expect(mockRedisSet).not.toHaveBeenCalled();
      });

      it('should cache result for 24 hours (86400 seconds)', async () => {
        await service.checkName('New Company');

        expect(mockRedisSet).toHaveBeenCalledWith(
          null,
          'ofac:new company',
          expect.any(String),
          86400
        );
      });

      it('should cache negative results too', async () => {
        await service.checkName('Legitimate Business');

        expect(mockRedisSet).toHaveBeenCalledWith(
          null,
          'ofac:legitimate business',
          JSON.stringify({
            isMatch: false,
            confidence: 0,
            matchedName: undefined
          }),
          86400
        );
      });

      it('should normalize name for cache key', async () => {
        await service.checkName('  UPPER CASE NAME  ');

        expect(mockRedisGet).toHaveBeenCalledWith(
          null,
          'ofac:upper case name'
        );
      });

      it('should use null tenantId for cache (OFAC is global)', async () => {
        await service.checkName('Test');

        expect(mockRedisGet).toHaveBeenCalledWith(null, expect.any(String));
        expect(mockRedisSet).toHaveBeenCalledWith(null, expect.any(String), expect.any(String), expect.any(Number));
      });
    });

    describe('confidence levels', () => {
      it('should return 95% confidence for direct matches', async () => {
        const result = await service.checkName('Bad Actor Company');

        expect(result.confidence).toBe(95);
      });

      it('should return 75% confidence for fuzzy matches', async () => {
        const result = await service.checkName('Entertainment World');

        expect(result.confidence).toBe(75);
      });

      it('should return 0% confidence for non-matches', async () => {
        const result = await service.checkName('Safe Business Name');

        expect(result.confidence).toBe(0);
      });
    });

    describe('match priority', () => {
      it('should prefer direct match over fuzzy match', async () => {
        // "Bad Actor Company" is a direct match, should get 95% not 75%
        const result = await service.checkName('Bad Actor Company Entertainment');

        expect(result.confidence).toBe(95);
        expect(result.matchedName).toBe('Bad Actor Company');
      });
    });
  });

  // ===========================================================================
  // updateOFACList Tests
  // ===========================================================================

  describe('updateOFACList', () => {
    it('should return true (mock implementation)', async () => {
      const result = await service.updateOFACList();

      expect(result).toBe(true);
    });

    it('should log update message', async () => {
      await service.updateOFACList();

      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('Mock OFAC list update')
      );
    });
  });

  // ===========================================================================
  // Singleton Export Test
  // ===========================================================================

  describe('ofacService singleton', () => {
    it('should export a singleton instance', () => {
      expect(ofacService).toBeInstanceOf(OFACService);
    });
  });

  // ===========================================================================
  // Edge Cases
  // ===========================================================================

  describe('edge cases', () => {
    it('should handle special characters in name', async () => {
      const result = await service.checkName('Company & Associates, Inc.');

      expect(result).toHaveProperty('isMatch');
      expect(result).toHaveProperty('confidence');
    });

    it('should handle numeric characters in name', async () => {
      const result = await service.checkName('Company 123 LLC');

      expect(result).toHaveProperty('isMatch');
    });

    it('should handle very long names', async () => {
      const longName = 'A'.repeat(1000);
      const result = await service.checkName(longName);

      expect(result.isMatch).toBe(false);
    });

    it('should handle unicode characters', async () => {
      const result = await service.checkName('Café Entertainment México');

      expect(result).toHaveProperty('isMatch');
    });

    it('should handle redis get failure gracefully', async () => {
      mockRedisGet.mockRejectedValue(new Error('Redis connection failed'));

      // Should throw since there's no try-catch in the service
      await expect(service.checkName('Test')).rejects.toThrow('Redis connection failed');
    });

    it('should handle redis set failure gracefully', async () => {
      mockRedisSet.mockRejectedValue(new Error('Redis write failed'));

      // Should throw since there's no try-catch in the service
      await expect(service.checkName('Test')).rejects.toThrow('Redis write failed');
    });
  });
});
