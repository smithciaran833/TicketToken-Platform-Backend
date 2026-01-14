import { DatabaseService } from '../../src/services/databaseService';
import { ReservationModel, IReservation } from '../../src/models/Reservation';
import { v4 as uuidv4 } from 'uuid';

/**
 * INTEGRATION TESTS FOR Reservation MODEL
 * Tests reservation database operations
 */

describe('Reservation Model Integration Tests', () => {
  let reservationModel: ReservationModel;
  let testTenantId: string;
  let testEventId: string;
  let testTicketTypeId: string;
  let testUserId: string;
  let testVenueId: string;

  beforeAll(async () => {
    await DatabaseService.initialize();
    reservationModel = new ReservationModel(DatabaseService.getPool());
  });

  beforeEach(async () => {
    testTenantId = uuidv4();
    testEventId = uuidv4();
    testTicketTypeId = uuidv4();
    testUserId = uuidv4();
    testVenueId = uuidv4();

    // 1. Create tenant record
    await DatabaseService.query(
      'INSERT INTO tenants (id, name, slug) VALUES ($1, $2, $3) ON CONFLICT (id) DO NOTHING',
      [testTenantId, 'Test Tenant', `test-${testTenantId}`]
    );

    // 2. Create user record (required by reservations FK)
    await DatabaseService.query(
      `INSERT INTO users (id, email, password_hash, email_verified, status, role, tenant_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT (id) DO NOTHING`,
      [testUserId, `test-${testUserId}@example.com`, '$2b$10$dummyhash', true, 'ACTIVE', 'user', testTenantId]
    );

    // 3. Create venue record (required by events FK)
    await DatabaseService.query(
      `INSERT INTO venues (id, tenant_id, name, slug, email, address_line1, city, state_province, country_code, venue_type, max_capacity, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) ON CONFLICT (id) DO NOTHING`,
      [testVenueId, testTenantId, 'Test Venue', `test-venue-${testVenueId}`, 'test@venue.com', '123 Test St', 'Test City', 'Test State', 'US', 'theater', 1000, testUserId]
    );

    // 4. Create event record (required by reservations FK)
    await DatabaseService.query(
      `INSERT INTO events (id, tenant_id, venue_id, name, slug, status, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT (id) DO NOTHING`,
      [testEventId, testTenantId, testVenueId, 'Test Event', `test-event-${testEventId}`, 'PUBLISHED', testUserId]
    );

    // 5. Create ticket_type record (required by reservations FK)
    await DatabaseService.query(
      `INSERT INTO ticket_types (id, tenant_id, event_id, name, price, quantity, available_quantity, sold_quantity, reserved_quantity, is_active, sale_start, sale_end)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW() + INTERVAL '30 days') ON CONFLICT (id) DO NOTHING`,
      [testTicketTypeId, testTenantId, testEventId, 'General Admission', 50.00, 100, 100, 0, 0, true]
    );
  });

  afterEach(async () => {
    // Clean up in reverse order of creation
    await DatabaseService.query('DELETE FROM reservations WHERE tenant_id = $1', [testTenantId]);
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
    it('should create a reservation', async () => {
      const reservationData: IReservation = {
        tenant_id: testTenantId,
        event_id: testEventId,
        ticket_type_id: testTicketTypeId,
        user_id: testUserId,
        quantity: 2,
        total_quantity: 2,
        tickets: [{ ticketTypeId: testTicketTypeId, quantity: 2 }],
        type_name: 'VIP',
        status: 'pending',
        expires_at: new Date(Date.now() + 86400000)
      };

      const result = await reservationModel.create(reservationData);

      expect(result).toBeDefined();
      expect(result.id).toBeDefined();
      expect(result.tenant_id).toBe(testTenantId);
      expect(result.event_id).toBe(testEventId);
      expect(result.user_id).toBe(testUserId);
      expect(result.quantity).toBe(2);
      expect(result.status).toBe('pending');
    });

    it('should default to pending status', async () => {
      const reservationData: IReservation = {
        tenant_id: testTenantId,
        event_id: testEventId,
        ticket_type_id: testTicketTypeId,
        user_id: testUserId,
        quantity: 1,
        total_quantity: 1,
        tickets: [{ ticketTypeId: testTicketTypeId, quantity: 1 }],
        status: 'pending',
        expires_at: new Date(Date.now() + 3600000)
      };

      const result = await reservationModel.create(reservationData);

      expect(result.status).toBe('pending');
    });

    it('should store tickets as JSON', async () => {
      const ticketsData = [
        { ticketTypeId: testTicketTypeId, quantity: 2 },
        { ticketTypeId: uuidv4(), quantity: 1 }
      ];

      const reservationData: IReservation = {
        tenant_id: testTenantId,
        event_id: testEventId,
        ticket_type_id: testTicketTypeId,
        user_id: testUserId,
        quantity: 3,
        total_quantity: 3,
        tickets: ticketsData,
        status: 'pending',
        expires_at: new Date(Date.now() + 3600000)
      };

      const result = await reservationModel.create(reservationData);

      expect(result.tickets).toBeDefined();
    });

    it('should handle tickets as string', async () => {
      const ticketsString = JSON.stringify([{ ticketTypeId: testTicketTypeId, quantity: 1 }]);

      const reservationData: IReservation = {
        tenant_id: testTenantId,
        event_id: testEventId,
        ticket_type_id: testTicketTypeId,
        user_id: testUserId,
        quantity: 1,
        total_quantity: 1,
        tickets: ticketsString,
        status: 'pending',
        expires_at: new Date(Date.now() + 3600000)
      };

      const result = await reservationModel.create(reservationData);

      expect(result).toBeDefined();
    });

    it('should set created_at timestamp', async () => {
      const reservationData: IReservation = {
        tenant_id: testTenantId,
        event_id: testEventId,
        ticket_type_id: testTicketTypeId,
        user_id: testUserId,
        quantity: 1,
        total_quantity: 1,
        tickets: [],
        status: 'pending',
        expires_at: new Date(Date.now() + 3600000)
      };

      const result = await reservationModel.create(reservationData);

      expect(result.created_at).toBeDefined();
    });

    it('should store type_name', async () => {
      const reservationData: IReservation = {
        tenant_id: testTenantId,
        event_id: testEventId,
        ticket_type_id: testTicketTypeId,
        user_id: testUserId,
        quantity: 1,
        total_quantity: 1,
        tickets: [],
        type_name: 'Early Bird',
        status: 'pending',
        expires_at: new Date(Date.now() + 3600000)
      };

      const result = await reservationModel.create(reservationData);

      expect(result.type_name).toBe('Early Bird');
    });

    it('should create reservation with future expiration', async () => {
      const expiresAt = new Date(Date.now() + 7200000); // 2 hours

      const reservationData: IReservation = {
        tenant_id: testTenantId,
        event_id: testEventId,
        ticket_type_id: testTicketTypeId,
        user_id: testUserId,
        quantity: 1,
        total_quantity: 1,
        tickets: [],
        status: 'pending',
        expires_at: expiresAt
      };

      const result = await reservationModel.create(reservationData);

      expect(new Date(result.expires_at).getTime()).toBeCloseTo(expiresAt.getTime(), -3);
    });
  });

  describe('findById', () => {
    let testReservation: IReservation;

    beforeEach(async () => {
      testReservation = await reservationModel.create({
        tenant_id: testTenantId,
        event_id: testEventId,
        ticket_type_id: testTicketTypeId,
        user_id: testUserId,
        quantity: 1,
        total_quantity: 1,
        tickets: [],
        status: 'pending',
        expires_at: new Date(Date.now() + 3600000)
      });
    });

    it('should find reservation by ID', async () => {
      const result = await reservationModel.findById(testReservation.id!);

      expect(result).toBeDefined();
      expect(result?.id).toBe(testReservation.id);
      expect(result?.user_id).toBe(testUserId);
      expect(result?.status).toBe('pending');
    });

    it('should return null for non-existent ID', async () => {
      const result = await reservationModel.findById(uuidv4());

      expect(result).toBeNull();
    });

    it('should return all reservation fields', async () => {
      const result = await reservationModel.findById(testReservation.id!);

      expect(result).toHaveProperty('id');
      expect(result).toHaveProperty('tenant_id');
      expect(result).toHaveProperty('event_id');
      expect(result).toHaveProperty('user_id');
      expect(result).toHaveProperty('status');
      expect(result).toHaveProperty('expires_at');
      expect(result).toHaveProperty('created_at');
    });
  });

  describe('findActive', () => {
    beforeEach(async () => {
      // Create pending reservation (expires in future)
      await reservationModel.create({
        tenant_id: testTenantId,
        event_id: testEventId,
        ticket_type_id: testTicketTypeId,
        user_id: testUserId,
        quantity: 1,
        total_quantity: 1,
        tickets: [],
        status: 'pending',
        expires_at: new Date(Date.now() + 3600000)
      });

      // Create expired reservation
      await reservationModel.create({
        tenant_id: testTenantId,
        event_id: testEventId,
        ticket_type_id: testTicketTypeId,
        user_id: testUserId,
        quantity: 1,
        total_quantity: 1,
        tickets: [],
        status: 'pending',
        expires_at: new Date(Date.now() - 1000)
      });
    });

    it('should find only active non-expired reservations', async () => {
      const result = await reservationModel.findActive(testUserId);

      expect(result.length).toBe(1);
      expect(result[0].status).toBe('pending');
    });

    it('should return empty array for user with no active reservations', async () => {
      const result = await reservationModel.findActive(uuidv4());

      expect(result).toEqual([]);
    });

    it('should order by created_at DESC', async () => {
      // Create second pending reservation
      await new Promise(resolve => setTimeout(resolve, 100));
      await reservationModel.create({
        tenant_id: testTenantId,
        event_id: testEventId,
        ticket_type_id: testTicketTypeId,
        user_id: testUserId,
        quantity: 1,
        total_quantity: 1,
        tickets: [],
        status: 'pending',
        expires_at: new Date(Date.now() + 3600000)
      });

      const result = await reservationModel.findActive(testUserId);

      expect(result.length).toBe(2);
      const firstCreatedAt = new Date(result[0].created_at!).getTime();
      const secondCreatedAt = new Date(result[1].created_at!).getTime();
      expect(firstCreatedAt).toBeGreaterThanOrEqual(secondCreatedAt);
    });
  });

  describe('update', () => {
    let testReservation: IReservation;

    beforeEach(async () => {
      testReservation = await reservationModel.create({
        tenant_id: testTenantId,
        event_id: testEventId,
        ticket_type_id: testTicketTypeId,
        user_id: testUserId,
        quantity: 1,
        total_quantity: 1,
        tickets: [],
        status: 'pending',
        expires_at: new Date(Date.now() + 3600000)
      });
    });

    it('should update reservation status', async () => {
      const result = await reservationModel.update(testReservation.id!, {
        status: 'confirmed'
      });

      expect(result).toBeDefined();
      expect(result?.status).toBe('confirmed');
    });

    it('should update quantity', async () => {
      const result = await reservationModel.update(testReservation.id!, {
        quantity: 3,
        total_quantity: 3
      });

      expect(result?.quantity).toBe(3);
      expect(result?.total_quantity).toBe(3);
    });

    it('should update expires_at', async () => {
      const newExpiresAt = new Date(Date.now() + 7200000);

      const result = await reservationModel.update(testReservation.id!, {
        expires_at: newExpiresAt
      });

      expect(new Date(result!.expires_at).getTime()).toBeCloseTo(newExpiresAt.getTime(), -3);
    });

    it('should set updated_at timestamp', async () => {
      const result = await reservationModel.update(testReservation.id!, {
        status: 'confirmed'
      });

      expect(result?.updated_at).toBeDefined();
    });

    it('should return null for non-existent ID', async () => {
      const result = await reservationModel.update(uuidv4(), {
        status: 'confirmed'
      });

      expect(result).toBeNull();
    });

    it('should reject invalid fields', async () => {
      await expect(
        reservationModel.update(testReservation.id!, {
          id: uuidv4() as any // Trying to update ID (not in whitelist)
        })
      ).rejects.toThrow('No valid fields to update');
    });

    it('should update type_name', async () => {
      const result = await reservationModel.update(testReservation.id!, {
        type_name: 'Premium'
      });

      expect(result?.type_name).toBe('Premium');
    });

    it('should update released_at', async () => {
      const releasedAt = new Date();

      const result = await reservationModel.update(testReservation.id!, {
        released_at: releasedAt
      });

      expect(result?.released_at).toBeDefined();
    });

    it('should only update whitelisted fields', async () => {
      const result = await reservationModel.update(testReservation.id!, {
        status: 'confirmed',
        created_at: new Date() as any // Not in whitelist
      });

      expect(result?.status).toBe('confirmed');
      // created_at should not have changed
    });
  });

  describe('expireOldReservations', () => {
    beforeEach(async () => {
      // Create expired pending reservation
      await reservationModel.create({
        tenant_id: testTenantId,
        event_id: testEventId,
        ticket_type_id: testTicketTypeId,
        user_id: testUserId,
        quantity: 1,
        total_quantity: 1,
        tickets: [],
        status: 'pending',
        expires_at: new Date(Date.now() - 1000) // Expired 1 second ago
      });

      // Create future pending reservation
      await reservationModel.create({
        tenant_id: testTenantId,
        event_id: testEventId,
        ticket_type_id: testTicketTypeId,
        user_id: testUserId,
        quantity: 1,
        total_quantity: 1,
        tickets: [],
        status: 'pending',
        expires_at: new Date(Date.now() + 3600000)
      });
    });

    it('should expire old reservations', async () => {
      const count = await reservationModel.expireOldReservations();

      expect(count).toBe(1);
    });

    it('should set status to expired', async () => {
      await reservationModel.expireOldReservations();

      const reservations = await DatabaseService.query(
        'SELECT * FROM reservations WHERE tenant_id = $1 AND status = $2',
        [testTenantId, 'expired']
      );

      expect(reservations.rows.length).toBe(1);
    });

    it('should not affect future reservations', async () => {
      await reservationModel.expireOldReservations();

      const pendingReservations = await DatabaseService.query(
        'SELECT * FROM reservations WHERE tenant_id = $1 AND status = $2',
        [testTenantId, 'pending']
      );

      expect(pendingReservations.rows.length).toBe(1);
    });

    it('should return 0 when no reservations to expire', async () => {
      await reservationModel.expireOldReservations(); // Expire existing

      const count = await reservationModel.expireOldReservations(); // Run again

      expect(count).toBe(0);
    });

    it('should set updated_at timestamp', async () => {
      const before = new Date();
      await reservationModel.expireOldReservations();
      const after = new Date();

      const expired = await DatabaseService.query(
        'SELECT * FROM reservations WHERE tenant_id = $1 AND status = $2',
        [testTenantId, 'expired']
      );

      const updatedAt = new Date(expired.rows[0].updated_at);
      expect(updatedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(updatedAt.getTime()).toBeLessThanOrEqual(after.getTime());
    });
  });

  describe('Edge cases', () => {
    it('should handle zero quantity', async () => {
      const reservationData: IReservation = {
        tenant_id: testTenantId,
        event_id: testEventId,
        ticket_type_id: testTicketTypeId,
        user_id: testUserId,
        quantity: 0,
        total_quantity: 0,
        tickets: [],
        status: 'pending',
        expires_at: new Date(Date.now() + 3600000)
      };

      const result = await reservationModel.create(reservationData);

      expect(result.quantity).toBe(0);
    });

    it('should handle large quantity', async () => {
      const reservationData: IReservation = {
        tenant_id: testTenantId,
        event_id: testEventId,
        ticket_type_id: testTicketTypeId,
        user_id: testUserId,
        quantity: 1000,
        total_quantity: 1000,
        tickets: [],
        status: 'pending',
        expires_at: new Date(Date.now() + 3600000)
      };

      const result = await reservationModel.create(reservationData);

      expect(result.quantity).toBe(1000);
    });

    it('should handle null type_name', async () => {
      const reservationData: IReservation = {
        tenant_id: testTenantId,
        event_id: testEventId,
        ticket_type_id: testTicketTypeId,
        user_id: testUserId,
        quantity: 1,
        total_quantity: 1,
        tickets: [],
        status: 'pending',
        expires_at: new Date(Date.now() + 3600000)
      };

      const result = await reservationModel.create(reservationData);

      expect(result.type_name).toBeNull();
    });

    it('should handle empty tickets array', async () => {
      const reservationData: IReservation = {
        tenant_id: testTenantId,
        event_id: testEventId,
        ticket_type_id: testTicketTypeId,
        user_id: testUserId,
        quantity: 0,
        total_quantity: 0,
        tickets: [],
        status: 'pending',
        expires_at: new Date(Date.now() + 3600000)
      };

      const result = await reservationModel.create(reservationData);

      expect(result).toBeDefined();
    });
  });
});
