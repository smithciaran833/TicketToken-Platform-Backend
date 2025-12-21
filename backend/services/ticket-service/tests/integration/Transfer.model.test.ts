import { DatabaseService } from '../../src/services/databaseService';
import { TransferModel, ITransfer } from '../../src/models/Transfer';
import { v4 as uuidv4 } from 'uuid';

describe('Transfer Model Integration Tests', () => {
  let transferModel: TransferModel;
  let testTenantId: string;
  let testFromUserId: string;
  let testToUserId: string;
  let testVenueId: string;
  let testEventId: string;
  let testTicketTypeId: string;
  let testTicketId: string;

  beforeAll(async () => {
    await DatabaseService.initialize();
    transferModel = new TransferModel((DatabaseService as any).pool);
  });

  beforeEach(async () => {
    testTenantId = uuidv4();
    testFromUserId = uuidv4();
    testToUserId = uuidv4();
    testVenueId = uuidv4();
    testEventId = uuidv4();
    testTicketTypeId = uuidv4();
    testTicketId = uuidv4();

    // 1. Create tenant
    await DatabaseService.query(
      'INSERT INTO tenants (id, name, slug) VALUES ($1, $2, $3)',
      [testTenantId, 'Test Tenant', `test-${testTenantId}`]
    );

    // 2. Create users
    await DatabaseService.query(
      `INSERT INTO users (id, email, password_hash, email_verified, status, role, tenant_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [testFromUserId, `from-${testFromUserId}@test.com`, '$2b$10$hash', true, 'ACTIVE', 'user', testTenantId]
    );

    await DatabaseService.query(
      `INSERT INTO users (id, email, password_hash, email_verified, status, role, tenant_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [testToUserId, `to-${testToUserId}@test.com`, '$2b$10$hash', true, 'ACTIVE', 'user', testTenantId]
    );

    // 3. Create venue
    await DatabaseService.query(
      `INSERT INTO venues (id, tenant_id, name, slug, email, address_line1, city, state_province, country_code, venue_type, max_capacity, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [testVenueId, testTenantId, 'Test Venue', `venue-${testVenueId}`, 'venue@test.com', '123 St', 'City', 'State', 'US', 'theater', 1000, testFromUserId]
    );

    // 4. Create event
    await DatabaseService.query(
      `INSERT INTO events (id, tenant_id, venue_id, name, slug, status, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [testEventId, testTenantId, testVenueId, 'Test Event', `event-${testEventId}`, 'PUBLISHED', testFromUserId]
    );

    // 5. Create ticket type
    await DatabaseService.query(
      `INSERT INTO ticket_types (id, tenant_id, event_id, name, price, quantity, available_quantity, sale_start, sale_end)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW() + INTERVAL '30 days')`,
      [testTicketTypeId, testTenantId, testEventId, 'GA', 50.00, 100, 100]
    );

    // 6. Create ticket
    await DatabaseService.query(
      `INSERT INTO tickets (id, tenant_id, event_id, ticket_type_id, user_id, ticket_number, qr_code, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [testTicketId, testTenantId, testEventId, testTicketTypeId, testFromUserId, `TKT-${Date.now()}`, `QR-${uuidv4()}`, 'active']
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

  describe('create', () => {
    it('should create a transfer with required fields', async () => {
      const transferData: ITransfer = {
        tenant_id: testTenantId,
        ticket_id: testTicketId,
        from_user_id: testFromUserId,
        to_email: 'recipient@test.com',
        transfer_method: 'email',
        is_gift: true,
        status: 'pending',
        expires_at: new Date(Date.now() + 86400000)
      };

      const result = await transferModel.create(transferData);

      expect(result).toBeDefined();
      expect(result.id).toBeDefined();
      expect(result.tenant_id).toBe(testTenantId);
      expect(result.ticket_id).toBe(testTicketId);
      expect(result.from_user_id).toBe(testFromUserId);
      expect(result.to_email).toBe('recipient@test.com');
      expect(result.transfer_method).toBe('email');
      expect(result.is_gift).toBe(true);
      expect(result.status).toBe('pending');
    });

    it('should auto-generate acceptance_code', async () => {
      const transferData: ITransfer = {
        tenant_id: testTenantId,
        ticket_id: testTicketId,
        to_email: 'recipient@test.com',
        transfer_method: 'email',
        is_gift: true,
        status: 'pending',
        expires_at: new Date(Date.now() + 86400000)
      };

      const result = await transferModel.create(transferData);

      expect(result.acceptance_code).toBeDefined();
      expect(result.acceptance_code!.length).toBeGreaterThan(0);
    });

    it('should auto-generate transfer_code', async () => {
      const transferData: ITransfer = {
        tenant_id: testTenantId,
        ticket_id: testTicketId,
        to_email: 'recipient@test.com',
        transfer_method: 'email',
        is_gift: true,
        status: 'pending',
        expires_at: new Date(Date.now() + 86400000)
      };

      const result = await transferModel.create(transferData);

      expect(result.transfer_code).toBeDefined();
      expect(result.transfer_code).toMatch(/^TRF-/);
    });

    it('should use provided transfer_code', async () => {
      const customCode = `CUSTOM-${uuidv4()}`;
      const transferData: ITransfer = {
        tenant_id: testTenantId,
        ticket_id: testTicketId,
        to_email: 'recipient@test.com',
        transfer_method: 'email',
        transfer_code: customCode,
        is_gift: true,
        status: 'pending',
        expires_at: new Date(Date.now() + 86400000)
      };

      const result = await transferModel.create(transferData);

      expect(result.transfer_code).toBe(customCode);
    });

    it('should create paid transfer with price_cents', async () => {
      const transferData: ITransfer = {
        tenant_id: testTenantId,
        ticket_id: testTicketId,
        to_email: 'buyer@test.com',
        transfer_method: 'email',
        is_gift: false,
        price_cents: 5000,
        currency: 'USD',
        status: 'pending',
        expires_at: new Date(Date.now() + 86400000)
      };

      const result = await transferModel.create(transferData);

      expect(result.is_gift).toBe(false);
      expect(result.price_cents).toBe(5000);
      expect(result.currency).toBe('USD');
    });

    it('should default currency to USD', async () => {
      const transferData: ITransfer = {
        tenant_id: testTenantId,
        ticket_id: testTicketId,
        to_email: 'recipient@test.com',
        transfer_method: 'email',
        is_gift: true,
        status: 'pending',
        expires_at: new Date(Date.now() + 86400000)
      };

      const result = await transferModel.create(transferData);

      expect(result.currency).toBe('USD');
    });

    it('should store message and notes', async () => {
      const transferData: ITransfer = {
        tenant_id: testTenantId,
        ticket_id: testTicketId,
        to_email: 'recipient@test.com',
        transfer_method: 'email',
        is_gift: true,
        message: 'Enjoy the show!',
        notes: 'Internal note',
        status: 'pending',
        expires_at: new Date(Date.now() + 86400000)
      };

      const result = await transferModel.create(transferData);

      expect(result.message).toBe('Enjoy the show!');
      expect(result.notes).toBe('Internal note');
    });

    it('should store transfer_type', async () => {
      const transferData: ITransfer = {
        tenant_id: testTenantId,
        ticket_id: testTicketId,
        to_email: 'recipient@test.com',
        transfer_method: 'email',
        transfer_type: 'gift',
        is_gift: true,
        status: 'pending',
        expires_at: new Date(Date.now() + 86400000)
      };

      const result = await transferModel.create(transferData);

      expect(result.transfer_type).toBe('gift');
    });

    it('should set created_at timestamp', async () => {
      const transferData: ITransfer = {
        tenant_id: testTenantId,
        ticket_id: testTicketId,
        to_email: 'recipient@test.com',
        transfer_method: 'email',
        is_gift: true,
        status: 'pending',
        expires_at: new Date(Date.now() + 86400000)
      };

      const result = await transferModel.create(transferData);

      expect(result.created_at).toBeDefined();
    });
  });

  describe('findById', () => {
    let testTransfer: ITransfer;

    beforeEach(async () => {
      testTransfer = await transferModel.create({
        tenant_id: testTenantId,
        ticket_id: testTicketId,
        from_user_id: testFromUserId,
        to_email: 'recipient@test.com',
        transfer_method: 'email',
        is_gift: true,
        status: 'pending',
        expires_at: new Date(Date.now() + 86400000)
      });
    });

    it('should find transfer by ID', async () => {
      const result = await transferModel.findById(testTransfer.id!);

      expect(result).toBeDefined();
      expect(result?.id).toBe(testTransfer.id);
      expect(result?.ticket_id).toBe(testTicketId);
    });

    it('should return null for non-existent ID', async () => {
      const result = await transferModel.findById(uuidv4());

      expect(result).toBeNull();
    });

    it('should return all transfer fields', async () => {
      const result = await transferModel.findById(testTransfer.id!);

      expect(result).toHaveProperty('id');
      expect(result).toHaveProperty('tenant_id');
      expect(result).toHaveProperty('ticket_id');
      expect(result).toHaveProperty('from_user_id');
      expect(result).toHaveProperty('to_email');
      expect(result).toHaveProperty('transfer_code');
      expect(result).toHaveProperty('transfer_method');
      expect(result).toHaveProperty('status');
      expect(result).toHaveProperty('acceptance_code');
      expect(result).toHaveProperty('is_gift');
      expect(result).toHaveProperty('expires_at');
      expect(result).toHaveProperty('created_at');
    });
  });

  describe('findByTransferCode', () => {
    let testTransfer: ITransfer;

    beforeEach(async () => {
      testTransfer = await transferModel.create({
        tenant_id: testTenantId,
        ticket_id: testTicketId,
        to_email: 'recipient@test.com',
        transfer_method: 'email',
        is_gift: true,
        status: 'pending',
        expires_at: new Date(Date.now() + 86400000)
      });
    });

    it('should find transfer by transfer code', async () => {
      const result = await transferModel.findByTransferCode(testTransfer.transfer_code!);

      expect(result).toBeDefined();
      expect(result?.id).toBe(testTransfer.id);
    });

    it('should return null for non-existent code', async () => {
      const result = await transferModel.findByTransferCode('NON-EXISTENT');

      expect(result).toBeNull();
    });

    it('should return null for empty code', async () => {
      const result = await transferModel.findByTransferCode('');

      expect(result).toBeNull();
    });
  });

  describe('findByAcceptanceCode', () => {
    let testTransfer: ITransfer;

    beforeEach(async () => {
      testTransfer = await transferModel.create({
        tenant_id: testTenantId,
        ticket_id: testTicketId,
        to_email: 'recipient@test.com',
        transfer_method: 'email',
        is_gift: true,
        status: 'pending',
        expires_at: new Date(Date.now() + 86400000)
      });
    });

    it('should find transfer by acceptance code', async () => {
      const result = await transferModel.findByAcceptanceCode(testTransfer.acceptance_code!);

      expect(result).toBeDefined();
      expect(result?.id).toBe(testTransfer.id);
    });

    it('should return null for non-existent code', async () => {
      const result = await transferModel.findByAcceptanceCode('INVALID');

      expect(result).toBeNull();
    });
  });

  describe('findByTicketId', () => {
    beforeEach(async () => {
      await transferModel.create({
        tenant_id: testTenantId,
        ticket_id: testTicketId,
        to_email: 'first@test.com',
        transfer_method: 'email',
        is_gift: true,
        status: 'completed',
        expires_at: new Date(Date.now() + 86400000)
      });

      await transferModel.create({
        tenant_id: testTenantId,
        ticket_id: testTicketId,
        to_email: 'second@test.com',
        transfer_method: 'email',
        is_gift: true,
        status: 'pending',
        expires_at: new Date(Date.now() + 86400000)
      });
    });

    it('should find all transfers for ticket', async () => {
      const result = await transferModel.findByTicketId(testTicketId);

      expect(result.length).toBe(2);
    });

    it('should order by created_at DESC', async () => {
      const result = await transferModel.findByTicketId(testTicketId);

      expect(result[0].to_email).toBe('second@test.com');
      expect(result[1].to_email).toBe('first@test.com');
    });

    it('should return empty array for ticket with no transfers', async () => {
      const result = await transferModel.findByTicketId(uuidv4());

      expect(result).toEqual([]);
    });
  });

  describe('findByFromUserId', () => {
    beforeEach(async () => {
      await transferModel.create({
        tenant_id: testTenantId,
        ticket_id: testTicketId,
        from_user_id: testFromUserId,
        to_email: 'recipient@test.com',
        transfer_method: 'email',
        is_gift: true,
        status: 'pending',
        expires_at: new Date(Date.now() + 86400000)
      });
    });

    it('should find transfers by from_user_id', async () => {
      const result = await transferModel.findByFromUserId(testFromUserId);

      expect(result.length).toBe(1);
      expect(result[0].from_user_id).toBe(testFromUserId);
    });

    it('should return empty array for user with no outgoing transfers', async () => {
      const result = await transferModel.findByFromUserId(uuidv4());

      expect(result).toEqual([]);
    });
  });

  describe('findByToEmail', () => {
    const recipientEmail = 'specific-recipient@test.com';

    beforeEach(async () => {
      await transferModel.create({
        tenant_id: testTenantId,
        ticket_id: testTicketId,
        to_email: recipientEmail,
        transfer_method: 'email',
        is_gift: true,
        status: 'pending',
        expires_at: new Date(Date.now() + 86400000)
      });
    });

    it('should find transfers by to_email', async () => {
      const result = await transferModel.findByToEmail(recipientEmail);

      expect(result.length).toBe(1);
      expect(result[0].to_email).toBe(recipientEmail);
    });

    it('should return empty array for email with no transfers', async () => {
      const result = await transferModel.findByToEmail('nobody@test.com');

      expect(result).toEqual([]);
    });
  });

  describe('accept', () => {
    let testTransfer: ITransfer;

    beforeEach(async () => {
      testTransfer = await transferModel.create({
        tenant_id: testTenantId,
        ticket_id: testTicketId,
        from_user_id: testFromUserId,
        to_email: 'recipient@test.com',
        transfer_method: 'email',
        is_gift: true,
        status: 'pending',
        expires_at: new Date(Date.now() + 86400000)
      });
    });

    it('should accept transfer and set to_user_id', async () => {
      const result = await transferModel.accept(testTransfer.id!, testToUserId);

      expect(result).toBeDefined();
      expect(result?.status).toBe('accepted');
      expect(result?.to_user_id).toBe(testToUserId);
      expect(result?.accepted_at).toBeDefined();
    });

    it('should set accepted_at timestamp', async () => {
      const before = new Date();
      const result = await transferModel.accept(testTransfer.id!, testToUserId);
      const after = new Date();

      expect(result?.accepted_at).toBeDefined();
      const acceptedAt = new Date(result!.accepted_at!);
      expect(acceptedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(acceptedAt.getTime()).toBeLessThanOrEqual(after.getTime());
    });

    it('should return null for non-existent ID', async () => {
      const result = await transferModel.accept(uuidv4(), testToUserId);

      expect(result).toBeNull();
    });
  });

  describe('complete', () => {
    let testTransfer: ITransfer;

    beforeEach(async () => {
      testTransfer = await transferModel.create({
        tenant_id: testTenantId,
        ticket_id: testTicketId,
        to_email: 'recipient@test.com',
        transfer_method: 'email',
        is_gift: true,
        status: 'accepted',
        expires_at: new Date(Date.now() + 86400000)
      });
    });

    it('should complete transfer', async () => {
      const result = await transferModel.complete(testTransfer.id!);

      expect(result).toBeDefined();
      expect(result?.status).toBe('completed');
      expect(result?.transferred_at).toBeDefined();
    });

    it('should set transferred_at timestamp', async () => {
      const result = await transferModel.complete(testTransfer.id!);

      expect(result?.transferred_at).toBeDefined();
    });

    it('should return null for non-existent ID', async () => {
      const result = await transferModel.complete(uuidv4());

      expect(result).toBeNull();
    });
  });

  describe('cancel', () => {
    let testTransfer: ITransfer;

    beforeEach(async () => {
      testTransfer = await transferModel.create({
        tenant_id: testTenantId,
        ticket_id: testTicketId,
        to_email: 'recipient@test.com',
        transfer_method: 'email',
        is_gift: true,
        status: 'pending',
        expires_at: new Date(Date.now() + 86400000)
      });
    });

    it('should cancel transfer', async () => {
      const result = await transferModel.cancel(testTransfer.id!);

      expect(result).toBeDefined();
      expect(result?.status).toBe('cancelled');
      expect(result?.cancelled_at).toBeDefined();
    });

    it('should store cancellation reason', async () => {
      const reason = 'Changed my mind';
      const result = await transferModel.cancel(testTransfer.id!, reason);

      expect(result?.cancellation_reason).toBe(reason);
    });

    it('should return null for non-existent ID', async () => {
      const result = await transferModel.cancel(uuidv4());

      expect(result).toBeNull();
    });
  });

  describe('reject', () => {
    let testTransfer: ITransfer;

    beforeEach(async () => {
      testTransfer = await transferModel.create({
        tenant_id: testTenantId,
        ticket_id: testTicketId,
        to_email: 'recipient@test.com',
        transfer_method: 'email',
        is_gift: true,
        status: 'pending',
        expires_at: new Date(Date.now() + 86400000)
      });
    });

    it('should reject transfer', async () => {
      const result = await transferModel.reject(testTransfer.id!);

      expect(result).toBeDefined();
      expect(result?.status).toBe('rejected');
    });

    it('should return null for non-existent ID', async () => {
      const result = await transferModel.reject(uuidv4());

      expect(result).toBeNull();
    });
  });

  describe('expire', () => {
    let testTransfer: ITransfer;

    beforeEach(async () => {
      testTransfer = await transferModel.create({
        tenant_id: testTenantId,
        ticket_id: testTicketId,
        to_email: 'recipient@test.com',
        transfer_method: 'email',
        is_gift: true,
        status: 'pending',
        expires_at: new Date(Date.now() + 86400000)
      });
    });

    it('should expire transfer', async () => {
      const result = await transferModel.expire(testTransfer.id!);

      expect(result).toBeDefined();
      expect(result?.status).toBe('expired');
    });

    it('should return null for non-existent ID', async () => {
      const result = await transferModel.expire(uuidv4());

      expect(result).toBeNull();
    });
  });

  describe('delete', () => {
    let testTransfer: ITransfer;

    beforeEach(async () => {
      testTransfer = await transferModel.create({
        tenant_id: testTenantId,
        ticket_id: testTicketId,
        to_email: 'recipient@test.com',
        transfer_method: 'email',
        is_gift: true,
        status: 'pending',
        expires_at: new Date(Date.now() + 86400000)
      });
    });

    it('should delete transfer', async () => {
      const result = await transferModel.delete(testTransfer.id!);

      expect(result).toBe(true);

      const found = await transferModel.findById(testTransfer.id!);
      expect(found).toBeNull();
    });

    it('should return false for non-existent ID', async () => {
      const result = await transferModel.delete(uuidv4());

      expect(result).toBe(false);
    });
  });

  describe('Status workflows', () => {
    it('should transition pending -> accepted -> completed', async () => {
      const transfer = await transferModel.create({
        tenant_id: testTenantId,
        ticket_id: testTicketId,
        to_email: 'recipient@test.com',
        transfer_method: 'email',
        is_gift: true,
        status: 'pending',
        expires_at: new Date(Date.now() + 86400000)
      });

      expect(transfer.status).toBe('pending');

      const accepted = await transferModel.accept(transfer.id!, testToUserId);
      expect(accepted?.status).toBe('accepted');

      const completed = await transferModel.complete(transfer.id!);
      expect(completed?.status).toBe('completed');
    });

    it('should transition pending -> rejected', async () => {
      const transfer = await transferModel.create({
        tenant_id: testTenantId,
        ticket_id: testTicketId,
        to_email: 'recipient@test.com',
        transfer_method: 'email',
        is_gift: true,
        status: 'pending',
        expires_at: new Date(Date.now() + 86400000)
      });

      const rejected = await transferModel.reject(transfer.id!);
      expect(rejected?.status).toBe('rejected');
    });

    it('should transition pending -> cancelled', async () => {
      const transfer = await transferModel.create({
        tenant_id: testTenantId,
        ticket_id: testTicketId,
        to_email: 'recipient@test.com',
        transfer_method: 'email',
        is_gift: true,
        status: 'pending',
        expires_at: new Date(Date.now() + 86400000)
      });

      const cancelled = await transferModel.cancel(transfer.id!, 'User requested');
      expect(cancelled?.status).toBe('cancelled');
      expect(cancelled?.cancellation_reason).toBe('User requested');
    });

    it('should transition pending -> expired', async () => {
      const transfer = await transferModel.create({
        tenant_id: testTenantId,
        ticket_id: testTicketId,
        to_email: 'recipient@test.com',
        transfer_method: 'email',
        is_gift: true,
        status: 'pending',
        expires_at: new Date(Date.now() + 86400000)
      });

      const expired = await transferModel.expire(transfer.id!);
      expect(expired?.status).toBe('expired');
    });
  });

  describe('Edge cases', () => {
    it('should handle transfer without from_user_id', async () => {
      const transfer = await transferModel.create({
        tenant_id: testTenantId,
        ticket_id: testTicketId,
        to_email: 'recipient@test.com',
        transfer_method: 'email',
        is_gift: true,
        status: 'pending',
        expires_at: new Date(Date.now() + 86400000)
      });

      expect(transfer.from_user_id).toBeNull();
    });

    it('should handle transfer with to_user_id set at creation', async () => {
      const transfer = await transferModel.create({
        tenant_id: testTenantId,
        ticket_id: testTicketId,
        from_user_id: testFromUserId,
        to_user_id: testToUserId,
        to_email: 'recipient@test.com',
        transfer_method: 'email',
        is_gift: true,
        status: 'pending',
        expires_at: new Date(Date.now() + 86400000)
      });

      expect(transfer.to_user_id).toBe(testToUserId);
    });

    it('should handle different transfer methods', async () => {
      const methods = ['email', 'sms', 'link', 'qr'];

      for (const method of methods) {
        const transfer = await transferModel.create({
          tenant_id: testTenantId,
          ticket_id: testTicketId,
          to_email: `${method}@test.com`,
          transfer_method: method,
          is_gift: true,
          status: 'pending',
          expires_at: new Date(Date.now() + 86400000)
        });

        expect(transfer.transfer_method).toBe(method);
      }
    });

    it('should handle zero price_cents for gift', async () => {
      const transfer = await transferModel.create({
        tenant_id: testTenantId,
        ticket_id: testTicketId,
        to_email: 'recipient@test.com',
        transfer_method: 'email',
        is_gift: true,
        price_cents: 0,
        status: 'pending',
        expires_at: new Date(Date.now() + 86400000)
      });

      expect(transfer.price_cents).toBe(0);
    });
  });
});
