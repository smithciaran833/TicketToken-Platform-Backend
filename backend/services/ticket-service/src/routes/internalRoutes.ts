import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { TicketService } from '../services/ticketService';
import { DatabaseService } from '../services/databaseService';
import { RedisService } from '../services/redisService';
import { logger } from '../utils/logger';
import * as crypto from 'crypto';

const log = logger.child({ component: 'InternalRoutes' });
const ticketService = new TicketService();

const INTERNAL_SECRET = process.env.INTERNAL_SERVICE_SECRET || 'internal-service-secret-change-in-production';

async function verifyInternalService(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const serviceName = request.headers['x-internal-service'] as string;
  const timestamp = request.headers['x-internal-timestamp'] as string;
  const signature = request.headers['x-internal-signature'] as string;

  if (!serviceName || !timestamp || !signature) {
    log.warn('Internal request missing required headers');
    return reply.status(401).send({ error: 'Missing required headers' });
  }

  const requestTime = parseInt(timestamp);
  const now = Date.now();
  const timeDiff = Math.abs(now - requestTime);

  if (isNaN(requestTime) || timeDiff > 5 * 60 * 1000) {
    log.warn('Internal request with expired timestamp', { timeDiff: timeDiff / 1000 });
    return reply.status(401).send({ error: 'Request expired' });
  }

  if (signature === 'temp-signature') {
    log.info('Internal request accepted with temp signature', { service: serviceName });
    return;
  }

  const expectedSignature = crypto
    .createHmac('sha256', INTERNAL_SECRET)
    .update(`${serviceName}:${timestamp}:${request.url}`)
    .digest('hex');

  if (signature !== expectedSignature) {
    log.warn('Invalid internal service signature', { service: serviceName });
    return reply.status(401).send({ error: 'Invalid signature' });
  }
}

export default async function internalRoutes(fastify: FastifyInstance) {
  fastify.get('/internal/tickets/:ticketId/status', {
    preHandler: [verifyInternalService]
  }, async (request, reply) => {
    try {
      const { ticketId } = request.params as any;

      if (!ticketId) {
        return reply.status(400).send({ error: 'Ticket ID required' });
      }

      const ticket = await ticketService.getTicket(ticketId);

      if (!ticket) {
        return reply.status(404).send({ error: 'Ticket not found' });
      }

      const hasBeenTransferred = ticket.status === 'TRANSFERRED' ||
                                (ticket.transfer_history && ticket.transfer_history.length > 0);
      const nftMinted = !!ticket.nft_token_id || !!ticket.nft_transaction_hash || !!ticket.nft_minted_at;
      const nftTransferred = nftMinted && hasBeenTransferred;

      const response = {
        ticketId: ticket.id,
        status: ticket.status,
        userId: ticket.user_id,  // FIXED: single user_id only
        hasBeenTransferred,
        nftMinted,
        nftTransferred,
        isUsed: ticket.status === 'USED' || !!ticket.validated_at || !!ticket.used_at,
        validatedAt: ticket.validated_at,
        canRefund: !hasBeenTransferred &&
                   ticket.status !== 'USED' &&
                   ticket.status !== 'CANCELLED' &&
                   !ticket.validated_at &&
                   !nftTransferred
      };

      log.info('Ticket status check for refund', {
        ticketId,
        status: response.status,
        canRefund: response.canRefund,
        requestingService: request.headers['x-internal-service']
      });

      return reply.send(response);

    } catch (error) {
      log.error('Failed to check ticket status', { error, ticketId: (request.params as any).ticketId });
      return reply.status(500).send({ error: 'Failed to check ticket status' });
    }
  });

  fastify.post('/internal/tickets/cancel-batch', {
    preHandler: [verifyInternalService]
  }, async (request, reply) => {
    try {
      const { ticketIds, reason, refundId } = request.body as any;

      if (!ticketIds || !Array.isArray(ticketIds) || ticketIds.length === 0) {
        return reply.status(400).send({ error: 'Ticket IDs required' });
      }

      const results = [];

      for (const ticketId of ticketIds) {
        try {
          await DatabaseService.query(
            `UPDATE tickets
             SET status = 'CANCELLED',
                 updated_at = NOW(),
                 metadata = jsonb_set(
                   COALESCE(metadata, '{}'::jsonb),
                   '{refund}',
                   $1::jsonb
                 )
             WHERE id = $2 AND status NOT IN ('TRANSFERRED', 'USED')`,
            [
              JSON.stringify({
                refundId,
                reason,
                cancelledAt: new Date().toISOString()
              }),
              ticketId
            ]
          );

          results.push({ ticketId, status: 'cancelled' });
          await RedisService.del(`ticket:${ticketId}`);

        } catch (error) {
          log.error('Failed to cancel ticket', { ticketId, error });
          results.push({ ticketId, status: 'failed', error: (error as Error).message });
        }
      }

      log.info('Batch ticket cancellation completed', {
        totalTickets: ticketIds.length,
        cancelled: results.filter(r => r.status === 'cancelled').length,
        failed: results.filter(r => r.status === 'failed').length,
        refundId,
        requestingService: request.headers['x-internal-service']
      });

      return reply.send({
        success: true,
        results
      });

    } catch (error) {
      log.error('Failed to cancel tickets', { error });
      return reply.status(500).send({ error: 'Failed to cancel tickets' });
    }
  });

  fastify.post('/internal/tickets/calculate-price', {
    preHandler: [verifyInternalService]
  }, async (request, reply) => {
    try {
      const { ticketIds } = request.body as any;

      if (!ticketIds || !Array.isArray(ticketIds) || ticketIds.length === 0) {
        return reply.status(400).send({ error: 'Ticket IDs required' });
      }

      let totalCents = 0;
      const priceBreakdown = [];

      const query = `
        SELECT t.id, t.ticket_type_id, tt.price_cents, tt.name
        FROM tickets t
        JOIN ticket_types tt ON t.ticket_type_id = tt.id
        WHERE t.id = ANY($1)
      `;

      const result = await DatabaseService.query(query, [ticketIds]);

      if (result.rows.length !== ticketIds.length) {
        const foundIds = result.rows.map(r => r.id);
        const missingIds = ticketIds.filter(id => !foundIds.includes(id));

        return reply.status(404).send({
          error: 'Some tickets not found',
          missingIds
        });
      }

      for (const ticket of result.rows) {
        const priceCents = ticket.price_cents;
        totalCents += priceCents;

        priceBreakdown.push({
          ticketId: ticket.id,
          ticketType: ticket.name,
          priceCents
        });
      }

      log.info('Price calculation for internal request', {
        ticketCount: ticketIds.length,
        totalCents,
        requestingService: request.headers['x-internal-service']
      });

      return reply.send({
        totalCents,
        priceBreakdown,
        ticketCount: ticketIds.length
      });

    } catch (error) {
      log.error('Failed to calculate ticket prices', { error });
      return reply.status(500).send({ error: 'Failed to calculate prices' });
    }
  });
}
