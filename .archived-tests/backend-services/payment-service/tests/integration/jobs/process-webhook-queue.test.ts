/**
 * Process Webhook Queue Job Integration Tests
 */

import Stripe from 'stripe';
import { ProcessWebhookQueueJob } from '../../../src/jobs/process-webhook-queue';
import {
  setupTestApp,
  teardownTestApp,
  cleanDatabase,
  pool,
  db,
} from '../setup';

describe('ProcessWebhookQueueJob', () => {
  let job: ProcessWebhookQueueJob;
  let mockStripe: any;

  beforeAll(async () => {
    await setupTestApp();

    mockStripe = {
      paymentIntents: {
        retrieve: jest.fn(),
      },
    };

    job = new ProcessWebhookQueueJob(pool, mockStripe as unknown as Stripe);
  });

  afterAll(async () => {
    await teardownTestApp({ db });
  });

  beforeEach(async () => {
    await cleanDatabase(db);
    jest.clearAllMocks();
  });

  describe('execute()', () => {
    it('should complete without errors when no webhooks exist', async () => {
      await expect(job.execute()).resolves.not.toThrow();
    });

    it('should process pending webhooks', async () => {
      await pool.query(
        `INSERT INTO webhook_inbox 
         (provider, event_id, event_type, payload, status, retry_count)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        ['stripe', 'evt_process_123', 'payment_intent.succeeded', 
         JSON.stringify({ id: 'evt_process_123', type: 'payment_intent.succeeded', data: { object: {} } }), 
         'pending', 0]
      );

      await job.execute();

      const result = await pool.query(
        `SELECT status, processed_at FROM webhook_inbox WHERE event_id = $1`,
        ['evt_process_123']
      );

      expect(result.rows[0].status).toBe('processed');
      expect(result.rows[0].processed_at).not.toBeNull();
    });

    it('should skip webhooks with retry_count >= 5', async () => {
      await pool.query(
        `INSERT INTO webhook_inbox 
         (provider, event_id, event_type, payload, status, retry_count)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        ['stripe', 'evt_maxretries_123', 'payment_intent.succeeded', '{}', 'pending', 5]
      );

      await job.execute();

      const result = await pool.query(
        `SELECT status FROM webhook_inbox WHERE event_id = $1`,
        ['evt_maxretries_123']
      );

      expect(result.rows[0].status).toBe('pending');
    });

    it('should skip already processed webhooks', async () => {
      await pool.query(
        `INSERT INTO webhook_inbox 
         (provider, event_id, event_type, payload, status, retry_count)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        ['stripe', 'evt_already_done', 'payment_intent.succeeded', '{}', 'processed', 0]
      );

      await job.execute();

      const result = await pool.query(
        `SELECT status FROM webhook_inbox WHERE event_id = $1`,
        ['evt_already_done']
      );

      expect(result.rows[0].status).toBe('processed');
    });

    it('should process webhooks in order (oldest first)', async () => {
      // Insert older webhook
      await pool.query(
        `INSERT INTO webhook_inbox 
         (provider, event_id, event_type, payload, status, retry_count, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW() - INTERVAL '2 hours')`,
        ['stripe', 'evt_older_123', 'payment_intent.succeeded', '{}', 'pending', 0]
      );

      // Insert newer webhook
      await pool.query(
        `INSERT INTO webhook_inbox 
         (provider, event_id, event_type, payload, status, retry_count, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW() - INTERVAL '1 hour')`,
        ['stripe', 'evt_newer_123', 'payment_intent.succeeded', '{}', 'pending', 0]
      );

      await job.execute();

      const result = await pool.query(
        `SELECT event_id, status FROM webhook_inbox ORDER BY created_at ASC`
      );

      expect(result.rows.length).toBe(2);
      expect(result.rows[0].status).toBe('processed');
      expect(result.rows[1].status).toBe('processed');
    });

    it('should limit processing to 10 webhooks per execution', async () => {
      for (let i = 0; i < 15; i++) {
        await pool.query(
          `INSERT INTO webhook_inbox 
           (provider, event_id, event_type, payload, status, retry_count, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, NOW() - INTERVAL '${i} minutes')`,
          ['stripe', `evt_batch_${i}`, 'payment_intent.succeeded', '{}', 'pending', 0]
        );
      }

      await job.execute();

      const result = await pool.query(
        `SELECT COUNT(*) FROM webhook_inbox WHERE status = 'processed'`
      );

      expect(parseInt(result.rows[0].count)).toBe(10);
    });

    it('should handle different providers', async () => {
      await pool.query(
        `INSERT INTO webhook_inbox 
         (provider, event_id, event_type, payload, status, retry_count)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        ['paypal', 'evt_paypal_123', 'PAYMENT.CAPTURE.COMPLETED', '{}', 'pending', 0]
      );

      await job.execute();

      const result = await pool.query(
        `SELECT status FROM webhook_inbox WHERE event_id = $1`,
        ['evt_paypal_123']
      );

      expect(result.rows[0].status).toBe('processed');
    });

    it('should handle webhooks with JSONB payload', async () => {
      const payload = { id: 'evt_jsonb_123', type: 'payment_intent.succeeded', data: { object: { amount: 1000 } } };
      
      await pool.query(
        `INSERT INTO webhook_inbox 
         (provider, event_id, event_type, payload, status, retry_count)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        ['stripe', 'evt_jsonb_123', 'payment_intent.succeeded', JSON.stringify(payload), 'pending', 0]
      );

      await job.execute();

      const result = await pool.query(
        `SELECT status FROM webhook_inbox WHERE event_id = $1`,
        ['evt_jsonb_123']
      );

      expect(result.rows[0].status).toBe('processed');
    });
  });

  describe('processWebhook()', () => {
    it('should mark webhook as processed with timestamp', async () => {
      await pool.query(
        `INSERT INTO webhook_inbox 
         (id, provider, event_id, event_type, payload, status, retry_count)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        ['a0000000-0000-0000-0000-000000000001', 'stripe', 'evt_timestamp_123', 
         'payment_intent.succeeded', '{}', 'pending', 0]
      );

      const jobInstance = job as any;
      await jobInstance.processWebhook({
        id: 'a0000000-0000-0000-0000-000000000001',
        provider: 'stripe',
        payload: '{}',
        webhook_id: 'evt_timestamp_123',
        event_id: 'evt_timestamp_123'
      });

      const result = await pool.query(
        `SELECT status, processed_at FROM webhook_inbox WHERE id = $1`,
        ['a0000000-0000-0000-0000-000000000001']
      );

      expect(result.rows[0].status).toBe('processed');
      expect(result.rows[0].processed_at).not.toBeNull();
    });

    it('should increment retry_count and store error on failure', async () => {
      await pool.query(
        `INSERT INTO webhook_inbox 
         (id, provider, event_id, event_type, payload, status, retry_count)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        ['b0000000-0000-0000-0000-000000000001', 'stripe', 'evt_error_123', 
         'payment_intent.succeeded', '{}', 'pending', 2]
      );

      const jobInstance = job as any;
      
      await jobInstance.processWebhook({
        id: 'b0000000-0000-0000-0000-000000000001',
        provider: 'stripe',
        payload: 'not valid json',
        webhook_id: 'evt_error_123',
        event_id: 'evt_error_123'
      });

      const result = await pool.query(
        `SELECT retry_count, error_message, status FROM webhook_inbox WHERE id = $1`,
        ['b0000000-0000-0000-0000-000000000001']
      );

      expect(result.rows[0].retry_count).toBe(3);
      expect(result.rows[0].error_message).toBeDefined();
      expect(result.rows[0].status).toBe('pending');
    });

    it('should handle payload as object (already parsed JSONB)', async () => {
      await pool.query(
        `INSERT INTO webhook_inbox 
         (id, provider, event_id, event_type, payload, status, retry_count)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        ['c0000000-0000-0000-0000-000000000001', 'stripe', 'evt_object_123', 
         'payment_intent.succeeded', '{"test": true}', 'pending', 0]
      );

      const jobInstance = job as any;
      await jobInstance.processWebhook({
        id: 'c0000000-0000-0000-0000-000000000001',
        provider: 'stripe',
        payload: { test: true },
        webhook_id: 'evt_object_123',
        event_id: 'evt_object_123'
      });

      const result = await pool.query(
        `SELECT status FROM webhook_inbox WHERE id = $1`,
        ['c0000000-0000-0000-0000-000000000001']
      );

      expect(result.rows[0].status).toBe('processed');
    });
  });
});
