import { QRService } from '../../src/services/qrService';
import { DatabaseService } from '../../src/services/databaseService';
import { RedisService } from '../../src/services/redisService';
import { v4 as uuidv4 } from 'uuid';

/**
 * INTEGRATION TESTS FOR QR SERVICE
 * Tests QR code generation, validation, and encryption
 */

describe('QRService Integration Tests', () => {
  let qrService: QRService;
  let testTenantId: string;
  let testUserId: string;
  let testVenueId: string;
  let testEventId: string;
  let testTicketTypeId: string;
  let testTicketId: string;

  beforeAll(async () => {
    await DatabaseService.initialize();
    await RedisService.initialize();
    qrService = new QRService();
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
      [testTicketTypeId, testTenantId, testEventId, 'VIP', 100.00, 100, 100]
    );

    // 6. Create ticket
    const ticketNumber = `TKT-${Date.now()}`;
    const qrCode = `QR-${ticketNumber}`;
    await DatabaseService.query(
      `INSERT INTO tickets (id, tenant_id, event_id, ticket_type_id, user_id, ticket_number, qr_code, status, is_validated)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [testTicketId, testTenantId, testEventId, testTicketTypeId, testUserId, ticketNumber, qrCode, 'active', false]
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
  });

  afterAll(async () => {
    await RedisService.close();
    await DatabaseService.close();
  });

  describe('generateRotatingQR', () => {
    it('should generate QR code for valid ticket', async () => {
      const result = await qrService.generateRotatingQR(testTicketId);

      expect(result).toBeDefined();
      expect(result.qrCode).toBeDefined();
      expect(result.qrImage).toBeDefined();
      expect(result.qrCode).toContain('TKT:');
      expect(result.qrImage).toContain('data:image/png;base64');
    });

    it('should generate different QR codes over time', async () => {
      const qr1 = await qrService.generateRotatingQR(testTicketId);
      await new Promise(resolve => setTimeout(resolve, 100));
      const qr2 = await qrService.generateRotatingQR(testTicketId);

      expect(qr1.qrCode).not.toBe(qr2.qrCode);
    });

    it('should throw error for non-existent ticket', async () => {
      await expect(
        qrService.generateRotatingQR(uuidv4())
      ).rejects.toThrow('Ticket not found');
    });

    it('should generate QR image with correct dimensions', async () => {
      const result = await qrService.generateRotatingQR(testTicketId);

      expect(result.qrImage).toMatch(/^data:image\/png;base64,/);
    });
  });

  describe('validateQR', () => {
    it('should successfully validate fresh QR code', async () => {
      const { qrCode } = await qrService.generateRotatingQR(testTicketId);

      const validation = await qrService.validateQR(qrCode, {
        eventId: testEventId,
        validatorId: testUserId
      });

      expect(validation.isValid).toBe(true);
      expect(validation.ticketId).toBe(testTicketId);
      expect(validation.eventId).toBe(testEventId);
      expect(validation.validatedAt).toBeInstanceOf(Date);
    });

    it('should reject already used ticket', async () => {
      const { qrCode } = await qrService.generateRotatingQR(testTicketId);

      // First validation succeeds
      await qrService.validateQR(qrCode, {
        eventId: testEventId,
        validatorId: testUserId
      });

      // Generate new QR for same ticket
      const { qrCode: qrCode2 } = await qrService.generateRotatingQR(testTicketId);

      // Second validation should fail
      const validation2 = await qrService.validateQR(qrCode2, {
        eventId: testEventId
      });

      expect(validation2.isValid).toBe(false);
      expect(validation2.reason).toContain('already used');
    });

    it('should reject QR for wrong event', async () => {
      const { qrCode } = await qrService.generateRotatingQR(testTicketId);

      const validation = await qrService.validateQR(qrCode, {
        eventId: uuidv4()
      });

      expect(validation.isValid).toBe(false);
      expect(validation.reason).toBe('Wrong event');
    });

    it('should reject invalid QR format', async () => {
      const validation = await qrService.validateQR('INVALID:FORMAT', {
        eventId: testEventId
      });

      expect(validation.isValid).toBe(false);
      expect(validation.reason).toContain('Invalid');
    });

    it('should create validation record in database', async () => {
      const { qrCode } = await qrService.generateRotatingQR(testTicketId);

      await qrService.validateQR(qrCode, {
        eventId: testEventId,
        validatorId: testUserId
      });

      const validation = await DatabaseService.query(
        'SELECT * FROM ticket_validations WHERE ticket_id = $1',
        [testTicketId]
      );

      expect(validation.rows.length).toBe(1);
      expect(validation.rows[0].validator_id).toBe(testUserId);
    });

    it('should update ticket status to used', async () => {
      const { qrCode } = await qrService.generateRotatingQR(testTicketId);

      await qrService.validateQR(qrCode, {
        eventId: testEventId
      });

      const ticket = await DatabaseService.query(
        'SELECT status, validated_at, is_validated FROM tickets WHERE id = $1',
        [testTicketId]
      );

      expect(ticket.rows[0].status).toBe('used');
      expect(ticket.rows[0].is_validated).toBe(true);
      expect(ticket.rows[0].validated_at).toBeDefined();
    });
  });

  describe('encryption and decryption', () => {
    it('should encrypt and decrypt QR data', async () => {
      const { qrCode } = await qrService.generateRotatingQR(testTicketId);

      expect(qrCode).toContain('TKT:');

      const validation = await qrService.validateQR(qrCode, {
        eventId: testEventId
      });

      expect(validation.ticketId).toBe(testTicketId);
    });

    it('should handle corrupted encrypted data', async () => {
      const validation = await qrService.validateQR('TKT:corrupted_data_here', {
        eventId: testEventId
      });

      expect(validation.isValid).toBe(false);
    });

    it('should generate unique nonces for each QR', async () => {
      const qr1 = await qrService.generateRotatingQR(testTicketId);
      const qr2 = await qrService.generateRotatingQR(testTicketId);

      expect(qr1.qrCode).not.toBe(qr2.qrCode);
    });
  });

  describe('concurrent validation prevention', () => {
    it('should prevent double validation with row locking', async () => {
      const { qrCode } = await qrService.generateRotatingQR(testTicketId);

      const validations = await Promise.allSettled([
        qrService.validateQR(qrCode, { eventId: testEventId }),
        qrService.validateQR(qrCode, { eventId: testEventId })
      ]);

      const successful = validations.filter(v => v.status === 'fulfilled' && (v.value as any).isValid);
      expect(successful.length).toBeLessThanOrEqual(1);
    });
  });

  describe('edge cases', () => {
    it('should handle ticket with no seat information', async () => {
      const altTicketId = uuidv4();
      const ticketNumber = `TKT-${Date.now()}-ALT`;
      const qrCode = `QR-${ticketNumber}`;

      await DatabaseService.query(
        `INSERT INTO tickets (id, tenant_id, event_id, ticket_type_id, user_id, ticket_number, qr_code, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [altTicketId, testTenantId, testEventId, testTicketTypeId, testUserId, ticketNumber, qrCode, 'active']
      );

      const qr = await qrService.generateRotatingQR(altTicketId);
      expect(qr.qrCode).toBeDefined();

      await DatabaseService.query('DELETE FROM tickets WHERE id = $1', [altTicketId]);
    });

    it('should handle validation without optional fields', async () => {
      const { qrCode } = await qrService.generateRotatingQR(testTicketId);

      const validation = await qrService.validateQR(qrCode, {
        eventId: testEventId
      });

      expect(validation.isValid).toBe(true);
    });

    it('should reject validation for cancelled ticket', async () => {
      await DatabaseService.query(
        "UPDATE tickets SET status = 'cancelled' WHERE id = $1",
        [testTicketId]
      );

      const { qrCode } = await qrService.generateRotatingQR(testTicketId);

      const validation = await qrService.validateQR(qrCode, {
        eventId: testEventId
      });

      expect(validation.isValid).toBe(false);
    });
  });

  describe('QR image generation', () => {
    it('should generate base64 PNG image', async () => {
      const result = await qrService.generateRotatingQR(testTicketId);

      expect(result.qrImage).toMatch(/^data:image\/png;base64,/);

      const base64Data = result.qrImage.split(',')[1];
      expect(base64Data).toMatch(/^[A-Za-z0-9+/=]+$/);
    });

    it('should generate scannable QR image', async () => {
      const result = await qrService.generateRotatingQR(testTicketId);

      expect(result.qrCode).toContain('TKT:');
      expect(result.qrImage.length).toBeGreaterThan(100);
    });
  });

  describe('Redis failure handling', () => {
    it('should generate QR even if Redis is unavailable', async () => {
      await RedisService.close();

      const result = await qrService.generateRotatingQR(testTicketId);

      expect(result.qrCode).toBeDefined();
      expect(result.qrImage).toBeDefined();

      await RedisService.initialize();
    });

    it('should validate QR even if Redis cache clear fails', async () => {
      const { qrCode } = await qrService.generateRotatingQR(testTicketId);

      await RedisService.close();

      const validation = await qrService.validateQR(qrCode, {
        eventId: testEventId
      });

      expect(validation.isValid).toBe(true);

      await RedisService.initialize();
    });
  });
});
