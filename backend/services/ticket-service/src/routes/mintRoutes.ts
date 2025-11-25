import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { MintWorker } from '../workers/mintWorker';
import { logger } from '../utils/logger';
import { DatabaseService } from '../services/databaseService';

const log = logger.child({ component: 'MintRoutes' });

// This should ONLY be called by internal queue processor
const MINT_SECRET = process.env.MINT_SERVICE_SECRET || 'mint-service-secret-change-in-production';

// Middleware to verify mint service authorization
async function verifyMintAuthorization(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const authHeader = request.headers['x-mint-authorization'] as string;

  if (!authHeader) {
    log.warn('Mint request without authorization');
    return reply.status(401).send({ error: 'Unauthorized' });
  }

  // Verify the authorization token
  if (authHeader !== `Bearer ${MINT_SECRET}`) {
    log.warn('Invalid mint authorization');
    return reply.status(401).send({ error: 'Invalid authorization' });
  }

  // Verify the job is valid and hasn't been processed
  const job = request.body as any;

  if (!job.orderId || !job.userId || !job.quantity) {
    return reply.status(400).send({ error: 'Invalid job structure' });
  }

  // Check if order exists and is in correct state
  const db = DatabaseService.getPool();
  try {
    const orderCheck = await db.query(
      'SELECT status, tenant_id FROM orders WHERE id = $1',
      [job.orderId]
    );

    if (orderCheck.rows.length === 0) {
      log.warn('Mint request for non-existent order', { orderId: job.orderId });
      return reply.status(404).send({ error: 'Order not found' });
    }

    const order = orderCheck.rows[0];

    // Only mint for orders that are PAID or AWAITING_MINT
    if (!['PAID', 'AWAITING_MINT'].includes(order.status)) {
      log.warn('Mint request for invalid order status', {
        orderId: job.orderId,
        status: order.status
      });
      return reply.status(400).send({ error: 'Invalid order status for minting' });
    }

    // Add tenant context
    (request as any).tenantId = order.tenant_id;
  } catch (error) {
    log.error('Database check failed', error);
    return reply.status(500).send({ error: 'Validation failed' });
  }
}

export default async function mintRoutes(fastify: FastifyInstance) {
  // Endpoint to trigger minting - SECURED
  fastify.post('/process-mint', {
    preHandler: [verifyMintAuthorization]
  }, async (request, reply) => {
    try {
      const job = request.body as any;
      const tenantId = (request as any).tenantId;

      log.info('Processing mint job', {
        orderId: job.orderId,
        ticketCount: job.quantity,
        tenantId
      });

      const result = await MintWorker.processMintJob(job);

      reply.send(result);
    } catch (error: any) {
      log.error('Mint processing failed', error);
      reply.status(500).send({
        error: 'Mint failed',
        message: error.message
      });
    }
  });
}
