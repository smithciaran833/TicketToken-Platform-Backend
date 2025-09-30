import { db } from './database.service';

export class DataRetentionService {
  private retentionPolicies = {
    'tax_records': { days: 2555, reason: 'IRS 7-year requirement', canDelete: false },
    'ofac_checks': { days: 1825, reason: 'FinCEN 5-year requirement', canDelete: false },
    'audit_logs': { days: 2555, reason: 'SOC 2 requirement', canDelete: false },
    'customer_profiles': { days: 90, reason: 'GDPR - delete on request', canDelete: true },
    'payment_data': { days: 2555, reason: 'PCI DSS & tax requirements', canDelete: false },
    'venue_verifications': { days: 2555, reason: 'Business records', canDelete: false }
  };

  async enforceRetention(): Promise<void> {
    for (const [table, policy] of Object.entries(this.retentionPolicies)) {
      if (policy.canDelete) {
        await this.deleteOldRecords(table, policy.days);
      }
    }
  }

  async handleGDPRDeletion(customerId: string): Promise<void> {
    // Anonymize customer profiles
    await db.query(
      `UPDATE customer_profiles SET
       email = 'deleted@gdpr.request',
       name = 'GDPR_DELETED',
       phone = NULL,
       address = NULL
       WHERE customer_id = $1`,
      [customerId]
    );

    // Clear preferences (different columns)
    await db.query(
      `UPDATE customer_preferences SET
       marketing_emails = false,
       sms_notifications = false,
       push_notifications = false
       WHERE customer_id = $1`,
      [customerId]
    );

    // Clear analytics
    await db.query(
      `DELETE FROM customer_analytics WHERE customer_id = $1`,
      [customerId]
    );
  }

  private async deleteOldRecords(table: string, days: number): Promise<void> {
    // SECURITY FIX: Whitelist table names and use parameterized queries
    const allowedTables = Object.keys(this.retentionPolicies);
    
    if (!allowedTables.includes(table)) {
      throw new Error(`Invalid table name: ${table}`);
    }

    // Validate days parameter
    const daysNum = Number.parseInt(String(days), 10);
    if (!Number.isFinite(daysNum) || daysNum < 0 || daysNum > 10000) {
      throw new Error('Invalid days parameter: must be 0-10000');
    }

    // Since we can't parameterize table names in PostgreSQL, we use a whitelist approach
    // The table name is now guaranteed to be from our predefined list
    // We use parameterized query for the days value
    const query = `DELETE FROM ${table} WHERE created_at < NOW() - make_interval(days => $1)`;
    await db.query(query, [daysNum]);
  }
}

export const dataRetentionService = new DataRetentionService();
