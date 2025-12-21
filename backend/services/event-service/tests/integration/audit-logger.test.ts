/**
 * EventAuditLogger Integration Tests
 */

import {
  setupTestApp,
  teardownTestApp,
  cleanDatabase,
  TestContext,
  db,
  pool,
  redis,
} from './setup';
import { EventAuditLogger } from '../../src/utils/audit-logger';
import { v4 as uuidv4 } from 'uuid';

const TEST_TENANT_ID = '00000000-0000-0000-0000-000000000001';
const TEST_USER_ID = '00000000-0000-0000-0000-000000000088';
const TEST_VENUE_ID = '00000000-0000-0000-0000-000000000077';

describe('EventAuditLogger', () => {
  let context: TestContext;
  let auditLogger: EventAuditLogger;
  let testEventId: string;

  beforeAll(async () => {
    context = await setupTestApp();
    auditLogger = new EventAuditLogger(context.db);
  }, 30000);

  afterAll(async () => {
    await teardownTestApp(context);
  });

  beforeEach(async () => {
    await redis.flushdb();
    await cleanDatabase(db);
    
    // Clean audit logs
    await pool.query('DELETE FROM audit_logs WHERE resource_type = $1', ['event']);

    // Create a test event
    testEventId = uuidv4();
    await pool.query(
      `INSERT INTO events (id, tenant_id, venue_id, name, slug, status, event_type, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [testEventId, TEST_TENANT_ID, TEST_VENUE_ID, 'Audit Test Event', `audit-test-${testEventId.slice(0,8)}`, 'DRAFT', 'single', TEST_USER_ID]
    );
  });

  // ==========================================================================
  // logEventAction
  // ==========================================================================
  describe('logEventAction', () => {
    it('should log an event action to audit_logs', async () => {
      await auditLogger.logEventAction('test_action', testEventId, TEST_USER_ID, {
        testData: 'value',
      });

      const result = await pool.query(
        'SELECT * FROM audit_logs WHERE resource_id = $1 AND action = $2',
        [testEventId, 'event_test_action']
      );

      expect(result.rows.length).toBe(1);
      expect(result.rows[0].service).toBe('event-service');
      expect(result.rows[0].user_id).toBe(TEST_USER_ID);
      expect(result.rows[0].resource_type).toBe('event');
      expect(result.rows[0].action_type).toBe('UPDATE');
      expect(result.rows[0].success).toBe(true);
    });

    it('should include IP address in audit log', async () => {
      await auditLogger.logEventAction('test_action', testEventId, TEST_USER_ID, {
        ip: '192.168.1.1',
      });

      const result = await pool.query(
        'SELECT * FROM audit_logs WHERE resource_id = $1',
        [testEventId]
      );

      expect(result.rows[0].ip_address).toBe('192.168.1.1');
    });

    it('should include user agent in audit log', async () => {
      await auditLogger.logEventAction('test_action', testEventId, TEST_USER_ID, {
        userAgent: 'Mozilla/5.0 Test Browser',
      });

      const result = await pool.query(
        'SELECT * FROM audit_logs WHERE resource_id = $1',
        [testEventId]
      );

      expect(result.rows[0].user_agent).toBe('Mozilla/5.0 Test Browser');
    });

    it('should store metadata as JSONB', async () => {
      await auditLogger.logEventAction('test_action', testEventId, TEST_USER_ID, {
        eventData: { name: 'Test Event', capacity: 100 },
        updates: { status: 'PUBLISHED' },
        requestId: 'req-123',
      });

      const result = await pool.query(
        'SELECT * FROM audit_logs WHERE resource_id = $1',
        [testEventId]
      );

      expect(result.rows[0].metadata.eventData).toEqual({ name: 'Test Event', capacity: 100 });
      expect(result.rows[0].metadata.updates).toEqual({ status: 'PUBLISHED' });
      expect(result.rows[0].metadata.requestId).toBe('req-123');
    });

    it('should allow custom action_type', async () => {
      await auditLogger.logEventAction('publish', testEventId, TEST_USER_ID, {}, 'PUBLISH');

      const result = await pool.query(
        'SELECT * FROM audit_logs WHERE resource_id = $1',
        [testEventId]
      );

      expect(result.rows[0].action_type).toBe('PUBLISH');
    });

    it('should not throw on failure (silent fail)', async () => {
      // Create a logger with invalid db connection to simulate failure
      const badLogger = new EventAuditLogger({} as any);

      // Should not throw
      await expect(
        badLogger.logEventAction('test', testEventId, TEST_USER_ID, {})
      ).resolves.not.toThrow();
    });
  });

  // ==========================================================================
  // logEventCreation
  // ==========================================================================
  describe('logEventCreation', () => {
    it('should log event creation with event_created action and CREATE type', async () => {
      await auditLogger.logEventCreation(TEST_USER_ID, testEventId, {
        name: 'New Event',
        status: 'DRAFT',
      });

      const result = await pool.query(
        'SELECT * FROM audit_logs WHERE resource_id = $1 AND action = $2',
        [testEventId, 'event_created']
      );

      expect(result.rows.length).toBe(1);
      expect(result.rows[0].action_type).toBe('CREATE');
      expect(result.rows[0].metadata.eventData).toEqual({ name: 'New Event', status: 'DRAFT' });
    });

    it('should include request info', async () => {
      await auditLogger.logEventCreation(TEST_USER_ID, testEventId, { name: 'Event' }, {
        ip: '10.0.0.1',
        userAgent: 'TestAgent',
        requestId: 'create-123',
      });

      const result = await pool.query(
        'SELECT * FROM audit_logs WHERE resource_id = $1 AND action = $2',
        [testEventId, 'event_created']
      );

      expect(result.rows[0].ip_address).toBe('10.0.0.1');
      expect(result.rows[0].user_agent).toBe('TestAgent');
    });
  });

  // ==========================================================================
  // logEventUpdate
  // ==========================================================================
  describe('logEventUpdate', () => {
    it('should log event update with event_updated action and UPDATE type', async () => {
      await auditLogger.logEventUpdate(TEST_USER_ID, testEventId, {
        status: 'PUBLISHED',
        name: 'Updated Name',
      });

      const result = await pool.query(
        'SELECT * FROM audit_logs WHERE resource_id = $1 AND action = $2',
        [testEventId, 'event_updated']
      );

      expect(result.rows.length).toBe(1);
      expect(result.rows[0].action_type).toBe('UPDATE');
      expect(result.rows[0].metadata.updates).toEqual({ status: 'PUBLISHED', name: 'Updated Name' });
    });
  });

  // ==========================================================================
  // logEventDeletion
  // ==========================================================================
  describe('logEventDeletion', () => {
    it('should log event deletion with event_deleted action and DELETE type', async () => {
      await auditLogger.logEventDeletion(TEST_USER_ID, testEventId, {
        ip: '192.168.1.1',
        requestId: 'delete-456',
      });

      const result = await pool.query(
        'SELECT * FROM audit_logs WHERE resource_id = $1 AND action = $2',
        [testEventId, 'event_deleted']
      );

      expect(result.rows.length).toBe(1);
      expect(result.rows[0].action_type).toBe('DELETE');
      expect(result.rows[0].user_id).toBe(TEST_USER_ID);
    });
  });

  // ==========================================================================
  // logEventAccess
  // ==========================================================================
  describe('logEventAccess', () => {
    it('should log allowed access with success=true', async () => {
      await auditLogger.logEventAccess(TEST_USER_ID, testEventId, 'view', true, {
        ip: '192.168.1.1',
        requestId: 'access-789',
      });

      const result = await pool.query(
        'SELECT * FROM audit_logs WHERE resource_id = $1 AND action = $2',
        [testEventId, 'event_access_view']
      );

      expect(result.rows.length).toBe(1);
      expect(result.rows[0].action_type).toBe('ACCESS');
      expect(result.rows[0].success).toBe(true);
      expect(result.rows[0].metadata.allowed).toBe(true);
    });

    it('should log denied access with success=false', async () => {
      await auditLogger.logEventAccess(TEST_USER_ID, testEventId, 'edit', false, {
        ip: '192.168.1.1',
      });

      const result = await pool.query(
        'SELECT * FROM audit_logs WHERE resource_id = $1 AND action = $2',
        [testEventId, 'event_access_edit']
      );

      expect(result.rows.length).toBe(1);
      expect(result.rows[0].success).toBe(false);
      expect(result.rows[0].metadata.allowed).toBe(false);
    });
  });
});
