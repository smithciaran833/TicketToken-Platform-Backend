import { TransferService } from '../../src/services/transferService';
import { DatabaseService } from '../../src/services/databaseService';
import { v4 as uuidv4 } from 'uuid';

/**
 * INTEGRATION TESTS FOR TRANSFER SERVICE
 * Tests ticket transfer logic and validations
 */

describe('TransferService Integration Tests', () => {
  let transferService: TransferService;
  let testTenantId: string;
  let testVenueId: string;
  let testEventId: string;
  let testTicketTypeId: string;
  let testTicketId: string;
  let fromUserId: string;
  let toUserId: string;

  beforeAll(async () => {
    await DatabaseService.initialize();
    transferService = new TransferService();
  });

  beforeEach(async () => {
    testTenantId = uuidv4();
    testVenueId = uuidv4();
    testEventId = uuidv4();
    testTicketTypeId = uuidv4();
    testTicketId = uuidv4();
    fromUserId = uuidv4();
    toUserId = uuidv4();

    // 1. Create tenant
    await DatabaseService.query(
      'INSERT INTO tenants (id, name, slug) VALUES ($1, $2, $3)',
      [testTenantId, 'Test Tenant', `test-${testTenantId.substring(0, 8)}`]
    );

    // 2. Create users
    await DatabaseService.query(
      `INSERT INTO users (id, email, password_hash, email_verified, status, role, tenant_id, can_receive_transfers, identity_verified)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [fromUserId, `from-${fromUserId.substring(0, 8)}@test.com`, '$2b$10$hash', true, 'ACTIVE', 'user', testTenantId, true, true]
    );

    await DatabaseService.query(
      `INSERT INTO users (id, email, password_hash, email_verified, status, role, tenant_id, can_receive_transfers, identity_verified)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [toUserId, `to-${toUserId.substring(0, 8)}@test.com`, '$2b$10$hash', true, 'ACTIVE', 'user', testTenantId, true, true]
    );

    // 3. Create venue
    await DatabaseService.query(
      `INSERT INTO venues (id, tenant_id, name, slug, email, address_line1, city, state_province, country_code, venue_type, max_capacity, created_by, transfer_deadline_hours)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
      [testVenueId, testTenantId, 'Test Venue', `venue-${testVenueId.substring(0, 8)}`, 'venue@test.com', '123 Test St', 'Test City', 'TS', 'US', 'theater', 1000, fromUserId, 48]
    );

    // 4. Create event (2 weeks in future)
    const futureDate = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
    await DatabaseService.query(
      `INSERT INTO events (id, tenant_id, venue_id, name, slug, status, created_by, start_date, allow_transfers, max_transfers_per_ticket)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [testEventId, testTenantId, testVenueId, 'Test Event', `event-${testEventId.substring(0, 8)}`, 'PUBLISHED', fromUserId, futureDate, true, 5]
    );

    // 5. Create ticket type
    await DatabaseService.query(
      `INSERT INTO ticket_types (id, tenant_id, event_id, name, price, quantity, available_quantity, sale_start, sale_end)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW() + INTERVAL '30 days')`,
      [testTicketTypeId, testTenantId, testEventId, 'GA', 100.00, 100, 100]
    );

    // 6. Create ticket
    const ticketNumber = `TKT-${Date.now()}`;
    await DatabaseService.query(
      `INSERT INTO tickets (id, tenant_id, event_id, ticket_type_id, user_id, ticket_number, qr_code, status, is_transferable)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [testTicketId, testTenantId, testEventId, testTicketTypeId, fromUserId, ticketNumber, `QR-${ticketNumber}`, 'active', true]
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
    it('should successfully transfer ticket', async () => {
      const result = await transferService.transferTicket(
        testTicketId,
        fromUserId,
        toUserId,
        'Test transfer'
      );

      expect(result.fromUserId).toBe(fromUserId);
      expect(result.toUserId).toBe(toUserId);
      expect(result.transferredAt).toBeInstanceOf(Date);
      expect(result.reason).toBe('Test transfer');
      expect(result.status).toBe('completed');
    });

    it('should update ticket ownership', async () => {
      await transferService.transferTicket(testTicketId, fromUserId, toUserId);

      const ticket = await DatabaseService.query(
        'SELECT user_id, status FROM tickets WHERE id = $1',
        [testTicketId]
      );

      expect(ticket.rows[0].user_id).toBe(toUserId);
      expect(ticket.rows[0].status).toBe('transferred');
    });

    it('should increment transfer count', async () => {
      await transferService.transferTicket(testTicketId, fromUserId, toUserId);

      const ticket = await DatabaseService.query(
        'SELECT transfer_count FROM tickets WHERE id = $1',
        [testTicketId]
      );

      expect(ticket.rows[0].transfer_count).toBe(1);
    });

    it('should create transfer record', async () => {
      await transferService.transferTicket(testTicketId, fromUserId, toUserId);

      const transfer = await DatabaseService.query(
        'SELECT * FROM ticket_transfers WHERE ticket_id = $1',
        [testTicketId]
      );

      expect(transfer.rows.length).toBe(1);
      expect(transfer.rows[0].from_user_id).toBe(fromUserId);
      expect(transfer.rows[0].to_user_id).toBe(toUserId);
      expect(transfer.rows[0].status).toBe('completed');
    });

    it('should reject transfer from non-owner', async () => {
      const otherUserId = uuidv4();
      await DatabaseService.query(
        `INSERT INTO users (id, email, password_hash, email_verified, status, role, tenant_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [otherUserId, `other-${otherUserId.substring(0, 8)}@test.com`, '$2b$10$hash', true, 'ACTIVE', 'user', testTenantId]
      );

      await expect(
        transferService.transferTicket(testTicketId, otherUserId, toUserId)
      ).rejects.toThrow('You do not own this ticket');
    });

    it('should reject transfer for incorrect status', async () => {
      await DatabaseService.query(
        "UPDATE tickets SET status = 'used' WHERE id = $1",
        [testTicketId]
      );

      await expect(
        transferService.transferTicket(testTicketId, fromUserId, toUserId)
      ).rejects.toThrow('Cannot transfer ticket with status');
    });

    it('should reject transfer when event disallows transfers', async () => {
      await DatabaseService.query(
        'UPDATE events SET allow_transfers = $1 WHERE id = $2',
        [false, testEventId]
      );

      await expect(
        transferService.transferTicket(testTicketId, fromUserId, toUserId)
      ).rejects.toThrow('Transfers are not allowed');
    });

    it('should reject transfer past deadline', async () => {
      // Set event to tomorrow
      const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
      await DatabaseService.query(
        'UPDATE events SET start_date = $1 WHERE id = $2',
        [tomorrow, testEventId]
      );

      await expect(
        transferService.transferTicket(testTicketId, fromUserId, toUserId)
      ).rejects.toThrow('Transfer deadline has passed');
    });

    it('should enforce max transfer limit', async () => {
      // Set max transfers to 1
      await DatabaseService.query(
        'UPDATE events SET max_transfers_per_ticket = $1 WHERE id = $2',
        [1, testEventId]
      );

      // First transfer succeeds
      await transferService.transferTicket(testTicketId, fromUserId, toUserId);

      // Update ownership back to fromUserId for second attempt
      await DatabaseService.query(
        "UPDATE tickets SET user_id = $1, status = 'active' WHERE id = $2",
        [fromUserId, testTicketId]
      );

      // Create third user
      const thirdUserId = uuidv4();
      await DatabaseService.query(
        `INSERT INTO users (id, email, password_hash, email_verified, status, role, tenant_id, can_receive_transfers)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [thirdUserId, `third-${thirdUserId.substring(0, 8)}@test.com`, '$2b$10$hash', true, 'ACTIVE', 'user', testTenantId, true]
      );

      // Second transfer should fail
      await expect(
        transferService.transferTicket(testTicketId, fromUserId, thirdUserId)
      ).rejects.toThrow('Maximum transfer limit');
    });

    it('should transfer without reason parameter', async () => {
      const result = await transferService.transferTicket(
        testTicketId,
        fromUserId,
        toUserId
      );

      expect(result.reason).toBeUndefined();
    });

    it('should reject non-transferable ticket', async () => {
      await DatabaseService.query(
        'UPDATE tickets SET is_transferable = false WHERE id = $1',
        [testTicketId]
      );

      await expect(
        transferService.transferTicket(testTicketId, fromUserId, toUserId)
      ).rejects.toThrow('non-transferable');
    });
  });

  describe('validateTransferRequest', () => {
    it('should validate successful transfer', async () => {
      const validation = await transferService.validateTransferRequest(
        testTicketId,
        fromUserId,
        toUserId
      );

      expect(validation.valid).toBe(true);
      expect(validation.reason).toBeUndefined();
    });

    it('should reject self-transfer', async () => {
      const validation = await transferService.validateTransferRequest(
        testTicketId,
        fromUserId,
        fromUserId
      );

      expect(validation.valid).toBe(false);
      expect(validation.reason).toContain('Cannot transfer ticket to yourself');
    });

    it('should reject transfer to inactive user', async () => {
      await DatabaseService.query(
        "UPDATE users SET status = 'SUSPENDED' WHERE id = $1",
        [toUserId]
      );

      const validation = await transferService.validateTransferRequest(
        testTicketId,
        fromUserId,
        toUserId
      );

      expect(validation.valid).toBe(false);
      expect(validation.reason).toContain('Recipient account is not active');
    });

    it('should reject transfer to unverified email', async () => {
      await DatabaseService.query(
        'UPDATE users SET email_verified = false WHERE id = $1',
        [toUserId]
      );

      const validation = await transferService.validateTransferRequest(
        testTicketId,
        fromUserId,
        toUserId
      );

      expect(validation.valid).toBe(false);
      expect(validation.reason).toContain('must verify email');
    });

    it('should reject transfer when recipient cannot receive', async () => {
      await DatabaseService.query(
        'UPDATE users SET can_receive_transfers = false WHERE id = $1',
        [toUserId]
      );

      const validation = await transferService.validateTransferRequest(
        testTicketId,
        fromUserId,
        toUserId
      );

      expect(validation.valid).toBe(false);
      expect(validation.reason).toContain('Recipient cannot receive transfers');
    });

    it('should reject non-transferable ticket', async () => {
      await DatabaseService.query(
        'UPDATE tickets SET is_transferable = false WHERE id = $1',
        [testTicketId]
      );

      const validation = await transferService.validateTransferRequest(
        testTicketId,
        fromUserId,
        toUserId
      );

      expect(validation.valid).toBe(false);
      expect(validation.reason).toContain('non-transferable');
    });

    it('should reject transfer for non-existent ticket', async () => {
      const validation = await transferService.validateTransferRequest(
        uuidv4(),
        fromUserId,
        toUserId
      );

      expect(validation.valid).toBe(false);
      expect(validation.reason).toContain('Ticket not found');
    });

    it('should reject transfer to non-existent user', async () => {
      const validation = await transferService.validateTransferRequest(
        testTicketId,
        fromUserId,
        uuidv4()
      );

      expect(validation.valid).toBe(false);
      expect(validation.reason).toContain('Recipient user not found');
    });

    it('should reject transfer for non-active ticket', async () => {
      await DatabaseService.query(
        "UPDATE tickets SET status = 'cancelled' WHERE id = $1",
        [testTicketId]
      );

      const validation = await transferService.validateTransferRequest(
        testTicketId,
        fromUserId,
        toUserId
      );

      expect(validation.valid).toBe(false);
      expect(validation.reason).toContain('does not allow transfers');
    });
  });

  describe('getTransferHistory', () => {
    it('should return empty history for untransferred ticket', async () => {
      const history = await transferService.getTransferHistory(testTicketId);

      expect(history).toEqual([]);
    });

    it('should return transfer history after transfer', async () => {
      await transferService.transferTicket(testTicketId, fromUserId, toUserId);

      const history = await transferService.getTransferHistory(testTicketId);

      expect(history.length).toBe(1);
      expect(history[0].fromUserId).toBe(fromUserId);
      expect(history[0].toUserId).toBe(toUserId);
    });

    it('should return multiple transfers in order', async () => {
      // First transfer
      await transferService.transferTicket(testTicketId, fromUserId, toUserId);

      // Update for second transfer
      await DatabaseService.query(
        "UPDATE tickets SET user_id = $1, status = 'active' WHERE id = $2",
        [toUserId, testTicketId]
      );

      // Reset cooldown by deleting the transfer record's timestamp
      await DatabaseService.query(
        "UPDATE ticket_transfers SET transferred_at = NOW() - INTERVAL '1 hour' WHERE ticket_id = $1",
        [testTicketId]
      );

      // Create third user
      const thirdUserId = uuidv4();
      await DatabaseService.query(
        `INSERT INTO users (id, email, password_hash, email_verified, status, role, tenant_id, can_receive_transfers)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [thirdUserId, `third-${thirdUserId.substring(0, 8)}@test.com`, '$2b$10$hash', true, 'ACTIVE', 'user', testTenantId, true]
      );

      // Second transfer
      await transferService.transferTicket(testTicketId, toUserId, thirdUserId);

      const history = await transferService.getTransferHistory(testTicketId);

      expect(history.length).toBe(2);
      // Should be in DESC order (most recent first)
      expect(history[0].toUserId).toBe(thirdUserId);
      expect(history[1].toUserId).toBe(toUserId);
    });
  });

  describe('transfer cooldown', () => {
    it('should enforce cooldown period between transfers', async () => {
      // First transfer
      await transferService.transferTicket(testTicketId, fromUserId, toUserId);

      // Update for second transfer attempt
      await DatabaseService.query(
        "UPDATE tickets SET user_id = $1, status = 'active' WHERE id = $2",
        [toUserId, testTicketId]
      );

      // Try immediate second transfer
      const validation = await transferService.validateTransferRequest(
        testTicketId,
        toUserId,
        fromUserId
      );

      expect(validation.valid).toBe(false);
      expect(validation.reason).toContain('wait');
      expect(validation.reason).toContain('minutes');
    });
  });

  describe('blackout periods', () => {
    it('should reject transfers during blackout', async () => {
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);

      await DatabaseService.query(
        'UPDATE events SET transfer_blackout_start = $1, transfer_blackout_end = $2 WHERE id = $3',
        [yesterday, tomorrow, testEventId]
      );

      await expect(
        transferService.transferTicket(testTicketId, fromUserId, toUserId)
      ).rejects.toThrow('blackout period');
    });
  });

  describe('identity verification', () => {
    it('should require identity verification when enabled', async () => {
      await DatabaseService.query(
        'UPDATE events SET require_identity_verification = true WHERE id = $1',
        [testEventId]
      );

      await DatabaseService.query(
        'UPDATE users SET identity_verified = false WHERE id = $1',
        [toUserId]
      );

      await expect(
        transferService.transferTicket(testTicketId, fromUserId, toUserId)
      ).rejects.toThrow('Identity verification required');
    });

    it('should allow transfer when both users verified', async () => {
      await DatabaseService.query(
        'UPDATE events SET require_identity_verification = true WHERE id = $1',
        [testEventId]
      );

      const result = await transferService.transferTicket(
        testTicketId,
        fromUserId,
        toUserId
      );

      expect(result.fromUserId).toBe(fromUserId);
      expect(result.toUserId).toBe(toUserId);
    });
  });

  describe('edge cases', () => {
    it('should handle missing venue transfer deadline', async () => {
      await DatabaseService.query(
        'UPDATE venues SET transfer_deadline_hours = NULL WHERE id = $1',
        [testVenueId]
      );

      const result = await transferService.transferTicket(
        testTicketId,
        fromUserId,
        toUserId
      );

      expect(result.transferredAt).toBeDefined();
    });
  });
});
