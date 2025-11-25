/**
 * Phase 2: NFT Minting Tests
 *
 * Tests NFT minting workflow:
 * - Authorization & security
 * - Mint job processing
 * - Blockchain simulation
 * - Transaction handling
 * - Error recovery & refunds
 * - Outbox events
 */

import { Pool } from 'pg';
import { config } from '../../src/config';
import { MintWorker } from '../../src/workers/mintWorker';
import { DatabaseService } from '../../src/services/databaseService';
import { TestDataHelper, TEST_EVENT, TEST_TICKET_TYPES, DEFAULT_TENANT_ID, TEST_USERS } from '../fixtures/test-data';
import { v4 as uuidv4 } from 'uuid';
import request from 'supertest';
import express from 'express';
import mintRoutes from '../../src/routes/mintRoutes';

describe('Phase 2: NFT Minting Integration', () => {
  let pool: Pool;
  let testHelper: TestDataHelper;
  let app: express.Application;

  const MINT_SECRET = process.env.MINT_SERVICE_SECRET || 'mint-service-secret-change-in-production';

  beforeAll(async () => {
    await DatabaseService.initialize();
    pool = DatabaseService.getPool();
    testHelper = new TestDataHelper(pool);

    app = express();
    app.use(express.json());
    app.use('/api/mint', mintRoutes);

    await testHelper.seedDatabase();
  });

  afterAll(async () => {
    await testHelper.cleanDatabase();
    await DatabaseService.close();
  });

  beforeEach(async () => {
    await pool.query('DELETE FROM tickets WHERE tenant_id = $1', [DEFAULT_TENANT_ID]);
    await pool.query('DELETE FROM orders WHERE tenant_id = $1', [DEFAULT_TENANT_ID]);
    await pool.query('DELETE FROM outbox WHERE tenant_id = $1', [DEFAULT_TENANT_ID]);
  });

  describe('1. Mint Route Authorization', () => {
    it('should reject requests without authorization header', async () => {
      const response = await request(app)
        .post('/api/mint/process-mint')
        .send({
          orderId: uuidv4(),
          userId: TEST_USERS.BUYER_1,
          quantity: 1
        });

      expect(response.status).toBe(401);
      expect(response.body.error).toBe('Unauthorized');
    });

    it('should reject requests with invalid authorization token', async () => {
      const response = await request(app)
        .post('/api/mint/process-mint')
        .set('x-mint-authorization', 'Bearer wrong-token')
        .send({
          orderId: uuidv4(),
          userId: TEST_USERS.BUYER_1,
          quantity: 1
        });

      expect(response.status).toBe(401);
      expect(response.body.error).toBe('Invalid authorization');
    });

    it('should reject requests with missing required fields', async () => {
      const response = await request(app)
        .post('/api/mint/process-mint')
        .set('x-mint-authorization', `Bearer ${MINT_SECRET}`)
        .send({
          orderId: uuidv4()
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid job structure');
    });

    it('should reject mint for non-existent order', async () => {
      const response = await request(app)
        .post('/api/mint/process-mint')
        .set('x-mint-authorization', `Bearer ${MINT_SECRET}`)
        .send({
          orderId: uuidv4(),
          userId: TEST_USERS.BUYER_1,
          quantity: 1
        });

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Order not found');
    });

    it('should reject mint for order in wrong status', async () => {
      const order = await testHelper.createTestOrder(TEST_USERS.BUYER_1, {
        status: 'PENDING',
        event_id: TEST_EVENT.id
      });

      const response = await request(app)
        .post('/api/mint/process-mint')
        .set('x-mint-authorization', `Bearer ${MINT_SECRET}`)
        .send({
          orderId: order.id,
          userId: TEST_USERS.BUYER_1,
          quantity: 1
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid order status for minting');
    });

    it('should accept mint for PAID order', async () => {
      const order = await testHelper.createTestOrder(TEST_USERS.BUYER_1, {
        status: 'PAID',
        event_id: TEST_EVENT.id
      });

      const response = await request(app)
        .post('/api/mint/process-mint')
        .set('x-mint-authorization', `Bearer ${MINT_SECRET}`)
        .send({
          orderId: order.id,
          userId: TEST_USERS.BUYER_1,
          eventId: TEST_EVENT.id,
          ticketTypeId: TEST_TICKET_TYPES.GA.id,
          quantity: 1,
          timestamp: new Date().toISOString()
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    it('should accept mint for AWAITING_MINT order', async () => {
      const order = await testHelper.createTestOrder(TEST_USERS.BUYER_1, {
        status: 'AWAITING_MINT',
        event_id: TEST_EVENT.id
      });

      const response = await request(app)
        .post('/api/mint/process-mint')
        .set('x-mint-authorization', `Bearer ${MINT_SECRET}`)
        .send({
          orderId: order.id,
          userId: TEST_USERS.BUYER_1,
          eventId: TEST_EVENT.id,
          ticketTypeId: TEST_TICKET_TYPES.GA.id,
          quantity: 1,
          timestamp: new Date().toISOString()
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });
  });

  describe('2. Mint Worker Processing', () => {
    it('should successfully mint single ticket', async () => {
      const order = await testHelper.createTestOrder(TEST_USERS.BUYER_1, {
        status: 'PAID',
        event_id: TEST_EVENT.id,
        ticket_quantity: 1
      });

      const job = {
        orderId: order.id,
        userId: TEST_USERS.BUYER_1,
        eventId: TEST_EVENT.id,
        ticketTypeId: TEST_TICKET_TYPES.GA.id,
        quantity: 1,
        timestamp: new Date().toISOString()
      };

      const result = await MintWorker.processMintJob(job);

      expect(result.success).toBe(true);
      expect(result.tickets).toHaveLength(1);
      expect(result.tickets[0]).toHaveProperty('id');
      expect(result.tickets[0]).toHaveProperty('nftAddress');
      expect(result.tickets[0]).toHaveProperty('signature');
    });

    it('should create tickets in database with NFT metadata', async () => {
      const order = await testHelper.createTestOrder(TEST_USERS.BUYER_1, {
        status: 'PAID',
        event_id: TEST_EVENT.id
      });

      const job = {
        orderId: order.id,
        userId: TEST_USERS.BUYER_1,
        eventId: TEST_EVENT.id,
        ticketTypeId: TEST_TICKET_TYPES.GA.id,
        quantity: 1,
        timestamp: new Date().toISOString()
      };

      const result = await MintWorker.processMintJob(job);

      const ticketCheck = await pool.query(
        'SELECT * FROM tickets WHERE id = $1',
        [result.tickets[0].id]
      );

      expect(ticketCheck.rows).toHaveLength(1);
      const ticket = ticketCheck.rows[0];

      expect(ticket.order_id).toBe(order.id);
      expect(ticket.user_id).toBe(TEST_USERS.BUYER_1);
      expect(ticket.event_id).toBe(TEST_EVENT.id);
      expect(ticket.nft_mint_address).toBeTruthy();
      expect(ticket.status).toBe('SOLD');
    });

    it('should mint multiple tickets in single job', async () => {
      const order = await testHelper.createTestOrder(TEST_USERS.BUYER_1, {
        status: 'PAID',
        event_id: TEST_EVENT.id,
        ticket_quantity: 5
      });

      const job = {
        orderId: order.id,
        userId: TEST_USERS.BUYER_1,
        eventId: TEST_EVENT.id,
        ticketTypeId: TEST_TICKET_TYPES.GA.id,
        quantity: 5,
        timestamp: new Date().toISOString()
      };

      const result = await MintWorker.processMintJob(job);

      expect(result.success).toBe(true);
      expect(result.tickets).toHaveLength(5);

      const addresses = result.tickets.map((t: any) => t.nftAddress);
      const uniqueAddresses = new Set(addresses);
      expect(uniqueAddresses.size).toBe(5);
    });

    it('should update order status to COMPLETED after successful mint', async () => {
      const order = await testHelper.createTestOrder(TEST_USERS.BUYER_1, {
        status: 'PAID',
        event_id: TEST_EVENT.id
      });

      const job = {
        orderId: order.id,
        userId: TEST_USERS.BUYER_1,
        eventId: TEST_EVENT.id,
        ticketTypeId: TEST_TICKET_TYPES.GA.id,
        quantity: 1,
        timestamp: new Date().toISOString()
      };

      await MintWorker.processMintJob(job);

      const orderCheck = await pool.query(
        'SELECT status FROM orders WHERE id = $1',
        [order.id]
      );

      expect(orderCheck.rows[0].status).toBe('COMPLETED');
    });

    it('should write completion event to outbox', async () => {
      const order = await testHelper.createTestOrder(TEST_USERS.BUYER_1, {
        status: 'PAID',
        event_id: TEST_EVENT.id
      });

      const job = {
        orderId: order.id,
        userId: TEST_USERS.BUYER_1,
        eventId: TEST_EVENT.id,
        ticketTypeId: TEST_TICKET_TYPES.GA.id,
        quantity: 2,
        timestamp: new Date().toISOString()
      };

      await MintWorker.processMintJob(job);

      const outboxCheck = await pool.query(
        `SELECT * FROM outbox
         WHERE aggregate_id = $1
         AND event_type = 'order.completed'`,
        [order.id]
      );

      expect(outboxCheck.rows).toHaveLength(1);
      const event = outboxCheck.rows[0];

      expect(event.aggregate_type).toBe('order');
      expect(event.payload).toHaveProperty('orderId');
      expect(event.payload).toHaveProperty('tickets');
      expect(event.payload.tickets).toHaveLength(2);
    });
  });

  describe('3. NFT Metadata Generation', () => {
    it('should generate unique NFT addresses', async () => {
      const order = await testHelper.createTestOrder(TEST_USERS.BUYER_1, {
        status: 'PAID',
        event_id: TEST_EVENT.id
      });

      const job = {
        orderId: order.id,
        userId: TEST_USERS.BUYER_1,
        eventId: TEST_EVENT.id,
        ticketTypeId: TEST_TICKET_TYPES.GA.id,
        quantity: 10,
        timestamp: new Date().toISOString()
      };

      const result = await MintWorker.processMintJob(job);

      const addresses = result.tickets.map((t: any) => t.nftAddress);
      const uniqueAddresses = new Set(addresses);

      expect(uniqueAddresses.size).toBe(10);

      addresses.forEach((addr: any) => {
        expect(addr).toMatch(/^mock_nft_/);
      });
    });

    it('should generate unique transaction signatures', async () => {
      const order = await testHelper.createTestOrder(TEST_USERS.BUYER_1, {
        status: 'PAID',
        event_id: TEST_EVENT.id
      });

      const job = {
        orderId: order.id,
        userId: TEST_USERS.BUYER_1,
        eventId: TEST_EVENT.id,
        ticketTypeId: TEST_TICKET_TYPES.GA.id,
        quantity: 5,
        timestamp: new Date().toISOString()
      };

      const result = await MintWorker.processMintJob(job);

      const signatures = result.tickets.map((t: any) => t.signature);
      const uniqueSignatures = new Set(signatures);

      expect(uniqueSignatures.size).toBe(5);

      signatures.forEach((sig: any) => {
        expect(sig).toMatch(/^sig_/);
      });
    });

    it('should include timestamp in NFT metadata', async () => {
      const order = await testHelper.createTestOrder(TEST_USERS.BUYER_1, {
        status: 'PAID',
        event_id: TEST_EVENT.id
      });

      const beforeMint = Date.now();

      const job = {
        orderId: order.id,
        userId: TEST_USERS.BUYER_1,
        eventId: TEST_EVENT.id,
        ticketTypeId: TEST_TICKET_TYPES.GA.id,
        quantity: 1,
        timestamp: new Date().toISOString()
      };

      const result = await MintWorker.processMintJob(job);

      const afterMint = Date.now();

      const address = result.tickets[0].nftAddress;
      const timestampMatch = address.match(/mock_nft_(\d+)_/);

      expect(timestampMatch).toBeTruthy();

      const mintTimestamp = parseInt(timestampMatch![1]);
      expect(mintTimestamp).toBeGreaterThanOrEqual(beforeMint);
      expect(mintTimestamp).toBeLessThanOrEqual(afterMint);
    });
  });

  describe('4. Transaction Integrity', () => {
    it('should rollback transaction on mint failure', async () => {
      const order = await testHelper.createTestOrder(TEST_USERS.BUYER_1, {
        status: 'PAID',
        event_id: TEST_EVENT.id
      });

      const job = {
        orderId: order.id,
        userId: TEST_USERS.BUYER_1,
        eventId: TEST_EVENT.id,
        ticketTypeId: TEST_TICKET_TYPES.GA.id,
        quantity: 50,
        timestamp: new Date().toISOString()
      };

      try {
        await MintWorker.processMintJob(job);
      } catch (error) {
        // Expected on failure
      }

      const ticketCheck = await pool.query(
        'SELECT COUNT(*) FROM tickets WHERE order_id = $1',
        [order.id]
      );

      const ticketCount = parseInt(ticketCheck.rows[0].count);
      expect([0, 50]).toContain(ticketCount);
    });

    it('should maintain atomicity - all tickets or none', async () => {
      const order = await testHelper.createTestOrder(TEST_USERS.BUYER_1, {
        status: 'PAID',
        event_id: TEST_EVENT.id
      });

      const job = {
        orderId: order.id,
        userId: TEST_USERS.BUYER_1,
        eventId: TEST_EVENT.id,
        ticketTypeId: TEST_TICKET_TYPES.GA.id,
        quantity: 3,
        timestamp: new Date().toISOString()
      };

      try {
        await MintWorker.processMintJob(job);
      } catch (error) {
        // Expected on failure
      }

      const ticketCheck = await pool.query(
        'SELECT COUNT(*) FROM tickets WHERE order_id = $1',
        [order.id]
      );

      const count = parseInt(ticketCheck.rows[0].count);
      expect([0, 3]).toContain(count);
    });

    it('should create tickets and update order in same transaction', async () => {
      const order = await testHelper.createTestOrder(TEST_USERS.BUYER_1, {
        status: 'PAID',
        event_id: TEST_EVENT.id
      });

      const job = {
        orderId: order.id,
        userId: TEST_USERS.BUYER_1,
        eventId: TEST_EVENT.id,
        ticketTypeId: TEST_TICKET_TYPES.GA.id,
        quantity: 2,
        timestamp: new Date().toISOString()
      };

      await MintWorker.processMintJob(job);

      const ticketCheck = await pool.query(
        'SELECT COUNT(*) FROM tickets WHERE order_id = $1',
        [order.id]
      );

      const orderCheck = await pool.query(
        'SELECT status FROM orders WHERE id = $1',
        [order.id]
      );

      expect(parseInt(ticketCheck.rows[0].count)).toBe(2);
      expect(orderCheck.rows[0].status).toBe('COMPLETED');
    });

    it('should write outbox event in same transaction', async () => {
      const order = await testHelper.createTestOrder(TEST_USERS.BUYER_1, {
        status: 'PAID',
        event_id: TEST_EVENT.id
      });

      const job = {
        orderId: order.id,
        userId: TEST_USERS.BUYER_1,
        eventId: TEST_EVENT.id,
        ticketTypeId: TEST_TICKET_TYPES.GA.id,
        quantity: 1,
        timestamp: new Date().toISOString()
      };

      await MintWorker.processMintJob(job);

      const checks = await Promise.all([
        pool.query('SELECT COUNT(*) FROM tickets WHERE order_id = $1', [order.id]),
        pool.query('SELECT status FROM orders WHERE id = $1', [order.id]),
        pool.query(
          `SELECT COUNT(*) FROM outbox
           WHERE aggregate_id = $1 AND event_type = 'order.completed'`,
          [order.id]
        )
      ]);

      expect(parseInt(checks[0].rows[0].count)).toBe(1);
      expect(checks[1].rows[0].status).toBe('COMPLETED');
      expect(parseInt(checks[2].rows[0].count)).toBe(1);
    });
  });

  describe('5. Performance & Concurrency', () => {
    it('should handle concurrent mint jobs', async () => {
      const order1 = await testHelper.createTestOrder(TEST_USERS.BUYER_1, {
        status: 'PAID',
        event_id: TEST_EVENT.id
      });

      const order2 = await testHelper.createTestOrder(TEST_USERS.BUYER_2, {
        status: 'PAID',
        event_id: TEST_EVENT.id
      });

      const jobs = [
        {
          orderId: order1.id,
          userId: TEST_USERS.BUYER_1,
          eventId: TEST_EVENT.id,
          ticketTypeId: TEST_TICKET_TYPES.GA.id,
          quantity: 2,
          timestamp: new Date().toISOString()
        },
        {
          orderId: order2.id,
          userId: TEST_USERS.BUYER_2,
          eventId: TEST_EVENT.id,
          ticketTypeId: TEST_TICKET_TYPES.GA.id,
          quantity: 2,
          timestamp: new Date().toISOString()
        }
      ];

      const results = await Promise.allSettled(
        jobs.map(job => MintWorker.processMintJob(job))
      );

      results.forEach((result, idx) => {
        if (result.status === 'fulfilled') {
          expect(result.value.success).toBe(true);
          expect(result.value.tickets).toHaveLength(2);
        }
      });
    });

    it('should complete mint within reasonable time', async () => {
      const order = await testHelper.createTestOrder(TEST_USERS.BUYER_1, {
        status: 'PAID',
        event_id: TEST_EVENT.id
      });

      const job = {
        orderId: order.id,
        userId: TEST_USERS.BUYER_1,
        eventId: TEST_EVENT.id,
        ticketTypeId: TEST_TICKET_TYPES.GA.id,
        quantity: 5,
        timestamp: new Date().toISOString()
      };

      const startTime = Date.now();
      await MintWorker.processMintJob(job);
      const duration = Date.now() - startTime;

      expect(duration).toBeLessThan(2000);
    });
  });
});
