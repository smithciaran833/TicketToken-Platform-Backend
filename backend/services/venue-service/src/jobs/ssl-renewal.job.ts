import cron, { ScheduledTask } from 'node-cron';
import { logger } from '../utils/logger';
import { db } from '../config/database';

const log = logger.child({ component: 'SSLRenewalJob' });

/**
 * SSL Certificate Renewal Cron Job
 *
 * Runs daily at 5 AM to check for expiring SSL certificates
 * Renews certificates that expire within 7 days
 *
 * NOTE: This is currently a MOCK implementation
 * Real Let's Encrypt integration needs to be implemented
 */
export class SSLRenewalJob {
  private task: ScheduledTask | null = null;

  /**
   * Start the cron job
   */
  start(): void {
    // Run daily at 5 AM
    this.task = cron.schedule('0 5 * * *', async () => {
      log.info('Starting scheduled SSL certificate renewal check');

      try {
        const result = await this.checkAndRenewCertificates();
        log.info({
          checked: result.checked,
          renewed: result.renewed,
          failed: result.failed
        }, 'SSL renewal check completed');
      } catch (error) {
        log.error({ error }, 'SSL renewal check failed');
      }
    });

    log.info('SSL renewal cron job started (runs daily at 5 AM)');
  }

  /**
   * Stop the cron job
   */
  stop(): void {
    if (this.task) {
      this.task.stop();
      log.info('SSL renewal cron job stopped');
    }
  }

  /**
   * Check and renew expiring certificates
   */
  private async checkAndRenewCertificates(): Promise<{
    checked: number;
    renewed: number;
    failed: number;
  }> {
    const sevenDaysFromNow = new Date();
    sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);

    let checked = 0;
    let renewed = 0;
    let failed = 0;

    try {
      // Get domains with SSL certificates expiring within 7 days
      const expiringDomains = await db('custom_domains')
        .where('is_verified', true)
        .where('ssl_status', 'active')
        .where('ssl_expires_at', '<', sevenDaysFromNow)
        .select('id', 'domain', 'venue_id', 'ssl_expires_at');

      checked = expiringDomains.length;

      if (checked === 0) {
        log.info('No SSL certificates need renewal');
        return { checked: 0, renewed: 0, failed: 0 };
      }

      log.info({ count: checked }, 'Found SSL certificates needing renewal');

      // Process each domain
      for (const domain of expiringDomains) {
        try {
          await this.renewCertificate(domain.id, domain.domain);
          renewed++;
        } catch (error) {
          log.error({
            domainId: domain.id,
            domain: domain.domain,
            error
          }, 'Failed to renew SSL certificate');
          failed++;
        }
      }

      return { checked, renewed, failed };
    } catch (error) {
      log.error({ error }, 'Error checking expiring certificates');
      throw error;
    }
  }

  /**
   * Renew SSL certificate for a domain
   *
   * MOCK IMPLEMENTATION - Just updates the expiry date
   * TODO: Integrate with Let's Encrypt ACME protocol
   */
  private async renewCertificate(domainId: string, domain: string): Promise<void> {
    log.warn({
      domainId,
      domain
    }, 'MOCK: SSL renewal not implemented - updating expiry dates only');

    try {
      // MOCK: Just set new expiry dates
      // Real implementation would:
      // 1. Generate CSR (Certificate Signing Request)
      // 2. Request certificate from Let's Encrypt
      // 3. Complete ACME challenge (HTTP-01 or DNS-01)
      // 4. Download and install certificate
      // 5. Update database with new cert details

      const newExpiryDate = new Date();
      newExpiryDate.setDate(newExpiryDate.getDate() + 90); // 90 days from now

      await db('custom_domains')
        .where('id', domainId)
        .update({
          ssl_issued_at: new Date(),
          ssl_expires_at: newExpiryDate,
          ssl_status: 'active',
          ssl_error_message: null,
          updated_at: new Date(),
        });

      log.info({
        domainId,
        domain,
        newExpiryDate
      }, 'MOCK: SSL certificate "renewed" (expiry updated)');
    } catch (error) {
      // Update status to failed
      await db('custom_domains')
        .where('id', domainId)
        .update({
          ssl_status: 'failed',
          ssl_error_message: error instanceof Error ? error.message : 'Renewal failed',
          updated_at: new Date(),
        });

      throw error;
    }
  }

  /**
   * Run renewal check manually (for testing)
   */
  async runNow(): Promise<{ checked: number; renewed: number; failed: number }> {
    log.info('Running SSL renewal check manually');

    try {
      const result = await this.checkAndRenewCertificates();
      log.info(result, 'Manual SSL renewal check completed');
      return result;
    } catch (error) {
      log.error({ error }, 'Manual SSL renewal check failed');
      throw error;
    }
  }
}

export const sslRenewalJob = new SSLRenewalJob();
