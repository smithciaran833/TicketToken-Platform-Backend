/**
 * Venue Audit Logger Integration Tests
 */

import { VenueAuditLogger } from '../../../src/utils/venue-audit-logger';
import { 
  setupTestApp, 
  teardownTestApp, 
  cleanDatabase,
  TestContext,
  TEST_TENANT_ID,
  TEST_USER_ID,
  TEST_VENUE_ID,
  db,
  pool
} from '../setup';

describe('Venue Audit Logger Integration Tests', () => {
  let context: TestContext;
  let auditLogger: VenueAuditLogger;

  beforeAll(async () => {
    context = await setupTestApp();
    auditLogger = new VenueAuditLogger(db);
  }, 30000);

  afterAll(async () => {
    await teardownTestApp(context);
  });

  beforeEach(async () => {
    await cleanDatabase(db);
    // Clean audit logs
    await pool.query('DELETE FROM audit_logs WHERE resource_type = $1', ['venue']);
  });

  describe('VenueAuditLogger', () => {
    it('should create audit logger instance', () => {
      expect(auditLogger).toBeDefined();
      expect(typeof auditLogger.log).toBe('function');
    });

    it('should log venue creation event', async () => {
      await auditLogger.log('venue_created', TEST_USER_ID, TEST_VENUE_ID, {
        tenantId: TEST_TENANT_ID,
        venueName: 'Test Venue'
      });

      const result = await pool.query(
        'SELECT * FROM audit_logs WHERE resource_id = $1 AND action = $2',
        [TEST_VENUE_ID, 'venue_created']
      );

      expect(result.rows.length).toBe(1);
      expect(result.rows[0].user_id).toBe(TEST_USER_ID);
      expect(result.rows[0].resource_type).toBe('venue');
    });

    it('should log venue update event', async () => {
      await auditLogger.log('venue_updated', TEST_USER_ID, TEST_VENUE_ID, {
        changes: { name: 'New Name' }
      });

      const result = await pool.query(
        'SELECT * FROM audit_logs WHERE resource_id = $1 AND action = $2',
        [TEST_VENUE_ID, 'venue_updated']
      );

      expect(result.rows.length).toBe(1);
    });

    it('should include IP address when provided', async () => {
      await auditLogger.log('venue_accessed', TEST_USER_ID, TEST_VENUE_ID, {
        ipAddress: '192.168.1.1'
      });

      const result = await pool.query(
        'SELECT * FROM audit_logs WHERE resource_id = $1 AND action = $2',
        [TEST_VENUE_ID, 'venue_accessed']
      );

      expect(result.rows[0].ip_address).toBe('192.168.1.1');
    });

    it('should include user agent when provided', async () => {
      await auditLogger.log('venue_accessed', TEST_USER_ID, TEST_VENUE_ID, {
        userAgent: 'Mozilla/5.0 Test Browser'
      });

      const result = await pool.query(
        'SELECT * FROM audit_logs WHERE resource_id = $1 AND action = $2',
        [TEST_VENUE_ID, 'venue_accessed']
      );

      expect(result.rows[0].user_agent).toBe('Mozilla/5.0 Test Browser');
    });

    it('should store metadata as JSON', async () => {
      const metadata = {
        tenantId: TEST_TENANT_ID,
        oldValue: 'old',
        newValue: 'new',
        changedFields: ['name', 'description']
      };

      await auditLogger.log('venue_updated', TEST_USER_ID, TEST_VENUE_ID, metadata);

      const result = await pool.query(
        'SELECT metadata FROM audit_logs WHERE resource_id = $1',
        [TEST_VENUE_ID]
      );

      expect(result.rows[0].metadata).toEqual(metadata);
    });

    it('should not throw on logging failure', async () => {
      // Create logger with invalid db to simulate failure
      const badLogger = new VenueAuditLogger({ raw: () => Promise.reject(new Error('DB Error')) } as any);
      
      // Should not throw
      await expect(badLogger.log('test', 'user', 'venue')).resolves.not.toThrow();
    });

    it('should handle multiple log entries', async () => {
      await auditLogger.log('action1', TEST_USER_ID, TEST_VENUE_ID);
      await auditLogger.log('action2', TEST_USER_ID, TEST_VENUE_ID);
      await auditLogger.log('action3', TEST_USER_ID, TEST_VENUE_ID);

      const result = await pool.query(
        'SELECT COUNT(*) as count FROM audit_logs WHERE resource_id = $1',
        [TEST_VENUE_ID]
      );

      expect(parseInt(result.rows[0].count)).toBe(3);
    });
  });
});
