import { MintWorker } from '../../src/workers/mintWorker';
import { DatabaseService } from '../../src/services/databaseService';
import { v4 as uuidv4 } from 'uuid';

/**
 * INTEGRATION TESTS FOR MINT WORKER
 * Tests NFT minting workflow, transaction handling, and error recovery
 */

describe('MintWorker Integration Tests', () => {
  let testTenantId: string;
  let testUserId: string;
  let testEventId: string;
  let testVenueId: string;
  let testTicketTypeId: string;
  let testOrderId: string;

  beforeAll(async () => {
    await DatabaseService.initialize();
  });

  beforeEach(async () => {
    testTenantId = uuidv4();
    testUserId = uuidv4();
    testEventId = uuidv4();
    testVenueId = uuidv4();
    testTicketTypeId = uuidv4();
    testOrderId = uuidv4();

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
      [testVenueId, testTenantId, 'Test Venue', `venue-${testVenueId.substring(0, 8)}`, 'venue@test.com', '123 Test St', 'New York', 'NY', 'US', 'theater', 1000, testUserId]
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

    // 6. Create order
    await DatabaseService.query(
      `INSERT INTO orders (id, tenant_id, user_id, event_id, order_number, subtotal_cents,
        platform_fee_cents, processing_fee_cents, total_cents, ticket_quantity, status, currency)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [testOrderId, testTenantId, testUserId, testEventId, `ORD-${Date.now()}`, 10000, 750, 290, 11040, 1, 'PENDING', 'USD']
    );

    // 7. Create order item
    await DatabaseService.query(
      `INSERT INTO order_items (id, tenant_id, order_id, ticket_type_id, quantity, unit_price_cents, total_price_cents)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [uuidv4(), testTenantId, testOrderId, testTicketTypeId, 1, 10000, 10000]
    );
  });

  afterEach(async () => {
    // Cleanup in reverse FK order
    await DatabaseService.query('DELETE FROM outbox WHERE aggregate_id = $1', [testOrderId]);
    await DatabaseService.query('DELETE FROM tickets WHERE tenant_id = $1', [testTenantId]);
    await DatabaseService.query('DELETE FROM order_items WHERE tenant_id = $1', [testTenantId]);
    await DatabaseService.query('DELETE FROM orders WHERE tenant_id = $1', [testTenantId]);
    await DatabaseService.query('DELETE FROM ticket_types WHERE tenant_id = $1', [testTenantId]);
    await DatabaseService.query('DELETE FROM events WHERE tenant_id = $1', [testTenantId]);
    await DatabaseService.query('DELETE FROM venues WHERE tenant_id = $1', [testTenantId]);
    await DatabaseService.query('DELETE FROM users WHERE tenant_id = $1', [testTenantId]);
    await DatabaseService.query('DELETE FROM tenants WHERE id = $1', [testTenantId]);
  });

  afterAll(async () => {
    await DatabaseService.close();
  });

  describe('processMintJob', () => {
    it('should successfully mint single ticket', async () => {
      const job = {
        orderId: testOrderId,
        userId: testUserId,
        eventId: testEventId,
        quantity: 1,
        ticketTypeId: testTicketTypeId,
        tenantId: testTenantId,
        timestamp: new Date().toISOString()
      };

      const result = await MintWorker.processMintJob(job);

      expect(result.success).toBe(true);
      expect(result.tickets).toHaveLength(1);
      expect(result.tickets[0]).toHaveProperty('id');
      expect(result.tickets[0]).toHaveProperty('nftAddress');
      expect(result.tickets[0]).toHaveProperty('signature');
    });

    it('should create ticket with NFT metadata', async () => {
      const job = {
        orderId: testOrderId,
        userId: testUserId,
        eventId: testEventId,
        quantity: 1,
        ticketTypeId: testTicketTypeId,
        tenantId: testTenantId,
        timestamp: new Date().toISOString()
      };

      await MintWorker.processMintJob(job);

      const result = await DatabaseService.query(
        'SELECT * FROM tickets WHERE user_id = $1 AND event_id = $2',
        [testUserId, testEventId]
      );

      expect(result.rows.length).toBe(1);
      const ticket = result.rows[0];

      expect(ticket.is_nft).toBe(true);
      expect(ticket.status).toBe('active');
      expect(ticket.is_transferable).toBe(true);
      expect(ticket.metadata).toBeDefined();

      const metadata = typeof ticket.metadata === 'string'
        ? JSON.parse(ticket.metadata)
        : ticket.metadata;

      expect(metadata).toHaveProperty('nft_mint_address');
      expect(metadata).toHaveProperty('nft_transaction_hash');
      expect(metadata).toHaveProperty('minted_at');
      expect(metadata.order_id).toBe(testOrderId);
    });

    it('should mint multiple tickets', async () => {
      const job = {
        orderId: testOrderId,
        userId: testUserId,
        eventId: testEventId,
        quantity: 3,
        ticketTypeId: testTicketTypeId,
        tenantId: testTenantId,
        timestamp: new Date().toISOString()
      };

      const result = await MintWorker.processMintJob(job);

      expect(result.success).toBe(true);
      expect(result.tickets).toHaveLength(3);

      const ticketResult = await DatabaseService.query(
        'SELECT * FROM tickets WHERE user_id = $1 AND event_id = $2',
        [testUserId, testEventId]
      );

      expect(ticketResult.rows.length).toBe(3);
    });

    it('should generate unique ticket numbers for each ticket', async () => {
      const job = {
        orderId: testOrderId,
        userId: testUserId,
        eventId: testEventId,
        quantity: 5,
        ticketTypeId: testTicketTypeId,
        tenantId: testTenantId,
        timestamp: new Date().toISOString()
      };

      await MintWorker.processMintJob(job);

      const result = await DatabaseService.query(
        'SELECT ticket_number FROM tickets WHERE user_id = $1',
        [testUserId]
      );

      const ticketNumbers = result.rows.map(row => row.ticket_number);
      const uniqueNumbers = new Set(ticketNumbers);

      expect(uniqueNumbers.size).toBe(5);
      ticketNumbers.forEach(num => {
        expect(num).toMatch(/^TKT-/);
      });
    });

    it('should generate unique QR codes for each ticket', async () => {
      const job = {
        orderId: testOrderId,
        userId: testUserId,
        eventId: testEventId,
        quantity: 5,
        ticketTypeId: testTicketTypeId,
        tenantId: testTenantId,
        timestamp: new Date().toISOString()
      };

      await MintWorker.processMintJob(job);

      const result = await DatabaseService.query(
        'SELECT qr_code FROM tickets WHERE user_id = $1',
        [testUserId]
      );

      const qrCodes = result.rows.map(row => row.qr_code);
      const uniqueCodes = new Set(qrCodes);

      expect(uniqueCodes.size).toBe(5);
      qrCodes.forEach(code => {
        expect(code).toMatch(/^QR-TKT-/);
      });
    });

    it('should update order status to COMPLETED', async () => {
      const job = {
        orderId: testOrderId,
        userId: testUserId,
        eventId: testEventId,
        quantity: 1,
        ticketTypeId: testTicketTypeId,
        tenantId: testTenantId,
        timestamp: new Date().toISOString()
      };

      await MintWorker.processMintJob(job);

      const result = await DatabaseService.query(
        'SELECT status FROM orders WHERE id = $1',
        [testOrderId]
      );

      expect(result.rows[0].status).toBe('COMPLETED');
    });

    it('should create outbox event for completed order', async () => {
      const job = {
        orderId: testOrderId,
        userId: testUserId,
        eventId: testEventId,
        quantity: 2,
        ticketTypeId: testTicketTypeId,
        tenantId: testTenantId,
        timestamp: new Date().toISOString()
      };

      await MintWorker.processMintJob(job);

      const result = await DatabaseService.query(
        `SELECT * FROM outbox WHERE aggregate_id = $1 AND event_type = 'order.completed'`,
        [testOrderId]
      );

      expect(result.rows.length).toBe(1);

      const outboxPayload = typeof result.rows[0].payload === 'string'
        ? JSON.parse(result.rows[0].payload)
        : result.rows[0].payload;

      expect(outboxPayload.orderId).toBe(testOrderId);
      expect(outboxPayload.tickets).toHaveLength(2);
    });

    it('should use order data when job parameters missing', async () => {
      const job = {
        orderId: testOrderId,
        userId: testUserId,
        eventId: testEventId,
        quantity: 1,
        timestamp: new Date().toISOString()
      };

      const result = await MintWorker.processMintJob(job);

      expect(result.success).toBe(true);
      expect(result.tickets).toHaveLength(1);
    });
  });

  describe('error handling', () => {
    it('should rollback on failure', async () => {
      const fakeOrderId = uuidv4();
      const job = {
        orderId: fakeOrderId,
        userId: testUserId,
        eventId: testEventId,
        quantity: 1,
        ticketTypeId: testTicketTypeId,
        tenantId: testTenantId,
        timestamp: new Date().toISOString()
      };

      await expect(MintWorker.processMintJob(job)).rejects.toThrow('Order not found');

      const result = await DatabaseService.query(
        'SELECT * FROM tickets WHERE user_id = $1',
        [testUserId]
      );

      expect(result.rows.length).toBe(0);
    });

    it('should handle missing ticket type', async () => {
      const orphanOrderId = uuidv4();
      await DatabaseService.query(
        `INSERT INTO orders (id, tenant_id, user_id, event_id, order_number, subtotal_cents,
          platform_fee_cents, processing_fee_cents, total_cents, ticket_quantity, status, currency)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [orphanOrderId, testTenantId, testUserId, testEventId, `ORD-${Date.now()}-orphan`, 10000, 750, 290, 11040, 1, 'PENDING', 'USD']
      );

      const job = {
        orderId: orphanOrderId,
        userId: testUserId,
        eventId: testEventId,
        quantity: 1,
        timestamp: new Date().toISOString()
      };

      await expect(MintWorker.processMintJob(job)).rejects.toThrow('No ticket type found');

      await DatabaseService.query('DELETE FROM orders WHERE id = $1', [orphanOrderId]);
    });
  });

  describe('transaction integrity', () => {
    it('should be atomic - all tickets or none', async () => {
      const job = {
        orderId: testOrderId,
        userId: testUserId,
        eventId: testEventId,
        quantity: 5,
        ticketTypeId: testTicketTypeId,
        tenantId: testTenantId,
        timestamp: new Date().toISOString()
      };

      await MintWorker.processMintJob(job);

      const result = await DatabaseService.query(
        'SELECT COUNT(*) as count FROM tickets WHERE user_id = $1',
        [testUserId]
      );

      const count = parseInt(result.rows[0].count);
      expect(count === 0 || count === 5).toBe(true);
    });
  });

  describe('NFT minting', () => {
    it('should generate unique NFT addresses', async () => {
      const job = {
        orderId: testOrderId,
        userId: testUserId,
        eventId: testEventId,
        quantity: 10,
        ticketTypeId: testTicketTypeId,
        tenantId: testTenantId,
        timestamp: new Date().toISOString()
      };

      const result = await MintWorker.processMintJob(job);

      const addresses = result.tickets.map(t => t.nftAddress);
      const uniqueAddresses = new Set(addresses);

      expect(uniqueAddresses.size).toBe(10);
    });

    it('should generate transaction signatures', async () => {
      const job = {
        orderId: testOrderId,
        userId: testUserId,
        eventId: testEventId,
        quantity: 1,
        ticketTypeId: testTicketTypeId,
        tenantId: testTenantId,
        timestamp: new Date().toISOString()
      };

      const result = await MintWorker.processMintJob(job);

      expect(result.tickets[0].signature).toBeDefined();
      expect(result.tickets[0].signature).toMatch(/^sig_/);
    });

    it('should include NFT metadata in ticket', async () => {
      const job = {
        orderId: testOrderId,
        userId: testUserId,
        eventId: testEventId,
        quantity: 1,
        ticketTypeId: testTicketTypeId,
        tenantId: testTenantId,
        timestamp: new Date().toISOString()
      };

      const result = await MintWorker.processMintJob(job);

      const ticketResult = await DatabaseService.query(
        'SELECT metadata FROM tickets WHERE id = $1',
        [result.tickets[0].id]
      );

      const metadata = typeof ticketResult.rows[0].metadata === 'string'
        ? JSON.parse(ticketResult.rows[0].metadata)
        : ticketResult.rows[0].metadata;

      expect(metadata.nft_mint_address).toBe(result.tickets[0].nftAddress);
      expect(metadata.nft_transaction_hash).toBe(result.tickets[0].signature);
      expect(metadata.minted_at).toBeDefined();
    });
  });

  describe('data consistency', () => {
    it('should set correct ticket properties', async () => {
      const job = {
        orderId: testOrderId,
        userId: testUserId,
        eventId: testEventId,
        quantity: 1,
        ticketTypeId: testTicketTypeId,
        tenantId: testTenantId,
        timestamp: new Date().toISOString()
      };

      await MintWorker.processMintJob(job);

      const result = await DatabaseService.query(
        'SELECT * FROM tickets WHERE user_id = $1',
        [testUserId]
      );

      const ticket = result.rows[0];
      expect(ticket.tenant_id).toBe(testTenantId);
      expect(ticket.user_id).toBe(testUserId);
      expect(ticket.event_id).toBe(testEventId);
      expect(ticket.ticket_type_id).toBe(testTicketTypeId);
      expect(ticket.status).toBe('active');
      expect(ticket.is_nft).toBe(true);
      expect(ticket.is_transferable).toBe(true);
      expect(ticket.transfer_count).toBe(0);
    });

    it('should set purchased_at timestamp', async () => {
      const job = {
        orderId: testOrderId,
        userId: testUserId,
        eventId: testEventId,
        quantity: 1,
        ticketTypeId: testTicketTypeId,
        tenantId: testTenantId,
        timestamp: new Date().toISOString()
      };

      await MintWorker.processMintJob(job);

      const result = await DatabaseService.query(
        'SELECT purchased_at FROM tickets WHERE user_id = $1',
        [testUserId]
      );

      expect(result.rows[0].purchased_at).toBeDefined();
      expect(new Date(result.rows[0].purchased_at)).toBeInstanceOf(Date);
    });
  });

  describe('edge cases', () => {
    it('should handle zero quantity jobs', async () => {
      const job = {
        orderId: testOrderId,
        userId: testUserId,
        eventId: testEventId,
        quantity: 0,
        ticketTypeId: testTicketTypeId,
        tenantId: testTenantId,
        timestamp: new Date().toISOString()
      };

      const result = await MintWorker.processMintJob(job);

      expect(result.tickets).toHaveLength(0);
    });

    it('should handle large batch minting', async () => {
      const job = {
        orderId: testOrderId,
        userId: testUserId,
        eventId: testEventId,
        quantity: 50,
        ticketTypeId: testTicketTypeId,
        tenantId: testTenantId,
        timestamp: new Date().toISOString()
      };

      const result = await MintWorker.processMintJob(job);

      expect(result.success).toBe(true);
      expect(result.tickets).toHaveLength(50);

      const dbResult = await DatabaseService.query(
        'SELECT COUNT(*) as count FROM tickets WHERE user_id = $1',
        [testUserId]
      );

      expect(parseInt(dbResult.rows[0].count)).toBe(50);
    });
  });
});
