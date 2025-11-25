import { Pool } from 'pg';
import axios from 'axios';
import {
  TestDataHelper,
  DEFAULT_TENANT_ID,
  TEST_USERS,
  TEST_EVENT,
  createTestJWT,
} from '../fixtures/test-data';

/**
 * Transfer System - Complete Integration Tests
 * 
 * Tests based on actual transferService.ts implementation
 */
describe('Transfer System - End to End', () => {
  let pool: Pool;
  let testHelper: TestDataHelper;
  let buyer1Token: string;
  let buyer2Token: string;

  const API_BASE = 'http://localhost:3004';

  beforeAll(async () => {
    pool = new Pool({
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432'),
      database: process.env.DB_NAME || 'tickettoken_db',
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || 'postgres',
    });

    testHelper = new TestDataHelper(pool);
    await testHelper.seedDatabase();

    buyer1Token = createTestJWT(TEST_USERS.BUYER_1, 'user');
    buyer2Token = createTestJWT(TEST_USERS.BUYER_2, 'user');

    console.log('✅ Test setup complete');
  });

  afterAll(async () => {
    await testHelper.cleanDatabase();
    await pool.end();
    console.log('✅ Test teardown complete');
  });

  describe('validateTransferRequest - Pre-transfer Validation', () => {
    
    it('should reject transfer to yourself', async () => {
      const ticket = await testHelper.createTestTicket(TEST_USERS.BUYER_1);

      const response = await axios.post(
        `${API_BASE}/api/v1/transfer/validate`,
        {
          ticketId: ticket.id,
          toUserId: TEST_USERS.BUYER_1,
        },
        {
          headers: {
            Authorization: `Bearer ${buyer1Token}`,
            'x-tenant-id': DEFAULT_TENANT_ID,
          },
          validateStatus: () => true,
        }
      );

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(false);
      expect(response.data.data.valid).toBe(false);
      expect(response.data.data.reason).toContain('Cannot transfer ticket to yourself');
    });

    it('should pass validation when all conditions met', async () => {
      const ticket = await testHelper.createTestTicket(TEST_USERS.BUYER_1);

      await pool.query(
        `INSERT INTO users (id, email, password_hash, status, can_receive_transfers, email_verified)
 VALUES ($1, 'buyer2@test.com', 'dummy_hash', 'ACTIVE', true, true)
 ON CONFLICT (id) DO UPDATE SET status = 'ACTIVE', can_receive_transfers = true, email_verified = true`,
        [TEST_USERS.BUYER_2]
      );

      const response = await axios.post(
        `${API_BASE}/api/v1/transfer/validate`,
        {
          ticketId: ticket.id,
          toUserId: TEST_USERS.BUYER_2,
        },
        {
          headers: {
            Authorization: `Bearer ${buyer1Token}`,
            'x-tenant-id': DEFAULT_TENANT_ID,
          },
          validateStatus: () => true,
        }
      );

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
      expect(response.data.data.valid).toBe(true);
    });
  });

  describe('transferTicket - Actual Transfer Execution', () => {

    beforeEach(async () => {
      await pool.query(
        `INSERT INTO users (id, status, can_receive_transfers, email_verified, identity_verified)
         VALUES ($1, 'ACTIVE', true, true, true), ($2, 'ACTIVE', true, true, true)
         ON CONFLICT (id) DO UPDATE SET 
           status = 'ACTIVE', 
           can_receive_transfers = true, 
           email_verified = true,
           identity_verified = true`,
        [TEST_USERS.BUYER_1, TEST_USERS.BUYER_2]
      );

      // Add event dates for transfer deadline check
      await pool.query(
        `UPDATE events SET 
          start_date = NOW() + INTERVAL '48 hours',
          allow_transfers = true,
          max_transfers_per_ticket = 5
         WHERE id = $1`,
        [TEST_EVENT.id]
      );
    });

    it('should successfully transfer ticket between users', async () => {
      const ticket = await testHelper.createTestTicket(TEST_USERS.BUYER_1);

      const response = await axios.post(
        `${API_BASE}/api/v1/transfer`,
        {
          ticketId: ticket.id,
          toUserId: TEST_USERS.BUYER_2,
          reason: 'Selling to friend',
        },
        {
          headers: {
            Authorization: `Bearer ${buyer1Token}`,
            'x-tenant-id': DEFAULT_TENANT_ID,
          },
          validateStatus: () => true,
        }
      );

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
      expect(response.data.data.fromUserId).toBe(TEST_USERS.BUYER_1);
      expect(response.data.data.toUserId).toBe(TEST_USERS.BUYER_2);
      expect(response.data.data.transferredAt).toBeDefined();

      const ticketCheck = await pool.query(
        'SELECT user_id, status FROM tickets WHERE id = $1',
        [ticket.id]
      );
      expect(ticketCheck.rows[0].user_id).toBe(TEST_USERS.BUYER_2);
      expect(ticketCheck.rows[0].status).toBe('TRANSFERRED');

      const transferCheck = await pool.query(
        'SELECT * FROM ticket_transfers WHERE ticket_id = $1',
        [ticket.id]
      );
      expect(transferCheck.rows.length).toBe(1);
      expect(transferCheck.rows[0].from_user_id).toBe(TEST_USERS.BUYER_1);
      expect(transferCheck.rows[0].to_user_id).toBe(TEST_USERS.BUYER_2);
      expect(transferCheck.rows[0].reason).toBe('Selling to friend');
    });

    it('should get transfer history for a ticket', async () => {
      const ticket = await testHelper.createTestTicket(TEST_USERS.BUYER_1);

      await axios.post(
        `${API_BASE}/api/v1/transfer`,
        {
          ticketId: ticket.id,
          toUserId: TEST_USERS.BUYER_2,
          reason: 'First transfer',
        },
        {
          headers: {
            Authorization: `Bearer ${buyer1Token}`,
            'x-tenant-id': DEFAULT_TENANT_ID,
          },
        }
      );

      const response = await axios.get(
        `${API_BASE}/api/v1/transfer/${ticket.id}/history`,
        {
          headers: {
            Authorization: `Bearer ${buyer1Token}`,
            'x-tenant-id': DEFAULT_TENANT_ID,
          },
        }
      );

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
      expect(response.data.data.length).toBe(1);
      expect(response.data.data[0].from_user_id).toBe(TEST_USERS.BUYER_1);
      expect(response.data.data[0].to_user_id).toBe(TEST_USERS.BUYER_2);
      expect(response.data.data[0].reason).toBe('First transfer');
    });
  });
});
