/**
 * Phase 3 Edge Cases: QR Code Advanced Tests
 *
 * Tests QR code security and validation:
 * - QR rotation every 30 seconds
 * - Concurrent scanning prevention
 * - Replay attack prevention
 * - Device fingerprinting
 * - Validation event logging
 * - Performance testing
 */

import { Pool } from 'pg';
import { DatabaseService } from '../../src/services/databaseService';
import { qrService } from '../../src/services/qrService';
import { TestDataHelper, DEFAULT_TENANT_ID, TEST_EVENT, TEST_USERS } from '../fixtures/test-data';
import { v4 as uuidv4 } from 'uuid';

describe('Phase 3: QR Code Advanced', () => {
  let pool: Pool;
  let testHelper: TestDataHelper;

  beforeAll(async () => {
    await DatabaseService.initialize();
    pool = DatabaseService.getPool();
    testHelper = new TestDataHelper(pool);
    await testHelper.seedDatabase();
  });

  afterAll(async () => {
    await testHelper.cleanDatabase();
    await DatabaseService.close();
  });

  beforeEach(async () => {
    await pool.query('DELETE FROM ticket_validations WHERE tenant_id = $1', [DEFAULT_TENANT_ID]);
    await pool.query('DELETE FROM tickets WHERE tenant_id = $1', [DEFAULT_TENANT_ID]);
  });

  // Helper to create a test ticket
  async function createTestTicket(status = 'SOLD') {
    const result = await pool.query(
      `INSERT INTO tickets (
        tenant_id, event_id, ticket_type_id, user_id, order_id,
        status, price_cents
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *`,
      [
        DEFAULT_TENANT_ID,
        TEST_EVENT.id,
        uuidv4(),
        TEST_USERS.BUYER_1,
        uuidv4(),
        status,
        5000
      ]
    );
    return result.rows[0];
  }

  describe('1. QR Rotation', () => {
    it('should generate different QR codes every 30 seconds', async () => {
      const ticket = await createTestTicket();

      const qr1 = await qrService.generateRotatingQR(ticket.id);
      
      // Wait 31 seconds (simulate rotation interval)
      await new Promise(resolve => setTimeout(resolve, 31000));
      
      const qr2 = await qrService.generateRotatingQR(ticket.id);

      expect(qr1.qrCode).not.toBe(qr2.qrCode);
      expect(qr1.qrImage).not.toBe(qr2.qrImage);
    }, 35000); // Increase Jest timeout for this test

    it('should generate same QR code within rotation window', async () => {
      const ticket = await createTestTicket();

      const qr1 = await qrService.generateRotatingQR(ticket.id);
      
      // Wait only 5 seconds (within same window)
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      const qr2 = await qrService.generateRotatingQR(ticket.id);

      // Extract timestamps from encrypted QR codes (they should be same)
      const timestamp1 = qr1.qrCode.split(':')[0];
      const timestamp2 = qr2.qrCode.split(':')[0];
      
      expect(timestamp1).toBe(timestamp2);
    }, 10000);
  });

  describe('2. Concurrent Scanning Prevention', () => {
    it('should prevent double scanning with SELECT FOR UPDATE', async () => {
      const ticket = await createTestTicket();
      const { qrCode } = await qrService.generateRotatingQR(ticket.id);

      // Simulate two concurrent scans
      const validation1Promise = qrService.validateQR(qrCode, {
        eventId: TEST_EVENT.id,
        entrance: 'Gate A',
        deviceId: 'device-1',
        validatorId: TEST_USERS.VALIDATOR
      });

      const validation2Promise = qrService.validateQR(qrCode, {
        eventId: TEST_EVENT.id,
        entrance: 'Gate B',
        deviceId: 'device-2',
        validatorId: TEST_USERS.ADMIN
      });

      const [result1, result2] = await Promise.all([
        validation1Promise,
        validation2Promise
      ]);

      // One should succeed, one should fail
      const validCount = [result1.isValid, result2.isValid].filter(Boolean).length;
      expect(validCount).toBe(1);

      // Check only one validation logged
      const validations = await pool.query(
        'SELECT * FROM ticket_validations WHERE ticket_id = $1',
        [ticket.id]
      );
      expect(validations.rows).toHaveLength(1);
    });
  });

  describe('3. Replay Attack Prevention', () => {
    it('should reject already-used ticket', async () => {
      const ticket = await createTestTicket();
      const { qrCode } = await qrService.generateRotatingQR(ticket.id);

      // First scan - should succeed
      const validation1 = await qrService.validateQR(qrCode, {
        eventId: TEST_EVENT.id,
        entrance: 'Gate A',
        deviceId: 'device-1'
      });

      expect(validation1.isValid).toBe(true);

      // Second scan - should fail (replay attack)
      const validation2 = await qrService.validateQR(qrCode, {
        eventId: TEST_EVENT.id,
        entrance: 'Gate A',
        deviceId: 'device-1'
      });

      expect(validation2.isValid).toBe(false);
      expect(validation2.reason).toMatch(/already used/i);
    });

    it('should reject expired QR code (>60 seconds old)', async () => {
      const ticket = await createTestTicket();
      
      // Generate QR code
      const { qrCode } = await qrService.generateRotatingQR(ticket.id);

      // Wait 91 seconds (past 2 rotation intervals = timeDiff > 2)
      await new Promise(resolve => setTimeout(resolve, 91000));

      const validation = await qrService.validateQR(qrCode, {
        eventId: TEST_EVENT.id,
        entrance: 'Gate A',
        deviceId: 'device-1'
      });

      expect(validation.isValid).toBe(false);
      expect(validation.reason).toMatch(/expired/i);
    }, 95000);
  });

  describe('4. Device Fingerprinting', () => {
    it('should track device ID in validation', async () => {
      const ticket = await createTestTicket();
      const { qrCode } = await qrService.generateRotatingQR(ticket.id);

      const deviceId = 'scanner-device-12345';

      await qrService.validateQR(qrCode, {
        eventId: TEST_EVENT.id,
        entrance: 'Gate A',
        deviceId,
        validatorId: TEST_USERS.VALIDATOR
      });

      const validation = await pool.query(
        'SELECT * FROM ticket_validations WHERE ticket_id = $1',
        [ticket.id]
      );

      expect(validation.rows[0].device_id).toBe(deviceId);
    });

    it('should track multiple scan attempts from different devices', async () => {
      const ticket = await createTestTicket();

      // First attempt from device 1
      const qr1 = await qrService.generateRotatingQR(ticket.id);
      await qrService.validateQR(qr1.qrCode, {
        eventId: TEST_EVENT.id,
        deviceId: 'device-1',
        entrance: 'Gate A'
      });

      // Second attempt from device 2 (should fail - already used)
      const qr2 = await qrService.generateRotatingQR(ticket.id);
      const result2 = await qrService.validateQR(qr2.qrCode, {
        eventId: TEST_EVENT.id,
        deviceId: 'device-2',
        entrance: 'Gate B'
      });

      expect(result2.isValid).toBe(false);
    });
  });

  describe('5. QR Expiration Validation', () => {
    it('should validate QR code within valid time window', async () => {
      const ticket = await createTestTicket();
      const { qrCode } = await qrService.generateRotatingQR(ticket.id);

      // Validate immediately (should succeed)
      const validation = await qrService.validateQR(qrCode, {
        eventId: TEST_EVENT.id,
        entrance: 'Gate A'
      });

      expect(validation.isValid).toBe(true);
    });

    it('should reject QR code outside time window', async () => {
      const ticket = await createTestTicket();
      const { qrCode } = await qrService.generateRotatingQR(ticket.id);

      // Wait until QR expires (91+ seconds)
      await new Promise(resolve => setTimeout(resolve, 91000));

      const validation = await qrService.validateQR(qrCode, {
        eventId: TEST_EVENT.id,
        entrance: 'Gate A'
      });

      expect(validation.isValid).toBe(false);
      expect(validation.reason).toContain('expired');
    }, 95000);
  });

  describe('6. Validation Event Logging', () => {
    it('should log all validation metadata', async () => {
      const ticket = await createTestTicket();
      const { qrCode } = await qrService.generateRotatingQR(ticket.id);

      const validationData = {
        eventId: TEST_EVENT.id,
        entrance: 'VIP Gate',
        deviceId: 'scanner-001',
        validatorId: TEST_USERS.VALIDATOR
      };

      await qrService.validateQR(qrCode, validationData);

      const log = await pool.query(
        'SELECT * FROM ticket_validations WHERE ticket_id = $1',
        [ticket.id]
      );

      expect(log.rows).toHaveLength(1);
      const validation = log.rows[0];
      
      expect(validation.event_id).toBe(TEST_EVENT.id);
      expect(validation.entrance).toBe('VIP Gate');
      expect(validation.device_id).toBe('scanner-001');
      expect(validation.validator_id).toBe(TEST_USERS.VALIDATOR);
      expect(validation.validated_at).toBeTruthy();
    });
  });

  describe('7. Entrance Gate Tracking', () => {
    it('should record entrance gate in ticket and validation log', async () => {
      const ticket = await createTestTicket();
      const { qrCode } = await qrService.generateRotatingQR(ticket.id);

      await qrService.validateQR(qrCode, {
        eventId: TEST_EVENT.id,
        entrance: 'North Gate'
      });

      // Check ticket record
      const ticketRecord = await pool.query(
        'SELECT entrance FROM tickets WHERE id = $1',
        [ticket.id]
      );
      expect(ticketRecord.rows[0].entrance).toBe('North Gate');

      // Check validation log
      const validationRecord = await pool.query(
        'SELECT entrance FROM ticket_validations WHERE ticket_id = $1',
        [ticket.id]
      );
      expect(validationRecord.rows[0].entrance).toBe('North Gate');
    });
  });

  describe('8. QR Generation Performance', () => {
    it('should generate QR code in under 2 seconds', async () => {
      const ticket = await createTestTicket();

      const startTime = Date.now();
      await qrService.generateRotatingQR(ticket.id);
      const duration = Date.now() - startTime;

      expect(duration).toBeLessThan(2000);
    });

    it('should handle bulk QR generation efficiently', async () => {
      const tickets = await Promise.all(
        Array(10).fill(null).map(() => createTestTicket())
      );

      const startTime = Date.now();
      await Promise.all(
        tickets.map(ticket => qrService.generateRotatingQR(ticket.id))
      );
      const duration = Date.now() - startTime;

      // 10 QR codes in under 15 seconds
      expect(duration).toBeLessThan(15000);
    });
  });
});
