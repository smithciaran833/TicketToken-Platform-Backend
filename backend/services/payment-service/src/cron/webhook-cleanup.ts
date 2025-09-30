import { Pool } from 'pg';

export class WebhookCleanup {
  private db: Pool;

  constructor(db: Pool) {
    this.db = db;
  }

  async run(): Promise<void> {
    console.log('Starting webhook cleanup...');
    
    // Delete processed webhooks older than 30 days
    const result = await this.db.query(
      `DELETE FROM webhook_inbox 
       WHERE processed = true 
       AND created_at < NOW() - INTERVAL '30 days'`
    );

    console.log(`Deleted ${result.rowCount} old webhooks`);

    // Archive failed webhooks older than 7 days
    const failedWebhooks = await this.db.query(
      `SELECT * FROM webhook_inbox 
       WHERE processed = false 
       AND retry_count >= 5 
       AND created_at < NOW() - INTERVAL '7 days'`
    );

    if (failedWebhooks.rows.length > 0) {
      // You could move these to an archive table or external storage
      console.log(`Found ${failedWebhooks.rows.length} failed webhooks to archive`);
    }
  }
}
