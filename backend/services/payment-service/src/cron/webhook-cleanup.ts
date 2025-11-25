import { Pool } from 'pg';
import { logger } from '../utils/logger';

const log = logger.child({ component: 'WebhookCleanup' });

export class WebhookCleanup {
  private db: Pool;

  constructor(db: Pool) {
    this.db = db;
  }

  async run(): Promise<void> {
    log.info('Starting webhook cleanup');
    
    // Delete processed webhooks older than 30 days
    const result = await this.db.query(
      `DELETE FROM webhook_inbox 
       WHERE processed = true 
       AND created_at < NOW() - INTERVAL '30 days'`
    );

    log.info('Deleted old webhooks', { count: result.rowCount });

    // Archive failed webhooks older than 7 days
    const failedWebhooks = await this.db.query(
      `SELECT * FROM webhook_inbox 
       WHERE processed = false 
       AND retry_count >= 5 
       AND created_at < NOW() - INTERVAL '7 days'`
    );

    if (failedWebhooks.rows.length > 0) {
      // You could move these to an archive table or external storage
      log.info('Found failed webhooks to archive', { count: failedWebhooks.rows.length });
    }
  }
}
