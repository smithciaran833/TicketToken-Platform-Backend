/**
 * Unit Tests for RealOFACService
 *
 * Tests OFAC list download, parsing, and screening functionality
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// =============================================================================
// MOCKS - Must be defined before importing the module under test
// =============================================================================

const mockDbQuery = jest.fn();
jest.mock('../../../src/services/database.service', () => ({
  db: {
    query: mockDbQuery
  }
}));

const mockRedisGet = jest.fn();
const mockRedisSet = jest.fn();
jest.mock('../../../src/services/redis.service', () => ({
  redis: {
    get: mockRedisGet,
    set: mockRedisSet
  }
}));

const mockAxiosGet = jest.fn();
jest.mock('axios', () => ({
  default: {
    get: mockAxiosGet
  },
  get: mockAxiosGet
}));

const mockParseStringPromise = jest.fn();
jest.mock('xml2js', () => ({
  Parser: jest.fn().mockImplementation(() => ({
    parseStringPromise: mockParseStringPromise
  }))
}));

// Mock console to reduce noise
const originalConsoleLog = console.log;
const originalConsoleError = console.error;
beforeEach(() => {
  console.log = jest.fn();
  console.error = jest.fn();
});
afterEach(() => {
  console.log = originalConsoleLog;
  console.error = originalConsoleError;
});

// Import module under test AFTER mocks
import { RealOFACService, realOFACService } from '../../../src/services/ofac-real.service';

// =============================================================================
// TEST FIXTURES
// =============================================================================

const MOCK_SDN_XML = `<?xml version="1.0"?><sdnList><sdnEntry><uid>123</uid></sdnEntry></sdnList>`;

const MOCK_PARSED_SDN = {
  sdnList: {
    sdnEntry: [
      {
        uid: ['12345'],
        firstName: ['John'],
        lastName: ['Doe'],
        sdnType: ['Individual'],
        programList: [{ program: ['SDGT', 'IRAN'] }]
      },
      {
        uid: ['67890'],
        firstName: ['Evil'],
        lastName: ['Corp'],
        sdnType: ['Entity'],
        programList: [{ program: ['CYBER2'] }]
      }
    ]
  }
};

// =============================================================================
// TESTS
// =============================================================================

describe('RealOFACService', () => {
  let service: RealOFACService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new RealOFACService();
    mockDbQuery.mockResolvedValue({ rows: [] });
    mockRedisGet.mockResolvedValue(null);
    mockRedisSet.mockResolvedValue('OK');
  });

  // ===========================================================================
  // downloadAndUpdateOFACList Tests
  // ===========================================================================

  describe('downloadAndUpdateOFACList', () => {
    beforeEach(() => {
      mockAxiosGet.mockResolvedValue({ data: MOCK_SDN_XML });
      mockParseStringPromise.mockResolvedValue(MOCK_PARSED_SDN);
    });

    it('should download from Treasury OFAC SDN URL', async () => {
      await service.downloadAndUpdateOFACList();

      expect(mockAxiosGet).toHaveBeenCalledWith(
        'https://www.treasury.gov/ofac/downloads/sdn.xml',
        expect.objectContaining({
          responseType: 'text',
          timeout: 30000
        })
      );
    });

    it('should parse XML response', async () => {
      await service.downloadAndUpdateOFACList();

      expect(mockParseStringPromise).toHaveBeenCalledWith(MOCK_SDN_XML);
    });

    it('should truncate existing OFAC data before inserting', async () => {
      await service.downloadAndUpdateOFACList();

      expect(mockDbQuery).toHaveBeenCalledWith('TRUNCATE TABLE ofac_sdn_list');
    });

    it('should insert each SDN entry into database', async () => {
      await service.downloadAndUpdateOFACList();

      // Should have TRUNCATE + 2 INSERT calls
      const insertCalls = mockDbQuery.mock.calls.filter(call =>
        call[0].includes('INSERT INTO ofac_sdn_list')
      );

      expect(insertCalls).toHaveLength(2);
    });

    it('should insert entry with correct fields', async () => {
      await service.downloadAndUpdateOFACList();

      expect(mockDbQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO ofac_sdn_list'),
        expect.arrayContaining([
          '12345',           // uid
          'John Doe',        // full_name
          'John',            // first_name
          'Doe',             // last_name
          'Individual',      // sdn_type
          expect.any(String) // programs JSON
        ])
      );
    });

    it('should handle entries with missing firstName', async () => {
      mockParseStringPromise.mockResolvedValue({
        sdnList: {
          sdnEntry: [
            {
              uid: ['111'],
              lastName: ['OnlyLast'],
              sdnType: ['Entity'],
              programList: [{ program: [] }]
            }
          ]
        }
      });

      await service.downloadAndUpdateOFACList();

      expect(mockDbQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO ofac_sdn_list'),
        expect.arrayContaining([
          '111',
          'OnlyLast',  // full_name should just be lastName
          '',          // empty firstName
          'OnlyLast'
        ])
      );
    });

    it('should handle entries with missing lastName', async () => {
      mockParseStringPromise.mockResolvedValue({
        sdnList: {
          sdnEntry: [
            {
              uid: ['222'],
              firstName: ['OnlyFirst'],
              sdnType: ['Individual'],
              programList: [{ program: [] }]
            }
          ]
        }
      });

      await service.downloadAndUpdateOFACList();

      expect(mockDbQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO ofac_sdn_list'),
        expect.arrayContaining([
          '222',
          'OnlyFirst',  // full_name
          'OnlyFirst',
          ''            // empty lastName
        ])
      );
    });

    it('should update last update timestamp in Redis', async () => {
      await service.downloadAndUpdateOFACList();

      expect(mockRedisSet).toHaveBeenCalledWith(
        null,  // tenantId is null for global OFAC
        'ofac:last_update',
        expect.any(String)
      );
    });

    it('should log progress for large lists', async () => {
      // Create 150 entries to trigger progress logging
      const manyEntries = Array(150).fill(null).map((_, i) => ({
        uid: [`${i}`],
        firstName: ['Test'],
        lastName: [`User${i}`],
        sdnType: ['Individual'],
        programList: [{ program: [] }]
      }));

      mockParseStringPromise.mockResolvedValue({
        sdnList: { sdnEntry: manyEntries }
      });

      await service.downloadAndUpdateOFACList();

      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('Processed 100 OFAC entries')
      );
    });

    it('should log completion with entry count', async () => {
      await service.downloadAndUpdateOFACList();

      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('OFAC list updated: 2 entries')
      );
    });

    it('should handle empty SDN list', async () => {
      mockParseStringPromise.mockResolvedValue({
        sdnList: { sdnEntry: [] }
      });

      await service.downloadAndUpdateOFACList();

      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('OFAC list updated: 0 entries')
      );
    });

    it('should handle missing sdnList in response', async () => {
      mockParseStringPromise.mockResolvedValue({});

      await service.downloadAndUpdateOFACList();

      // Should not throw, just process 0 entries
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('OFAC list updated: 0 entries')
      );
    });

    it('should throw and log error on download failure', async () => {
      const downloadError = new Error('Network timeout');
      mockAxiosGet.mockRejectedValue(downloadError);

      await expect(service.downloadAndUpdateOFACList())
        .rejects.toThrow('Network timeout');

      expect(console.error).toHaveBeenCalledWith(
        '❌ Failed to update OFAC list:',
        downloadError
      );
    });

    it('should throw error on XML parse failure', async () => {
      mockParseStringPromise.mockRejectedValue(new Error('Invalid XML'));

      await expect(service.downloadAndUpdateOFACList())
        .rejects.toThrow('Invalid XML');
    });

    it('should throw error on database failure', async () => {
      mockDbQuery.mockRejectedValue(new Error('DB connection lost'));

      await expect(service.downloadAndUpdateOFACList())
        .rejects.toThrow('DB connection lost');
    });
  });

  // ===========================================================================
  // checkAgainstOFAC Tests
  // ===========================================================================

  describe('checkAgainstOFAC', () => {
    describe('caching', () => {
      it('should check cache first', async () => {
        const cachedResult = {
          isMatch: true,
          confidence: 95,
          matches: [{ name: 'Cached Match' }]
        };
        mockRedisGet.mockResolvedValue(JSON.stringify(cachedResult));

        const result = await service.checkAgainstOFAC('Test Name');

        expect(mockRedisGet).toHaveBeenCalledWith(null, 'ofac:check:TEST NAME');
        expect(result).toEqual(cachedResult);
        // Should NOT query database
        expect(mockDbQuery).not.toHaveBeenCalled();
      });

      it('should cache results for 24 hours', async () => {
        mockDbQuery.mockResolvedValue({ rows: [] });

        await service.checkAgainstOFAC('Test Name');

        expect(mockRedisSet).toHaveBeenCalledWith(
          null,
          'ofac:check:TEST NAME',
          expect.any(String),
          86400  // 24 hours in seconds
        );
      });

      it('should use null tenantId for cache (OFAC is global)', async () => {
        mockDbQuery.mockResolvedValue({ rows: [] });

        await service.checkAgainstOFAC('Test Name');

        expect(mockRedisGet).toHaveBeenCalledWith(null, expect.any(String));
        expect(mockRedisSet).toHaveBeenCalledWith(null, expect.any(String), expect.any(String), expect.any(Number));
      });
    });

    describe('name normalization', () => {
      it('should normalize name to uppercase', async () => {
        mockDbQuery.mockResolvedValue({ rows: [] });

        await service.checkAgainstOFAC('john doe');

        expect(mockRedisGet).toHaveBeenCalledWith(null, 'ofac:check:JOHN DOE');
      });

      it('should trim whitespace from name', async () => {
        mockDbQuery.mockResolvedValue({ rows: [] });

        await service.checkAgainstOFAC('  John Doe  ');

        expect(mockRedisGet).toHaveBeenCalledWith(null, 'ofac:check:JOHN DOE');
      });
    });

    describe('exact match (fuzzyMatch=false)', () => {
      it('should use exact match query when fuzzyMatch is false', async () => {
        mockDbQuery.mockResolvedValue({ rows: [] });

        await service.checkAgainstOFAC('John Doe', false);

        expect(mockDbQuery).toHaveBeenCalledWith(
          expect.stringContaining('WHERE UPPER(full_name) = $1'),
          ['JOHN DOE']
        );
        expect(mockDbQuery).toHaveBeenCalledWith(
          expect.not.stringContaining('similarity'),
          expect.any(Array)
        );
      });
    });

    describe('fuzzy match (default)', () => {
      it('should use similarity query by default', async () => {
        mockDbQuery.mockResolvedValue({ rows: [] });

        await service.checkAgainstOFAC('John Doe');

        expect(mockDbQuery).toHaveBeenCalledWith(
          expect.stringContaining('similarity'),
          ['JOHN DOE']
        );
      });

      it('should filter by similarity > 0.3', async () => {
        mockDbQuery.mockResolvedValue({ rows: [] });

        await service.checkAgainstOFAC('John Doe');

        expect(mockDbQuery).toHaveBeenCalledWith(
          expect.stringContaining('similarity(UPPER(full_name), $1) > 0.3'),
          expect.any(Array)
        );
      });

      it('should limit results to 10', async () => {
        mockDbQuery.mockResolvedValue({ rows: [] });

        await service.checkAgainstOFAC('John Doe');

        expect(mockDbQuery).toHaveBeenCalledWith(
          expect.stringContaining('LIMIT 10'),
          expect.any(Array)
        );
      });

      it('should order by score DESC', async () => {
        mockDbQuery.mockResolvedValue({ rows: [] });

        await service.checkAgainstOFAC('John Doe');

        expect(mockDbQuery).toHaveBeenCalledWith(
          expect.stringContaining('ORDER BY score DESC'),
          expect.any(Array)
        );
      });
    });

    describe('response formatting', () => {
      it('should return isMatch=false when no matches', async () => {
        mockDbQuery.mockResolvedValue({ rows: [] });

        const result = await service.checkAgainstOFAC('Safe Person');

        expect(result.isMatch).toBe(false);
        expect(result.confidence).toBe(0);
        expect(result.matches).toEqual([]);
      });

      it('should return isMatch=true when matches found', async () => {
        mockDbQuery.mockResolvedValue({
          rows: [{
            full_name: 'John Doe',
            sdn_type: 'Individual',
            programs: ['SDGT'],
            score: 0.95
          }]
        });

        const result = await service.checkAgainstOFAC('John Doe');

        expect(result.isMatch).toBe(true);
      });

      it('should calculate confidence from score (0-100)', async () => {
        mockDbQuery.mockResolvedValue({
          rows: [{
            full_name: 'John Doe',
            sdn_type: 'Individual',
            programs: ['SDGT'],
            score: 0.85
          }]
        });

        const result = await service.checkAgainstOFAC('John Doe');

        expect(result.confidence).toBe(85);
      });

      it('should round confidence to nearest integer', async () => {
        mockDbQuery.mockResolvedValue({
          rows: [{
            full_name: 'Test',
            sdn_type: 'Entity',
            programs: [],
            score: 0.876
          }]
        });

        const result = await service.checkAgainstOFAC('Test');

        expect(result.confidence).toBe(88);
      });

      it('should format matches correctly', async () => {
        mockDbQuery.mockResolvedValue({
          rows: [
            {
              full_name: 'Evil Corp',
              sdn_type: 'Entity',
              programs: ['CYBER2', 'IRAN'],
              score: 0.92
            },
            {
              full_name: 'Evil Corporation',
              sdn_type: 'Entity',
              programs: ['SDGT'],
              score: 0.78
            }
          ]
        });

        const result = await service.checkAgainstOFAC('Evil Corp');

        expect(result.matches).toHaveLength(2);
        expect(result.matches[0]).toEqual({
          name: 'Evil Corp',
          type: 'Entity',
          programs: ['CYBER2', 'IRAN'],
          score: 0.92
        });
        expect(result.matches[1]).toEqual({
          name: 'Evil Corporation',
          type: 'Entity',
          programs: ['SDGT'],
          score: 0.78
        });
      });

      it('should handle missing score in exact match mode', async () => {
        mockDbQuery.mockResolvedValue({
          rows: [{
            full_name: 'John Doe',
            sdn_type: 'Individual',
            programs: ['SDGT']
            // No score field
          }]
        });

        const result = await service.checkAgainstOFAC('John Doe', false);

        expect(result.confidence).toBe(0);
      });
    });
  });

  // ===========================================================================
  // Singleton Export Test
  // ===========================================================================

  describe('realOFACService singleton', () => {
    it('should export a singleton instance', () => {
      expect(realOFACService).toBeInstanceOf(RealOFACService);
    });
  });
});
