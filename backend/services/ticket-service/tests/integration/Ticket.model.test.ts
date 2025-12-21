import { DatabaseService } from '../../src/services/databaseService';
import { TicketModel, ITicket } from '../../src/models/Ticket';
import { v4 as uuidv4 } from 'uuid';

/**
 * INTEGRATION TESTS FOR Ticket MODEL
 * Tests ticket database operations
 */

describe('Ticket Model Integration Tests', () => {
  let ticketModel: TicketModel;
  let testTenantId: string;
  let testUserId: string;
  let testVenueId: string;
  let testEventId: string;
  let testTicketTypeId: string;

  beforeAll(async () => {
    await DatabaseService.initialize();
    ticketModel = new TicketModel((DatabaseService as any).pool);
  });

  beforeEach(async () => {
    testTenantId = uuidv4();
    testUserId = uuidv4();
    testVenueId = uuidv4();
    testEventId = uuidv4();
    testTicketTypeId = uuidv4();

    // 1. Create tenant
    await DatabaseService.query(
      'INSERT INTO tenants (id, name, slug) VALUES ($1, $2, $3) ON CONFLICT (id) DO NOTHING',
      [testTenantId, 'Test Tenant', `test-${testTenantId}`]
    );

    // 2. Create user
    await DatabaseService.query(
      `INSERT INTO users (id, email, password_hash, email_verified, status, role, tenant_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT (id) DO NOTHING`,
      [testUserId, `test-${testUserId}@example.com`, '$2b$10$dummyhash', true, 'ACTIVE', 'user', testTenantId]
    );

    // 3. Create venue
    await DatabaseService.query(
      `INSERT INTO venues (id, tenant_id, name, slug, email, address_line1, city, state_province, country_code, venue_type, max_capacity, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) ON CONFLICT (id) DO NOTHING`,
      [testVenueId, testTenantId, 'Test Venue', `test-venue-${testVenueId}`, 'test@venue.com', '123 Test St', 'Test City', 'Test State', 'US', 'theater', 1000, testUserId]
    );

    // 4. Create event
    await DatabaseService.query(
      `INSERT INTO events (id, tenant_id, venue_id, name, slug, status, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT (id) DO NOTHING`,
      [testEventId, testTenantId, testVenueId, 'Test Event', `test-event-${testEventId}`, 'PUBLISHED', testUserId]
    );

    // 5. Create ticket type
    await DatabaseService.query(
      `INSERT INTO ticket_types (id, tenant_id, event_id, name, price, quantity, available_quantity, sold_quantity, reserved_quantity, is_active, sale_start, sale_end)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW() + INTERVAL '30 days') ON CONFLICT (id) DO NOTHING`,
      [testTicketTypeId, testTenantId, testEventId, 'General Admission', 50.00, 100, 100, 0, 0, true]
    );
  });

  afterEach(async () => {
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

  describe('create', () => {
    it('should create a ticket', async () => {
      const ticketData: ITicket = {
        tenant_id: testTenantId,
        event_id: testEventId,
        ticket_type_id: testTicketTypeId,
        user_id: testUserId,
        status: 'active',
        price_cents: 5000
      };

      const result = await ticketModel.create(ticketData);

      expect(result).toBeDefined();
      expect(result.id).toBeDefined();
      expect(result.event_id).toBe(testEventId);
      expect(result.ticket_type_id).toBe(testTicketTypeId);
      expect(result.user_id).toBe(testUserId);
      expect(result.status).toBe('active');
      expect(result.price_cents).toBe(5000);
      expect(result.ticket_number).toBeDefined();
      expect(result.qr_code).toBeDefined();
    });

    it('should auto-generate ticket_number and qr_code', async () => {
      const ticketData: ITicket = {
        tenant_id: testTenantId,
        event_id: testEventId,
        ticket_type_id: testTicketTypeId,
        status: 'active',
        price_cents: 5000
      };

      const result = await ticketModel.create(ticketData);

      expect(result.ticket_number).toMatch(/^TKT-/);
      expect(result.qr_code).toMatch(/^QR-/);
    });

    it('should default to active status', async () => {
      const ticketData: ITicket = {
        tenant_id: testTenantId,
        event_id: testEventId,
        ticket_type_id: testTicketTypeId,
        status: 'active',
        price_cents: 5000
      };

      const result = await ticketModel.create(ticketData);

      expect(result.status).toBe('active');
    });

    it('should set created_at timestamp', async () => {
      const ticketData: ITicket = {
        tenant_id: testTenantId,
        event_id: testEventId,
        ticket_type_id: testTicketTypeId,
        status: 'active',
        price_cents: 5000
      };

      const result = await ticketModel.create(ticketData);

      expect(result.created_at).toBeDefined();
    });

    it('should create ticket with seat information', async () => {
      const ticketData: ITicket = {
        tenant_id: testTenantId,
        event_id: testEventId,
        ticket_type_id: testTicketTypeId,
        status: 'active',
        price_cents: 8000,
        seat: 'A-101',
        section: 'A',
        row: '10'
      };

      const result = await ticketModel.create(ticketData);

      expect(result.seat).toBe('A-101');
      expect(result.section).toBe('A');
      expect(result.row).toBe('10');
    });

    it('should create ticket with metadata', async () => {
      const metadata = { tier: 'VIP', benefits: ['lounge_access', 'parking'] };
      const ticketData: ITicket = {
        tenant_id: testTenantId,
        event_id: testEventId,
        ticket_type_id: testTicketTypeId,
        status: 'active',
        price_cents: 15000,
        metadata
      };

      const result = await ticketModel.create(ticketData);

      expect(result.metadata).toBeDefined();
      expect(result.metadata.tier).toBe('VIP');
    });

    it('should handle zero price tickets', async () => {
      const ticketData: ITicket = {
        tenant_id: testTenantId,
        event_id: testEventId,
        ticket_type_id: testTicketTypeId,
        status: 'active',
        price_cents: 0
      };

      const result = await ticketModel.create(ticketData);

      expect(result.price_cents).toBe(0);
    });

    it('should set default boolean values', async () => {
      const ticketData: ITicket = {
        tenant_id: testTenantId,
        event_id: testEventId,
        ticket_type_id: testTicketTypeId,
        status: 'active'
      };

      const result = await ticketModel.create(ticketData);

      expect(result.is_validated).toBe(false);
      expect(result.is_transferable).toBe(true);
      expect(result.transfer_count).toBe(0);
      expect(result.is_nft).toBe(false);
    });
  });

  describe('ticket statuses', () => {
    it('should create ticket with active status', async () => {
      const ticket = await ticketModel.create({
        tenant_id: testTenantId,
        event_id: testEventId,
        ticket_type_id: testTicketTypeId,
        user_id: testUserId,
        status: 'active'
      });

      expect(ticket.status).toBe('active');
    });

    it('should create ticket with used status', async () => {
      const ticket = await ticketModel.create({
        tenant_id: testTenantId,
        event_id: testEventId,
        ticket_type_id: testTicketTypeId,
        user_id: testUserId,
        status: 'used'
      });

      expect(ticket.status).toBe('used');
    });

    it('should create ticket with cancelled status', async () => {
      const ticket = await ticketModel.create({
        tenant_id: testTenantId,
        event_id: testEventId,
        ticket_type_id: testTicketTypeId,
        status: 'cancelled'
      });

      expect(ticket.status).toBe('cancelled');
    });

    it('should create ticket with transferred status', async () => {
      const ticket = await ticketModel.create({
        tenant_id: testTenantId,
        event_id: testEventId,
        ticket_type_id: testTicketTypeId,
        user_id: testUserId,
        status: 'transferred'
      });

      expect(ticket.status).toBe('transferred');
    });
  });

  describe('findById', () => {
    let testTicket: ITicket;

    beforeEach(async () => {
      testTicket = await ticketModel.create({
        tenant_id: testTenantId,
        event_id: testEventId,
        ticket_type_id: testTicketTypeId,
        user_id: testUserId,
        status: 'active',
        price_cents: 5000
      });
    });

    it('should find ticket by ID', async () => {
      const result = await ticketModel.findById(testTicket.id!);

      expect(result).toBeDefined();
      expect(result?.id).toBe(testTicket.id);
      expect(result?.event_id).toBe(testEventId);
    });

    it('should return null for non-existent ID', async () => {
      const result = await ticketModel.findById(uuidv4());

      expect(result).toBeNull();
    });

    it('should return all ticket fields', async () => {
      const result = await ticketModel.findById(testTicket.id!);

      expect(result).toHaveProperty('id');
      expect(result).toHaveProperty('tenant_id');
      expect(result).toHaveProperty('event_id');
      expect(result).toHaveProperty('ticket_type_id');
      expect(result).toHaveProperty('ticket_number');
      expect(result).toHaveProperty('qr_code');
      expect(result).toHaveProperty('status');
      expect(result).toHaveProperty('created_at');
    });

    it('should not find soft-deleted ticket', async () => {
      await ticketModel.delete(testTicket.id!);
      const result = await ticketModel.findById(testTicket.id!);

      expect(result).toBeNull();
    });
  });

  describe('findByEventId', () => {
    beforeEach(async () => {
      await ticketModel.create({
        tenant_id: testTenantId,
        event_id: testEventId,
        ticket_type_id: testTicketTypeId,
        status: 'active',
        price_cents: 5000
      });

      await new Promise(resolve => setTimeout(resolve, 100));

      await ticketModel.create({
        tenant_id: testTenantId,
        event_id: testEventId,
        ticket_type_id: testTicketTypeId,
        status: 'used',
        price_cents: 5000,
        user_id: testUserId
      });
    });

    it('should find all tickets for event', async () => {
      const result = await ticketModel.findByEventId(testEventId);

      expect(result.length).toBe(2);
    });

    it('should order by created_at DESC', async () => {
      const result = await ticketModel.findByEventId(testEventId);

      expect(result[0].status).toBe('used');
      expect(result[1].status).toBe('active');
    });

    it('should return empty array for event with no tickets', async () => {
      const result = await ticketModel.findByEventId(uuidv4());

      expect(result).toEqual([]);
    });
  });

  describe('findByUserId', () => {
    beforeEach(async () => {
      await ticketModel.create({
        tenant_id: testTenantId,
        event_id: testEventId,
        ticket_type_id: testTicketTypeId,
        user_id: testUserId,
        status: 'active',
        price_cents: 5000
      });

      await ticketModel.create({
        tenant_id: testTenantId,
        event_id: testEventId,
        ticket_type_id: testTicketTypeId,
        user_id: testUserId,
        status: 'active',
        price_cents: 6000
      });
    });

    it('should find tickets by user ID', async () => {
      const tickets = await ticketModel.findByUserId(testUserId);

      expect(tickets).toHaveLength(2);
      tickets.forEach(ticket => {
        expect(ticket.user_id).toBe(testUserId);
      });
    });

    it('should return empty array for user with no tickets', async () => {
      const tickets = await ticketModel.findByUserId(uuidv4());

      expect(tickets).toEqual([]);
    });
  });

  describe('findByTicketNumber', () => {
    it('should find ticket by ticket number', async () => {
      const ticket = await ticketModel.create({
        tenant_id: testTenantId,
        event_id: testEventId,
        ticket_type_id: testTicketTypeId,
        status: 'active',
        price_cents: 5000
      });

      const found = await ticketModel.findByTicketNumber(ticket.ticket_number!);

      expect(found).toBeDefined();
      expect(found?.id).toBe(ticket.id);
    });

    it('should return null for non-existent ticket number', async () => {
      const found = await ticketModel.findByTicketNumber('NON-EXISTENT');

      expect(found).toBeNull();
    });
  });

  describe('update', () => {
    let testTicket: ITicket;

    beforeEach(async () => {
      testTicket = await ticketModel.create({
        tenant_id: testTenantId,
        event_id: testEventId,
        ticket_type_id: testTicketTypeId,
        status: 'active',
        price_cents: 5000
      });
    });

    it('should update ticket status', async () => {
      const result = await ticketModel.update(testTicket.id!, {
        status: 'used'
      });

      expect(result?.status).toBe('used');
    });

    it('should update to cancelled status', async () => {
      const result = await ticketModel.update(testTicket.id!, {
        status: 'cancelled'
      });

      expect(result?.status).toBe('cancelled');
    });

    it('should update to transferred status', async () => {
      const result = await ticketModel.update(testTicket.id!, {
        status: 'transferred'
      });

      expect(result?.status).toBe('transferred');
    });

    it('should update user_id', async () => {
      const newUserId = uuidv4();
      await DatabaseService.query(
        `INSERT INTO users (id, email, password_hash, email_verified, status, role, tenant_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT (id) DO NOTHING`,
        [newUserId, `test-${newUserId}@example.com`, '$2b$10$dummyhash', true, 'ACTIVE', 'user', testTenantId]
      );

      const result = await ticketModel.update(testTicket.id!, {
        user_id: newUserId
      });

      expect(result?.user_id).toBe(newUserId);
    });

    it('should update price_cents', async () => {
      const result = await ticketModel.update(testTicket.id!, {
        price_cents: 7500
      });

      expect(result?.price_cents).toBe(7500);
    });

    it('should update seat', async () => {
      const result = await ticketModel.update(testTicket.id!, {
        seat: 'B-205'
      });

      expect(result?.seat).toBe('B-205');
    });

    it('should update section', async () => {
      const result = await ticketModel.update(testTicket.id!, {
        section: 'VIP'
      });

      expect(result?.section).toBe('VIP');
    });

    it('should update row', async () => {
      const result = await ticketModel.update(testTicket.id!, {
        row: '5'
      });

      expect(result?.row).toBe('5');
    });

    it('should update metadata', async () => {
      const newMetadata = { updated: true, notes: 'VIP upgrade' };
      const result = await ticketModel.update(testTicket.id!, {
        metadata: newMetadata
      });

      expect(result?.metadata).toEqual(newMetadata);
    });

    it('should update multiple fields', async () => {
      const result = await ticketModel.update(testTicket.id!, {
        status: 'used',
        user_id: testUserId,
        price_cents: 6000
      });

      expect(result?.status).toBe('used');
      expect(result?.user_id).toBe(testUserId);
      expect(result?.price_cents).toBe(6000);
    });

    it('should update is_validated', async () => {
      const result = await ticketModel.update(testTicket.id!, {
        is_validated: true
      });

      expect(result?.is_validated).toBe(true);
    });

    it('should update is_transferable', async () => {
      const result = await ticketModel.update(testTicket.id!, {
        is_transferable: false
      });

      expect(result?.is_transferable).toBe(false);
    });

    it('should update transfer_count', async () => {
      const result = await ticketModel.update(testTicket.id!, {
        transfer_count: 2
      });

      expect(result?.transfer_count).toBe(2);
    });

    it('should set updated_at timestamp', async () => {
      const result = await ticketModel.update(testTicket.id!, {
        status: 'used'
      });

      expect(result?.updated_at).toBeDefined();
    });

    it('should return null for non-existent ID', async () => {
      const result = await ticketModel.update(uuidv4(), {
        status: 'used'
      });

      expect(result).toBeNull();
    });

    it('should reject invalid fields', async () => {
      await expect(
        ticketModel.update(testTicket.id!, {
          id: uuidv4() as any
        })
      ).rejects.toThrow('No valid fields to update');
    });

    it('should handle empty update object', async () => {
      await expect(
        ticketModel.update(testTicket.id!, {})
      ).rejects.toThrow('No valid fields to update');
    });
  });

  describe('delete', () => {
    let testTicket: ITicket;

    beforeEach(async () => {
      testTicket = await ticketModel.create({
        tenant_id: testTenantId,
        event_id: testEventId,
        ticket_type_id: testTicketTypeId,
        status: 'active',
        price_cents: 5000
      });
    });

    it('should soft delete ticket', async () => {
      const result = await ticketModel.delete(testTicket.id!);

      expect(result).toBe(true);

      const found = await ticketModel.findById(testTicket.id!);
      expect(found).toBeNull();
    });

    it('should return false for non-existent ID', async () => {
      const result = await ticketModel.delete(uuidv4());

      expect(result).toBe(false);
    });

    it('should remove ticket from findByEventId results', async () => {
      await ticketModel.delete(testTicket.id!);

      const tickets = await ticketModel.findByEventId(testEventId);
      expect(tickets).toHaveLength(0);
    });
  });

  describe('hardDelete', () => {
    let testTicket: ITicket;

    beforeEach(async () => {
      testTicket = await ticketModel.create({
        tenant_id: testTenantId,
        event_id: testEventId,
        ticket_type_id: testTicketTypeId,
        status: 'active',
        price_cents: 5000
      });
    });

    it('should permanently delete ticket', async () => {
      const result = await ticketModel.hardDelete(testTicket.id!);

      expect(result).toBe(true);

      // Verify it's completely gone
      const directQuery = await DatabaseService.query(
        'SELECT * FROM tickets WHERE id = $1',
        [testTicket.id]
      );
      expect(directQuery.rows).toHaveLength(0);
    });

    it('should return false for non-existent ID', async () => {
      const result = await ticketModel.hardDelete(uuidv4());

      expect(result).toBe(false);
    });
  });

  describe('Status workflows', () => {
    it('should transition from active to used', async () => {
      const ticket = await ticketModel.create({
        tenant_id: testTenantId,
        event_id: testEventId,
        ticket_type_id: testTicketTypeId,
        user_id: testUserId,
        status: 'active'
      });

      const updated = await ticketModel.update(ticket.id!, {
        status: 'used'
      });

      expect(updated?.status).toBe('used');
    });

    it('should transition to cancelled', async () => {
      const ticket = await ticketModel.create({
        tenant_id: testTenantId,
        event_id: testEventId,
        ticket_type_id: testTicketTypeId,
        user_id: testUserId,
        status: 'active'
      });

      const updated = await ticketModel.update(ticket.id!, {
        status: 'cancelled'
      });

      expect(updated?.status).toBe('cancelled');
    });

    it('should handle ticket transfer', async () => {
      const newOwner = uuidv4();
      await DatabaseService.query(
        `INSERT INTO users (id, email, password_hash, email_verified, status, role, tenant_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT (id) DO NOTHING`,
        [newOwner, `test-${newOwner}@example.com`, '$2b$10$dummyhash', true, 'ACTIVE', 'user', testTenantId]
      );

      const ticket = await ticketModel.create({
        tenant_id: testTenantId,
        event_id: testEventId,
        ticket_type_id: testTicketTypeId,
        user_id: testUserId,
        status: 'active'
      });

      const updated = await ticketModel.update(ticket.id!, {
        user_id: newOwner,
        status: 'transferred',
        transfer_count: 1
      });

      expect(updated?.user_id).toBe(newOwner);
      expect(updated?.status).toBe('transferred');
      expect(updated?.transfer_count).toBe(1);
    });
  });

  describe('Seat assignments', () => {
    it('should create general admission ticket without seat', async () => {
      const ticket = await ticketModel.create({
        tenant_id: testTenantId,
        event_id: testEventId,
        ticket_type_id: testTicketTypeId,
        status: 'active'
      });

      expect(ticket.seat).toBeNull();
      expect(ticket.section).toBeNull();
      expect(ticket.row).toBeNull();
    });

    it('should create assigned seating ticket', async () => {
      const ticket = await ticketModel.create({
        tenant_id: testTenantId,
        event_id: testEventId,
        ticket_type_id: testTicketTypeId,
        status: 'active',
        seat: 'A-101',
        section: 'Orchestra',
        row: '10'
      });

      expect(ticket.seat).toBe('A-101');
      expect(ticket.section).toBe('Orchestra');
      expect(ticket.row).toBe('10');
    });

    it('should update seat assignment', async () => {
      const ticket = await ticketModel.create({
        tenant_id: testTenantId,
        event_id: testEventId,
        ticket_type_id: testTicketTypeId,
        status: 'active'
      });

      const updated = await ticketModel.update(ticket.id!, {
        seat: 'B-205',
        section: 'Balcony',
        row: '5'
      });

      expect(updated?.seat).toBe('B-205');
      expect(updated?.section).toBe('Balcony');
      expect(updated?.row).toBe('5');
    });
  });

  describe('Edge cases', () => {
    it('should handle concurrent ticket creation', async () => {
      const tickets = await Promise.all([
        ticketModel.create({
          tenant_id: testTenantId,
          event_id: testEventId,
          ticket_type_id: testTicketTypeId,
          status: 'active'
        }),
        ticketModel.create({
          tenant_id: testTenantId,
          event_id: testEventId,
          ticket_type_id: testTicketTypeId,
          status: 'active'
        })
      ]);

      expect(tickets).toHaveLength(2);
      expect(tickets[0].id).not.toBe(tickets[1].id);
      expect(tickets[0].ticket_number).not.toBe(tickets[1].ticket_number);
    });

    it('should handle complex metadata', async () => {
      const complexMetadata = {
        tier: 'PREMIUM',
        perks: ['lounge', 'parking', 'meet_greet'],
        upgrade_history: [{ date: '2024-01-01', from: 'standard', to: 'premium' }]
      };

      const ticket = await ticketModel.create({
        tenant_id: testTenantId,
        event_id: testEventId,
        ticket_type_id: testTicketTypeId,
        status: 'active',
        metadata: complexMetadata
      });

      expect(ticket.metadata).toBeDefined();
      expect(ticket.metadata.tier).toBe('PREMIUM');
      expect(ticket.metadata.perks).toHaveLength(3);
    });

    it('should handle null user_id', async () => {
      const ticket = await ticketModel.create({
        tenant_id: testTenantId,
        event_id: testEventId,
        ticket_type_id: testTicketTypeId,
        status: 'active'
      });

      expect(ticket.id).toBeDefined();
      expect(ticket.user_id).toBeNull();
    });
  });

  describe('Bulk operations', () => {
    it('should create multiple tickets for same event', async () => {
      const tickets = await Promise.all([
        ticketModel.create({
          tenant_id: testTenantId,
          event_id: testEventId,
          ticket_type_id: testTicketTypeId,
          status: 'active',
          seat: 'A-101'
        }),
        ticketModel.create({
          tenant_id: testTenantId,
          event_id: testEventId,
          ticket_type_id: testTicketTypeId,
          status: 'active',
          seat: 'A-102'
        }),
        ticketModel.create({
          tenant_id: testTenantId,
          event_id: testEventId,
          ticket_type_id: testTicketTypeId,
          status: 'active',
          seat: 'A-103'
        })
      ]);

      expect(tickets).toHaveLength(3);

      const allTickets = await ticketModel.findByEventId(testEventId);
      expect(allTickets).toHaveLength(3);
    });

    it('should handle mixed status tickets', async () => {
      await Promise.all([
        ticketModel.create({
          tenant_id: testTenantId,
          event_id: testEventId,
          ticket_type_id: testTicketTypeId,
          status: 'active'
        }),
        ticketModel.create({
          tenant_id: testTenantId,
          event_id: testEventId,
          ticket_type_id: testTicketTypeId,
          user_id: testUserId,
          status: 'used'
        }),
        ticketModel.create({
          tenant_id: testTenantId,
          event_id: testEventId,
          ticket_type_id: testTicketTypeId,
          status: 'cancelled'
        })
      ]);

      const allTickets = await ticketModel.findByEventId(testEventId);
      expect(allTickets).toHaveLength(3);

      const statuses = allTickets.map(t => t.status);
      expect(statuses).toContain('active');
      expect(statuses).toContain('used');
      expect(statuses).toContain('cancelled');
    });
  });
});
