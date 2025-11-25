import { FastifyInstance } from 'fastify';
import { db } from '../config/database';
import { escrowMonitorService } from '../services/escrow-monitor.service';
import { feeDistributionService } from '../services/fee-distribution.service';

export default async function metricsRoutes(fastify: FastifyInstance) {
  /**
   * Prometheus-compatible metrics endpoint
   */
  fastify.get('/metrics', async (request, reply) => {
    try {
      // Get marketplace statistics
      const listingStats = await db('marketplace_listings')
        .select(
          db.raw("COUNT(*) FILTER (WHERE status = 'active') as active_listings"),
          db.raw("COUNT(*) FILTER (WHERE status = 'sold') as sold_listings"),
          db.raw("COUNT(*) FILTER (WHERE status = 'cancelled') as cancelled_listings"),
          db.raw('COUNT(*) as total_listings')
        )
        .first();

      const transferStats = await db('marketplace_transfers')
        .select(
          db.raw("COUNT(*) FILTER (WHERE status = 'completed') as completed_transfers"),
          db.raw("COUNT(*) FILTER (WHERE status = 'failed') as failed_transfers"),
          db.raw("COUNT(*) FILTER (WHERE status = 'initiated') as initiated_transfers"),
          db.raw('SUM(usd_value) FILTER (WHERE status = \'completed\') as total_volume')
        )
        .first();

      // Get escrow metrics
      const escrowMetrics = await escrowMonitorService.getMetrics();

      // Get fee statistics
      const feeStats = await feeDistributionService.getFeeStatistics({});

      // Build Prometheus-formatted metrics
      const metrics = `
# HELP marketplace_active_listings Number of active listings
# TYPE marketplace_active_listings gauge
marketplace_active_listings ${listingStats.active_listings || 0}

# HELP marketplace_sold_listings Total number of sold listings
# TYPE marketplace_sold_listings counter
marketplace_sold_listings ${listingStats.sold_listings || 0}

# HELP marketplace_cancelled_listings Total number of cancelled listings
# TYPE marketplace_cancelled_listings counter
marketplace_cancelled_listings ${listingStats.cancelled_listings || 0}

# HELP marketplace_completed_transfers Total number of completed transfers
# TYPE marketplace_completed_transfers counter
marketplace_completed_transfers ${transferStats.completed_transfers || 0}

# HELP marketplace_failed_transfers Total number of failed transfers
# TYPE marketplace_failed_transfers counter
marketplace_failed_transfers ${transferStats.failed_transfers || 0}

# HELP marketplace_initiated_transfers Number of in-progress transfers
# TYPE marketplace_initiated_transfers gauge
marketplace_initiated_transfers ${transferStats.initiated_transfers || 0}

# HELP marketplace_total_volume_usd Total transaction volume in USD
# TYPE marketplace_total_volume_usd counter
marketplace_total_volume_usd ${transferStats.total_volume || 0}

# HELP marketplace_active_escrows Number of active escrow accounts
# TYPE marketplace_active_escrows gauge
marketplace_active_escrows ${escrowMetrics.activeEscrows}

# HELP marketplace_timed_out_escrows Number of timed out escrows
# TYPE marketplace_timed_out_escrows gauge
marketplace_timed_out_escrows ${escrowMetrics.timedOutEscrows}

# HELP marketplace_total_escrow_value_usd Total value in escrow (USD)
# TYPE marketplace_total_escrow_value_usd gauge
marketplace_total_escrow_value_usd ${escrowMetrics.totalEscrowValue}

# HELP marketplace_platform_fees_collected_usd Total platform fees collected (USD)
# TYPE marketplace_platform_fees_collected_usd counter
marketplace_platform_fees_collected_usd ${feeStats.platformFeesCollected}

# HELP marketplace_venue_fees_collected_usd Total venue fees collected (USD)
# TYPE marketplace_venue_fees_collected_usd counter
marketplace_venue_fees_collected_usd ${feeStats.venueFeesCollected}

# HELP marketplace_fee_transactions Total number of fee-bearing transactions
# TYPE marketplace_fee_transactions counter
marketplace_fee_transactions ${feeStats.transactionCount}
`;

      reply.type('text/plain').send(metrics.trim());
    } catch (error) {
      fastify.log.error({ error }, 'Failed to generate metrics');
      reply.status(500).send('# Error generating metrics\n');
    }
  });

  /**
   * JSON metrics endpoint for dashboards
   */
  fastify.get('/metrics/json', async (request, reply) => {
    try {
      const listingStats = await db('marketplace_listings')
        .select(
          db.raw("COUNT(*) FILTER (WHERE status = 'active') as active"),
          db.raw("COUNT(*) FILTER (WHERE status = 'sold') as sold"),
          db.raw("COUNT(*) FILTER (WHERE status = 'cancelled') as cancelled"),
          db.raw('COUNT(*) as total')
        )
        .first();

      const transferStats = await db('marketplace_transfers')
        .select(
          db.raw("COUNT(*) FILTER (WHERE status = 'completed') as completed"),
          db.raw("COUNT(*) FILTER (WHERE status = 'failed') as failed"),
          db.raw("COUNT(*) FILTER (WHERE status = 'initiated') as initiated"),
          db.raw('SUM(usd_value) FILTER (WHERE status = \'completed\') as volume')
        )
        .first();

      const escrowMetrics = await escrowMonitorService.getMetrics();
      const feeStats = await feeDistributionService.getFeeStatistics({});

      reply.send({
        timestamp: new Date().toISOString(),
        listings: {
          active: parseInt(listingStats.active) || 0,
          sold: parseInt(listingStats.sold) || 0,
          cancelled: parseInt(listingStats.cancelled) || 0,
          total: parseInt(listingStats.total) || 0
        },
        transfers: {
          completed: parseInt(transferStats.completed) || 0,
          failed: parseInt(transferStats.failed) || 0,
          initiated: parseInt(transferStats.initiated) || 0,
          totalVolume: parseFloat(transferStats.volume) || 0
        },
        escrow: {
          active: escrowMetrics.activeEscrows,
          timedOut: escrowMetrics.timedOutEscrows,
          totalValue: escrowMetrics.totalEscrowValue
        },
        fees: {
          platformCollected: feeStats.platformFeesCollected,
          venueCollected: feeStats.venueFeesCollected,
          totalCollected: feeStats.totalFeesCollected,
          transactionCount: feeStats.transactionCount,
          averagePerTransaction: feeStats.averageFeePerTransaction
        }
      });
    } catch (error) {
      fastify.log.error({ error }, 'Failed to generate JSON metrics');
      reply.status(500).send({ error: 'Failed to generate metrics' });
    }
  });
}
