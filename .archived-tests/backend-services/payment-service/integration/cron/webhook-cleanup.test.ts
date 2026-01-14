/**
 * Webhook Cleanup Cron Integration Tests
 */

import { WebhookCleanup } from '../../../src/cron/webhook-cleanup';
import {
  setupTestApp,
  teardownTestApp,
  cleanDatabase,
  pool,
  db,
} from '../setup';

describe('WebhookCleanup', () => {
  let cleanup: WebhookCleanup;

  beforeAll(async () => {
    await setupTestApp();
    cleanup = new WebhookCleanup(pool);
  });

  afterAll(async () => {
    await teardownTestApp({ db });
  });

  beforeEach(async () => {
    await cleanDatabase(db);
  });

  describe('run()', () => {
    it('should complete without errors when no webhooks exist', async () => {
      await expect(cleanup.run()).resolves.not.toThrow();
    });

    it('should delete processed webhooks older than 30 days', async () => {
      await pool.query(
        `INSERT INTO webhook_inbox 
         (provider, event_id, event_type, payload, status, created_at)
         VALUES ($1, $2, $3, $4, $5, NOW() - INTERVAL '35 days')`,
        ['stripe', 'evt_old_processed_123', 'payment_intent.succeeded', '{}', 'processed']
      );

      await pool.query(
        `INSERT INTO webhook_inbox 
         (provider, event_id, event_type, payload, status, created_at)
         VALUES ($1, $2, $3, $4, $5, NOW() - INTERVAL '5 days')`,
        ['stripe', 'evt_recent_processed_123', 'payment_intent.succeeded', '{}', 'processed']
      );

      let result = await pool.query('SELECT COUNT(*) FROM webhook_inbox');
      expect(parseInt(result.rows[0].count)).toBe(2);

      await cleanup.run();

      result = await pool.query('SELECT event_id FROM webhook_inbox');
      expect(result.rows.length).toBe(1);
      expect(result.rows[0].event_id).toBe('evt_recent_processed_123');
    });

    it('should not delete pending webhooks regardless of age', async () => {
      await pool.query(
        `INSERT INTO webhook_inbox 
         (provider, event_id, event_type, payload, status, created_at)
         VALUES ($1, $2, $3, $4, $5, NOW() - INTERVAL '60 days')`,
        ['stripe', 'evt_old_pending_123', 'payment_intent.succeeded', '{}', 'pending']
      );

      await cleanup.run();

      const result = await pool.query(
        `SELECT * FROM webhook_inbox WHERE event_id = $1`,
        ['evt_old_pending_123']
      );
      expect(result.rows.length).toBe(1);
    });

    it('should identify failed webhooks for archival', async () => {
      await pool.query(
        `INSERT INTO webhook_inbox 
         (provider, event_id, event_type, payload, status, retry_count, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW() - INTERVAL '10 days')`,
        ['stripe', 'evt_failed_123', 'payment_intent.succeeded', '{}', 'pending', 5]
      );

      await pool.query(
        `INSERT INTO webhook_inbox 
         (provider, event_id, event_type, payload, status, retry_count, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW() - INTERVAL '10 days')`,
        ['stripe', 'evt_retrying_123', 'payment_intent.succeeded', '{}', 'pending', 3]
      );

      await cleanup.run();

      const result = await pool.query('SELECT COUNT(*) FROM webhook_inbox');
      expect(parseInt(result.rows[0].count)).toBe(2);
    });

    it('should handle multiple old processed webhooks', async () => {
      for (let i = 0; i < 5; i++) {
        await pool.query(
          `INSERT INTO webhook_inbox 
           (provider, event_id, event_type, payload, status, created_at)
           VALUES ($1, $2, $3, $4, $5, NOW() - INTERVAL '${31 + i} days')`,
          ['stripe', `evt_old_batch_${i}`, 'payment_intent.succeeded', '{}', 'processed']
        );
      }

      await cleanup.run();

      const result = await pool.query('SELECT COUNT(*) FROM webhook_inbox');
      expect(parseInt(result.rows[0].count)).toBe(0);
    });

    it('should not delete webhooks at exactly 30 day boundary', async () => {
      await pool.query(
        `INSERT INTO webhook_inbox 
         (provider, event_id, event_type, payload, status, created_at)
         VALUES ($1, $2, $3, $4, $5, NOW() - INTERVAL '30 days')`,
        ['stripe', 'evt_boundary_123', 'payment_intent.succeeded', '{}', 'processed']
      );

      await cleanup.run();

      const result = await pool.query(
        `SELECT * FROM webhook_inbox WHERE event_id = $1`,
        ['evt_boundary_123']
      );
      expect(result.rows.length).toBe(1);
    });

    it('should handle webhooks from different providers', async () => {
      await pool.query(
        `INSERT INTO webhook_inbox 
         (provider, event_id, event_type, payload, status, created_at)
         VALUES ($1, $2, $3, $4, $5, NOW() - INTERVAL '35 days')`,
        ['stripe', 'evt_stripe_old', 'payment_intent.succeeded', '{}', 'processed']
      );

      await pool.query(
        `INSERT INTO webhook_inbox 
         (provider, event_id, event_type, payload, status, created_at)
         VALUES ($1, $2, $3, $4, $5, NOW() - INTERVAL '35 days')`,
        ['square', 'evt_square_old', 'payment.completed', '{}', 'processed']
      );

      await cleanup.run();

      const result = await pool.query('SELECT COUNT(*) FROM webhook_inbox');
      expect(parseInt(result.rows[0].count)).toBe(0);
    });

    it('should handle mixed processed and pending webhooks', async () => {
      await pool.query(
        `INSERT INTO webhook_inbox 
         (provider, event_id, event_type, payload, status, created_at)
         VALUES ($1, $2, $3, $4, $5, NOW() - INTERVAL '35 days')`,
        ['stripe', 'evt_old_proc', 'payment_intent.succeeded', '{}', 'processed']
      );

      await pool.query(
        `INSERT INTO webhook_inbox 
         (provider, event_id, event_type, payload, status, created_at)
         VALUES ($1, $2, $3, $4, $5, NOW() - INTERVAL '35 days')`,
        ['stripe', 'evt_old_pend', 'payment_intent.succeeded', '{}', 'pending']
      );

      await pool.query(
        `INSERT INTO webhook_inbox 
         (provider, event_id, event_type, payload, status, created_at)
         VALUES ($1, $2, $3, $4, $5, NOW() - INTERVAL '5 days')`,
        ['stripe', 'evt_new_proc', 'payment_intent.succeeded', '{}', 'processed']
      );

      await cleanup.run();

      const result = await pool.query('SELECT event_id FROM webhook_inbox ORDER BY event_id');
      expect(result.rows.length).toBe(2);
      expect(result.rows.map((r: any) => r.event_id)).toContain('evt_old_pend');
      expect(result.rows.map((r: any) => r.event_id)).toContain('evt_new_proc');
    });
  });
});
