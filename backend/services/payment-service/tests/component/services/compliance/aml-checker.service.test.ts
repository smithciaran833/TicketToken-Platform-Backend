/**
 * COMPONENT TEST: AMLCheckerService
 *
 * Tests Anti-Money Laundering checks
 */

import { v4 as uuidv4 } from 'uuid';

process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'silent';

// Mock query
const mockQuery = jest.fn();

jest.mock('../../../../src/config/database', () => ({
  query: mockQuery,
}));

// Mock compliance config
jest.mock('../../../../src/config/compliance', () => ({
  complianceConfig: {
    aml: {
      transactionThreshold: 10000,
      aggregateThreshold: 50000,
    },
  },
}));

// Mock logger
jest.mock('../../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    child: () => ({ info: jest.fn(), error: jest.fn(), warn: jest.fn() }),
  },
}));

import { AMLCheckerService } from '../../../../src/services/compliance/aml-checker.service';

describe('AMLCheckerService Component Tests', () => {
  let service: AMLCheckerService;
  let tenantId: string;
  let userId: string;

  beforeEach(() => {
    tenantId = uuidv4();
    userId = uuidv4();
    mockQuery.mockReset();

    // Default responses for all checks
    mockQuery.mockImplementation(async (sql: string, params?: any[]) => {
      // Aggregate check
      if (sql.includes('SUM(amount) as total') && sql.includes('payment_transactions')) {
        return { rows: [{ total: '1000' }] };
      }
      // Rapid high-value
      if (sql.includes('COUNT(*) as count') && sql.includes('amount > $3')) {
        return { rows: [{ count: '0', total: '0' }] };
      }
      // Structuring pattern
      if (sql.includes('AVG(amount)') && sql.includes('STDDEV')) {
        return { rows: [{ count: '0', avg_amount: '0', stddev_amount: '0' }] };
      }
      // Geographic pattern
      if (sql.includes('COUNT(DISTINCT country)')) {
        return { rows: [{ country_count: '1', state_count: '1', countries: ['US'] }] };
      }
      // Sanctions list
      if (sql.includes('sanctions_list_matches')) {
        return { rows: [] };
      }
      // PEP check
      if (sql.includes('pep_database')) {
        return { rows: [] };
      }
      // INSERT aml_checks
      if (sql.includes('INSERT INTO aml_checks')) {
        return { rows: [] };
      }
      return { rows: [] };
    });

    service = new AMLCheckerService();
  });

  // ===========================================================================
  // CHECK TRANSACTION
  // ===========================================================================
  describe('checkTransaction()', () => {
    it('should pass for normal transaction', async () => {
      const result = await service.checkTransaction(tenantId, userId, 500, 'ticket_purchase');

      expect(result.passed).toBe(true);
      expect(result.requiresReview).toBe(false);
      expect(result.riskScore).toBeLessThan(0.5);
    });

    it('should flag high value transactions', async () => {
      const result = await service.checkTransaction(tenantId, userId, 15000, 'ticket_purchase');

      expect(result.flags).toContain('high_value_transaction');
      expect(result.riskScore).toBeGreaterThan(0);
    });

    it('should flag aggregate threshold exceeded', async () => {
      mockQuery.mockImplementation(async (sql: string) => {
        if (sql.includes('SUM(amount) as total')) {
          return { rows: [{ total: '60000' }] }; // Over 50k threshold
        }
        if (sql.includes('sanctions_list_matches')) return { rows: [] };
        if (sql.includes('pep_database')) return { rows: [] };
        if (sql.includes('COUNT(*) as count')) return { rows: [{ count: '0', total: '0' }] };
        if (sql.includes('AVG(amount)')) return { rows: [{ count: '0', avg_amount: '0', stddev_amount: '0' }] };
        if (sql.includes('COUNT(DISTINCT country)')) return { rows: [{ country_count: '1', state_count: '1', countries: ['US'] }] };
        if (sql.includes('INSERT')) return { rows: [] };
        return { rows: [] };
      });

      const result = await service.checkTransaction(tenantId, userId, 5000, 'ticket_purchase');

      expect(result.flags).toContain('aggregate_threshold_exceeded');
    });

    it('should flag sanctions list match', async () => {
      mockQuery.mockImplementation(async (sql: string) => {
        if (sql.includes('sanctions_list_matches')) {
          return { rows: [{ list_name: 'OFAC SDN' }] };
        }
        if (sql.includes('SUM(amount)')) return { rows: [{ total: '0' }] };
        if (sql.includes('pep_database')) return { rows: [] };
        if (sql.includes('COUNT(*) as count')) return { rows: [{ count: '0', total: '0' }] };
        if (sql.includes('AVG(amount)')) return { rows: [{ count: '0', avg_amount: '0', stddev_amount: '0' }] };
        if (sql.includes('COUNT(DISTINCT country)')) return { rows: [{ country_count: '1', state_count: '1', countries: ['US'] }] };
        if (sql.includes('INSERT')) return { rows: [] };
        return { rows: [] };
      });

      const result = await service.checkTransaction(tenantId, userId, 500, 'ticket_purchase');

      expect(result.flags).toContain('sanctions_list_match');
      expect(result.riskScore).toBe(1.0);
      expect(result.requiresReview).toBe(true);
      expect(result.passed).toBe(false);
    });

    it('should flag PEP status', async () => {
      mockQuery.mockImplementation(async (sql: string) => {
        if (sql.includes('pep_database')) {
          return { rows: [{ position: 'Minister', country: 'US', since_date: new Date() }] };
        }
        if (sql.includes('SUM(amount)')) return { rows: [{ total: '0' }] };
        if (sql.includes('sanctions_list_matches')) return { rows: [] };
        if (sql.includes('COUNT(*) as count')) return { rows: [{ count: '0', total: '0' }] };
        if (sql.includes('AVG(amount)')) return { rows: [{ count: '0', avg_amount: '0', stddev_amount: '0' }] };
        if (sql.includes('COUNT(DISTINCT country)')) return { rows: [{ country_count: '1', state_count: '1', countries: ['US'] }] };
        if (sql.includes('INSERT')) return { rows: [] };
        return { rows: [] };
      });

      const result = await service.checkTransaction(tenantId, userId, 500, 'ticket_purchase');

      expect(result.flags).toContain('politically_exposed_person');
    });

    it('should detect rapid high-value pattern', async () => {
      mockQuery.mockImplementation(async (sql: string) => {
        if (sql.includes('COUNT(*) as count') && sql.includes('amount > $3')) {
          return { rows: [{ count: '5', total: '25000' }] }; // 5 high-value txns
        }
        if (sql.includes('SUM(amount)')) return { rows: [{ total: '0' }] };
        if (sql.includes('sanctions_list_matches')) return { rows: [] };
        if (sql.includes('pep_database')) return { rows: [] };
        if (sql.includes('AVG(amount)')) return { rows: [{ count: '0', avg_amount: '0', stddev_amount: '0' }] };
        if (sql.includes('COUNT(DISTINCT country)')) return { rows: [{ country_count: '1', state_count: '1', countries: ['US'] }] };
        if (sql.includes('INSERT')) return { rows: [] };
        return { rows: [] };
      });

      const result = await service.checkTransaction(tenantId, userId, 500, 'ticket_purchase');

      expect(result.flags).toContain('pattern_rapid_high_value');
    });

    it('should detect structuring pattern', async () => {
      mockQuery.mockImplementation(async (sql: string) => {
        if (sql.includes('AVG(amount)') && sql.includes('STDDEV')) {
          return { rows: [{ count: '5', avg_amount: '9500', stddev_amount: '50' }] }; // Low variance
        }
        if (sql.includes('SUM(amount)')) return { rows: [{ total: '0' }] };
        if (sql.includes('sanctions_list_matches')) return { rows: [] };
        if (sql.includes('pep_database')) return { rows: [] };
        if (sql.includes('COUNT(*) as count') && sql.includes('amount > $3')) return { rows: [{ count: '0', total: '0' }] };
        if (sql.includes('COUNT(DISTINCT country)')) return { rows: [{ country_count: '1', state_count: '1', countries: ['US'] }] };
        if (sql.includes('INSERT')) return { rows: [] };
        return { rows: [] };
      });

      const result = await service.checkTransaction(tenantId, userId, 500, 'ticket_purchase');

      expect(result.flags).toContain('pattern_structured_transactions');
    });

    it('should detect high-risk country', async () => {
      mockQuery.mockImplementation(async (sql: string) => {
        if (sql.includes('COUNT(DISTINCT country)')) {
          return { rows: [{ country_count: '2', state_count: '1', countries: ['US', 'IR'] }] }; // Iran
        }
        if (sql.includes('SUM(amount)')) return { rows: [{ total: '0' }] };
        if (sql.includes('sanctions_list_matches')) return { rows: [] };
        if (sql.includes('pep_database')) return { rows: [] };
        if (sql.includes('COUNT(*) as count')) return { rows: [{ count: '0', total: '0' }] };
        if (sql.includes('AVG(amount)')) return { rows: [{ count: '0', avg_amount: '0', stddev_amount: '0' }] };
        if (sql.includes('INSERT')) return { rows: [] };
        return { rows: [] };
      });

      const result = await service.checkTransaction(tenantId, userId, 500, 'ticket_purchase');

      expect(result.flags).toContain('pattern_unusual_geography');
    });

    it('should record AML check with tenant_id', async () => {
      await service.checkTransaction(tenantId, userId, 500, 'ticket_purchase');

      const insertCall = mockQuery.mock.calls.find(c => c[0].includes('INSERT INTO aml_checks'));
      expect(insertCall).toBeDefined();
      expect(insertCall[1][0]).toBe(tenantId);
      expect(insertCall[1][1]).toBe(userId);
    });

    it('should require review when risk score >= 0.5', async () => {
      // High value + aggregate exceeded = 0.3 + 0.25 = 0.55
      mockQuery.mockImplementation(async (sql: string) => {
        if (sql.includes('SUM(amount) as total')) {
          return { rows: [{ total: '60000' }] };
        }
        if (sql.includes('sanctions_list_matches')) return { rows: [] };
        if (sql.includes('pep_database')) return { rows: [] };
        if (sql.includes('COUNT(*) as count')) return { rows: [{ count: '0', total: '0' }] };
        if (sql.includes('AVG(amount)')) return { rows: [{ count: '0', avg_amount: '0', stddev_amount: '0' }] };
        if (sql.includes('COUNT(DISTINCT country)')) return { rows: [{ country_count: '1', state_count: '1', countries: ['US'] }] };
        if (sql.includes('INSERT')) return { rows: [] };
        return { rows: [] };
      });

      const result = await service.checkTransaction(tenantId, userId, 15000, 'ticket_purchase');

      expect(result.riskScore).toBeGreaterThanOrEqual(0.5);
      expect(result.requiresReview).toBe(true);
      expect(result.passed).toBe(false);
    });
  });

  // ===========================================================================
  // GENERATE SAR
  // ===========================================================================
  describe('generateSAR()', () => {
    it('should generate suspicious activity report', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await service.generateSAR(
        userId,
        [uuidv4(), uuidv4()],
        'Multiple structured transactions detected'
      );

      expect(result.sarId).toMatch(/^SAR-/);
      expect(result.filingDeadline).toBeInstanceOf(Date);
      expect(result.filingDeadline.getTime()).toBeGreaterThan(Date.now());
    });

    it('should insert SAR record', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await service.generateSAR(userId, [uuidv4()], 'Test activity');

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO suspicious_activity_reports'),
        expect.arrayContaining([expect.stringMatching(/^SAR-/), userId])
      );
    });
  });
});
