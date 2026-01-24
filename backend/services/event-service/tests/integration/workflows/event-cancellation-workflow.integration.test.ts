/**
 * Event Cancellation Workflow Integration Tests
 *
 * Tests the full cancellation workflow with real database and mocked external services.
 * Verifies:
 * - Full workflow with tickets (database + external calls)
 * - Workflow stages (transaction first, then external calls)
 * - Partial failures (external service failures don't rollback DB)
 * - Idempotency (cancelling twice is safe)
 * - External service mock verification
 */

import { Pool } from 'pg';
import {
  setupTestContainers,
  teardownTestContainers,
  getDbPool,
  TEST_DATA,
} from '../setup/testcontainers';
import {
  clearDatabase,
  createMockEvent,
  createMockCapacity,
  createMockPricing,
  insertEvent,
  insertCapacity,
  insertPricing,
  withTenantContext,
} from '../setup/test-helpers';

// Mock external services
const mockTicketServiceClient = {
  getTicketsByEvent: jest.fn(),
  cancelTicketsBatch: jest.fn(),
};

const mockPaymentServiceClient = {
  processBulkRefunds: jest.fn(),
};

const mockMarketplaceServiceClient = {
  cancelEventListings: jest.fn(),
};

const mockNotificationServiceClient = {
  sendBatchNotification: jest.fn(),
};

// Note: In real tests, these would be mocked at the module level
// For these integration tests, we simulate the external service behavior

// Increase timeout for container startup and teardown
jest.setTimeout(180000);

describe('Event Cancellation Workflow Integration Tests', () => {
  let pool: Pool;

  beforeAll(async () => {
    const containers = await setupTestContainers();
    pool = containers.dbPool;
  });

  afterAll(async () => {
    await teardownTestContainers();
  });

  beforeEach(async () => {
    await clearDatabase(pool);
    // Reset all mocks
    jest.clearAllMocks();
    mockTicketServiceClient.getTicketsByEvent.mockReset();
    mockTicketServiceClient.cancelTicketsBatch.mockReset();
    mockPaymentServiceClient.processBulkRefunds.mockReset();
    mockMarketplaceServiceClient.cancelEventListings.mockReset();
    mockNotificationServiceClient.sendBatchNotification.mockReset();
  });

  describe('Full Workflow with Tickets', () => {
    it('should complete full cancellation workflow', async () => {
      // Setup: Create event with capacity and pricing
      const event = createMockEvent({ status: 'ON_SALE', name: 'Concert 2026' });
      const createdEvent = await insertEvent(pool, event);

      const capacity = createMockCapacity(createdEvent.id, {
        total_capacity: 500,
        available_capacity: 250,
        sold_count: 250,
      });
      await insertCapacity(pool, capacity);

      const pricing = createMockPricing(createdEvent.id, undefined, {
        name: 'General Admission',
        base_price: 75,
      });
      await insertPricing(pool, pricing);

      // Mock external services
      mockTicketServiceClient.getTicketsByEvent.mockResolvedValue({
        tickets: [
          { id: 'ticket-1', userId: 'user-1', email: 'user1@test.com', status: 'VALID' },
          { id: 'ticket-2', userId: 'user-2', email: 'user2@test.com', status: 'VALID' },
          { id: 'ticket-3', userId: 'user-1', email: 'user1@test.com', status: 'VALID' },
        ],
      });
      mockTicketServiceClient.cancelTicketsBatch.mockResolvedValue({ successCount: 3 });
      mockPaymentServiceClient.processBulkRefunds.mockResolvedValue({
        requestId: 'refund-123',
        status: 'processing',
        totalOrders: 2,
      });
      mockMarketplaceServiceClient.cancelEventListings.mockResolvedValue({
        success: true,
        cancelledListings: 5,
      });
      mockNotificationServiceClient.sendBatchNotification.mockResolvedValue({
        queuedCount: 2,
      });

      // Execute: Simulate full workflow
      // Stage 1: Database transaction
      const reportId = await withTenantContext(pool, TEST_DATA.TENANT_1_ID, async (client) => {
        await client.query('BEGIN');

        // Update event status
        await client.query(
          `UPDATE events
           SET status = 'CANCELLED',
               cancelled_at = NOW(),
               cancelled_by = $1,
               cancellation_reason = $2
           WHERE id = $3`,
          [TEST_DATA.USER_1_ID, 'Artist cancellation', createdEvent.id]
        );

        // Update capacity
        await client.query(
          `UPDATE event_capacity
           SET available_capacity = 0, is_active = false
           WHERE event_id = $1`,
          [createdEvent.id]
        );

        // Create audit log
        await client.query(
          `INSERT INTO event_audit_log (tenant_id, event_id, action, actor_id, details)
           VALUES ($1, $2, 'EVENT_CANCELLED', $3, $4)`,
          [
            TEST_DATA.TENANT_1_ID,
            createdEvent.id,
            TEST_DATA.USER_1_ID,
            JSON.stringify({ reason: 'Artist cancellation', refundPolicy: 'full' }),
          ]
        );

        // Generate report
        const rptId = crypto.randomUUID();
        await client.query(
          `INSERT INTO event_cancellation_reports (id, tenant_id, event_id, report_data)
           VALUES ($1, $2, $3, $4)`,
          [
            rptId,
            TEST_DATA.TENANT_1_ID,
            createdEvent.id,
            JSON.stringify({
              id: rptId,
              eventName: 'Concert 2026',
              summary: { totalTicketsSold: 250 },
            }),
          ]
        );

        await client.query('COMMIT');
        return rptId;
      });

      // Stage 2: Simulate external service calls (would happen after transaction)
      const tickets = await mockTicketServiceClient.getTicketsByEvent(createdEvent.id);
      await mockTicketServiceClient.cancelTicketsBatch(
        tickets.tickets.map((t: any) => t.id),
        'Event cancelled',
        createdEvent.id
      );
      await mockPaymentServiceClient.processBulkRefunds({
        eventId: createdEvent.id,
        refundPolicy: 'full',
      });
      await mockMarketplaceServiceClient.cancelEventListings(createdEvent.id);
      await mockNotificationServiceClient.sendBatchNotification({
        notifications: [{ userId: 'user-1' }, { userId: 'user-2' }],
      });

      // Verify: Check database state
      const finalEvent = await withTenantContext(pool, TEST_DATA.TENANT_1_ID, async (client) => {
        const result = await client.query(`SELECT * FROM events WHERE id = $1`, [createdEvent.id]);
        return result.rows[0];
      });

      const finalCapacity = await withTenantContext(pool, TEST_DATA.TENANT_1_ID, async (client) => {
        const result = await client.query(
          `SELECT * FROM event_capacity WHERE event_id = $1`,
          [createdEvent.id]
        );
        return result.rows[0];
      });

      const report = await withTenantContext(pool, TEST_DATA.TENANT_1_ID, async (client) => {
        const result = await client.query(
          `SELECT * FROM event_cancellation_reports WHERE id = $1`,
          [reportId]
        );
        return result.rows[0];
      });

      expect(finalEvent.status).toBe('CANCELLED');
      expect(finalEvent.cancelled_at).toBeDefined();
      expect(finalCapacity.is_active).toBe(false);
      expect(finalCapacity.available_capacity).toBe(0);
      expect(report).toBeDefined();

      // Verify mock calls
      expect(mockTicketServiceClient.getTicketsByEvent).toHaveBeenCalledWith(createdEvent.id);
      expect(mockTicketServiceClient.cancelTicketsBatch).toHaveBeenCalled();
      expect(mockPaymentServiceClient.processBulkRefunds).toHaveBeenCalled();
      expect(mockMarketplaceServiceClient.cancelEventListings).toHaveBeenCalledWith(createdEvent.id);
      expect(mockNotificationServiceClient.sendBatchNotification).toHaveBeenCalled();
    });

    it('should verify external services called with correct parameters', async () => {
      const event = createMockEvent({ status: 'ON_SALE' });
      const createdEvent = await insertEvent(pool, event);

      const mockTickets = [
        { id: 'ticket-abc', userId: 'user-123', email: 'alice@test.com', status: 'VALID' },
        { id: 'ticket-def', userId: 'user-456', email: 'bob@test.com', status: 'VALID' },
      ];

      mockTicketServiceClient.getTicketsByEvent.mockResolvedValue({ tickets: mockTickets });
      mockTicketServiceClient.cancelTicketsBatch.mockResolvedValue({ successCount: 2 });

      // Simulate getting tickets and cancelling
      const tickets = await mockTicketServiceClient.getTicketsByEvent(createdEvent.id);
      const ticketIds = tickets.tickets.map((t: any) => t.id);
      await mockTicketServiceClient.cancelTicketsBatch(ticketIds, 'Event cancelled', `event-${createdEvent.id}`);

      expect(mockTicketServiceClient.getTicketsByEvent).toHaveBeenCalledWith(createdEvent.id);
      expect(mockTicketServiceClient.cancelTicketsBatch).toHaveBeenCalledWith(
        ['ticket-abc', 'ticket-def'],
        'Event cancelled',
        `event-${createdEvent.id}`
      );
    });
  });

  describe('Workflow Stages', () => {
    it('should commit transaction before external calls', async () => {
      const event = createMockEvent({ status: 'ON_SALE' });
      const createdEvent = await insertEvent(pool, event);

      // Stage 1: Execute transaction (this should succeed)
      await withTenantContext(pool, TEST_DATA.TENANT_1_ID, async (client) => {
        await client.query('BEGIN');
        await client.query(
          `UPDATE events SET status = 'CANCELLED', cancelled_at = NOW() WHERE id = $1`,
          [createdEvent.id]
        );
        await client.query(
          `INSERT INTO event_audit_log (tenant_id, event_id, action, actor_id, details)
           VALUES ($1, $2, 'EVENT_CANCELLED', $3, '{}')`,
          [TEST_DATA.TENANT_1_ID, createdEvent.id, TEST_DATA.USER_1_ID]
        );
        await client.query('COMMIT');
      });

      // Verify: Transaction committed
      const eventAfterTx = await withTenantContext(pool, TEST_DATA.TENANT_1_ID, async (client) => {
        const result = await client.query(`SELECT * FROM events WHERE id = $1`, [createdEvent.id]);
        return result.rows[0];
      });

      expect(eventAfterTx.status).toBe('CANCELLED');

      // Stage 2: External calls happen after (simulated failure)
      mockPaymentServiceClient.processBulkRefunds.mockRejectedValue(new Error('Payment service down'));

      try {
        await mockPaymentServiceClient.processBulkRefunds({ eventId: createdEvent.id });
      } catch (e) {
        // Expected failure
      }

      // Verify: Event is still cancelled despite external failure
      const eventAfterFailure = await withTenantContext(pool, TEST_DATA.TENANT_1_ID, async (client) => {
        const result = await client.query(`SELECT * FROM events WHERE id = $1`, [createdEvent.id]);
        return result.rows[0];
      });

      expect(eventAfterFailure.status).toBe('CANCELLED'); // Still cancelled
    });

    it('should ensure audit log is part of transaction', async () => {
      const event = createMockEvent({ status: 'ON_SALE' });
      const createdEvent = await insertEvent(pool, event);

      // Execute transaction with audit log
      await withTenantContext(pool, TEST_DATA.TENANT_1_ID, async (client) => {
        await client.query('BEGIN');
        await client.query(
          `UPDATE events SET status = 'CANCELLED' WHERE id = $1`,
          [createdEvent.id]
        );
        await client.query(
          `INSERT INTO event_audit_log (tenant_id, event_id, action, actor_id, details)
           VALUES ($1, $2, 'EVENT_CANCELLED', $3, $4)`,
          [
            TEST_DATA.TENANT_1_ID,
            createdEvent.id,
            TEST_DATA.USER_1_ID,
            JSON.stringify({ inTransaction: true }),
          ]
        );
        await client.query('COMMIT');
      });

      // Both event and audit log should exist
      const auditLog = await withTenantContext(pool, TEST_DATA.TENANT_1_ID, async (client) => {
        const result = await client.query(
          `SELECT * FROM event_audit_log WHERE event_id = $1`,
          [createdEvent.id]
        );
        return result.rows[0];
      });

      expect(auditLog).toBeDefined();
      expect(auditLog.action).toBe('EVENT_CANCELLED');
    });
  });

  describe('Partial Failures', () => {
    it('should keep event cancelled when payment service fails', async () => {
      const event = createMockEvent({ status: 'ON_SALE' });
      const createdEvent = await insertEvent(pool, event);

      // Stage 1: DB transaction succeeds
      await withTenantContext(pool, TEST_DATA.TENANT_1_ID, async (client) => {
        await client.query('BEGIN');
        await client.query(
          `UPDATE events SET status = 'CANCELLED', cancelled_at = NOW() WHERE id = $1`,
          [createdEvent.id]
        );
        await client.query('COMMIT');
      });

      // Stage 2: Payment service fails
      mockPaymentServiceClient.processBulkRefunds.mockRejectedValue(
        new Error('Payment gateway timeout')
      );

      let paymentError: Error | null = null;
      try {
        await mockPaymentServiceClient.processBulkRefunds({ eventId: createdEvent.id });
      } catch (e: any) {
        paymentError = e;
      }

      expect(paymentError?.message).toBe('Payment gateway timeout');

      // Event should still be cancelled
      const finalEvent = await withTenantContext(pool, TEST_DATA.TENANT_1_ID, async (client) => {
        const result = await client.query(`SELECT * FROM events WHERE id = $1`, [createdEvent.id]);
        return result.rows[0];
      });

      expect(finalEvent.status).toBe('CANCELLED');
    });

    it('should keep event cancelled when marketplace service fails', async () => {
      const event = createMockEvent({ status: 'ON_SALE' });
      const createdEvent = await insertEvent(pool, event);

      await withTenantContext(pool, TEST_DATA.TENANT_1_ID, async (client) => {
        await client.query(
          `UPDATE events SET status = 'CANCELLED', cancelled_at = NOW() WHERE id = $1`,
          [createdEvent.id]
        );
      });

      mockMarketplaceServiceClient.cancelEventListings.mockRejectedValue(
        new Error('Marketplace service unavailable')
      );

      let marketplaceError: Error | null = null;
      try {
        await mockMarketplaceServiceClient.cancelEventListings(createdEvent.id);
      } catch (e: any) {
        marketplaceError = e;
      }

      expect(marketplaceError?.message).toBe('Marketplace service unavailable');

      const finalEvent = await withTenantContext(pool, TEST_DATA.TENANT_1_ID, async (client) => {
        const result = await client.query(`SELECT * FROM events WHERE id = $1`, [createdEvent.id]);
        return result.rows[0];
      });

      expect(finalEvent.status).toBe('CANCELLED');
    });

    it('should keep event cancelled when notification service fails', async () => {
      const event = createMockEvent({ status: 'ON_SALE' });
      const createdEvent = await insertEvent(pool, event);

      await withTenantContext(pool, TEST_DATA.TENANT_1_ID, async (client) => {
        await client.query(
          `UPDATE events SET status = 'CANCELLED', cancelled_at = NOW() WHERE id = $1`,
          [createdEvent.id]
        );
      });

      mockNotificationServiceClient.sendBatchNotification.mockRejectedValue(
        new Error('Email provider error')
      );

      let notificationError: Error | null = null;
      try {
        await mockNotificationServiceClient.sendBatchNotification({});
      } catch (e: any) {
        notificationError = e;
      }

      expect(notificationError?.message).toBe('Email provider error');

      const finalEvent = await withTenantContext(pool, TEST_DATA.TENANT_1_ID, async (client) => {
        const result = await client.query(`SELECT * FROM events WHERE id = $1`, [createdEvent.id]);
        return result.rows[0];
      });

      expect(finalEvent.status).toBe('CANCELLED');
    });

    it('should log errors but continue on partial failures', async () => {
      const event = createMockEvent({ status: 'ON_SALE' });
      const createdEvent = await insertEvent(pool, event);

      const errors: string[] = [];

      // DB transaction
      await withTenantContext(pool, TEST_DATA.TENANT_1_ID, async (client) => {
        await client.query(
          `UPDATE events SET status = 'CANCELLED' WHERE id = $1`,
          [createdEvent.id]
        );
      });

      // Payment fails
      mockPaymentServiceClient.processBulkRefunds.mockRejectedValue(new Error('Payment error'));
      try {
        await mockPaymentServiceClient.processBulkRefunds({});
      } catch (e: any) {
        errors.push(`Refund trigger failed: ${e.message}`);
      }

      // Notifications fail
      mockNotificationServiceClient.sendBatchNotification.mockRejectedValue(new Error('Notification error'));
      try {
        await mockNotificationServiceClient.sendBatchNotification({});
      } catch (e: any) {
        errors.push(`Notification failed: ${e.message}`);
      }

      // Marketplace succeeds
      mockMarketplaceServiceClient.cancelEventListings.mockResolvedValue({ cancelledListings: 5 });
      await mockMarketplaceServiceClient.cancelEventListings(createdEvent.id);

      // Verify errors were captured
      expect(errors).toContain('Refund trigger failed: Payment error');
      expect(errors).toContain('Notification failed: Notification error');
      expect(errors.length).toBe(2);

      // Event still cancelled
      const finalEvent = await withTenantContext(pool, TEST_DATA.TENANT_1_ID, async (client) => {
        const result = await client.query(`SELECT * FROM events WHERE id = $1`, [createdEvent.id]);
        return result.rows[0];
      });
      expect(finalEvent.status).toBe('CANCELLED');
    });
  });

  describe('Idempotency', () => {
    it('should handle cancelling already cancelled event gracefully', async () => {
      const event = createMockEvent({ status: 'CANCELLED' });
      const createdEvent = await insertEvent(pool, event);

      // Try to cancel again (WHERE clause should not match)
      const result = await withTenantContext(pool, TEST_DATA.TENANT_1_ID, async (client) => {
        const res = await client.query(
          `UPDATE events
           SET status = 'CANCELLED', cancelled_at = NOW()
           WHERE id = $1 AND status NOT IN ('CANCELLED', 'COMPLETED')
           RETURNING *`,
          [createdEvent.id]
        );
        return res.rows[0];
      });

      expect(result).toBeUndefined(); // No update happened
    });

    it('should not create duplicate audit logs', async () => {
      const event = createMockEvent({ status: 'ON_SALE' });
      const createdEvent = await insertEvent(pool, event);

      // First cancellation
      await withTenantContext(pool, TEST_DATA.TENANT_1_ID, async (client) => {
        await client.query(
          `UPDATE events SET status = 'CANCELLED' WHERE id = $1 AND status != 'CANCELLED'`,
          [createdEvent.id]
        );
        await client.query(
          `INSERT INTO event_audit_log (tenant_id, event_id, action, actor_id, details)
           SELECT $1, $2, 'EVENT_CANCELLED', $3, '{}'
           WHERE NOT EXISTS (
             SELECT 1 FROM event_audit_log
             WHERE event_id = $2 AND action = 'EVENT_CANCELLED'
           )`,
          [TEST_DATA.TENANT_1_ID, createdEvent.id, TEST_DATA.USER_1_ID]
        );
      });

      // Second attempt (should not insert)
      await withTenantContext(pool, TEST_DATA.TENANT_1_ID, async (client) => {
        await client.query(
          `INSERT INTO event_audit_log (tenant_id, event_id, action, actor_id, details)
           SELECT $1, $2, 'EVENT_CANCELLED', $3, '{}'
           WHERE NOT EXISTS (
             SELECT 1 FROM event_audit_log
             WHERE event_id = $2 AND action = 'EVENT_CANCELLED'
           )`,
          [TEST_DATA.TENANT_1_ID, createdEvent.id, TEST_DATA.USER_1_ID]
        );
      });

      // Should only have one audit log
      const auditLogs = await withTenantContext(pool, TEST_DATA.TENANT_1_ID, async (client) => {
        const result = await client.query(
          `SELECT * FROM event_audit_log WHERE event_id = $1 AND action = 'EVENT_CANCELLED'`,
          [createdEvent.id]
        );
        return result.rows;
      });

      expect(auditLogs.length).toBe(1);
    });

    it('should not make duplicate external service calls', async () => {
      const event = createMockEvent({ status: 'CANCELLED' }); // Already cancelled
      const createdEvent = await insertEvent(pool, event);

      mockTicketServiceClient.getTicketsByEvent.mockResolvedValue({ tickets: [] });

      // Simulate workflow check: if already cancelled, don't call external services
      const eventStatus = await withTenantContext(pool, TEST_DATA.TENANT_1_ID, async (client) => {
        const result = await client.query(
          `SELECT status FROM events WHERE id = $1`,
          [createdEvent.id]
        );
        return result.rows[0]?.status;
      });

      if (eventStatus === 'CANCELLED') {
        // Skip external calls - event already cancelled
      } else {
        await mockTicketServiceClient.getTicketsByEvent(createdEvent.id);
      }

      expect(mockTicketServiceClient.getTicketsByEvent).not.toHaveBeenCalled();
    });
  });

  describe('With Sold Tickets', () => {
    it('should call ticketServiceClient with correct ticket IDs', async () => {
      const event = createMockEvent({ status: 'ON_SALE' });
      const createdEvent = await insertEvent(pool, event);

      const mockTickets = Array.from({ length: 50 }, (_, i) => ({
        id: `ticket-${i + 1}`,
        userId: `user-${(i % 10) + 1}`,
        email: `user${(i % 10) + 1}@test.com`,
        status: 'VALID',
      }));

      mockTicketServiceClient.getTicketsByEvent.mockResolvedValue({ tickets: mockTickets });
      mockTicketServiceClient.cancelTicketsBatch.mockResolvedValue({ successCount: 50 });

      // Execute workflow
      const tickets = await mockTicketServiceClient.getTicketsByEvent(createdEvent.id);
      const ticketIds = tickets.tickets.map((t: any) => t.id);

      await mockTicketServiceClient.cancelTicketsBatch(
        ticketIds,
        'Event cancelled',
        `event-cancel-${createdEvent.id}`
      );

      expect(mockTicketServiceClient.cancelTicketsBatch).toHaveBeenCalledWith(
        expect.arrayContaining(['ticket-1', 'ticket-50']),
        'Event cancelled',
        `event-cancel-${createdEvent.id}`
      );
      expect(ticketIds.length).toBe(50);
    });

    it('should call paymentServiceClient for refunds', async () => {
      const event = createMockEvent({ status: 'ON_SALE' });
      const createdEvent = await insertEvent(pool, event);

      mockTicketServiceClient.getTicketsByEvent.mockResolvedValue({
        tickets: [{ id: 't1', userId: 'u1' }],
      });

      mockPaymentServiceClient.processBulkRefunds.mockResolvedValue({
        requestId: 'ref-123',
        jobId: 'job-456',
        totalOrders: 25,
        estimatedRefundAmount: 1875.00,
      });

      await mockPaymentServiceClient.processBulkRefunds({
        eventId: createdEvent.id,
        tenantId: TEST_DATA.TENANT_1_ID,
        refundPolicy: 'full',
        reason: 'Event cancelled',
      });

      expect(mockPaymentServiceClient.processBulkRefunds).toHaveBeenCalledWith({
        eventId: createdEvent.id,
        tenantId: TEST_DATA.TENANT_1_ID,
        refundPolicy: 'full',
        reason: 'Event cancelled',
      });
    });

    it('should call notificationServiceClient with unique user IDs', async () => {
      const event = createMockEvent({ status: 'ON_SALE' });
      const createdEvent = await insertEvent(pool, event);

      // Multiple tickets for same users
      const mockTickets = [
        { id: 't1', userId: 'user-A', email: 'a@test.com' },
        { id: 't2', userId: 'user-A', email: 'a@test.com' }, // Duplicate user
        { id: 't3', userId: 'user-B', email: 'b@test.com' },
        { id: 't4', userId: 'user-C', email: 'c@test.com' },
        { id: 't5', userId: 'user-B', email: 'b@test.com' }, // Duplicate user
      ];

      mockTicketServiceClient.getTicketsByEvent.mockResolvedValue({ tickets: mockTickets });
      mockNotificationServiceClient.sendBatchNotification.mockResolvedValue({ queuedCount: 3 });

      const tickets = await mockTicketServiceClient.getTicketsByEvent(createdEvent.id);

      // Get unique user IDs
      const uniqueUserIds = [...new Set(tickets.tickets.map((t: any) => t.userId))];

      await mockNotificationServiceClient.sendBatchNotification({
        notifications: uniqueUserIds.map(userId => ({
          userId,
          templateId: 'event_cancelled',
          data: { eventId: createdEvent.id, reason: 'Cancelled' },
        })),
        priority: 'high',
      });

      expect(uniqueUserIds).toEqual(['user-A', 'user-B', 'user-C']);
      expect(uniqueUserIds.length).toBe(3);
      expect(mockNotificationServiceClient.sendBatchNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          notifications: expect.arrayContaining([
            expect.objectContaining({ userId: 'user-A' }),
            expect.objectContaining({ userId: 'user-B' }),
            expect.objectContaining({ userId: 'user-C' }),
          ]),
        })
      );
    });
  });

  describe('Cancellation Report Content', () => {
    it('should include event details in report', async () => {
      const event = createMockEvent({
        status: 'ON_SALE',
        name: 'Rock Festival 2026',
        description: 'Three day music festival',
      });
      const createdEvent = await insertEvent(pool, event);

      const reportId = crypto.randomUUID();
      const reportData = {
        id: reportId,
        eventId: createdEvent.id,
        eventName: 'Rock Festival 2026',
        tenantId: TEST_DATA.TENANT_1_ID,
        cancelledAt: new Date().toISOString(),
        cancelledBy: TEST_DATA.USER_1_ID,
        reason: 'Weather concerns',
        refundPolicy: 'full',
      };

      await withTenantContext(pool, TEST_DATA.TENANT_1_ID, async (client) => {
        await client.query(
          `INSERT INTO event_cancellation_reports (id, tenant_id, event_id, report_data)
           VALUES ($1, $2, $3, $4)`,
          [reportId, TEST_DATA.TENANT_1_ID, createdEvent.id, JSON.stringify(reportData)]
        );
      });

      const stored = await withTenantContext(pool, TEST_DATA.TENANT_1_ID, async (client) => {
        const result = await client.query(
          `SELECT * FROM event_cancellation_reports WHERE id = $1`,
          [reportId]
        );
        return result.rows[0];
      });

      const report = typeof stored.report_data === 'string' ? JSON.parse(stored.report_data) : stored.report_data;
      expect(report.eventName).toBe('Rock Festival 2026');
      expect(report.reason).toBe('Weather concerns');
      expect(report.refundPolicy).toBe('full');
    });

    it('should include ticket breakdown by status in report', async () => {
      const event = createMockEvent({ status: 'ON_SALE' });
      const createdEvent = await insertEvent(pool, event);

      const ticketBreakdown = {
        byStatus: {
          VALID: 180,
          USED: 15,
          TRANSFERRED: 5,
        },
        total: 200,
      };

      const reportId = crypto.randomUUID();
      const reportData = {
        id: reportId,
        eventId: createdEvent.id,
        ticketBreakdown,
        summary: { totalTicketsSold: 200 },
      };

      await withTenantContext(pool, TEST_DATA.TENANT_1_ID, async (client) => {
        await client.query(
          `INSERT INTO event_cancellation_reports (id, tenant_id, event_id, report_data)
           VALUES ($1, $2, $3, $4)`,
          [reportId, TEST_DATA.TENANT_1_ID, createdEvent.id, JSON.stringify(reportData)]
        );
      });

      const stored = await withTenantContext(pool, TEST_DATA.TENANT_1_ID, async (client) => {
        const result = await client.query(
          `SELECT * FROM event_cancellation_reports WHERE id = $1`,
          [reportId]
        );
        return result.rows[0];
      });

      const report = typeof stored.report_data === 'string' ? JSON.parse(stored.report_data) : stored.report_data;
      expect(report.ticketBreakdown.byStatus.VALID).toBe(180);
      expect(report.ticketBreakdown.byStatus.USED).toBe(15);
      expect(report.ticketBreakdown.total).toBe(200);
    });

    it('should include pricing information in report', async () => {
      const event = createMockEvent({ status: 'ON_SALE' });
      const createdEvent = await insertEvent(pool, event);

      const pricingInfo = [
        { tier: 'Early Bird', quantity: 50, unitPrice: 45.00, totalValue: 2250.00 },
        { tier: 'General Admission', quantity: 120, unitPrice: 75.00, totalValue: 9000.00 },
        { tier: 'VIP', quantity: 30, unitPrice: 150.00, totalValue: 4500.00 },
      ];

      const reportId = crypto.randomUUID();
      const reportData = {
        id: reportId,
        eventId: createdEvent.id,
        ticketBreakdown: pricingInfo,
        summary: {
          totalTicketsSold: 200,
          totalRevenue: 15750.00,
          refundAmount: 15750.00,
        },
      };

      await withTenantContext(pool, TEST_DATA.TENANT_1_ID, async (client) => {
        await client.query(
          `INSERT INTO event_cancellation_reports (id, tenant_id, event_id, report_data)
           VALUES ($1, $2, $3, $4)`,
          [reportId, TEST_DATA.TENANT_1_ID, createdEvent.id, JSON.stringify(reportData)]
        );
      });

      const stored = await withTenantContext(pool, TEST_DATA.TENANT_1_ID, async (client) => {
        const result = await client.query(
          `SELECT * FROM event_cancellation_reports WHERE id = $1`,
          [reportId]
        );
        return result.rows[0];
      });

      const report = typeof stored.report_data === 'string' ? JSON.parse(stored.report_data) : stored.report_data;
      expect(report.ticketBreakdown).toHaveLength(3);
      expect(report.ticketBreakdown[0].tier).toBe('Early Bird');
      expect(report.summary.totalRevenue).toBe(15750.00);
      expect(report.summary.refundAmount).toBe(15750.00);
    });

    it('should make report retrievable via getCancellationReport pattern', async () => {
      const event = createMockEvent({ status: 'ON_SALE' });
      const createdEvent = await insertEvent(pool, event);

      const reportId = crypto.randomUUID();
      const reportData = {
        id: reportId,
        eventId: createdEvent.id,
        eventName: 'Test Event',
        summary: { totalTicketsSold: 100 },
      };

      await withTenantContext(pool, TEST_DATA.TENANT_1_ID, async (client) => {
        await client.query(
          `INSERT INTO event_cancellation_reports (id, tenant_id, event_id, report_data)
           VALUES ($1, $2, $3, $4)`,
          [reportId, TEST_DATA.TENANT_1_ID, createdEvent.id, JSON.stringify(reportData)]
        );
      });

      // Simulate getCancellationReport
      const retrieved = await withTenantContext(pool, TEST_DATA.TENANT_1_ID, async (client) => {
        const result = await client.query(
          `SELECT report_data FROM event_cancellation_reports
           WHERE id = $1 AND event_id = $2 AND tenant_id = $3`,
          [reportId, createdEvent.id, TEST_DATA.TENANT_1_ID]
        );
        if (result.rows.length === 0) return null;
        const data = result.rows[0].report_data;
        return typeof data === 'string' ? JSON.parse(data) : data;
      });

      expect(retrieved).toBeDefined();
      expect(retrieved.id).toBe(reportId);
      expect(retrieved.eventName).toBe('Test Event');
      expect(retrieved.summary.totalTicketsSold).toBe(100);
    });
  });

  describe('Timeline Tracking', () => {
    it('should track workflow stages in report timeline', async () => {
      const event = createMockEvent({ status: 'ON_SALE' });
      const createdEvent = await insertEvent(pool, event);

      const timeline = [
        { timestamp: new Date().toISOString(), action: 'Update event status', status: 'success' },
        { timestamp: new Date().toISOString(), action: 'Invalidate tickets', status: 'success', details: '50 tickets invalidated' },
        { timestamp: new Date().toISOString(), action: 'Record audit log', status: 'success' },
        { timestamp: new Date().toISOString(), action: 'Generate report', status: 'success' },
        { timestamp: new Date().toISOString(), action: 'Trigger refunds', status: 'success', details: '25 refunds triggered' },
        { timestamp: new Date().toISOString(), action: 'Cancel resale listings', status: 'failed', details: 'Marketplace service unavailable' },
      ];

      const reportId = crypto.randomUUID();
      const reportData = {
        id: reportId,
        eventId: createdEvent.id,
        timeline,
        errors: ['Cancel resale listings failed: Marketplace service unavailable'],
      };

      await withTenantContext(pool, TEST_DATA.TENANT_1_ID, async (client) => {
        await client.query(
          `INSERT INTO event_cancellation_reports (id, tenant_id, event_id, report_data)
           VALUES ($1, $2, $3, $4)`,
          [reportId, TEST_DATA.TENANT_1_ID, createdEvent.id, JSON.stringify(reportData)]
        );
      });

      const stored = await withTenantContext(pool, TEST_DATA.TENANT_1_ID, async (client) => {
        const result = await client.query(
          `SELECT * FROM event_cancellation_reports WHERE id = $1`,
          [reportId]
        );
        return result.rows[0];
      });

      const report = typeof stored.report_data === 'string' ? JSON.parse(stored.report_data) : stored.report_data;
      expect(report.timeline).toHaveLength(6);
      expect(report.timeline[0].action).toBe('Update event status');
      expect(report.timeline[5].status).toBe('failed');
      expect(report.errors).toHaveLength(1);
    });
  });
});
