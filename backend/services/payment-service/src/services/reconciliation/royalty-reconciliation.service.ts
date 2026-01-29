import { Pool, PoolClient } from 'pg';
import { logger } from '../../utils/logger';

const log = logger.child({ component: 'RoyaltyReconciliation' });

export interface SecondarySale {
  signature: string;
  tokenId: string;
  price: number;
  seller: string;
  buyer: string;
  timestamp: Date;
  eventId: string;
  venueId: string;
  tenantId: string;
}

export interface RoyaltyDistribution {
  id: string;
  tenant_id: string;
  transaction_id: string;
  event_id: string;
  recipient_type: 'venue' | 'artist' | 'platform';
  recipient_id: string;
  amount_cents: number;
  percentage: number;
  status: string;
  created_at: Date;
}

export interface ReconciliationRunResult {
  runId: string;
  transactionsChecked: number;
  discrepanciesFound: number;
  discrepanciesResolved: number;
  totalRoyaltiesCalculated: number;
  totalRoyaltiesPaid: number;
}

export interface BlockchainIndexerClient {
  getSecondarySales(startDate: Date, endDate: Date): Promise<SecondarySale[]>;
  getTransaction(signature: string): Promise<SecondarySale | null>;
}

export class RoyaltyReconciliationService {
  private pool: Pool;
  private blockchainClient: BlockchainIndexerClient;

  constructor(pool: Pool, blockchainClient: BlockchainIndexerClient) {
    this.pool = pool;
    this.blockchainClient = blockchainClient;
  }

  async runReconciliation(
    tenantId: string,
    startDate: Date,
    endDate: Date
  ): Promise<ReconciliationRunResult> {
    log.info({ tenantId, startDate, endDate }, 'Starting royalty reconciliation');

    const runId = await this.createReconciliationRun(tenantId, startDate, endDate);

    try {
      const secondarySales = await this.blockchainClient.getSecondarySales(startDate, endDate);
      log.info({ count: secondarySales.length }, 'Found secondary sales on blockchain');

      const distributions = await this.getRoyaltyDistributions(tenantId, startDate, endDate);
      log.info({ count: distributions.length }, 'Found royalty distributions in database');

      const results = await this.reconcile(tenantId, runId, secondarySales, distributions);

      await this.completeReconciliationRun(runId, results);

      log.info({ runId, ...results }, 'Reconciliation completed');

      return { runId, ...results };

    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      await this.failReconciliationRun(runId, msg);
      throw error;
    }
  }

  async getRoyaltyDistributions(
    tenantId: string,
    startDate: Date,
    endDate: Date
  ): Promise<RoyaltyDistribution[]> {
    const result = await this.pool.query(`
      SELECT id, tenant_id, transaction_id, event_id, recipient_type, 
             recipient_id, amount_cents, percentage, status, created_at
      FROM royalty_distributions
      WHERE tenant_id = $1
        AND created_at BETWEEN $2 AND $3
    `, [tenantId, startDate, endDate]);

    return result.rows;
  }

  private async reconcile(
    tenantId: string,
    runId: string,
    sales: SecondarySale[],
    distributions: RoyaltyDistribution[]
  ): Promise<{
    transactionsChecked: number;
    discrepanciesFound: number;
    discrepanciesResolved: number;
    totalRoyaltiesCalculated: number;
    totalRoyaltiesPaid: number;
  }> {
    let discrepanciesFound = 0;
    let discrepanciesResolved = 0;
    let totalRoyaltiesCalculated = 0;
    let totalRoyaltiesPaid = 0;

    const distributionMap = new Map<string, RoyaltyDistribution[]>();
    for (const dist of distributions) {
      const key = dist.transaction_id;
      if (!distributionMap.has(key)) {
        distributionMap.set(key, []);
      }
      distributionMap.get(key)!.push(dist);
    }

    for (const sale of sales) {
      const existingDistributions = distributionMap.get(sale.signature) || [];

      const expectedRoyalties = await this.calculateExpectedRoyalties(tenantId, sale);
      totalRoyaltiesCalculated += expectedRoyalties.total;

      if (existingDistributions.length === 0) {
        log.warn({ signature: sale.signature }, 'Missing royalty distribution');

        await this.recordDiscrepancy(tenantId, runId, {
          transactionId: sale.signature,
          discrepancyType: 'missing_distribution',
          expectedAmount: expectedRoyalties.total,
          actualAmount: 0,
          variance: expectedRoyalties.total
        });

        discrepanciesFound++;

        await this.createMissingDistribution(tenantId, sale, expectedRoyalties);
        discrepanciesResolved++;

      } else {
        const actualTotal = existingDistributions.reduce(
          (sum, d) => sum + parseFloat(d.amount_cents.toString()), 0
        );
        totalRoyaltiesPaid += actualTotal;

        const variance = Math.abs(expectedRoyalties.total - actualTotal);

        if (variance > 1) {
          log.warn({
            signature: sale.signature,
            expected: expectedRoyalties.total,
            actual: actualTotal
          }, 'Royalty amount mismatch');

          await this.recordDiscrepancy(tenantId, runId, {
            transactionId: sale.signature,
            discrepancyType: 'incorrect_amount',
            expectedAmount: expectedRoyalties.total,
            actualAmount: actualTotal,
            variance
          });

          discrepanciesFound++;
        }
      }
    }

    return {
      transactionsChecked: sales.length,
      discrepanciesFound,
      discrepanciesResolved,
      totalRoyaltiesCalculated,
      totalRoyaltiesPaid
    };
  }

  async calculateExpectedRoyalties(
    tenantId: string,
    sale: SecondarySale
  ): Promise<{ venue: number; artist: number; platform: number; total: number }> {
    const venueSettings = await this.pool.query(`
      SELECT default_royalty_percentage FROM venue_royalty_settings
      WHERE tenant_id = $1 AND venue_id = $2
    `, [tenantId, sale.venueId]);

    const eventSettings = await this.pool.query(`
      SELECT venue_royalty_percentage, artist_royalty_percentage 
      FROM event_royalty_settings
      WHERE tenant_id = $1 AND event_id = $2
    `, [tenantId, sale.eventId]);

    const venueDefault = venueSettings.rows[0]?.default_royalty_percentage ?? 10;
    const venuePercentage = eventSettings.rows[0]?.venue_royalty_percentage ?? venueDefault;
    const artistPercentage = eventSettings.rows[0]?.artist_royalty_percentage ?? 0;
    const platformPercentage = 5;

    const venue = Math.round((sale.price * venuePercentage) / 100);
    const artist = Math.round((sale.price * artistPercentage) / 100);
    const platform = Math.round((sale.price * platformPercentage) / 100);

    return {
      venue,
      artist,
      platform,
      total: venue + artist + platform
    };
  }

  private async createMissingDistribution(
    tenantId: string,
    sale: SecondarySale,
    royalties: { venue: number; artist: number; platform: number }
  ): Promise<void> {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      if (royalties.venue > 0) {
        await client.query(`
          INSERT INTO royalty_distributions (
            tenant_id, transaction_id, event_id, transaction_type,
            recipient_type, recipient_id, amount_cents, percentage, status
          ) VALUES ($1, $2, $3, 'secondary_sale', 'venue', $4, $5, $6, 'pending')
        `, [
          tenantId,
          sale.signature,
          sale.eventId,
          sale.venueId,
          royalties.venue,
          (royalties.venue / sale.price) * 100
        ]);
      }

      if (royalties.platform > 0) {
        const platformId = '00000000-0000-0000-0000-000000000001';
        await client.query(`
          INSERT INTO royalty_distributions (
            tenant_id, transaction_id, event_id, transaction_type,
            recipient_type, recipient_id, amount_cents, percentage, status
          ) VALUES ($1, $2, $3, 'secondary_sale', 'platform', $4, $5, 5, 'pending')
        `, [tenantId, sale.signature, sale.eventId, platformId, royalties.platform]);
      }

      if (royalties.artist > 0) {
        const artistId = sale.venueId;
        await client.query(`
          INSERT INTO royalty_distributions (
            tenant_id, transaction_id, event_id, transaction_type,
            recipient_type, recipient_id, amount_cents, percentage, status
          ) VALUES ($1, $2, $3, 'secondary_sale', 'artist', $4, $5, $6, 'pending')
        `, [
          tenantId,
          sale.signature,
          sale.eventId,
          artistId,
          royalties.artist,
          (royalties.artist / sale.price) * 100
        ]);
      }

      await client.query('COMMIT');
      log.info({ signature: sale.signature }, 'Created missing royalty distributions');

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  private async recordDiscrepancy(
    tenantId: string,
    runId: string,
    discrepancy: {
      transactionId: string;
      discrepancyType: string;
      expectedAmount: number;
      actualAmount: number;
      variance: number;
    }
  ): Promise<string> {
    const result = await this.pool.query(`
      INSERT INTO royalty_discrepancies (
        tenant_id, reconciliation_run_id, transaction_id,
        discrepancy_type, expected_amount, actual_amount, variance, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'identified')
      RETURNING id
    `, [
      tenantId,
      runId,
      discrepancy.transactionId,
      discrepancy.discrepancyType,
      discrepancy.expectedAmount,
      discrepancy.actualAmount,
      discrepancy.variance
    ]);

    return result.rows[0].id;
  }

  private async createReconciliationRun(
    tenantId: string,
    startDate: Date,
    endDate: Date
  ): Promise<string> {
    const result = await this.pool.query(`
      INSERT INTO royalty_reconciliation_runs (
        tenant_id, reconciliation_date, period_start, period_end, status, started_at
      ) VALUES ($1, CURRENT_DATE, $2, $3, 'running', NOW())
      RETURNING id
    `, [tenantId, startDate, endDate]);

    return result.rows[0].id;
  }

  private async completeReconciliationRun(
    runId: string,
    results: {
      transactionsChecked: number;
      discrepanciesFound: number;
      discrepanciesResolved: number;
      totalRoyaltiesCalculated: number;
      totalRoyaltiesPaid: number;
    }
  ): Promise<void> {
    const variance = results.totalRoyaltiesCalculated - results.totalRoyaltiesPaid;

    await this.pool.query(`
      UPDATE royalty_reconciliation_runs
      SET transactions_checked = $2,
          discrepancies_found = $3,
          discrepancies_resolved = $4,
          total_royalties_calculated = $5,
          total_royalties_paid = $6,
          variance_amount = $7,
          status = 'completed',
          completed_at = NOW()
      WHERE id = $1
    `, [
      runId,
      results.transactionsChecked,
      results.discrepanciesFound,
      results.discrepanciesResolved,
      results.totalRoyaltiesCalculated,
      results.totalRoyaltiesPaid,
      variance
    ]);
  }

  private async failReconciliationRun(runId: string, errorMessage: string): Promise<void> {
    await this.pool.query(`
      UPDATE royalty_reconciliation_runs
      SET status = 'failed',
          error_message = $2,
          completed_at = NOW()
      WHERE id = $1
    `, [runId, errorMessage]);
  }

  async getDiscrepancies(runId: string): Promise<any[]> {
    const result = await this.pool.query(`
      SELECT * FROM royalty_discrepancies WHERE reconciliation_run_id = $1
    `, [runId]);
    return result.rows;
  }

  async getReconciliationRun(runId: string): Promise<any | null> {
    const result = await this.pool.query(`
      SELECT * FROM royalty_reconciliation_runs WHERE id = $1
    `, [runId]);
    return result.rows[0] || null;
  }

  async schedulePayouts(tenantId: string): Promise<number> {
    const client = await this.pool.connect();
    let payoutsCreated = 0;

    try {
      const pending = await client.query(`
        SELECT recipient_id, recipient_type,
               SUM(amount_cents) as total_amount,
               COUNT(*) as distribution_count
        FROM royalty_distributions
        WHERE tenant_id = $1 AND status = 'pending'
        GROUP BY recipient_id, recipient_type
      `, [tenantId]);

      for (const group of pending.rows) {
        if (group.recipient_type === 'venue') {
          const settings = await client.query(`
            SELECT minimum_payout_amount_cents FROM venue_royalty_settings
            WHERE tenant_id = $1 AND venue_id = $2
          `, [tenantId, group.recipient_id]);

          const minimum = settings.rows[0]?.minimum_payout_amount_cents ?? 1000;
          if (parseFloat(group.total_amount) < minimum) {
            continue;
          }
        }

        const now = new Date();
        const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
        const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);

        await client.query(`
          INSERT INTO royalty_payouts (
            tenant_id, recipient_id, recipient_type, amount_cents,
            distribution_count, period_start, period_end, status, scheduled_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'scheduled', NOW())
        `, [
          tenantId,
          group.recipient_id,
          group.recipient_type,
          group.total_amount,
          group.distribution_count,
          periodStart,
          periodEnd
        ]);

        await client.query(`
          UPDATE royalty_distributions
          SET status = 'scheduled'
          WHERE tenant_id = $1 AND recipient_id = $2 AND recipient_type = $3 AND status = 'pending'
        `, [tenantId, group.recipient_id, group.recipient_type]);

        payoutsCreated++;
      }

      return payoutsCreated;

    } finally {
      client.release();
    }
  }
}
