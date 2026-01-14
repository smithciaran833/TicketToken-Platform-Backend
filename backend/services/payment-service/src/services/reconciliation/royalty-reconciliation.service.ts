import { db } from '../../config/database';
import { logger } from '../../utils/logger';
import axios from 'axios';

interface SecondarySale {
  signature: string;
  tokenId: string;
  price: number;
  seller: string;
  buyer: string;
  timestamp: Date;
  eventId?: string;
  venueId?: string;
}

interface RoyaltyDistribution {
  id: string;
  transaction_id: string;
  event_id: string;
  recipient_type: string;
  recipient_id: string;
  amount_cents: number;
  percentage: number;
  status: string;
  created_at: Date;
}

export class RoyaltyReconciliationService {
  private log = logger.child({ component: 'RoyaltyReconciliation' });
  private blockchainIndexerUrl = process.env.BLOCKCHAIN_INDEXER_URL || 'http://blockchain-indexer:3012';

  /**
   * Main reconciliation run - checks blockchain sales vs database royalties
   */
  async runReconciliation(startDate: Date, endDate: Date): Promise<void> {
    this.log.info({ startDate, endDate }, 'Starting royalty reconciliation');

    const runId = await this.createReconciliationRun(startDate, endDate);

    try {
      // 1. Get secondary sales from blockchain-indexer (MongoDB)
      const secondarySales = await this.getSecondarySalesFromBlockchain(startDate, endDate);
      this.log.info(`Found ${secondarySales.length} secondary sales on blockchain`);

      // 2. Get royalty distributions from our database
      const distributions = await this.getRoyaltyDistributions(startDate, endDate);
      this.log.info(`Found ${distributions.length} royalty distributions in database`);

      // 3. Reconcile and find discrepancies
      const results = await this.reconcile(runId, secondarySales, distributions);

      // 4. Schedule pending payouts
      await this.schedulePayouts();

      // 5. Complete the run
      await this.completeReconciliationRun(runId, results);

      this.log.info({ runId, ...results }, 'Reconciliation completed successfully');

    } catch (error: any) {
      this.log.error({ error, runId }, 'Reconciliation failed');
      await this.failReconciliationRun(runId, error.message);
      throw error;
    }
  }

  /**
   * Get secondary sales from blockchain-indexer MongoDB
   */
  private async getSecondarySalesFromBlockchain(startDate: Date, endDate: Date): Promise<SecondarySale[]> {
    try {
      const response = await axios.post(`${this.blockchainIndexerUrl}/api/v1/marketplace/sales`, {
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        eventType: 'sale'
      });

      return response.data.sales || [];
    } catch (error: any) {
      this.log.error({ error }, 'Failed to fetch secondary sales from blockchain-indexer');
      return [];
    }
  }

  /**
   * Get royalty distributions from PostgreSQL
   */
  private async getRoyaltyDistributions(startDate: Date, endDate: Date): Promise<RoyaltyDistribution[]> {
    const distributions = await db('royalty_distributions')
      .whereBetween('created_at', [startDate, endDate])
      .select('*');

    return distributions;
  }

  /**
   * Reconcile blockchain sales with database distributions
   */
  private async reconcile(
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

    // Create a map of distributions by transaction signature
    const distributionMap = new Map<string, RoyaltyDistribution[]>();
    for (const dist of distributions) {
      const key = dist.transaction_id;
      if (!distributionMap.has(key)) {
        distributionMap.set(key, []);
      }
      distributionMap.get(key)!.push(dist);
    }

    // Check each blockchain sale
    for (const sale of sales) {
      const existingDistributions = distributionMap.get(sale.signature) || [];

      // Calculate expected royalties
      const expectedRoyalties = await this.calculateExpectedRoyalties(sale);
      totalRoyaltiesCalculated += expectedRoyalties.total;

      if (existingDistributions.length === 0) {
        // Missing distribution - create discrepancy
        this.log.warn({ signature: sale.signature }, 'Missing royalty distribution for sale');

        await this.recordDiscrepancy(runId, {
          transaction_id: sale.signature,
          discrepancy_type: 'missing_distribution',
          expected_amount: expectedRoyalties.total,
          actual_amount: 0,
          variance: expectedRoyalties.total
        });

        discrepanciesFound++;

        // Auto-create the missing distribution
        await this.createMissingDistribution(sale, expectedRoyalties);
        discrepanciesResolved++;

      } else {
        // Check amounts
        const actualTotal = existingDistributions.reduce((sum, d) => sum + parseFloat(d.amount_cents.toString()), 0);
        totalRoyaltiesPaid += actualTotal;

        const variance = Math.abs(expectedRoyalties.total - actualTotal);

        if (variance > 0.01) { // More than 1 cent difference
          this.log.warn({
            signature: sale.signature,
            expected: expectedRoyalties.total,
            actual: actualTotal,
            variance
          }, 'Royalty amount mismatch');

          await this.recordDiscrepancy(runId, {
            transaction_id: sale.signature,
            discrepancy_type: 'incorrect_amount',
            expected_amount: expectedRoyalties.total,
            actual_amount: actualTotal,
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

  /**
   * Calculate expected royalties for a secondary sale
   */
  private async calculateExpectedRoyalties(sale: SecondarySale): Promise<{
    venue: number;
    artist: number;
    platform: number;
    total: number;
  }> {
    // Get venue settings
    const venueSettings = await db('venue_royalty_settings')
      .where('venue_id', sale.venueId)
      .first();

    // Get event settings
    const eventSettings = await db('event_royalty_settings')
      .where('event_id', sale.eventId)
      .first();

    const venuePercentage = eventSettings?.venue_royalty_percentage ??
                           venueSettings?.default_royalty_percentage ??
                           10;

    const artistPercentage = eventSettings?.artist_royalty_percentage ?? 0;
    const platformPercentage = 5;

    const venue = (sale.price * venuePercentage) / 100;
    const artist = (sale.price * artistPercentage) / 100;
    const platform = (sale.price * platformPercentage) / 100;

    return {
      venue,
      artist,
      platform,
      total: venue + artist + platform
    };
  }

  /**
   * Create missing royalty distribution
   */
  private async createMissingDistribution(sale: SecondarySale, royalties: any): Promise<void> {
    const distributions = [
      {
        transaction_id: sale.signature,
        event_id: sale.eventId,
        transaction_type: 'secondary_sale',
        recipient_type: 'venue',
        recipient_id: sale.venueId,
        amount_cents: royalties.venue,
        percentage: royalties.venue / sale.price * 100,
        status: 'pending'
      },
      {
        transaction_id: sale.signature,
        event_id: sale.eventId,
        transaction_type: 'secondary_sale',
        recipient_type: 'platform',
        recipient_id: 'tickettoken',
        amount_cents: royalties.platform,
        percentage: 5,
        status: 'pending'
      }
    ];

    if (royalties.artist > 0) {
      const eventSettings = await db('event_royalty_settings')
        .where('event_id', sale.eventId)
        .first();

      distributions.push({
        transaction_id: sale.signature,
        event_id: sale.eventId,
        transaction_type: 'secondary_sale',
        recipient_type: 'artist',
        recipient_id: eventSettings?.artist_wallet_address || 'unknown',
        amount_cents: royalties.artist,
        percentage: royalties.artist / sale.price * 100,
        status: 'pending'
      });
    }

    await db('royalty_distributions').insert(distributions);

    this.log.info({ signature: sale.signature }, 'Created missing royalty distributions');
  }

  /**
   * Record a discrepancy
   */
  private async recordDiscrepancy(runId: string, discrepancy: any): Promise<void> {
    await db('royalty_discrepancies').insert({
      reconciliation_run_id: runId,
      transaction_id: discrepancy.transaction_id,
      discrepancy_type: discrepancy.discrepancy_type,
      expected_amount: discrepancy.expected_amount,
      actual_amount: discrepancy.actual_amount,
      variance: discrepancy.variance,
      status: 'identified'
    });
  }

  /**
   * Schedule payouts for pending distributions
   */
  private async schedulePayouts(): Promise<void> {
    this.log.info('Scheduling royalty payouts');

    // Group pending distributions by recipient
    const pendingByRecipient = await db('royalty_distributions')
      .where('status', 'pending')
      .select('recipient_id', 'recipient_type')
      .sum('amount_cents as total_amount')
      .count('* as distribution_count')
      .groupBy('recipient_id', 'recipient_type');

    for (const group of pendingByRecipient) {
      // Check minimum payout threshold
      if (group.recipient_type === 'venue') {
        const settings = await db('venue_royalty_settings')
          .where('venue_id', group.recipient_id)
          .first();

        if (settings && parseFloat(group.total_amount) < settings.minimum_payout_amount_cents) {
          this.log.debug({
            venueId: group.recipient_id,
            amount: group.total_amount,
            minimum: settings.minimum_payout_amount_cents
          }, 'Skipping payout - below minimum threshold');
          continue;
        }
      }

      // Create payout
      await this.createPayout(group);
    }
  }

  /**
   * Create a payout for a recipient
   */
  private async createPayout(group: any): Promise<void> {
    const now = new Date();
    const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    const [payoutId] = await db('royalty_payouts').insert({
      recipient_id: group.recipient_id,
      recipient_type: group.recipient_type,
      amount_cents: group.total_amount,
      distribution_count: group.distribution_count,
      period_start: periodStart,
      period_end: periodEnd,
      status: 'scheduled',
      scheduled_at: new Date()
    }).returning('id');

    // Mark distributions as scheduled
    await db('royalty_distributions')
      .where('recipient_id', group.recipient_id)
      .where('recipient_type', group.recipient_type)
      .where('status', 'pending')
      .update({ status: 'scheduled' });

    this.log.info({
      payoutId,
      recipientId: group.recipient_id,
      amount: group.total_amount
    }, 'Created royalty payout');
  }

  /**
   * Create reconciliation run record
   */
  private async createReconciliationRun(startDate: Date, endDate: Date): Promise<string> {
    const [run] = await db('royalty_reconciliation_runs').insert({
      reconciliation_date: new Date(),
      period_start: startDate,
      period_end: endDate,
      status: 'running',
      started_at: new Date()
    }).returning('id');

    return run.id;
  }

  /**
   * Complete reconciliation run
   */
  private async completeReconciliationRun(runId: string, results: any): Promise<void> {
    const variance = results.totalRoyaltiesCalculated - results.totalRoyaltiesPaid;

    await db('royalty_reconciliation_runs')
      .where('id', runId)
      .update({
        transactions_checked: results.transactionsChecked,
        discrepancies_found: results.discrepanciesFound,
        discrepancies_resolved: results.discrepanciesResolved,
        total_royalties_calculated: results.totalRoyaltiesCalculated,
        total_royalties_paid: results.totalRoyaltiesPaid,
        variance_amount: variance,
        status: 'completed',
        completed_at: new Date()
      });
  }

  /**
   * Mark reconciliation run as failed
   */
  private async failReconciliationRun(runId: string, errorMessage: string): Promise<void> {
    await db('royalty_reconciliation_runs')
      .where('id', runId)
      .update({
        status: 'failed',
        error_message: errorMessage,
        completed_at: new Date()
      });
  }

  /**
   * Manual reconciliation for specific transaction
   */
  async reconcileTransaction(transactionSignature: string): Promise<void> {
    this.log.info({ signature: transactionSignature }, 'Manual reconciliation for transaction');

    // Get the transaction from blockchain
    const response = await axios.get(
      `${this.blockchainIndexerUrl}/api/v1/transactions/${transactionSignature}`
    );

    const sale: SecondarySale = response.data;

    // Check existing distributions
    const existing = await db('royalty_distributions')
      .where('transaction_id', transactionSignature)
      .select('*');

    if (existing.length === 0) {
      // Create missing distributions
      const royalties = await this.calculateExpectedRoyalties(sale);
      await this.createMissingDistribution(sale, royalties);
      this.log.info({ signature: transactionSignature }, 'Created missing distributions');
    } else {
      this.log.info({ signature: transactionSignature }, 'Distributions already exist');
    }
  }
}

export const royaltyReconciliationService = new RoyaltyReconciliationService();
