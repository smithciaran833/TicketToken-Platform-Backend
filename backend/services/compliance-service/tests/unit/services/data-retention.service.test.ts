/**
 * Unit Tests for Data Retention Service
 */
jest.mock('../../../src/services/database.service', () => ({
  db: {
    query: jest.fn()
  }
}));

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { DataRetentionService, dataRetentionService } from '../../../src/services/data-retention.service';
import { db } from '../../../src/services/database.service';

describe('DataRetentionService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (db.query as jest.Mock<any>).mockResolvedValue({ rows: [], rowCount: 0 });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('enforceRetention', () => {
    it('should only delete from tables with canDelete=true', async () => {
      await dataRetentionService.enforceRetention();

      // Should only delete from customer_profiles (canDelete: true)
      expect(db.query).toHaveBeenCalledTimes(1);
      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM customer_profiles'),
        [90]
      );
    });

    it('should not delete from tables with canDelete=false', async () => {
      await dataRetentionService.enforceRetention();

      // Should NOT delete from these tables
      expect(db.query).not.toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM tax_records'),
        expect.any(Array)
      );
      expect(db.query).not.toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM ofac_checks'),
        expect.any(Array)
      );
      expect(db.query).not.toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM audit_logs'),
        expect.any(Array)
      );
    });

    it('should use correct retention days for customer_profiles', async () => {
      await dataRetentionService.enforceRetention();

      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining('make_interval(days => $1)'),
        [90]
      );
    });
  });

  describe('handleGDPRDeletion', () => {
    it('should anonymize customer profile', async () => {
      await dataRetentionService.handleGDPRDeletion('customer-123');

      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE customer_profiles'),
        ['customer-123']
      );
      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining("email = 'deleted@gdpr.request'"),
        expect.any(Array)
      );
      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining("name = 'GDPR_DELETED'"),
        expect.any(Array)
      );
    });

    it('should disable notifications in customer_preferences', async () => {
      await dataRetentionService.handleGDPRDeletion('customer-123');

      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE customer_preferences'),
        ['customer-123']
      );
      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining('marketing_emails = false'),
        expect.any(Array)
      );
    });

    it('should delete customer analytics', async () => {
      await dataRetentionService.handleGDPRDeletion('customer-123');

      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM customer_analytics'),
        ['customer-123']
      );
    });

    it('should call all three queries in order', async () => {
      await dataRetentionService.handleGDPRDeletion('customer-456');

      expect(db.query).toHaveBeenCalledTimes(3);
      
      // First call - anonymize profile
      expect((db.query as jest.Mock<any>).mock.calls[0][0]).toContain('UPDATE customer_profiles');
      
      // Second call - disable preferences
      expect((db.query as jest.Mock<any>).mock.calls[1][0]).toContain('UPDATE customer_preferences');
      
      // Third call - delete analytics
      expect((db.query as jest.Mock<any>).mock.calls[2][0]).toContain('DELETE FROM customer_analytics');
    });

    it('should propagate database errors', async () => {
      (db.query as jest.Mock<any>).mockRejectedValue(new Error('DB connection lost'));

      await expect(dataRetentionService.handleGDPRDeletion('customer-123'))
        .rejects.toThrow('DB connection lost');
    });
  });

  describe('deleteOldRecords (private, tested via enforceRetention)', () => {
    it('should use parameterized query for days', async () => {
      await dataRetentionService.enforceRetention();

      const call = (db.query as jest.Mock<any>).mock.calls[0];
      expect(call[0]).toContain('$1');
      expect(call[1]).toEqual([90]);
    });
  });

  describe('security validations', () => {
    it('should reject invalid table names', async () => {
      const service = new DataRetentionService();
      
      // Access private method for testing
      await expect((service as any).deleteOldRecords('malicious_table; DROP TABLE users;--', 90))
        .rejects.toThrow('Invalid table name');
    });

    it('should reject negative days', async () => {
      const service = new DataRetentionService();
      
      await expect((service as any).deleteOldRecords('customer_profiles', -1))
        .rejects.toThrow('Invalid days parameter');
    });

    it('should reject days exceeding maximum', async () => {
      const service = new DataRetentionService();
      
      await expect((service as any).deleteOldRecords('customer_profiles', 10001))
        .rejects.toThrow('Invalid days parameter');
    });

    it('should reject non-numeric days', async () => {
      const service = new DataRetentionService();
      
      await expect((service as any).deleteOldRecords('customer_profiles', NaN))
        .rejects.toThrow('Invalid days parameter');
    });

    it('should accept valid table from whitelist', async () => {
      const service = new DataRetentionService();
      
      await expect((service as any).deleteOldRecords('customer_profiles', 90))
        .resolves.not.toThrow();
    });
  });

  describe('exported singleton', () => {
    it('should export dataRetentionService instance', () => {
      expect(dataRetentionService).toBeDefined();
      expect(dataRetentionService.enforceRetention).toBeInstanceOf(Function);
      expect(dataRetentionService.handleGDPRDeletion).toBeInstanceOf(Function);
    });
  });
});
