import { transferController } from '../../src/controllers/transferController';
import { DatabaseService } from '../../src/services/databaseService';
import { v4 as uuidv4 } from 'uuid';

/**
 * INTEGRATION TESTS FOR TRANSFER CONTROLLER
 * Tests ticket transfer operations, history tracking, and validation
 * 
 * FK Chain: tenants → users → venues → events → ticket_types → tickets → ticket_transfers
 * Note: Table is ticket_transfers, not transfers
 */

describe('TransferController Integration Tests', () => {
  let testTenantId: string;
  let testFromUserId: string;
  let testToUserId: string;
  let testEventId: string;
  let testVenueId: string;
  let testTicketTypeId: string;
  let testTicketId: string;

  beforeAll(async () => {
    await DatabaseService.initialize();
  });

  beforeEach(async () => {
    testTenantId = uuidv4();
    testFromUserId = uuidv4();
    testToUserId = uuidv4();
    testEventId = uuidv4();
    testVenueId = uuidv4();
    testTicketTypeId = uuidv4();
    testTicketId = uuidv4();

    // 1. Create tenant
    await DatabaseService.query(
      'INSERT INTO tenants (id, name, slug) VALUES ($1, $2, $3)',
      [testTenantId, 'Test Tenant', `test-${testTenantId.substring(0, 8)}`]
    );

    // 2. Create users
    await DatabaseService.query(
      `INSERT INTO users (id, email, password_hash, email_verified, status, role, tenant_id, can_receive_transfers)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [testFromUserId, `from-${testFromUserId.substring(0, 8)}@test.com`, '$2b$10$hash', true, 'ACTIVE', 'user', testTenantId, true]
    );

    await DatabaseService.query(
      `INSERT INTO users (id, email, password_hash, email_verified, status, role, tenant_id, can_receive_transfers)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [testToUserId, `to-${testToUserId.substring(0, 8)}@test.com`, '$2b$10$hash', true, 'ACTIVE', 'user', testTenantId, true]
    );

    // 3. Create venue
    await DatabaseService.query(
      `INSERT INTO venues (id, tenant_id, name, slug, email, address_line1, city, state_province, country_code, venue_type, max_capacity, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [testVenueId, testTenantId, 'Test Venue', `venue-${testVenueId.substring(0, 8)}`, 'venue@test.com', '123 Test St', 'New York', 'NY', 'US', 'theater', 1000, testFromUserId]
    );

    // 4. Create event (well into the future to avoid transfer deadline issues)
    await DatabaseService.query(
      `INSERT INTO events (id, tenant_id, venue_id, name, slug, start_date, status, created_by, allow_transfers)
       VALUES ($1, $2, $3, $4, $5, NOW() + INTERVAL '30 days', $6, $7, $8)`,
      [testEventId, testTenantId, testVenueId, 'Test Event', `event-${testEventId.substring(0, 8)}`, 'PUBLISHED', testFromUserId, true]
    );

    // 5. Create ticket type
    await DatabaseService.query(
      `INSERT INTO ticket_types (id, tenant_id, event_id, name, price, quantity, available_quantity, sale_start, sale_end)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW() + INTERVAL '30 days')`,
      [testTicketTypeId, testTenantId, testEventId, 'General Admission', 50.00, 100, 100]
    );

    // 6. Create ticket owned by fromUser
    const ticketNumber = `TKT-${Date.now()}`;
    await DatabaseService.query(
      `INSERT INTO tickets (id, tenant_id, event_id, user_id, ticket_type_id, ticket_number, qr_code, status, price_cents, is_transferable, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())`,
      [testTicketId, testTenantId, testEventId, testFromUserId, testTicketTypeId, ticketNumber, `QR-${ticketNumber}`, 'active', 5000, true]
    );
  });

  afterEach(async () => {
    await DatabaseService.query('DELETE FROM ticket_transfers WHERE tenant_id = $1', [testTenantId]);
    await DatabaseService.query('DELETE FROM tickets WHERE tenant_id = $1', [testTenantId]);
    await DatabaseService.query('DELETE FROM ticket_types WHERE tenant_id = $1', [testTenantId]);
    await DatabaseService.query('DELETE FROM events WHERE tenant_id = $1', [testTenantId]);
    await DatabaseService.query('DELETE FROM venues WHERE tenant_id = $1', [testTenantId]);
    await DatabaseService.query('DELETE FROM users WHERE tenant_id = $1', [testTenantId]);
    await DatabaseService.query('DELETE FROM tenants WHERE id = $1', [testTenantId]);
  });

  afterAll(async () => {
    await DatabaseService.close();
  });

  describe('transferTicket', () => {
    it('should successfully transfer ticket from owner to recipient', async () => {
      const request = {
        body: {
          ticketId: testTicketId,
          toUserId: testToUserId,
          reason: 'Gift to friend'
        },
        user: { id: testFromUserId },
        ip: '127.0.0.1',
        headers: { 'user-agent': 'test-agent' }
      } as any;

      const reply = {
        send: jest.fn()
      } as any;

      await transferController.transferTicket(request, reply);

      expect(reply.send).toHaveBeenCalledWith({
        success: true,
        data: expect.objectContaining({
          ticketId: testTicketId,
          fromUserId: testFromUserId,
          toUserId: testToUserId
        })
      });

      // Verify ticket owner changed in database
      const result = await DatabaseService.query(
        'SELECT user_id FROM tickets WHERE id = $1',
        [testTicketId]
      );
      expect(result.rows[0].user_id).toBe(testToUserId);
    });

    it('should create transfer record in database', async () => {
      const request = {
        body: {
          ticketId: testTicketId,
          toUserId: testToUserId,
          reason: 'Resale'
        },
        user: { id: testFromUserId },
        ip: '127.0.0.1',
        headers: { 'user-agent': 'test-agent' }
      } as any;

      const reply = {
        send: jest.fn()
      } as any;

      await transferController.transferTicket(request, reply);

      // Verify transfer record exists in ticket_transfers table
      const result = await DatabaseService.query(
        'SELECT * FROM ticket_transfers WHERE ticket_id = $1',
        [testTicketId]
      );

      expect(result.rows.length).toBeGreaterThan(0);
      expect(result.rows[0].from_user_id).toBe(testFromUserId);
      expect(result.rows[0].to_user_id).toBe(testToUserId);
    });

    it('should record transfer with optional reason', async () => {
      const request = {
        body: {
          ticketId: testTicketId,
          toUserId: testToUserId
        },
        user: { id: testFromUserId },
        ip: '127.0.0.1',
        headers: { 'user-agent': 'test-agent' }
      } as any;

      const reply = {
        send: jest.fn()
      } as any;

      await transferController.transferTicket(request, reply);

      expect(reply.send).toHaveBeenCalledWith({
        success: true,
        data: expect.any(Object)
      });
    });

    it('should prevent unauthorized transfer', async () => {
      const unauthorizedUserId = uuidv4();
      const request = {
        body: {
          ticketId: testTicketId,
          toUserId: testToUserId,
          reason: 'Attempted theft'
        },
        user: { id: unauthorizedUserId },
        ip: '127.0.0.1',
        headers: { 'user-agent': 'test-agent' }
      } as any;

      const reply = {
        send: jest.fn()
      } as any;

      await expect(transferController.transferTicket(request, reply)).rejects.toThrow();

      // Verify ticket owner unchanged
      const result = await DatabaseService.query(
        'SELECT user_id FROM tickets WHERE id = $1',
        [testTicketId]
      );
      expect(result.rows[0].user_id).toBe(testFromUserId);
    });

    it('should prevent transfer of non-existent ticket', async () => {
      const fakeTicketId = uuidv4();
      const request = {
        body: {
          ticketId: fakeTicketId,
          toUserId: testToUserId,
          reason: 'Test'
        },
        user: { id: testFromUserId },
        ip: '127.0.0.1',
        headers: { 'user-agent': 'test-agent' }
      } as any;

      const reply = {
        send: jest.fn()
      } as any;

      await expect(transferController.transferTicket(request, reply)).rejects.toThrow();
    });

    it('should prevent transfer to same user', async () => {
      const request = {
        body: {
          ticketId: testTicketId,
          toUserId: testFromUserId, // Same as owner
          reason: 'Self transfer'
        },
        user: { id: testFromUserId },
        ip: '127.0.0.1',
        headers: { 'user-agent': 'test-agent' }
      } as any;

      const reply = {
        send: jest.fn()
      } as any;

      await expect(transferController.transferTicket(request, reply)).rejects.toThrow();
    });
  });

  describe('getTransferHistory', () => {
    beforeEach(async () => {
      // Create transfer history using correct table and required columns
      const acceptanceCode1 = Math.random().toString(36).substring(2, 14).toUpperCase();
      const acceptanceCode2 = Math.random().toString(36).substring(2, 14).toUpperCase();
      
      await DatabaseService.query(
        `INSERT INTO ticket_transfers (id, tenant_id, ticket_id, from_user_id, to_user_id, to_email, transfer_method, status, acceptance_code, is_gift, expires_at, message, transferred_at, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW() + INTERVAL '7 days', $11, NOW() - INTERVAL '2 days', NOW() - INTERVAL '2 days')`,
        [uuidv4(), testTenantId, testTicketId, testFromUserId, testToUserId, `to-${testToUserId.substring(0, 8)}@test.com`, 'direct', 'completed', acceptanceCode1, true, 'Initial transfer']
      );

      // Transfer back
      await DatabaseService.query(
        `INSERT INTO ticket_transfers (id, tenant_id, ticket_id, from_user_id, to_user_id, to_email, transfer_method, status, acceptance_code, is_gift, expires_at, message, transferred_at, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW() + INTERVAL '7 days', $11, NOW() - INTERVAL '1 day', NOW() - INTERVAL '1 day')`,
        [uuidv4(), testTenantId, testTicketId, testToUserId, testFromUserId, `from-${testFromUserId.substring(0, 8)}@test.com`, 'direct', 'completed', acceptanceCode2, true, 'Transfer back']
      );
    });

    it('should return transfer history for a ticket', async () => {
      const request = {
        params: { ticketId: testTicketId }
      } as any;

      const reply = {
        send: jest.fn()
      } as any;

      await transferController.getTransferHistory(request, reply);

      expect(reply.send).toHaveBeenCalledWith({
        success: true,
        data: expect.arrayContaining([
          expect.objectContaining({
            ticketId: testTicketId
          })
        ])
      });

      const response = reply.send.mock.calls[0][0];
      expect(response.data.length).toBeGreaterThanOrEqual(2);
    });

    it('should return empty array for ticket with no transfers', async () => {
      const newTicketId = uuidv4();
      const newTicketNumber = `TKT-${Date.now()}-NEW`;
      
      await DatabaseService.query(
        `INSERT INTO tickets (id, tenant_id, event_id, user_id, ticket_type_id, ticket_number, qr_code, status, price_cents)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [newTicketId, testTenantId, testEventId, testFromUserId, testTicketTypeId, newTicketNumber, `QR-${newTicketNumber}`, 'active', 5000]
      );

      const request = {
        params: { ticketId: newTicketId }
      } as any;

      const reply = {
        send: jest.fn()
      } as any;

      await transferController.getTransferHistory(request, reply);

      expect(reply.send).toHaveBeenCalledWith({
        success: true,
        data: []
      });
    });
  });

  describe('validateTransfer', () => {
    it('should validate transfer from owner', async () => {
      const request = {
        body: {
          ticketId: testTicketId,
          toUserId: testToUserId
        },
        user: { id: testFromUserId }
      } as any;

      const reply = {
        send: jest.fn()
      } as any;

      await transferController.validateTransfer(request, reply);

      expect(reply.send).toHaveBeenCalledWith({
        success: true,
        data: expect.objectContaining({
          valid: true
        })
      });
    });

    it('should reject validation from non-owner', async () => {
      const wrongUserId = uuidv4();
      const request = {
        body: {
          ticketId: testTicketId,
          toUserId: testToUserId
        },
        user: { id: wrongUserId }
      } as any;

      const reply = {
        send: jest.fn()
      } as any;

      await transferController.validateTransfer(request, reply);

      expect(reply.send).toHaveBeenCalledWith({
        success: false,
        data: expect.objectContaining({
          valid: false
        })
      });
    });

    it('should reject validation for non-existent ticket', async () => {
      const fakeTicketId = uuidv4();
      const request = {
        body: {
          ticketId: fakeTicketId,
          toUserId: testToUserId
        },
        user: { id: testFromUserId }
      } as any;

      const reply = {
        send: jest.fn()
      } as any;

      await transferController.validateTransfer(request, reply);

      expect(reply.send).toHaveBeenCalledWith({
        success: false,
        data: expect.objectContaining({
          valid: false
        })
      });
    });

    it('should reject validation for self-transfer', async () => {
      const request = {
        body: {
          ticketId: testTicketId,
          toUserId: testFromUserId // Same as owner
        },
        user: { id: testFromUserId }
      } as any;

      const reply = {
        send: jest.fn()
      } as any;

      await transferController.validateTransfer(request, reply);

      expect(reply.send).toHaveBeenCalledWith({
        success: false,
        data: expect.objectContaining({
          valid: false
        })
      });
    });

    it('should reject validation for used tickets', async () => {
      // Mark ticket as used
      await DatabaseService.query(
        `UPDATE tickets SET status = 'used' WHERE id = $1`,
        [testTicketId]
      );

      const request = {
        body: {
          ticketId: testTicketId,
          toUserId: testToUserId
        },
        user: { id: testFromUserId }
      } as any;

      const reply = {
        send: jest.fn()
      } as any;

      await transferController.validateTransfer(request, reply);

      expect(reply.send).toHaveBeenCalledWith({
        success: false,
        data: expect.objectContaining({
          valid: false
        })
      });
    });
  });

  describe('security and tenant isolation', () => {
    it('should prevent cross-tenant transfer access', async () => {
      const otherTenantId = uuidv4();
      const otherTicketId = uuidv4();
      const otherTicketNumber = `TKT-${Date.now()}-OTHER`;

      // Create other tenant
      await DatabaseService.query(
        'INSERT INTO tenants (id, name, slug) VALUES ($1, $2, $3)',
        [otherTenantId, 'Other Tenant', `other-${otherTenantId.substring(0, 8)}`]
      );

      // Create ticket in different tenant (note: this may fail FK constraints, but tests the isolation)
      try {
        await DatabaseService.query(
          `INSERT INTO tickets (id, tenant_id, event_id, user_id, ticket_type_id, ticket_number, qr_code, status, price_cents)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [otherTicketId, otherTenantId, testEventId, testFromUserId, testTicketTypeId, otherTicketNumber, `QR-${otherTicketNumber}`, 'active', 5000]
        );
      } catch (e) {
        // Expected - FK constraint may prevent this
      }

      const request = {
        body: {
          ticketId: otherTicketId,
          toUserId: testToUserId,
          reason: 'Cross-tenant attempt'
        },
        user: { id: testFromUserId },
        ip: '127.0.0.1',
        headers: { 'user-agent': 'test' }
      } as any;

      const reply = {
        send: jest.fn()
      } as any;

      await expect(transferController.transferTicket(request, reply)).rejects.toThrow();

      // Cleanup
      await DatabaseService.query('DELETE FROM tenants WHERE id = $1', [otherTenantId]);
    });

    it('should validate ticket ownership before transfer', async () => {
      const attackerId = uuidv4();

      const request = {
        body: {
          ticketId: testTicketId,
          toUserId: attackerId,
          reason: 'Theft attempt'
        },
        user: { id: attackerId },
        ip: '1.2.3.4',
        headers: { 'user-agent': 'attacker' }
      } as any;

      const reply = {
        send: jest.fn()
      } as any;

      await expect(transferController.transferTicket(request, reply)).rejects.toThrow();
    });
  });

  describe('edge cases', () => {
    it('should handle transfer with missing toUserId', async () => {
      const request = {
        body: {
          ticketId: testTicketId,
          reason: 'Missing recipient'
        },
        user: { id: testFromUserId },
        ip: '127.0.0.1',
        headers: { 'user-agent': 'test' }
      } as any;

      const reply = {
        send: jest.fn()
      } as any;

      await expect(transferController.transferTicket(request, reply)).rejects.toThrow();
    });

    it('should handle transfer with missing ticketId', async () => {
      const request = {
        body: {
          toUserId: testToUserId,
          reason: 'Missing ticket'
        },
        user: { id: testFromUserId },
        ip: '127.0.0.1',
        headers: { 'user-agent': 'test' }
      } as any;

      const reply = {
        send: jest.fn()
      } as any;

      await expect(transferController.transferTicket(request, reply)).rejects.toThrow();
    });
  });

  describe('data consistency', () => {
    it('should maintain referential integrity during transfer', async () => {
      const request = {
        body: {
          ticketId: testTicketId,
          toUserId: testToUserId,
          reason: 'Integrity test'
        },
        user: { id: testFromUserId },
        ip: '127.0.0.1',
        headers: { 'user-agent': 'test' }
      } as any;

      const reply = {
        send: jest.fn()
      } as any;

      await transferController.transferTicket(request, reply);

      // Verify ticket still exists and owner changed
      const ticketResult = await DatabaseService.query(
        'SELECT * FROM tickets WHERE id = $1',
        [testTicketId]
      );

      expect(ticketResult.rows.length).toBe(1);
      expect(ticketResult.rows[0].user_id).toBe(testToUserId);

      // Verify transfer record exists
      const transferResult = await DatabaseService.query(
        'SELECT * FROM ticket_transfers WHERE ticket_id = $1',
        [testTicketId]
      );

      expect(transferResult.rows.length).toBeGreaterThan(0);
    });

    it('should preserve ticket metadata during transfer', async () => {
      // Get initial ticket data
      const beforeResult = await DatabaseService.query(
        'SELECT * FROM tickets WHERE id = $1',
        [testTicketId]
      );
      const beforeData = beforeResult.rows[0];

      const request = {
        body: {
          ticketId: testTicketId,
          toUserId: testToUserId,
          reason: 'Metadata preservation test'
        },
        user: { id: testFromUserId },
        ip: '127.0.0.1',
        headers: { 'user-agent': 'test' }
      } as any;

      const reply = {
        send: jest.fn()
      } as any;

      await transferController.transferTicket(request, reply);

      // Get ticket data after transfer
      const afterResult = await DatabaseService.query(
        'SELECT * FROM tickets WHERE id = $1',
        [testTicketId]
      );
      const afterData = afterResult.rows[0];

      // Verify only user_id and status changed
      expect(afterData.id).toBe(beforeData.id);
      expect(afterData.event_id).toBe(beforeData.event_id);
      expect(afterData.ticket_type_id).toBe(beforeData.ticket_type_id);
      expect(afterData.price_cents).toBe(beforeData.price_cents);
      expect(afterData.user_id).not.toBe(beforeData.user_id);
      expect(afterData.user_id).toBe(testToUserId);
    });
  });
});
