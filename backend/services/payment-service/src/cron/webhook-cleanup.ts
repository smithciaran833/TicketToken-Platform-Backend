import { Pool } from 'pg';
import { logger } from '../utils/logger';

const log = logger.child({ component: 'WebhookCleanup' });

/**
 * SECURITY: Explicit field list for webhook cleanup queries.
 */
const WEBHOOK_CLEANUP_FIELDS = 'id, webhook_id, provider, event_type, status, retry_count, created_at';

export class WebhookCleanup {
  private db: Pool;

  constructor(db: Pool) {
    this.db = db;
  }

  async run(): Promise<void> {
    log.info('Starting webhook cleanup');

    const result = await this.db.query(
      `DELETE FROM webhook_inbox WHERE status = 'processed' AND created_at < NOW() - INTERVAL '30 days'`
    );

    log.info({ count: result.rowCount }, 'Deleted old webhooks');

    // SECURITY: Use explicit field list instead of SELECT *
    const failedWebhooks = await this.db.query(
      `SELECT ${WEBHOOK_CLEANUP_FIELDS} FROM webhook_inbox WHERE status != 'processed' AND retry_count >= 5 AND created_at < NOW() - INTERVAL '7 days'`
    );

    if (failedWebhooks.rows.length > 0) {
      log.info({ count: failedWebhooks.rows.length }, 'Found failed webhooks to archive');
    }
  }
}
