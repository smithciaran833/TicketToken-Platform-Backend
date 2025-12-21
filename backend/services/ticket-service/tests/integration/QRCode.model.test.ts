import { DatabaseService } from '../../src/services/databaseService';
import { QRCodeModel, IQRCodeResult } from '../../src/models/QRCode';
import { v4 as uuidv4 } from 'uuid';

describe('QRCode Model Integration Tests', () => {
  let qrCodeModel: QRCodeModel;
  let testTenantId: string;
  let testUserId: string;
  let testVenueId: string;
  let testEventId: string;
  let testTicketTypeId: string;
  let testTicketId: string;
  let testQRCode: string;

  beforeAll(async () => {
    await DatabaseService.initialize();
    qrCodeModel = new QRCodeModel((DatabaseService as any).pool);
  });

  beforeEach(async () => {
    testTenantId = uuidv4();
    testUserId = uuidv4();
    testVenueId = uuidv4();
    testEventId = uuidv4();
    testTicketTypeId = uuidv4();
    testTicketId = uuidv4();
    testQRCode = `QR-TEST-${uuidv4()}`;

    // 1. Create tenant
    await DatabaseService.query(
      'INSERT INTO tenants (id, name, slug) VALUES ($1, $2, $3)',
      [testTenantId, 'Test Tenant', `test-${testTenantId}`]
    );

    // 2. Create user
    await DatabaseService.query(
      `INSERT INTO users (id, email, password_hash, email_verified, status, role, tenant_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [testUserId, `user-${testUserId}@test.com`, '$2b$10$hash', true, 'ACTIVE', 'user', testTenantId]
    );

    // 3. Create venue
    await DatabaseService.query(
      `INSERT INTO venues (id, tenant_id, name, slug, email, address_line1, city, state_province, country_code, venue_type, max_capacity, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [testVenueId, testTenantId, 'Test Venue', `venue-${testVenueId}`, 'venue@test.com', '123 St', 'City', 'State', 'US', 'theater', 1000, testUserId]
    );

    // 4. Create event
    await DatabaseService.query(
      `INSERT INTO events (id, tenant_id, venue_id, name, slug, status, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [testEventId, testTenantId, testVenueId, 'Test Event', `event-${testEventId}`, 'PUBLISHED', testUserId]
    );

    // 5. Create ticket type
    await DatabaseService.query(
      `INSERT INTO ticket_types (id, tenant_id, event_id, name, price, quantity, available_quantity, sale_start, sale_end)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW() + INTERVAL '30 days')`,
      [testTicketTypeId, testTenantId, testEventId, 'GA', 50.00, 100, 100]
    );

    // 6. Create ticket with QR code
    await DatabaseService.query(
      `INSERT INTO tickets (id, tenant_id, event_id, ticket_type_id, user_id, ticket_number, qr_code, status, is_validated)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [testTicketId, testTenantId, testEventId, testTicketTypeId, testUserId, `TKT-${Date.now()}`, testQRCode, 'active', false]
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

  describe('findByCode', () => {
    it('should find ticket by QR code', async () => {
      const result = await qrCodeModel.findByCode(testQRCode);

      expect(result).toBeDefined();
      expect(result?.qr_code).toBe(testQRCode);
      expect(result?.ticket_id).toBe(testTicketId);
      expect(result?.status).toBe('active');
      expect(result?.is_validated).toBe(false);
    });

    it('should return null for non-existent QR code', async () => {
      const result = await qrCodeModel.findByCode('NON-EXISTENT-QR');

      expect(result).toBeNull();
    });

    it('should return null for empty string', async () => {
      const result = await qrCodeModel.findByCode('');

      expect(result).toBeNull();
    });

    it('should not find soft-deleted tickets', async () => {
      await DatabaseService.query(
        'UPDATE tickets SET deleted_at = NOW() WHERE id = $1',
        [testTicketId]
      );

      const result = await qrCodeModel.findByCode(testQRCode);

      expect(result).toBeNull();
    });

    it('should return all expected fields', async () => {
      const result = await qrCodeModel.findByCode(testQRCode);

      expect(result).toHaveProperty('id');
      expect(result).toHaveProperty('ticket_id');
      expect(result).toHaveProperty('qr_code');
      expect(result).toHaveProperty('ticket_number');
      expect(result).toHaveProperty('status');
      expect(result).toHaveProperty('is_validated');
      expect(result).toHaveProperty('event_id');
      expect(result).toHaveProperty('user_id');
    });
  });

  describe('findByTicketId', () => {
    it('should find QR code by ticket ID', async () => {
      const result = await qrCodeModel.findByTicketId(testTicketId);

      expect(result).toBeDefined();
      expect(result?.ticket_id).toBe(testTicketId);
      expect(result?.qr_code).toBe(testQRCode);
    });

    it('should return null for non-existent ticket ID', async () => {
      const result = await qrCodeModel.findByTicketId(uuidv4());

      expect(result).toBeNull();
    });

    it('should not find soft-deleted tickets', async () => {
      await DatabaseService.query(
        'UPDATE tickets SET deleted_at = NOW() WHERE id = $1',
        [testTicketId]
      );

      const result = await qrCodeModel.findByTicketId(testTicketId);

      expect(result).toBeNull();
    });
  });

  describe('regenerate', () => {
    it('should regenerate QR code for ticket', async () => {
      const result = await qrCodeModel.regenerate(testTicketId);

      expect(result).toBeDefined();
      expect(result?.qr_code).not.toBe(testQRCode);
      expect(result?.qr_code).toMatch(/^QR-/);
    });

    it('should return null for non-existent ticket', async () => {
      const result = await qrCodeModel.regenerate(uuidv4());

      expect(result).toBeNull();
    });

    it('should not regenerate for soft-deleted ticket', async () => {
      await DatabaseService.query(
        'UPDATE tickets SET deleted_at = NOW() WHERE id = $1',
        [testTicketId]
      );

      const result = await qrCodeModel.regenerate(testTicketId);

      expect(result).toBeNull();
    });

    it('should generate unique QR codes', async () => {
      const result1 = await qrCodeModel.regenerate(testTicketId);
      const result2 = await qrCodeModel.regenerate(testTicketId);

      expect(result1?.qr_code).not.toBe(result2?.qr_code);
    });
  });

  describe('markAsScanned', () => {
    it('should mark QR code as scanned', async () => {
      const result = await qrCodeModel.markAsScanned(testQRCode);

      expect(result).toBe(true);

      const ticket = await qrCodeModel.findByCode(testQRCode);
      expect(ticket?.is_validated).toBe(true);
      expect(ticket?.validated_at).toBeDefined();
    });

    it('should set validated_by when provided', async () => {
      const validatorId = testUserId;
      await qrCodeModel.markAsScanned(testQRCode, validatorId);

      const ticket = await qrCodeModel.findByCode(testQRCode);
      expect(ticket?.validated_by).toBe(validatorId);
    });

    it('should return false for already scanned QR code', async () => {
      await qrCodeModel.markAsScanned(testQRCode);
      const result = await qrCodeModel.markAsScanned(testQRCode);

      expect(result).toBe(false);
    });

    it('should return false for non-existent QR code', async () => {
      const result = await qrCodeModel.markAsScanned('NON-EXISTENT');

      expect(result).toBe(false);
    });

    it('should not scan soft-deleted ticket', async () => {
      await DatabaseService.query(
        'UPDATE tickets SET deleted_at = NOW() WHERE id = $1',
        [testTicketId]
      );

      const result = await qrCodeModel.markAsScanned(testQRCode);

      expect(result).toBe(false);
    });

    it('should set validated_at timestamp accurately', async () => {
      const before = new Date();
      await qrCodeModel.markAsScanned(testQRCode);
      const after = new Date();

      const ticket = await qrCodeModel.findByCode(testQRCode);
      const validatedAt = new Date(ticket!.validated_at!);

      expect(validatedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(validatedAt.getTime()).toBeLessThanOrEqual(after.getTime());
    });
  });

  describe('isValid', () => {
    it('should return true for valid unscanned active ticket', async () => {
      const result = await qrCodeModel.isValid(testQRCode);

      expect(result).toBe(true);
    });

    it('should return false for scanned ticket', async () => {
      await qrCodeModel.markAsScanned(testQRCode);
      const result = await qrCodeModel.isValid(testQRCode);

      expect(result).toBe(false);
    });

    it('should return false for cancelled ticket', async () => {
      await DatabaseService.query(
        "UPDATE tickets SET status = 'cancelled' WHERE id = $1",
        [testTicketId]
      );

      const result = await qrCodeModel.isValid(testQRCode);

      expect(result).toBe(false);
    });

    it('should return false for used ticket', async () => {
      await DatabaseService.query(
        "UPDATE tickets SET status = 'used' WHERE id = $1",
        [testTicketId]
      );

      const result = await qrCodeModel.isValid(testQRCode);

      expect(result).toBe(false);
    });

    it('should return false for transferred ticket', async () => {
      await DatabaseService.query(
        "UPDATE tickets SET status = 'transferred' WHERE id = $1",
        [testTicketId]
      );

      const result = await qrCodeModel.isValid(testQRCode);

      expect(result).toBe(false);
    });

    it('should return false for soft-deleted ticket', async () => {
      await DatabaseService.query(
        'UPDATE tickets SET deleted_at = NOW() WHERE id = $1',
        [testTicketId]
      );

      const result = await qrCodeModel.isValid(testQRCode);

      expect(result).toBe(false);
    });

    it('should return false for non-existent QR code', async () => {
      const result = await qrCodeModel.isValid('NON-EXISTENT');

      expect(result).toBe(false);
    });

    it('should return false for empty string', async () => {
      const result = await qrCodeModel.isValid('');

      expect(result).toBe(false);
    });
  });

  describe('getValidationStatus', () => {
    it('should return valid status for active unscanned ticket', async () => {
      const result = await qrCodeModel.getValidationStatus(testQRCode);

      expect(result.exists).toBe(true);
      expect(result.isValid).toBe(true);
      expect(result.reason).toBeUndefined();
    });

    it('should return already scanned reason', async () => {
      await qrCodeModel.markAsScanned(testQRCode);
      const result = await qrCodeModel.getValidationStatus(testQRCode);

      expect(result.exists).toBe(true);
      expect(result.isValid).toBe(false);
      expect(result.reason).toBe('Ticket already scanned');
    });

    it('should return status reason for non-active ticket', async () => {
      await DatabaseService.query(
        "UPDATE tickets SET status = 'cancelled' WHERE id = $1",
        [testTicketId]
      );

      const result = await qrCodeModel.getValidationStatus(testQRCode);

      expect(result.exists).toBe(true);
      expect(result.isValid).toBe(false);
      expect(result.reason).toBe('Ticket status is cancelled');
    });

    it('should return deleted reason for soft-deleted ticket', async () => {
      await DatabaseService.query(
        'UPDATE tickets SET deleted_at = NOW() WHERE id = $1',
        [testTicketId]
      );

      const result = await qrCodeModel.getValidationStatus(testQRCode);

      expect(result.exists).toBe(true);
      expect(result.isValid).toBe(false);
      expect(result.reason).toBe('Ticket has been deleted');
    });

    it('should return not found for non-existent QR code', async () => {
      const result = await qrCodeModel.getValidationStatus('NON-EXISTENT');

      expect(result.exists).toBe(false);
      expect(result.isValid).toBe(false);
      expect(result.reason).toBe('QR code not found');
    });

    it('should return no code provided for empty string', async () => {
      const result = await qrCodeModel.getValidationStatus('');

      expect(result.exists).toBe(false);
      expect(result.isValid).toBe(false);
      expect(result.reason).toBe('No QR code provided');
    });
  });

  describe('Edge cases', () => {
    it('should handle special characters in QR code lookup', async () => {
      const specialQR = `QR-SPECIAL-!@#$%`;
      await DatabaseService.query(
        'UPDATE tickets SET qr_code = $1 WHERE id = $2',
        [specialQR, testTicketId]
      );

      const result = await qrCodeModel.findByCode(specialQR);

      expect(result?.qr_code).toBe(specialQR);
    });

    it('should handle case sensitivity', async () => {
      const result = await qrCodeModel.findByCode(testQRCode.toLowerCase());

      // PostgreSQL is case-sensitive by default
      if (testQRCode !== testQRCode.toLowerCase()) {
        expect(result).toBeNull();
      }
    });

    it('should handle concurrent scan attempts', async () => {
      const results = await Promise.all([
        qrCodeModel.markAsScanned(testQRCode),
        qrCodeModel.markAsScanned(testQRCode),
        qrCodeModel.markAsScanned(testQRCode)
      ]);

      // Only one should succeed
      const successCount = results.filter(r => r === true).length;
      expect(successCount).toBe(1);
    });
  });
});
