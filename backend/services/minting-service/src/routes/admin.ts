import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { BatchMintingService } from '../services/BatchMintingService';
import { ReconciliationService } from '../services/ReconciliationService';
import { metadataCache } from '../services/MetadataCache';
import { getBalanceMonitor } from '../services/BalanceMonitor';
import db from '../config/database';
import logger from '../utils/logger';

/**
 * Admin routes for managing the minting service
 * 
 * Authentication should be added in production
 */
export default async function adminRoutes(
  fastify: FastifyInstance,
  options: any
): Promise<void> {
  
  // ===== Dashboard Overview =====
  
  fastify.get('/admin/dashboard', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const stats = await getDashboardStats();
      return reply.send(stats);
    } catch (error) {
      logger.error('Dashboard stats error', { error: (error as Error).message });
      return reply.code(500).send({ error: 'Failed to fetch dashboard stats' });
    }
  });

  // ===== Batch Minting =====
  
  interface BatchMintBody {
    venueId: string;
    tickets: Array<{
      id: string;
      eventId: string;
      userId: string;
      ticketData: any;
    }>;
  }

  fastify.post<{ Body: BatchMintBody }>(
    '/admin/batch-mint',
    async (request, reply) => {
      try {
        const { venueId, tickets } = request.body;

        if (!venueId || !tickets || !Array.isArray(tickets)) {
          return reply.code(400).send({ error: 'Invalid request body' });
        }

        const service = new BatchMintingService();
        const result = await service.batchMint({ venueId, tickets });

        return reply.send(result);

      } catch (error) {
        logger.error('Batch mint error', { error: (error as Error).message });
        return reply.code(500).send({ error: 'Batch minting failed' });
      }
    }
  );

  fastify.get<{ Querystring: { count: string } }>(
    '/admin/batch-mint/estimate',
    async (request, reply) => {
      try {
        const count = parseInt(request.query.count || '10');
        
        const service = new BatchMintingService();
        const estimate = await service.estimateBatchCost(count);

        return reply.send(estimate);

      } catch (error) {
        logger.error('Batch estimate error', { error: (error as Error).message });
        return reply.code(500).send({ error: 'Failed to estimate cost' });
      }
    }
  );

  // ===== Reconciliation =====
  
  fastify.post<{ Params: { venueId: string } }>(
    '/admin/reconcile/:venueId',
    async (request, reply) => {
      try {
        const { venueId } = request.params;

        const service = new ReconciliationService();
        const result = await service.reconcileAll(venueId);

        return reply.send(result);

      } catch (error) {
        logger.error('Reconciliation error', { error: (error as Error).message });
        return reply.code(500).send({ error: 'Reconciliation failed' });
      }
    }
  );

  interface FixDiscrepanciesBody {
    ticketIds: string[];
  }

  fastify.post<{ Params: { venueId: string }; Body: FixDiscrepanciesBody }>(
    '/admin/reconcile/:venueId/fix',
    async (request, reply) => {
      try {
        const { venueId } = request.params;
        const { ticketIds } = request.body;

        if (!ticketIds || !Array.isArray(ticketIds)) {
          return reply.code(400).send({ error: 'Invalid ticket IDs' });
        }

        const service = new ReconciliationService();
        const result = await service.fixDiscrepancies(venueId, ticketIds);

        return reply.send(result);

      } catch (error) {
        logger.error('Fix discrepancies error', { error: (error as Error).message });
        return reply.code(500).send({ error: 'Failed to fix discrepancies' });
      }
    }
  );

  fastify.get<{ Params: { venueId: string } }>(
    '/admin/reconcile/:venueId/history',
    async (request, reply) => {
      try {
        const { venueId } = request.params;

        const service = new ReconciliationService();
        const history = await service.getReconciliationHistory(venueId);

        return reply.send(history);

      } catch (error) {
        logger.error('Reconciliation history error', { error: (error as Error).message });
        return reply.code(500).send({ error: 'Failed to fetch history' });
      }
    }
  );

  // ===== Cache Management =====
  
  fastify.get('/admin/cache/stats', async (request, reply) => {
    try {
      const stats = await metadataCache.getStats();
      return reply.send(stats);
    } catch (error) {
      logger.error('Cache stats error', { error: (error as Error).message });
      return reply.code(500).send({ error: 'Failed to fetch cache stats' });
    }
  });

  fastify.delete<{ Params: { ticketId: string } }>(
    '/admin/cache/:ticketId',
    async (request, reply) => {
      try {
        const { ticketId } = request.params;
        
        await metadataCache.invalidateTicket(ticketId);
        
        return reply.send({ message: 'Cache invalidated', ticketId });
      } catch (error) {
        logger.error('Cache invalidation error', { error: (error as Error).message });
        return reply.code(500).send({ error: 'Failed to invalidate cache' });
      }
    }
  );

  fastify.delete('/admin/cache/clear', async (request, reply) => {
    try {
      await metadataCache.clearAll();
      
      return reply.send({ message: 'All cache cleared' });
    } catch (error) {
      logger.error('Cache clear error', { error: (error as Error).message });
      return reply.code(500).send({ error: 'Failed to clear cache' });
    }
  });

  // ===== Minting Operations =====
  
  fastify.get('/admin/mints', async (request, reply) => {
    try {
      const mints = await db('ticket_mints')
        .orderBy('created_at', 'desc')
        .limit(100)
        .select('*');

      return reply.send(mints);
    } catch (error) {
      logger.error('Fetch mints error', { error: (error as Error).message });
      return reply.code(500).send({ error: 'Failed to fetch mints' });
    }
  });

  fastify.get<{ Params: { ticketId: string } }>(
    '/admin/mints/:ticketId',
    async (request, reply) => {
      try {
        const { ticketId } = request.params;

        const mint = await db('ticket_mints')
          .where({ ticket_id: ticketId })
          .first();

        if (!mint) {
          return reply.code(404).send({ error: 'Mint not found' });
        }

        return reply.send(mint);
      } catch (error) {
        logger.error('Fetch mint error', { error: (error as Error).message });
        return reply.code(500).send({ error: 'Failed to fetch mint' });
      }
    }
  );

  // ===== System Health =====
  
  fastify.get('/admin/system/status', async (request, reply) => {
    try {
      const balanceMonitor = getBalanceMonitor();
      const balanceStatus = await balanceMonitor.getBalanceStatus();
      const cacheStats = await metadataCache.getStats();

      const status = {
        balanceMonitor: {
          balance: balanceStatus.balance,
          sufficient: balanceStatus.sufficient,
          minRequired: balanceStatus.minRequired,
          lastCheck: balanceStatus.lastCheck
        },
        cache: cacheStats,
        database: {
          connected: true // If we got here, DB is connected
        },
        timestamp: new Date().toISOString()
      };

      return reply.send(status);
    } catch (error) {
      logger.error('System status error', { error: (error as Error).message });
      return reply.code(500).send({ error: 'Failed to fetch system status' });
    }
  });

  // ===== Statistics =====
  
  fastify.get<{ Params: { venueId: string } }>(
    '/admin/stats/:venueId',
    async (request, reply) => {
      try {
        const { venueId } = request.params;

        const stats = await getVenueStats(venueId);
        
        return reply.send(stats);
      } catch (error) {
        logger.error('Venue stats error', { error: (error as Error).message });
        return reply.code(500).send({ error: 'Failed to fetch venue stats' });
      }
    }
  );
}

/**
 * Get dashboard overview statistics
 */
async function getDashboardStats() {
  const [
    totalMints,
    pendingMints,
    failedMints,
    recentMints
  ] = await Promise.all([
    db('ticket_mints').count('* as count').first(),
    db('ticket_mints').where({ status: 'pending' }).count('* as count').first(),
    db('ticket_mints').where({ status: 'failed' }).count('* as count').first(),
    db('ticket_mints')
      .orderBy('created_at', 'desc')
      .limit(10)
      .select('ticket_id', 'status', 'venue_id', 'created_at')
  ]);

  return {
    totalMints: parseInt(totalMints?.count as string || '0'),
    pendingMints: parseInt(pendingMints?.count as string || '0'),
    failedMints: parseInt(failedMints?.count as string || '0'),
    recentMints
  };
}

/**
 * Get venue-specific statistics
 */
async function getVenueStats(venueId: string) {
  const [
    totalMints,
    successfulMints,
    failedMints,
    avgMintTime
  ] = await Promise.all([
    db('ticket_mints')
      .where({ venue_id: venueId })
      .count('* as count')
      .first(),
    db('ticket_mints')
      .where({ venue_id: venueId, status: 'minted' })
      .count('* as count')
      .first(),
    db('ticket_mints')
      .where({ venue_id: venueId, status: 'failed' })
      .count('* as count')
      .first(),
    db('ticket_mints')
      .where({ venue_id: venueId, status: 'minted' })
      .avg('mint_duration as duration')
      .first()
  ]);

  const total = parseInt(totalMints?.count as string || '0');
  const successful = parseInt(successfulMints?.count as string || '0');
  const failed = parseInt(failedMints?.count as string || '0');

  return {
    venueId,
    totalMints: total,
    successfulMints: successful,
    failedMints: failed,
    successRate: total > 0 ? (successful / total) * 100 : 0,
    avgMintTimeSeconds: parseFloat(avgMintTime?.duration || '0')
  };
}
