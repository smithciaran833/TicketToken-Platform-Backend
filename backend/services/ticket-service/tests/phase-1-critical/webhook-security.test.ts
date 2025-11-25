import { Pool } from 'pg';
import axios from 'axios';
import * as crypto from 'crypto';
import {
  TestDataHelper,
} from '../fixtures/test-data';

// Mock queueService to avoid RabbitMQ dependency (external infrastructure)
jest.mock('../../src/services/queueService', () => ({
  QueueService: {
    publish: jest.fn().mockResolvedValue(true)
  }
}));

// Deterministic JSON stringify (same as server)
function deterministicStringify(obj: any): string {
  if (obj === null) return 'null';
  if (typeof obj !== 'object') return JSON.stringify(obj);
  if (Array.isArray(obj)) {
    return '[' + obj.map(item => deterministicStringify(item)).join(',') + ']';
  }
  const keys = Object.keys(obj).sort();
  const pairs = keys.map(key => `"${key}":${deterministicStringify(obj[key])}`);
  return '{' + pairs.join(',') + '}';
}

describe('Webhook Security - End to End', () => {
  let pool: Pool;
  let testHelper: TestDataHelper;
  const API_BASE = 'http://localhost:3004/api/v1/webhooks';
  
  // Real order UUIDs for testing
  let testOrderIds: {
    order1: string;
    order2: string;
    order3: string;
    order4: string;
    order5: string;
  };
  
  // Webhook secret (matches .env file)
  const WEBHOOK_SECRET = 'temp-secret'; // Must match .env file

  // Helper to generate valid signature with deterministic JSON
  function generateSignature(timestamp: number, nonce: string, body: any): string {
    const bodyString = deterministicStringify(body);
    const payload = `${timestamp}:${nonce}:${bodyString}`;
    return crypto
      .createHmac('sha256', WEBHOOK_SECRET)
      .update(payload)
      .digest('hex');
  }

  // Helper to create webhook headers
  function createHeaders(body: any, options: { 
    timestamp?: number; 
    nonce?: string; 
    signature?: string;
    skipSignature?: boolean;
    skipTimestamp?: boolean;
    skipNonce?: boolean;
  } = {}) {
    const timestamp = options.timestamp ?? Date.now();
    const nonce = options.nonce ?? crypto.randomUUID();
    const signature = options.signature ?? generateSignature(timestamp, nonce, body);

    const headers: any = {
      'Content-Type': 'application/json',
    };

    if (!options.skipSignature) headers['x-internal-signature'] = signature;
    if (!options.skipTimestamp) headers['x-webhook-timestamp'] = timestamp.toString();
    if (!options.skipNonce) headers['x-webhook-nonce'] = nonce;

    return headers;
  }

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

    // Create REAL orders for webhook testing
    const orderResult = await pool.query(`
      INSERT INTO orders (user_id, event_id, order_number, status, 
                         subtotal_cents, total_cents, ticket_quantity)
      VALUES 
        ($1, $2, 'WH-TEST-001', 'PENDING', 5000, 5000, 1),
        ($1, $2, 'WH-TEST-002', 'PENDING', 5000, 5000, 1),
        ($1, $2, 'WH-TEST-003', 'PENDING', 5000, 5000, 1),
        ($1, $2, 'WH-TEST-004', 'PENDING', 5000, 5000, 1),
        ($1, $2, 'WH-TEST-005', 'PENDING', 5000, 5000, 1)
      RETURNING id
    `, ['00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001']);

    testOrderIds = {
      order1: orderResult.rows[0].id,
      order2: orderResult.rows[1].id,
      order3: orderResult.rows[2].id,
      order4: orderResult.rows[3].id,
      order5: orderResult.rows[4].id,
    };

    console.log('✅ Webhook test setup complete with real orders');
  });

  afterAll(async () => {
    await testHelper.cleanDatabase();
    await pool.end();
    console.log('✅ Webhook test teardown complete');
  });

  describe('Signature Verification', () => {
    it('should reject webhook with missing signature header', async () => {
      const body = { orderId: testOrderIds.order1, paymentId: 'test-payment' };
      const headers = createHeaders(body, { skipSignature: true });

      const response = await axios.post(
        `${API_BASE}/payment-success`,
        body,
        { headers, validateStatus: () => true }
      );

      expect(response.status).toBe(401);
      expect(response.data.error).toContain('Missing required security headers');
    });

    it('should reject webhook with invalid signature', async () => {
      const body = { orderId: testOrderIds.order1, paymentId: 'test-payment' };
      const headers = createHeaders(body, { signature: 'invalid-signature-12345' });

      const response = await axios.post(
        `${API_BASE}/payment-success`,
        body,
        { headers, validateStatus: () => true }
      );

      expect(response.status).toBe(401);
      expect(response.data.error).toContain('Invalid signature');
    });

    it('should accept webhook with valid signature', async () => {
      const body = { orderId: testOrderIds.order1, paymentId: 'payment-123' };
      const headers = createHeaders(body);

      const response = await axios.post(
        `${API_BASE}/payment-success`,
        body,
        { headers }
      );

      expect(response.status).toBe(200);
      expect(response.data.processed).toBe(true);
    });
  });

  describe('Nonce Validation (Replay Protection)', () => {
    it('should reject webhook with duplicate nonce', async () => {
      const nonce = crypto.randomUUID();
      const body = { orderId: testOrderIds.order2, paymentId: 'payment-456' };
      
      // First request - should succeed
      const headers1 = createHeaders(body, { nonce });
      const response1 = await axios.post(
        `${API_BASE}/payment-success`,
        body,
        { headers: headers1 }
      );
      expect(response1.status).toBe(200);

      // Second request with same nonce - should fail
      const headers2 = createHeaders(body, { nonce });
      const response2 = await axios.post(
        `${API_BASE}/payment-success`,
        body,
        { headers: headers2, validateStatus: () => true }
      );

      expect(response2.status).toBe(401);
      expect(response2.data.error).toContain('Duplicate request');
    });

    it('should reject webhook with missing nonce header', async () => {
      const body = { orderId: testOrderIds.order1, paymentId: 'test-payment' };
      const headers = createHeaders(body, { skipNonce: true });

      const response = await axios.post(
        `${API_BASE}/payment-success`,
        body,
        { headers, validateStatus: () => true }
      );

      expect(response.status).toBe(401);
      expect(response.data.error).toContain('Missing required security headers');
    });
  });

  describe('Timestamp Validation', () => {
    it('should reject webhook with expired timestamp (older than 5 minutes)', async () => {
      const body = { orderId: testOrderIds.order1, paymentId: 'test-payment' };
      const oldTimestamp = Date.now() - (6 * 60 * 1000); // 6 minutes ago
      const headers = createHeaders(body, { timestamp: oldTimestamp });

      const response = await axios.post(
        `${API_BASE}/payment-success`,
        body,
        { headers, validateStatus: () => true }
      );

      expect(response.status).toBe(401);
      expect(response.data.error).toContain('expired');
    });

    it('should reject webhook with future timestamp (more than 5 minutes ahead)', async () => {
      const body = { orderId: testOrderIds.order1, paymentId: 'test-payment' };
      const futureTimestamp = Date.now() + (6 * 60 * 1000); // 6 minutes in future
      const headers = createHeaders(body, { timestamp: futureTimestamp });

      const response = await axios.post(
        `${API_BASE}/payment-success`,
        body,
        { headers, validateStatus: () => true }
      );

      expect(response.status).toBe(401);
      expect(response.data.error).toContain('expired');
    });

    it('should reject webhook with missing timestamp header', async () => {
      const body = { orderId: testOrderIds.order1, paymentId: 'test-payment' };
      const headers = createHeaders(body, { skipTimestamp: true });

      const response = await axios.post(
        `${API_BASE}/payment-success`,
        body,
        { headers, validateStatus: () => true }
      );

      expect(response.status).toBe(401);
      expect(response.data.error).toContain('Missing required security headers');
    });

    it('should accept webhook with valid timestamp (within 5 minutes)', async () => {
      const body = { orderId: testOrderIds.order3, paymentId: 'payment-789' };
      const headers = createHeaders(body); // Uses current time

      const response = await axios.post(
        `${API_BASE}/payment-success`,
        body,
        { headers }
      );

      expect(response.status).toBe(200);
      expect(response.data.processed).toBe(true);
    });
  });

  describe('Multiple Webhook Types', () => {
    it('should handle payment-success webhook', async () => {
      const body = { orderId: testOrderIds.order4, paymentId: 'payment-1' };
      const headers = createHeaders(body);

      const response = await axios.post(
        `${API_BASE}/payment-success`,
        body,
        { headers }
      );

      expect(response.status).toBe(200);
      expect(response.data.processed).toBe(true);
      expect(response.data.timestamp).toBeDefined();
    });

    it('should handle payment-failed webhook', async () => {
      const body = { orderId: testOrderIds.order5, reason: 'Insufficient funds' };
      const headers = createHeaders(body);

      const response = await axios.post(
        `${API_BASE}/payment-failed`,
        body,
        { headers }
      );

      expect(response.status).toBe(200);
      expect(response.data.processed).toBe(true);
    });
  });

  describe('Error Handling', () => {
    it('should return 400 for payment-success with missing orderId', async () => {
      const body = { paymentId: 'payment-123' }; // Missing orderId
      const headers = createHeaders(body);

      const response = await axios.post(
        `${API_BASE}/payment-success`,
        body,
        { headers, validateStatus: () => true }
      );

      expect(response.status).toBe(400);
      expect(response.data.error).toContain('Missing required fields');
    });

    it('should return 400 for payment-failed with missing orderId', async () => {
      const body = { reason: 'Card declined' }; // Missing orderId
      const headers = createHeaders(body);

      const response = await axios.post(
        `${API_BASE}/payment-failed`,
        body,
        { headers, validateStatus: () => true }
      );

      expect(response.status).toBe(400);
      expect(response.data.error).toContain('Missing orderId');
    });
  });
});
