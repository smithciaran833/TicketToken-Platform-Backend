/**
 * TicketService Integration Tests
 */

import {
  setupTestApp,
  teardownTestApp,
  cleanDatabase,
  TestContext,
  TEST_TENANT_ID,
  TEST_USER_ID,
  TEST_EVENT_ID,
  createTestTicketType,
  createTestTicket,
  createTestReservation,
  db,
  pool
} from './setup';
import { TicketService } from '../../src/services/ticketService';
import { TicketStatus } from '../../src/types';
import { v4 as uuidv4 } from 'uuid';

describe('TicketService', () => {
  let context: TestContext;
  let ticketService: TicketService;

  beforeAll(async () => {
    context = await setupTestApp();
    ticketService = new TicketService();
  });

  afterAll(async () => {
    await teardownTestApp(context);
  });

  beforeEach(async () => {
    await cleanDatabase(db);
  });

  // ==========================================================================
  // createTicketType
  // ==========================================================================
  describe('createTicketType', () => {
    it('should create a ticket type with valid data', async () => {
      const data = {
        tenant_id: TEST_TENANT_ID,
        eventId: TEST_EVENT_ID,
        name: 'VIP Pass',
        description: 'VIP access to all areas',
        priceCents: 10000,
        quantity: 50,
        maxPerPurchase: 4,
        saleStartDate: new Date(),
        saleEndDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        metadata: { perks: ['backstage', 'meet-greet'] }
      };

      const result: any = await ticketService.createTicketType(data);

      expect(result).toBeDefined();
      expect(result.id).toBeDefined();
      expect(result.name).toBe('VIP Pass');
      expect(result.quantity).toBe(50);
      expect(result.available_quantity).toBe(50);
    });

    it('should store price correctly from cents', async () => {
      const data = {
        tenant_id: TEST_TENANT_ID,
        eventId: TEST_EVENT_ID,
        name: 'Standard',
        priceCents: 2500,
        quantity: 100,
        maxPerPurchase: 10,
        saleStartDate: new Date(),
        saleEndDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      };

      const result: any = await ticketService.createTicketType(data);

      // Price stored as dollars in DB (2500 cents = 25.00 dollars)
      expect(parseFloat(result.price)).toBe(25.00);
    });

    it('should set default metadata to empty object', async () => {
      const data = {
        tenant_id: TEST_TENANT_ID,
        eventId: TEST_EVENT_ID,
        name: 'Basic',
        priceCents: 1000,
        quantity: 200,
        maxPerPurchase: 5,
        saleStartDate: new Date(),
        saleEndDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      };

      const result: any = await ticketService.createTicketType(data);

      expect(result.metadata).toEqual({});
    });
  });

  // ==========================================================================
  // getTicketTypes
  // ==========================================================================
  describe('getTicketTypes', () => {
    it('should return all ticket types for an event', async () => {
      await createTestTicketType(db, { name: 'GA', price: 25, quantity: 100 });
      await createTestTicketType(db, { name: 'VIP', price: 100, quantity: 50 });

      const result = await ticketService.getTicketTypes(TEST_EVENT_ID, TEST_TENANT_ID);

      expect(result).toHaveLength(2);
    });

    it('should return ticket types ordered by price ascending', async () => {
      await createTestTicketType(db, { name: 'VIP', price: 100 });
      await createTestTicketType(db, { name: 'GA', price: 25 });
      await createTestTicketType(db, { name: 'Premium', price: 75 });

      const result: any[] = await ticketService.getTicketTypes(TEST_EVENT_ID, TEST_TENANT_ID);

      expect(result[0].name).toBe('GA');
      expect(result[1].name).toBe('Premium');
      expect(result[2].name).toBe('VIP');
    });

    it('should return empty array for event with no ticket types', async () => {
      const result = await ticketService.getTicketTypes(TEST_EVENT_ID, TEST_TENANT_ID);

      expect(result).toEqual([]);
    });

    it('should not return ticket types from other tenants', async () => {
      const otherTenantId = uuidv4();
      
      // Create tenant first
      await pool.query(
        `INSERT INTO tenants (id, name, slug, settings) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING`,
        [otherTenantId, 'Other Tenant', 'other-tenant', '{}']
      );
      
      await createTestTicketType(db, { tenant_id: TEST_TENANT_ID, name: 'Our GA' });

      const result = await ticketService.getTicketTypes(TEST_EVENT_ID, otherTenantId);

      expect(result).toEqual([]);
    });
  });

  // ==========================================================================
  // checkAvailability
  // ==========================================================================
  describe('checkAvailability', () => {
    it('should return true when enough tickets available', async () => {
      const ticketType = await createTestTicketType(db, { quantity: 100, available_quantity: 100 });

      const result = await ticketService.checkAvailability(TEST_EVENT_ID, ticketType.id, 5);

      expect(result).toBe(true);
    });

    it('should return false when not enough tickets available', async () => {
      const ticketType = await createTestTicketType(db, { quantity: 100, available_quantity: 3 });

      const result = await ticketService.checkAvailability(TEST_EVENT_ID, ticketType.id, 5);

      expect(result).toBe(false);
    });

    it('should return true when requesting exact available quantity', async () => {
      const ticketType = await createTestTicketType(db, { quantity: 100, available_quantity: 10 });

      const result = await ticketService.checkAvailability(TEST_EVENT_ID, ticketType.id, 10);

      expect(result).toBe(true);
    });

    it('should throw NotFoundError for non-existent ticket type', async () => {
      const fakeId = uuidv4();

      await expect(
        ticketService.checkAvailability(TEST_EVENT_ID, fakeId, 1)
      ).rejects.toThrow('Ticket type');
    });
  });

  // ==========================================================================
  // getTicket
  // ==========================================================================
  describe('getTicket', () => {
    it('should return ticket by id', async () => {
      const ticketType = await createTestTicketType(db, {});
      const ticket = await createTestTicket(db, { ticket_type_id: ticketType.id });

      const result: any = await ticketService.getTicket(ticket.id);

      expect(result).toBeDefined();
      expect(result.id).toBe(ticket.id);
      expect(result.ticket_number).toBe(ticket.ticket_number);
    });

    it('should include ticket type name in result', async () => {
      const ticketType = await createTestTicketType(db, { name: 'Super VIP' });
      const ticket = await createTestTicket(db, { ticket_type_id: ticketType.id });

      const result: any = await ticketService.getTicket(ticket.id);

      expect(result.ticket_type_name).toBe('Super VIP');
    });

    it('should throw NotFoundError for non-existent ticket', async () => {
      const fakeId = uuidv4();

      await expect(ticketService.getTicket(fakeId)).rejects.toThrow('Ticket');
    });

    it('should enforce tenant isolation when tenantId provided', async () => {
      const ticketType = await createTestTicketType(db, {});
      const ticket = await createTestTicket(db, { ticket_type_id: ticketType.id });
      const otherTenantId = uuidv4();

      await expect(
        ticketService.getTicket(ticket.id, otherTenantId)
      ).rejects.toThrow('Ticket');
    });
  });

  // ==========================================================================
  // getUserTickets
  // ==========================================================================
  describe('getUserTickets', () => {
    it('should return all tickets for a user', async () => {
      const ticketType = await createTestTicketType(db, {});
      await createTestTicket(db, { ticket_type_id: ticketType.id, user_id: TEST_USER_ID });
      await createTestTicket(db, { ticket_type_id: ticketType.id, user_id: TEST_USER_ID });

      const result = await ticketService.getUserTickets(TEST_USER_ID, TEST_TENANT_ID);

      expect(result).toHaveLength(2);
    });

    it('should filter by event when eventId provided', async () => {
      const ticketType = await createTestTicketType(db, {});
      await createTestTicket(db, { ticket_type_id: ticketType.id });

      const result: any[] = await ticketService.getUserTickets(TEST_USER_ID, TEST_TENANT_ID, TEST_EVENT_ID);

      expect(result).toHaveLength(1);
      expect(result[0].event_id).toBe(TEST_EVENT_ID);
    });

    it('should return empty array for user with no tickets', async () => {
      const newUserId = uuidv4();
      
      // Create the user first
      await pool.query(
        `INSERT INTO users (id, email, password_hash, email_verified, status, role, tenant_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT DO NOTHING`,
        [newUserId, `test-${newUserId.slice(0,8)}@example.com`, '$2b$10$hash', true, 'ACTIVE', 'user', TEST_TENANT_ID]
      );

      const result = await ticketService.getUserTickets(newUserId, TEST_TENANT_ID);

      expect(result).toEqual([]);
    });

    it('should order tickets by created_at descending', async () => {
      const ticketType = await createTestTicketType(db, {});
      
      const ticket1 = await createTestTicket(db, { ticket_type_id: ticketType.id });
      // Small delay to ensure different timestamps
      await new Promise(resolve => setTimeout(resolve, 50));
      const ticket2 = await createTestTicket(db, { ticket_type_id: ticketType.id });

      const result: any[] = await ticketService.getUserTickets(TEST_USER_ID, TEST_TENANT_ID);

      expect(result[0].id).toBe(ticket2.id);
      expect(result[1].id).toBe(ticket1.id);
    });
  });

  // ==========================================================================
  // updateTicketStatus
  // ==========================================================================
  describe('updateTicketStatus', () => {
    it('should update ticket status to used', async () => {
      const ticketType = await createTestTicketType(db, {});
      const ticket = await createTestTicket(db, { ticket_type_id: ticketType.id, status: 'active' });

      await ticketService.updateTicketStatus(ticket.id, 'used' as any);

      const updated = await pool.query('SELECT status FROM tickets WHERE id = $1', [ticket.id]);
      expect(updated.rows[0].status).toBe('used');
    });

    it('should update ticket status to cancelled', async () => {
      const ticketType = await createTestTicketType(db, {});
      const ticket = await createTestTicket(db, { ticket_type_id: ticketType.id, status: 'active' });

      await ticketService.updateTicketStatus(ticket.id, 'cancelled' as any);

      const updated = await pool.query('SELECT status FROM tickets WHERE id = $1', [ticket.id]);
      expect(updated.rows[0].status).toBe('cancelled');
    });

    it('should update updated_at timestamp', async () => {
      const ticketType = await createTestTicketType(db, {});
      const ticket = await createTestTicket(db, { ticket_type_id: ticketType.id });
      const originalUpdatedAt = ticket.updated_at;

      await new Promise(resolve => setTimeout(resolve, 50));
      await ticketService.updateTicketStatus(ticket.id, 'used' as any);

      const updated = await pool.query('SELECT updated_at FROM tickets WHERE id = $1', [ticket.id]);
      expect(new Date(updated.rows[0].updated_at).getTime()).toBeGreaterThan(new Date(originalUpdatedAt).getTime());
    });
  });

  // ==========================================================================
  // getTicketType
  // ==========================================================================
  describe('getTicketType', () => {
    it('should return ticket type by id', async () => {
      const ticketType = await createTestTicketType(db, { name: 'Early Bird' });

      const result: any = await ticketService.getTicketType(ticketType.id, TEST_TENANT_ID);

      expect(result).toBeDefined();
      expect(result.name).toBe('Early Bird');
    });

    it('should return null for non-existent ticket type', async () => {
      const fakeId = uuidv4();

      const result = await ticketService.getTicketType(fakeId, TEST_TENANT_ID);

      expect(result).toBeNull();
    });

    it('should enforce tenant isolation', async () => {
      const ticketType = await createTestTicketType(db, {});
      const otherTenantId = uuidv4();

      const result = await ticketService.getTicketType(ticketType.id, otherTenantId);

      expect(result).toBeNull();
    });
  });

  // ==========================================================================
  // updateTicketType
  // ==========================================================================
  describe('updateTicketType', () => {
    it('should update ticket type name', async () => {
      const ticketType = await createTestTicketType(db, { name: 'Old Name' });

      const result: any = await ticketService.updateTicketType(
        ticketType.id,
        { name: 'New Name' },
        TEST_TENANT_ID
      );

      expect(result.name).toBe('New Name');
    });

    it('should update ticket type price from cents', async () => {
      const ticketType = await createTestTicketType(db, { price: 50 });

      const result: any = await ticketService.updateTicketType(
        ticketType.id,
        { priceCents: 7500 },
        TEST_TENANT_ID
      );

      expect(parseFloat(result.price)).toBe(75.00);
    });

    it('should update multiple fields at once', async () => {
      const ticketType = await createTestTicketType(db, { name: 'Old', price: 50 });

      const result: any = await ticketService.updateTicketType(
        ticketType.id,
        { name: 'Updated', priceCents: 9900, description: 'New description' },
        TEST_TENANT_ID
      );

      expect(result.name).toBe('Updated');
      expect(parseFloat(result.price)).toBe(99.00);
      expect(result.description).toBe('New description');
    });

    it('should throw NotFoundError for non-existent ticket type', async () => {
      const fakeId = uuidv4();

      await expect(
        ticketService.updateTicketType(fakeId, { name: 'Test' }, TEST_TENANT_ID)
      ).rejects.toThrow('Ticket type');
    });

    it('should enforce tenant isolation', async () => {
      const ticketType = await createTestTicketType(db, {});
      const otherTenantId = uuidv4();

      await expect(
        ticketService.updateTicketType(ticketType.id, { name: 'Hacked' }, otherTenantId)
      ).rejects.toThrow('Ticket type');
    });
  });

  // ==========================================================================
  // createReservation
  // ==========================================================================
  describe('createReservation', () => {
    it('should create a reservation with valid data', async () => {
      const ticketType = await createTestTicketType(db, { quantity: 100, available_quantity: 100 });

      const purchaseRequest = {
        tenantId: TEST_TENANT_ID,
        userId: TEST_USER_ID,
        eventId: TEST_EVENT_ID,
        tickets: [{ ticketTypeId: ticketType.id, quantity: 2 }]
      };

      const result: any = await ticketService.createReservation(purchaseRequest);

      expect(result).toBeDefined();
      expect(result.id).toBeDefined();
      expect(result.status).toBe('pending');
      expect(result.total_quantity).toBe(2);
    });

    it('should decrement available_quantity on ticket type', async () => {
      const ticketType = await createTestTicketType(db, { quantity: 100, available_quantity: 100 });

      const purchaseRequest = {
        tenantId: TEST_TENANT_ID,
        userId: TEST_USER_ID,
        eventId: TEST_EVENT_ID,
        tickets: [{ ticketTypeId: ticketType.id, quantity: 5 }]
      };

      await ticketService.createReservation(purchaseRequest);

      const updated = await pool.query('SELECT available_quantity FROM ticket_types WHERE id = $1', [ticketType.id]);
      expect(updated.rows[0].available_quantity).toBe(95);
    });

    it('should set expiration time on reservation', async () => {
      const ticketType = await createTestTicketType(db, { quantity: 100, available_quantity: 100 });

      const purchaseRequest = {
        tenantId: TEST_TENANT_ID,
        userId: TEST_USER_ID,
        eventId: TEST_EVENT_ID,
        tickets: [{ ticketTypeId: ticketType.id, quantity: 1 }]
      };

      const result: any = await ticketService.createReservation(purchaseRequest);

      expect(result.expires_at).toBeDefined();
      expect(new Date(result.expires_at).getTime()).toBeGreaterThan(Date.now());
    });

    it('should throw ConflictError when not enough tickets available', async () => {
      const ticketType = await createTestTicketType(db, { quantity: 100, available_quantity: 2 });

      const purchaseRequest = {
        tenantId: TEST_TENANT_ID,
        userId: TEST_USER_ID,
        eventId: TEST_EVENT_ID,
        tickets: [{ ticketTypeId: ticketType.id, quantity: 5 }]
      };

      await expect(ticketService.createReservation(purchaseRequest)).rejects.toThrow('Not enough tickets');
    });

    it('should throw NotFoundError for non-existent ticket type', async () => {
      const fakeId = uuidv4();

      const purchaseRequest = {
        tenantId: TEST_TENANT_ID,
        userId: TEST_USER_ID,
        eventId: TEST_EVENT_ID,
        tickets: [{ ticketTypeId: fakeId, quantity: 1 }]
      };

      await expect(ticketService.createReservation(purchaseRequest)).rejects.toThrow('Ticket type');
    });
  });

  // ==========================================================================
  // confirmPurchase
  // ==========================================================================
  describe('confirmPurchase', () => {
    it('should confirm reservation and create tickets', async () => {
      const ticketType = await createTestTicketType(db, { quantity: 100, available_quantity: 100 });
      const reservation = await createTestReservation(db, {
        ticket_type_id: ticketType.id,
        quantity: 2,
        status: 'pending'
      });

      const paymentId = `pi_${uuidv4().replace(/-/g, '')}`;
      const tickets: any[] = await ticketService.confirmPurchase(reservation.id, paymentId);

      expect(tickets).toHaveLength(2);
      expect(tickets[0].status).toBe('active');
      expect(tickets[0].payment_id).toBe(paymentId);
    });

    it('should update reservation status to confirmed', async () => {
      const ticketType = await createTestTicketType(db, { quantity: 100, available_quantity: 100 });
      const reservation = await createTestReservation(db, {
        ticket_type_id: ticketType.id,
        quantity: 1,
        status: 'pending'
      });

      await ticketService.confirmPurchase(reservation.id, 'pi_test123');

      const updated = await pool.query('SELECT status FROM reservations WHERE id = $1', [reservation.id]);
      expect(updated.rows[0].status).toBe('confirmed');
    });

    it('should throw NotFoundError for non-existent reservation', async () => {
      const fakeId = uuidv4();

      await expect(
        ticketService.confirmPurchase(fakeId, 'pi_test')
      ).rejects.toThrow('Reservation');
    });

    it('should throw ConflictError for already confirmed reservation', async () => {
      const ticketType = await createTestTicketType(db, { quantity: 100, available_quantity: 100 });
      const reservation = await createTestReservation(db, {
        ticket_type_id: ticketType.id,
        quantity: 1,
        status: 'confirmed'
      });

      await expect(
        ticketService.confirmPurchase(reservation.id, 'pi_test')
      ).rejects.toThrow('no longer active');
    });

    it('should generate unique ticket numbers for each ticket', async () => {
      const ticketType = await createTestTicketType(db, { quantity: 100, available_quantity: 100 });
      const reservation = await createTestReservation(db, {
        ticket_type_id: ticketType.id,
        quantity: 3,
        status: 'pending'
      });

      const tickets: any[] = await ticketService.confirmPurchase(reservation.id, 'pi_test');

      const ticketNumbers = tickets.map(t => t.ticket_number);
      const uniqueNumbers = new Set(ticketNumbers);
      expect(uniqueNumbers.size).toBe(3);
    });
  });

  // ==========================================================================
  // releaseReservation
  // ==========================================================================
  describe('releaseReservation', () => {
    it('should release reservation and restore availability', async () => {
      const ticketType = await createTestTicketType(db, { quantity: 100, available_quantity: 95 });
      const reservation = await createTestReservation(db, {
        ticket_type_id: ticketType.id,
        quantity: 5,
        status: 'pending'
      });

      await ticketService.releaseReservation(reservation.id, TEST_USER_ID);

      const updated = await pool.query('SELECT available_quantity FROM ticket_types WHERE id = $1', [ticketType.id]);
      expect(updated.rows[0].available_quantity).toBe(100);
    });

    it('should update reservation status to cancelled', async () => {
      const ticketType = await createTestTicketType(db, { quantity: 100, available_quantity: 100 });
      const reservation = await createTestReservation(db, {
        ticket_type_id: ticketType.id,
        quantity: 2,
        status: 'pending'
      });

      await ticketService.releaseReservation(reservation.id, TEST_USER_ID);

      const updated = await pool.query('SELECT status FROM reservations WHERE id = $1', [reservation.id]);
      expect(updated.rows[0].status).toBe('cancelled');
    });

    it('should throw NotFoundError for non-existent reservation', async () => {
      const fakeId = uuidv4();

      await expect(
        ticketService.releaseReservation(fakeId, TEST_USER_ID)
      ).rejects.toThrow('Reservation not found');
    });

    it('should throw NotFoundError if user does not own reservation', async () => {
      const ticketType = await createTestTicketType(db, { quantity: 100, available_quantity: 100 });
      const reservation = await createTestReservation(db, {
        ticket_type_id: ticketType.id,
        quantity: 1,
        status: 'pending'
      });

      const otherUserId = uuidv4();

      await expect(
        ticketService.releaseReservation(reservation.id, otherUserId)
      ).rejects.toThrow('Reservation not found');
    });

    it('should throw NotFoundError for already processed reservation', async () => {
      const ticketType = await createTestTicketType(db, { quantity: 100, available_quantity: 100 });
      const reservation = await createTestReservation(db, {
        ticket_type_id: ticketType.id,
        quantity: 1,
        status: 'confirmed'
      });

      await expect(
        ticketService.releaseReservation(reservation.id, TEST_USER_ID)
      ).rejects.toThrow('Reservation not found');
    });
  });

  // ==========================================================================
  // generateQR
  // ==========================================================================
  describe('generateQR', () => {
    beforeAll(() => {
      // Set encryption key for QR tests (32 bytes for AES-256)
      process.env.QR_ENCRYPTION_KEY = '12345678901234567890123456789012';
    });

    it('should generate QR code data for valid ticket', async () => {
      const ticketType = await createTestTicketType(db, {});
      const ticket = await createTestTicket(db, { ticket_type_id: ticketType.id });

      const result = await ticketService.generateQR(ticket.id);

      expect(result).toBeDefined();
      expect(result.qrCode).toBeDefined();
      expect(result.qrImage).toBeDefined();
      expect(result.ticketId).toBe(ticket.id);
    });

    it('should generate base64 QR image', async () => {
      const ticketType = await createTestTicketType(db, {});
      const ticket = await createTestTicket(db, { ticket_type_id: ticketType.id });

      const result = await ticketService.generateQR(ticket.id);

      expect(result.qrImage).toMatch(/^data:image\/png;base64,/);
    });

    it('should throw NotFoundError for non-existent ticket', async () => {
      const fakeId = uuidv4();

      await expect(ticketService.generateQR(fakeId)).rejects.toThrow('Ticket');
    });
  });

  // ==========================================================================
  // validateQR
  // ==========================================================================
  describe('validateQR', () => {
    beforeAll(() => {
      process.env.QR_ENCRYPTION_KEY = '12345678901234567890123456789012';
    });

    it('should validate QR code for active ticket', async () => {
      const ticketType = await createTestTicketType(db, {});
      const ticket = await createTestTicket(db, { ticket_type_id: ticketType.id, status: 'active' });

      const qrData = await ticketService.generateQR(ticket.id);
      const result = await ticketService.validateQR(qrData.qrCode);

      expect(result.valid).toBe(true);
      expect(result.data.ticketId).toBe(ticket.id);
    });

    it('should return invalid for used ticket', async () => {
      const ticketType = await createTestTicketType(db, {});
      const ticket = await createTestTicket(db, { ticket_type_id: ticketType.id, status: 'used' });

      const qrData = await ticketService.generateQR(ticket.id);
      const result = await ticketService.validateQR(qrData.qrCode);

      expect(result.valid).toBe(false);
    });

    it('should return invalid for malformed QR data', async () => {
      const result = await ticketService.validateQR('invalid-qr-data');

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Invalid QR code');
    });

    it('should handle base64 encoded QR format', async () => {
      const ticketType = await createTestTicketType(db, {});
      const ticket = await createTestTicket(db, { ticket_type_id: ticketType.id, status: 'active' });

      const payload = {
        ticket_id: ticket.id,
        event_id: TEST_EVENT_ID,
        user_id: TEST_USER_ID
      };
      const base64Data = Buffer.from(JSON.stringify(payload)).toString('base64');

      const result = await ticketService.validateQR(base64Data);

      expect(result.valid).toBe(true);
    });
  });
});
