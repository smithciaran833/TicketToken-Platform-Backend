import { ticketController } from '../../src/controllers/ticketController';
import { DatabaseService } from '../../src/services/databaseService';
import { RedisService } from '../../src/services/redisService';
import { cache } from '../../src/services/cache-integration';
import { v4 as uuidv4 } from 'uuid';

describe('TicketController Integration Tests', () => {
  let testTenantId: string;
  let testUserId: string;
  let testAdminId: string;
  let testEventId: string;
  let testVenueId: string;
  let testTicketTypeId: string;
  let testTicketId: string;

  beforeAll(async () => {
    await DatabaseService.initialize();
    await RedisService.initialize();
  });

  beforeEach(async () => {
    testTenantId = uuidv4();
    testUserId = uuidv4();
    testAdminId = uuidv4();
    testEventId = uuidv4();
    testVenueId = uuidv4();
    testTicketTypeId = uuidv4();
    testTicketId = uuidv4();

    // Create test tenant
    await DatabaseService.query(
      `INSERT INTO tenants (id, name, slug, status)
       VALUES ($1, 'Test Tenant', $2, 'active')
       ON CONFLICT (id) DO NOTHING`,
      [testTenantId, `test-tenant-${testTenantId.slice(0, 8)}`]
    );

    // Create test user
    await DatabaseService.query(
      `INSERT INTO users (id, email, password_hash, status)
       VALUES ($1, $2, 'hashedpassword123', 'ACTIVE')`,
      [testUserId, `user-${testUserId.slice(0, 8)}@test.com`]
    );

    // Create test admin
    await DatabaseService.query(
      `INSERT INTO users (id, email, password_hash, status, role)
       VALUES ($1, $2, 'hashedpassword123', 'ACTIVE', 'admin')`,
      [testAdminId, `admin-${testAdminId.slice(0, 8)}@test.com`]
    );

    // Create test venue
    await DatabaseService.query(
      `INSERT INTO venues (id, name, slug, email, address_line1, city, state_province, country_code, venue_type, max_capacity)
       VALUES ($1, 'Test Venue', $2, 'venue@test.com', '123 Test St', 'Test City', 'TS', 'US', 'arena', 1000)`,
      [testVenueId, `test-venue-${testVenueId.slice(0, 8)}`]
    );

    // Create test event
    await DatabaseService.query(
      `INSERT INTO events (id, tenant_id, name, slug, venue_id, status, start_date)
       VALUES ($1, $2, 'Test Event', $3, $4, 'PUBLISHED', NOW() + INTERVAL '1 month')`,
      [testEventId, testTenantId, `test-event-${testEventId.slice(0, 8)}`, testVenueId]
    );

    // Create test ticket type
    await DatabaseService.query(
      `INSERT INTO ticket_types (id, tenant_id, event_id, name, price, quantity, available_quantity, sale_start, sale_end)
       VALUES ($1, $2, $3, 'General Admission', 50.00, 100, 100, NOW(), NOW() + INTERVAL '1 month')`,
      [testTicketTypeId, testTenantId, testEventId]
    );
  });

  afterEach(async () => {
    await DatabaseService.query('DELETE FROM tickets WHERE event_id = $1', [testEventId]);
    await DatabaseService.query('DELETE FROM reservations WHERE event_id = $1', [testEventId]);
    await DatabaseService.query('DELETE FROM ticket_types WHERE event_id = $1', [testEventId]);
    await DatabaseService.query('DELETE FROM events WHERE id = $1', [testEventId]);
    await DatabaseService.query('DELETE FROM venues WHERE id = $1', [testVenueId]);
    await DatabaseService.query('DELETE FROM users WHERE id = $1', [testUserId]);
    await DatabaseService.query('DELETE FROM users WHERE id = $1', [testAdminId]);
    await DatabaseService.query('DELETE FROM tenants WHERE id = $1', [testTenantId]);
    await cache.flush();
  });

  afterAll(async () => {
    await DatabaseService.close();
    await RedisService.close();
  });

  describe('getTicketTypes', () => {
    it('should return ticket types for an event', async () => {
      const request = {
        params: { eventId: testEventId },
        tenantId: testTenantId
      } as any;

      const reply = {
        header: jest.fn(),
        send: jest.fn()
      } as any;

      await ticketController.getTicketTypes(request, reply);

      expect(reply.send).toHaveBeenCalledWith({
        success: true,
        data: expect.arrayContaining([
          expect.objectContaining({
            name: 'General Admission'
          })
        ])
      });
    });

    it('should enforce tenant isolation', async () => {
      const wrongTenantId = uuidv4();
      const request = {
        params: { eventId: testEventId },
        tenantId: wrongTenantId
      } as any;

      const reply = {
        header: jest.fn(),
        send: jest.fn()
      } as any;

      await ticketController.getTicketTypes(request, reply);

      expect(reply.send).toHaveBeenCalledWith({
        success: true,
        data: []
      });
    });
  });

  describe('createReservation', () => {
    it('should reject unauthenticated requests', async () => {
      const request = {
        user: null,
        tenantId: testTenantId,
        body: {
          eventId: testEventId,
          ticketTypeId: testTicketTypeId,
          quantity: 2
        }
      } as any;

      const reply = {
        status: jest.fn().mockReturnThis(),
        send: jest.fn()
      } as any;

      await ticketController.createReservation(request, reply);

      expect(reply.status).toHaveBeenCalledWith(401);
      expect(reply.send).toHaveBeenCalledWith({
        error: 'User not authenticated'
      });
    });
  });

  describe('getUserTickets', () => {
    beforeEach(async () => {
      await DatabaseService.query(
        `INSERT INTO tickets (id, tenant_id, event_id, user_id, ticket_type_id, ticket_number, qr_code, status, price_cents)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'active', 5000)`,
        [testTicketId, testTenantId, testEventId, testUserId, testTicketTypeId, `TKT-${testTicketId.slice(0, 8)}`, `QR-${testTicketId}`]
      );
    });

    it('should prevent users from viewing other users tickets', async () => {
      const otherUserId = uuidv4();
      const request = {
        params: { userId: otherUserId },
        tenantId: testTenantId,
        user: { id: testUserId, role: 'customer' }
      } as any;

      const reply = {
        status: jest.fn().mockReturnThis(),
        send: jest.fn()
      } as any;

      await ticketController.getUserTickets(request, reply);

      expect(reply.status).toHaveBeenCalledWith(403);
      expect(reply.send).toHaveBeenCalledWith({
        error: 'FORBIDDEN',
        message: 'You can only view your own tickets'
      });
    });
  });

  describe('getTicketById', () => {
    beforeEach(async () => {
      await DatabaseService.query(
        `INSERT INTO tickets (id, tenant_id, event_id, user_id, ticket_type_id, ticket_number, qr_code, status, price_cents)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'active', 5000)`,
        [testTicketId, testTenantId, testEventId, testUserId, testTicketTypeId, `TKT-${testTicketId.slice(0, 8)}`, `QR-${testTicketId}`]
      );
    });

    it('should throw NotFoundError for non-existent ticket', async () => {
      const fakeTicketId = uuidv4();
      const request = {
        params: { ticketId: fakeTicketId },
        tenantId: testTenantId,
        user: { id: testUserId, role: 'customer' }
      } as any;

      const reply = {
        status: jest.fn().mockReturnThis(),
        send: jest.fn()
      } as any;

      // Service throws NotFoundError for non-existent tickets
      await expect(ticketController.getTicketById(request, reply)).rejects.toThrow('Ticket not found');
    });

    it('should prevent non-owner from viewing ticket', async () => {
      const otherUserId = uuidv4();
      const request = {
        params: { ticketId: testTicketId },
        tenantId: testTenantId,
        user: { id: otherUserId, role: 'customer' }
      } as any;

      const reply = {
        status: jest.fn().mockReturnThis(),
        send: jest.fn()
      } as any;

      await ticketController.getTicketById(request, reply);

      expect(reply.status).toHaveBeenCalledWith(403);
      expect(reply.send).toHaveBeenCalledWith({
        error: 'FORBIDDEN',
        message: 'You do not own this ticket'
      });
    });
  });

  describe('getTicketType', () => {
    it('should return 404 for non-existent ticket type', async () => {
      const fakeId = uuidv4();
      const request = {
        params: { id: fakeId },
        tenantId: testTenantId
      } as any;

      const reply = {
        status: jest.fn().mockReturnThis(),
        send: jest.fn()
      } as any;

      await ticketController.getTicketType(request, reply);

      expect(reply.status).toHaveBeenCalledWith(404);
      expect(reply.send).toHaveBeenCalledWith({
        error: 'Ticket type not found'
      });
    });

    it('should enforce tenant isolation', async () => {
      const wrongTenantId = uuidv4();
      const request = {
        params: { id: testTicketTypeId },
        tenantId: wrongTenantId
      } as any;

      const reply = {
        status: jest.fn().mockReturnThis(),
        send: jest.fn()
      } as any;

      await ticketController.getTicketType(request, reply);

      expect(reply.status).toHaveBeenCalledWith(404);
    });
  });

  describe('security', () => {
    beforeEach(async () => {
      await DatabaseService.query(
        `INSERT INTO tickets (id, tenant_id, event_id, user_id, ticket_type_id, ticket_number, qr_code, status, price_cents)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'active', 5000)`,
        [testTicketId, testTenantId, testEventId, testUserId, testTicketTypeId, `TKT-${testTicketId.slice(0, 8)}`, `QR-${testTicketId}`]
      );
    });

    it('should throw NotFoundError for cross-tenant ticket access', async () => {
      const wrongTenantId = uuidv4();
      const request = {
        params: { ticketId: testTicketId },
        tenantId: wrongTenantId,
        user: { id: testUserId, role: 'customer' }
      } as any;

      const reply = {
        status: jest.fn().mockReturnThis(),
        send: jest.fn()
      } as any;

      // Service throws NotFoundError when ticket not found for tenant
      await expect(ticketController.getTicketById(request, reply)).rejects.toThrow('Ticket not found');
    });

    it('should validate ownership before operations', async () => {
      const hackerId = uuidv4();
      const request = {
        params: { ticketId: testTicketId },
        tenantId: testTenantId,
        user: { id: hackerId, role: 'customer' }
      } as any;

      const reply = {
        status: jest.fn().mockReturnThis(),
        send: jest.fn()
      } as any;

      await ticketController.getTicketById(request, reply);

      expect(reply.status).toHaveBeenCalledWith(403);
    });
  });
});
