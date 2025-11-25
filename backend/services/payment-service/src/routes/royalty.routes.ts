import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { royaltyReconciliationService } from '../services/reconciliation/royalty-reconciliation.service';
import { RoyaltySplitterService } from '../services/marketplace/royalty-splitter.service';
import { db } from '../config/database';

const royaltySplitter = new RoyaltySplitterService();

export default async function royaltyRoutes(fastify: FastifyInstance) {
  /**
   * GET /report/:venueId
   * Get royalty report for a venue
   */
  fastify.get<{ Params: { venueId: string } }>('/report/:venueId', async (request, reply) => {
    try {
      const { venueId } = request.params;
      const { startDate, endDate } = request.query as any;

      const start = startDate ? new Date(startDate as string) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const end = endDate ? new Date(endDate as string) : new Date();

      const report = await royaltySplitter.getRoyaltyReport(venueId, start, end);

      return report;
    } catch (error: any) {
      return reply.code(500).send({ error: error.message });
    }
  });

  /**
   * GET /payouts/:recipientId
   * Get payout history for a recipient
   */
  fastify.get<{ Params: { recipientId: string } }>('/payouts/:recipientId', async (request, reply) => {
    try {
      const { recipientId } = request.params;

      const payouts = await db('royalty_payouts')
        .where('recipient_id', recipientId)
        .orderBy('created_at', 'desc')
        .limit(50);

      return { payouts };
    } catch (error: any) {
      return reply.code(500).send({ error: error.message });
    }
  });

  /**
   * GET /distributions/:recipientId
   * Get royalty distributions for a recipient
   */
  fastify.get<{ Params: { recipientId: string } }>('/distributions/:recipientId', async (request, reply) => {
    try {
      const { recipientId } = request.params;
      const { status } = request.query as any;

      let query = db('royalty_distributions')
        .where('recipient_id', recipientId)
        .orderBy('created_at', 'desc')
        .limit(100);

      if (status) {
        query = query.where('status', status);
      }

      const distributions = await query;

      return { distributions };
    } catch (error: any) {
      return reply.code(500).send({ error: error.message });
    }
  });

  /**
   * POST /reconcile
   * Trigger manual reconciliation
   */
  fastify.post('/reconcile', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { startDate, endDate, transactionSignature } = request.body as any;

      if (transactionSignature) {
        // Reconcile single transaction
        await royaltyReconciliationService.reconcileTransaction(transactionSignature);
        return { message: 'Transaction reconciled successfully' };
      } else {
        // Reconcile date range
        const start = new Date(startDate);
        const end = new Date(endDate);

        await royaltyReconciliationService.runReconciliation(start, end);
        return { message: 'Reconciliation completed successfully' };
      }
    } catch (error: any) {
      return reply.code(500).send({ error: error.message });
    }
  });

  /**
   * GET /reconciliation-runs
   * Get reconciliation run history
   */
  fastify.get('/reconciliation-runs', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const runs = await db('royalty_reconciliation_runs')
        .orderBy('started_at', 'desc')
        .limit(20);

      return { runs };
    } catch (error: any) {
      return reply.code(500).send({ error: error.message });
    }
  });

  /**
   * GET /discrepancies
   * Get unresolved discrepancies
   */
  fastify.get('/discrepancies', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { status } = request.query as any;

      let query = db('royalty_discrepancies')
        .orderBy('created_at', 'desc')
        .limit(100);

      if (status) {
        query = query.where('status', status);
      } else {
        query = query.whereIn('status', ['identified', 'investigating']);
      }

      const discrepancies = await query;

      return { discrepancies };
    } catch (error: any) {
      return reply.code(500).send({ error: error.message });
    }
  });

  /**
   * PUT /discrepancies/:id/resolve
   * Mark a discrepancy as resolved
   */
  fastify.put<{ Params: { id: string } }>('/discrepancies/:id/resolve', async (request, reply) => {
    try {
      const { id } = request.params;
      const { resolution_notes, resolved_by } = request.body as any;

      await db('royalty_discrepancies')
        .where('id', id)
        .update({
          status: 'resolved',
          resolution_notes,
          resolved_by,
          resolved_at: new Date()
        });

      return { message: 'Discrepancy resolved' };
    } catch (error: any) {
      return reply.code(500).send({ error: error.message });
    }
  });
}
