import { AMLCheckerService } from '../../../../src/services/compliance/aml-checker.service';

// Mock database
jest.mock('../../../../src/config/database', () => ({
  query: jest.fn()
}));

// Mock compliance config
jest.mock('../../../../src/config/compliance', () => ({
  complianceConfig: {
    aml: {
      transactionThreshold: 10000, // $100 in cents
      aggregateThreshold: 100000 // $1000 in cents over 30 days
    }
  }
}));

// Mock logger
jest.mock('../../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    child: jest.fn(() => ({
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn()
    }))
  }
}));

import { query } from '../../../../src/config/database';

describe('AMLCheckerService', () => {
  let service: AMLCheckerService;
  let mockQuery: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    mockQuery = query as jest.Mock;
    service = new AMLCheckerService();
  });

  describe('checkTransaction', () => {
    it('should pass low-risk transactions', async () => {
      // Mock all checks to return safe values
      mockQuery
        .mockResolvedValueOnce({ rows: [{ total: 5000 }] }) // Aggregate check
        .mockResolvedValueOnce({ rows: [{ count: 1, total: 5000 }] }) // Rapid high value
        .mockResolvedValueOnce({ rows: [{ count: 0, avg_amount: 0, stddev_amount: 0 }] }) // Structuring
        .mockResolvedValueOnce({ rows: [{ country_count: 1, state_count: 1, countries: ['US'] }] }) // Geographic
        .mockResolvedValueOnce({ rows: [] }) // Sanctions
        .mockResolvedValueOnce({ rows: [] }) // PEP
        .mockResolvedValueOnce({ rows: [] }); // Record check

      const result = await service.checkTransaction('user_1', 5000, 'purchase');

      expect(result.passed).toBe(true);
      expect(result.requiresReview).toBe(false);
      expect(result.riskScore).toBeLessThan(0.5);
      expect(result.flags).toHaveLength(0);
    });

    it('should flag high-value transactions', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ total: 5000 }] })
        .mockResolvedValueOnce({ rows: [{ count: 1, total: 15000 }] })
        .mockResolvedValueOnce({ rows: [{ count: 0, avg_amount: 0, stddev_amount: 0 }] })
        .mockResolvedValueOnce({ rows: [{ country_count: 1, state_count: 1, countries: ['US'] }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      const result = await service.checkTransaction('user_2', 15000, 'purchase');

      expect(result.flags).toContain('high_value_transaction');
      expect(result.riskScore).toBeGreaterThan(0);
    });

    it('should flag aggregate threshold exceeded', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ total: 150000 }] }) // Over $1000 aggregate
        .mockResolvedValueOnce({ rows: [{ count: 1, total: 5000 }] })
        .mockResolvedValueOnce({ rows: [{ count: 0, avg_amount: 0, stddev_amount: 0 }] })
        .mockResolvedValueOnce({ rows: [{ country_count: 1, state_count: 1, countries: ['US'] }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      const result = await service.checkTransaction('user_3', 5000, 'purchase');

      expect(result.flags).toContain('aggregate_threshold_exceeded');
    });

    it('should flag rapid high-value pattern', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ total: 5000 }] })
        .mockResolvedValueOnce({ rows: [{ count: 5, total: 30000 }] }) // 5 high-value transactions in 24h
        .mockResolvedValueOnce({ rows: [{ count: 0, avg_amount: 0, stddev_amount: 0 }] })
        .mockResolvedValueOnce({ rows: [{ country_count: 1, state_count: 1, countries: ['US'] }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      const result = await service.checkTransaction('user_4', 5000, 'purchase');

      expect(result.flags).toContain('pattern_rapid_high_value');
    });

    it('should flag structuring pattern', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ total: 5000 }] })
        .mockResolvedValueOnce({ rows: [{ count: 1, total: 5000 }] })
        .mockResolvedValueOnce({ rows: [{ count: 5, avg_amount: 9500, stddev_amount: 50 }] }) // Many $9500 transactions
        .mockResolvedValueOnce({ rows: [{ country_count: 1, state_count: 1, countries: ['US'] }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      const result = await service.checkTransaction('user_5', 9500, 'purchase');

      expect(result.flags).toContain('pattern_structured_transactions');
    });

    it('should flag unusual geographic pattern', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ total: 5000 }] })
        .mockResolvedValueOnce({ rows: [{ count: 1, total: 5000 }] })
        .mockResolvedValueOnce({ rows: [{ count: 0, avg_amount: 0, stddev_amount: 0 }] })
        .mockResolvedValueOnce({ 
          rows: [{ 
            country_count: 6, 
            state_count: 10, 
            countries: ['US', 'GB', 'FR', 'DE', 'IT', 'ES'] 
          }] 
        })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      const result = await service.checkTransaction('user_6', 5000, 'purchase');

      expect(result.flags).toContain('pattern_unusual_geography');
    });

    it('should flag high-risk country transactions', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ total: 5000 }] })
        .mockResolvedValueOnce({ rows: [{ count: 1, total: 5000 }] })
        .mockResolvedValueOnce({ rows: [{ count: 0, avg_amount: 0, stddev_amount: 0 }] })
        .mockResolvedValueOnce({ 
          rows: [{ 
            country_count: 2, 
            state_count: 1, 
            countries: ['US', 'IR'] // Iran is high-risk
          }] 
        })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      const result = await service.checkTransaction('user_7', 5000, 'purchase');

      expect(result.flags).toContain('pattern_unusual_geography');
    });

    it('should flag sanctions list match with maximum risk', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ total: 5000 }] })
        .mockResolvedValueOnce({ rows: [{ count: 1, total: 5000 }] })
        .mockResolvedValueOnce({ rows: [{ count: 0, avg_amount: 0, stddev_amount: 0 }] })
        .mockResolvedValueOnce({ rows: [{ country_count: 1, state_count: 1, countries: ['US'] }] })
        .mockResolvedValueOnce({ 
          rows: [{ 
            list_name: 'OFAC SDN List',
            active: true 
          }] 
        })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      const result = await service.checkTransaction('user_8', 5000, 'purchase');

      expect(result.flags).toContain('sanctions_list_match');
      expect(result.riskScore).toBe(1.0);
      expect(result.requiresReview).toBe(true);
      expect(result.passed).toBe(false);
    });

    it('should flag PEP status', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ total: 5000 }] })
        .mockResolvedValueOnce({ rows: [{ count: 1, total: 5000 }] })
        .mockResolvedValueOnce({ rows: [{ count: 0, avg_amount: 0, stddev_amount: 0 }] })
        .mockResolvedValueOnce({ rows: [{ country_count: 1, state_count: 1, countries: ['US'] }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ 
          rows: [{ 
            position: 'Senator',
            country: 'US',
            since_date: new Date('2020-01-01')
          }] 
        })
        .mockResolvedValueOnce({ rows: [] });

      const result = await service.checkTransaction('user_9', 5000, 'purchase');

      expect(result.flags).toContain('politically_exposed_person');
    });

    it('should require review when risk score >= 0.5', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ total: 150000 }] }) // Aggregate exceeded (0.25)
        .mockResolvedValueOnce({ rows: [{ count: 5, total: 30000 }] }) // Rapid high value (0.2)
        .mockResolvedValueOnce({ rows: [{ count: 0, avg_amount: 0, stddev_amount: 0 }] })
        .mockResolvedValueOnce({ rows: [{ country_count: 1, state_count: 1, countries: ['US'] }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      const result = await service.checkTransaction('user_10', 15000, 'purchase');

      // High value (0.3) + Aggregate (0.25) + Rapid (0.2) = 0.75
      expect(result.riskScore).toBeGreaterThanOrEqual(0.5);
      expect(result.requiresReview).toBe(true);
      expect(result.passed).toBe(false);
    });

    it('should record AML check in database', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ total: 5000 }] })
        .mockResolvedValueOnce({ rows: [{ count: 1, total: 5000 }] })
        .mockResolvedValueOnce({ rows: [{ count: 0, avg_amount: 0, stddev_amount: 0 }] })
        .mockResolvedValueOnce({ rows: [{ country_count: 1, state_count: 1, countries: ['US'] }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      await service.checkTransaction('user_11', 5000, 'purchase');

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO aml_checks'),
        expect.arrayContaining([
          'user_11',
          5000,
          'purchase',
          expect.any(Boolean),
          expect.any(String),
          expect.any(Number),
          expect.any(Boolean)
        ])
      );
    });
  });

  describe('generateSAR', () => {
    it('should generate suspicious activity report', async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      const result = await service.generateSAR(
        'user_suspicious',
        ['txn_1', 'txn_2', 'txn_3'],
        'Multiple high-value transactions from high-risk jurisdiction'
      );

      expect(result.sarId).toBeDefined();
      expect(result.sarId).toContain('SAR-');
      expect(result.filingDeadline).toBeInstanceOf(Date);
    });

    it('should set 30-day filing deadline', async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      const result = await service.generateSAR(
        'user_sar',
        ['txn_1'],
        'Suspicious pattern detected'
      );

      const now = new Date();
      const thirtyDaysLater = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
      
      const daysDifference = Math.abs(
        (result.filingDeadline.getTime() - thirtyDaysLater.getTime()) / (24 * 60 * 60 * 1000)
      );

      expect(daysDifference).toBeLessThan(1); // Within 1 day tolerance
    });

    it('should record SAR in database', async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      await service.generateSAR(
        'user_sar_2',
        ['txn_a', 'txn_b'],
        'Structuring detected'
      );

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO suspicious_activity_reports'),
        expect.arrayContaining([
          expect.stringContaining('SAR-'),
          'user_sar_2',
          ['txn_a', 'txn_b'],
          'Structuring detected',
          expect.any(Date)
        ])
      );
    });
  });

  describe('Edge Cases', () => {
    it('should handle database errors gracefully', async () => {
      mockQuery.mockRejectedValue(new Error('Database error'));

      await expect(
        service.checkTransaction('user_error', 5000, 'purchase')
      ).rejects.toThrow('Database error');
    });

    it('should handle zero amount transactions', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ total: 0 }] })
        .mockResolvedValueOnce({ rows: [{ count: 0, total: 0 }] })
        .mockResolvedValueOnce({ rows: [{ count: 0, avg_amount: 0, stddev_amount: 0 }] })
        .mockResolvedValueOnce({ rows: [{ country_count: 0, state_count: 0, countries: [] }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      const result = await service.checkTransaction('user_zero', 0, 'refund');

      expect(result.passed).toBe(true);
    });

    it('should handle null database results', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ total: null }] })
        .mockResolvedValueOnce({ rows: [{ count: null, total: null }] })
        .mockResolvedValueOnce({ rows: [{ count: null, avg_amount: null, stddev_amount: null }] })
        .mockResolvedValueOnce({ rows: [{ country_count: 0, state_count: 0, countries: null }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      const result = await service.checkTransaction('user_null', 5000, 'purchase');

      expect(result).toBeDefined();
    });

    it('should handle multiple flags with cumulative risk', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ total: 150000 }] }) // Aggregate (0.25)
        .mockResolvedValueOnce({ rows: [{ count: 5, total: 30000 }] }) // Rapid (0.2)
        .mockResolvedValueOnce({ rows: [{ count: 5, avg_amount: 9500, stddev_amount: 50 }] }) // Structuring (0.3)
        .mockResolvedValueOnce({ rows: [{ country_count: 6, state_count: 10, countries: ['US', 'GB', 'FR', 'DE', 'IT', 'ES'] }] }) // Geographic (0.15)
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ 
          rows: [{ 
            position: 'Governor',
            country: 'US'
          }] 
        }) // PEP (0.3)
        .mockResolvedValueOnce({ rows: [] });

      const result = await service.checkTransaction('user_multi', 15000, 'purchase');

      // High value (0.3) + Aggregate (0.25) + Rapid (0.2) + Structuring (0.3) + Geographic (0.15) + PEP (0.3)
      expect(result.flags.length).toBeGreaterThan(3);
      expect(result.riskScore).toBeGreaterThan(1.0);
      expect(result.requiresReview).toBe(true);
    });
  });
});
