import { qrController } from '../../src/controllers/qrController';
import { DatabaseService } from '../../src/services/databaseService';
import { RedisService } from '../../src/services/redisService';
import { v4 as uuidv4 } from 'uuid';

/**
 * INTEGRATION TESTS FOR QR CONTROLLER
 * Tests QR code generation, validation, and refresh endpoints
 * 
 * FK Chain: tenants → users → venues → events → ticket_types → tickets
 * Note: QR codes are stored on tickets.qr_code column, not a separate table
 */

describe('QRController Integration Tests', () => {
  let testTenantId: string;
  let testUserId: string;
  let testVenueId: string;
  let testEventId: string;
  let testTicketTypeId: string;
  let testTicketId: string;

  beforeAll(async () => {
    await DatabaseService.initialize();
    await RedisService.initialize();
  });

  beforeEach(async () => {
    testTenantId = uuidv4();
    testUserId = uuidv4();
    testVenueId = uuidv4();
    testEventId = uuidv4();
    testTicketTypeId = uuidv4();
    testTicketId = uuidv4();

    // 1. Create tenant
    await DatabaseService.query(
      'INSERT INTO tenants (id, name, slug) VALUES ($1, $2, $3)',
      [testTenantId, 'Test Tenant', `test-${testTenantId.substring(0, 8)}`]
    );

    // 2. Create user
    await DatabaseService.query(
      `INSERT INTO users (id, email, password_hash, email_verified, status, role, tenant_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [testUserId, `user-${testUserId.substring(0, 8)}@test.com`, '$2b$10$hash', true, 'ACTIVE', 'user', testTenantId]
    );

    // 3. Create venue
    await DatabaseService.query(
      `INSERT INTO venues (id, tenant_id, name, slug, email, address_line1, city, state_province, country_code, venue_type, max_capacity, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [testVenueId, testTenantId, 'Test Venue', `venue-${testVenueId.substring(0, 8)}`, 'venue@test.com', '123 Test St', 'Test City', 'TS', 'US', 'theater', 1000, testUserId]
    );

    // 4. Create event
    await DatabaseService.query(
      `INSERT INTO events (id, tenant_id, venue_id, name, slug, status, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [testEventId, testTenantId, testVenueId, 'Test Event', `event-${testEventId.substring(0, 8)}`, 'PUBLISHED', testUserId]
    );

    // 5. Create ticket type
    await DatabaseService.query(
      `INSERT INTO ticket_types (id, tenant_id, event_id, name, price, quantity, available_quantity, sale_start, sale_end)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW() + INTERVAL '30 days')`,
      [testTicketTypeId, testTenantId, testEventId, 'GA', 50.00, 100, 100]
    );

    // 6. Create ticket
    const ticketNumber = `TKT-${Date.now()}`;
    await DatabaseService.query(
      `INSERT INTO tickets (id, tenant_id, event_id, ticket_type_id, user_id, ticket_number, qr_code, status, price_cents)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [testTicketId, testTenantId, testEventId, testTicketTypeId, testUserId, ticketNumber, `QR-${ticketNumber}`, 'active', 5000]
    );
  });

  afterEach(async () => {
    await DatabaseService.query('DELETE FROM ticket_validations WHERE ticket_id = $1', [testTicketId]);
    await DatabaseService.query('DELETE FROM tickets WHERE tenant_id = $1', [testTenantId]);
    await DatabaseService.query('DELETE FROM ticket_types WHERE tenant_id = $1', [testTenantId]);
    await DatabaseService.query('DELETE FROM events WHERE tenant_id = $1', [testTenantId]);
    await DatabaseService.query('DELETE FROM venues WHERE tenant_id = $1', [testTenantId]);
    await DatabaseService.query('DELETE FROM users WHERE tenant_id = $1', [testTenantId]);
    await DatabaseService.query('DELETE FROM tenants WHERE id = $1', [testTenantId]);

    try {
      const redis = RedisService.getClient();
      const keys = await redis.keys('qr:*');
      if (keys.length > 0) await redis.del(...keys);
    } catch (e) {
      // Redis may not be available
    }
  });

  afterAll(async () => {
    await RedisService.close();
    await DatabaseService.close();
  });

  describe('generateQR', () => {
    it('should generate QR code for ticket owner', async () => {
      const request = {
        params: { ticketId: testTicketId },
        user: { id: testUserId, role: 'customer' },
        tenantId: testTenantId
      } as any;

      const reply = {
        send: jest.fn()
      } as any;

      await qrController.generateQR(request, reply);

      expect(reply.send).toHaveBeenCalledWith({
        success: true,
        data: expect.objectContaining({
          qrCode: expect.any(String),
          qrImage: expect.any(String),
          expiresIn: 30
        })
      });
    });

    it('should reject non-owner access', async () => {
      const otherUserId = uuidv4();

      const request = {
        params: { ticketId: testTicketId },
        user: { id: otherUserId, role: 'customer' },
        tenantId: testTenantId
      } as any;

      const reply = { send: jest.fn() } as any;

      await expect(qrController.generateQR(request, reply)).rejects.toThrow('You do not own this ticket');
    });

    it('should allow admin access to any ticket', async () => {
      const adminId = uuidv4();

      const request = {
        params: { ticketId: testTicketId },
        user: { id: adminId, role: 'admin' },
        tenantId: testTenantId
      } as any;

      const reply = { send: jest.fn() } as any;

      await qrController.generateQR(request, reply);

      expect(reply.send).toHaveBeenCalled();
    });

    it('should enforce tenant isolation', async () => {
      const wrongTenantId = uuidv4();

      const request = {
        params: { ticketId: testTicketId },
        user: { id: testUserId, role: 'customer' },
        tenantId: wrongTenantId
      } as any;

      const reply = { send: jest.fn() } as any;

      await expect(qrController.generateQR(request, reply)).rejects.toThrow();
    });

    it('should return QR code with 30 second expiry', async () => {
      const request = {
        params: { ticketId: testTicketId },
        user: { id: testUserId, role: 'customer' },
        tenantId: testTenantId
      } as any;

      const reply = { send: jest.fn() } as any;

      await qrController.generateQR(request, reply);

      const callArg = reply.send.mock.calls[0][0];
      expect(callArg.data.expiresIn).toBe(30);
    });
  });

  describe('validateQR', () => {
    it('should validate valid QR code', async () => {
      // First generate a QR code
      const genRequest = {
        params: { ticketId: testTicketId },
        user: { id: testUserId, role: 'customer' },
        tenantId: testTenantId
      } as any;

      const genReply = { send: jest.fn() } as any;
      await qrController.generateQR(genRequest, genReply);

      const qrCode = genReply.send.mock.calls[0][0].data.qrCode;

      // Now validate it
      const request = {
        body: {
          qrCode,
          eventId: testEventId,
          entrance: 'Gate A',
          deviceId: 'scanner-1'
        },
        user: { id: uuidv4() }
      } as any;

      const reply = { send: jest.fn() } as any;

      await qrController.validateQR(request, reply);

      expect(reply.send).toHaveBeenCalledWith({
        success: expect.any(Boolean),
        data: expect.any(Object)
      });
    });

    it('should reject invalid QR code', async () => {
      const request = {
        body: {
          qrCode: 'invalid-qr-code',
          eventId: testEventId,
          entrance: 'Gate A',
          deviceId: 'scanner-1'
        },
        user: { id: uuidv4() }
      } as any;

      const reply = { send: jest.fn() } as any;

      await qrController.validateQR(request, reply);

      const callArg = reply.send.mock.calls[0][0];
      expect(callArg.success).toBe(false);
    });

    it('should include validation metadata', async () => {
      const genRequest = {
        params: { ticketId: testTicketId },
        user: { id: testUserId, role: 'customer' },
        tenantId: testTenantId
      } as any;

      const genReply = { send: jest.fn() } as any;
      await qrController.generateQR(genRequest, genReply);

      const qrCode = genReply.send.mock.calls[0][0].data.qrCode;

      const validatorId = uuidv4();
      const request = {
        body: {
          qrCode,
          eventId: testEventId,
          entrance: 'Gate B',
          deviceId: 'scanner-2'
        },
        user: { id: validatorId }
      } as any;

      const reply = { send: jest.fn() } as any;

      await qrController.validateQR(request, reply);

      expect(reply.send).toHaveBeenCalled();
    });
  });

  describe('refreshQR', () => {
    it('should refresh QR code for ticket owner', async () => {
      const request = {
        body: { ticketId: testTicketId },
        user: { id: testUserId, role: 'customer' },
        tenantId: testTenantId
      } as any;

      const reply = { send: jest.fn() } as any;

      await qrController.refreshQR(request, reply);

      expect(reply.send).toHaveBeenCalledWith({
        success: true,
        data: expect.objectContaining({
          qrCode: expect.any(String),
          qrImage: expect.any(String),
          expiresIn: 30
        })
      });
    });

    it('should reject non-owner refresh', async () => {
      const otherUserId = uuidv4();

      const request = {
        body: { ticketId: testTicketId },
        user: { id: otherUserId, role: 'customer' },
        tenantId: testTenantId
      } as any;

      const reply = { send: jest.fn() } as any;

      await expect(qrController.refreshQR(request, reply)).rejects.toThrow('You do not own this ticket');
    });

    it('should allow admin to refresh any ticket', async () => {
      const adminId = uuidv4();

      const request = {
        body: { ticketId: testTicketId },
        user: { id: adminId, role: 'admin' },
        tenantId: testTenantId
      } as any;

      const reply = { send: jest.fn() } as any;

      await qrController.refreshQR(request, reply);

      expect(reply.send).toHaveBeenCalled();
    });

    it('should generate new QR code on refresh', async () => {
      const request = {
        body: { ticketId: testTicketId },
        user: { id: testUserId, role: 'customer' },
        tenantId: testTenantId
      } as any;

      const reply1 = { send: jest.fn() } as any;
      await qrController.refreshQR(request, reply1);
      const qrCode1 = reply1.send.mock.calls[0][0].data.qrCode;

      await new Promise(resolve => setTimeout(resolve, 100));

      const reply2 = { send: jest.fn() } as any;
      await qrController.refreshQR(request, reply2);
      const qrCode2 = reply2.send.mock.calls[0][0].data.qrCode;

      expect(qrCode1).not.toBe(qrCode2);
    });

    it('should enforce tenant isolation on refresh', async () => {
      const wrongTenantId = uuidv4();

      const request = {
        body: { ticketId: testTicketId },
        user: { id: testUserId, role: 'customer' },
        tenantId: wrongTenantId
      } as any;

      const reply = { send: jest.fn() } as any;

      await expect(qrController.refreshQR(request, reply)).rejects.toThrow();
    });
  });

  describe('security', () => {
    it('should prevent access to tickets from other tenants', async () => {
      const otherTenantId = uuidv4();

      const request = {
        params: { ticketId: testTicketId },
        user: { id: testUserId, role: 'customer' },
        tenantId: otherTenantId
      } as any;

      const reply = { send: jest.fn() } as any;

      await expect(qrController.generateQR(request, reply)).rejects.toThrow();
    });

    it('should verify ticket ownership before operations', async () => {
      const hackerId = uuidv4();

      const request = {
        params: { ticketId: testTicketId },
        user: { id: hackerId, role: 'customer' },
        tenantId: testTenantId
      } as any;

      const reply = { send: jest.fn() } as any;

      await expect(qrController.generateQR(request, reply)).rejects.toThrow();
    });

    it('should handle missing ticket gracefully', async () => {
      const fakeTicketId = uuidv4();

      const request = {
        params: { ticketId: fakeTicketId },
        user: { id: testUserId, role: 'customer' },
        tenantId: testTenantId
      } as any;

      const reply = { send: jest.fn() } as any;

      await expect(qrController.generateQR(request, reply)).rejects.toThrow();
    });
  });

  describe('edge cases', () => {
    it('should handle rapid refresh requests', async () => {
      const request = {
        body: { ticketId: testTicketId },
        user: { id: testUserId, role: 'customer' },
        tenantId: testTenantId
      } as any;

      const promises = [];
      for (let i = 0; i < 5; i++) {
        const reply = { send: jest.fn() } as any;
        promises.push(qrController.refreshQR(request, reply));
      }

      await Promise.all(promises);
      // Should complete without errors
    });

    it('should handle validation with missing fields', async () => {
      const request = {
        body: {
          qrCode: 'some-code'
          // Missing eventId, entrance, deviceId
        },
        user: { id: uuidv4() }
      } as any;

      const reply = { send: jest.fn() } as any;

      await qrController.validateQR(request, reply);
      expect(reply.send).toHaveBeenCalled();
    });
  });
});
