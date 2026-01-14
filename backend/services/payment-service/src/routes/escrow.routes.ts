/**
 * Escrow Routes
 * 
 * HIGH FIX: Implements escrow API endpoints with:
 * - UUID validation for escrowId
 * - Proper tenant isolation
 * - Request validation
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { escrowService } from '../services/escrow.service';
import { 
  validateCreateEscrow, 
  validateEscrowIdParam,
  validateReleaseEscrow,
  CreateEscrowInput,
  EscrowIdParam,
  ReleaseEscrowInput,
} from '../validators/payment.validator';
import { logger } from '../utils/logger';

const log = logger.child({ component: 'EscrowRoutes' });

// =============================================================================
// ROUTE HANDLERS
// =============================================================================

export default async function escrowRoutes(fastify: FastifyInstance) {
  /**
   * POST /escrow
   * Create a new escrow account
   */
  fastify.post(
    '/',
    {
      preHandler: [validateCreateEscrow],
      schema: {
        body: {
          type: 'object',
          required: ['orderId', 'paymentIntentId', 'amount'],
          properties: {
            orderId: { type: 'string', format: 'uuid' },
            paymentIntentId: { type: 'string', pattern: '^pi_[a-zA-Z0-9]+$' },
            amount: { type: 'integer', minimum: 50 },
            holdDays: { type: 'integer', minimum: 1, maximum: 90, default: 7 },
            releaseConditions: { type: 'array', items: { type: 'string' } },
          },
        },
        response: {
          201: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              orderId: { type: 'string' },
              amount: { type: 'integer' },
              heldAmount: { type: 'integer' },
              status: { type: 'string' },
              holdUntil: { type: 'string' },
            },
          },
          400: {
            type: 'object',
            properties: {
              type: { type: 'string' },
              title: { type: 'string' },
              status: { type: 'integer' },
              detail: { type: 'string' },
            },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const tenantId = (request as any).tenantId;
      const body = (request as any).validatedBody as CreateEscrowInput;

      try {
        const escrow = await escrowService.createEscrow({
          ...body,
          tenantId,
        });

        log.info({
          escrowId: escrow.id,
          orderId: escrow.orderId,
          amount: escrow.amount,
        }, 'Escrow created');

        return reply.status(201).send(escrow);
      } catch (error: any) {
        log.error({ error: error.message }, 'Failed to create escrow');
        
        return reply.status(400).send({
          type: 'https://api.tickettoken.io/problems/escrow-creation-failed',
          title: 'Escrow Creation Failed',
          status: 400,
          detail: error.message,
        });
      }
    }
  );

  /**
   * GET /escrow/:escrowId
   * Get an escrow account by ID
   */
  fastify.get(
    '/:escrowId',
    {
      preHandler: [validateEscrowIdParam],
      schema: {
        params: {
          type: 'object',
          required: ['escrowId'],
          properties: {
            escrowId: { type: 'string', format: 'uuid' },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              orderId: { type: 'string' },
              paymentIntentId: { type: 'string' },
              amount: { type: 'integer' },
              heldAmount: { type: 'integer' },
              releasedAmount: { type: 'integer' },
              status: { type: 'string' },
              holdUntil: { type: 'string' },
              createdAt: { type: 'string' },
            },
          },
          404: {
            type: 'object',
            properties: {
              type: { type: 'string' },
              title: { type: 'string' },
              status: { type: 'integer' },
            },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const tenantId = (request as any).tenantId;
      const { escrowId } = (request as any).validatedParams as EscrowIdParam;

      const escrow = await escrowService.getEscrow(escrowId, tenantId);

      if (!escrow) {
        return reply.status(404).send({
          type: 'https://api.tickettoken.io/problems/not-found',
          title: 'Escrow Not Found',
          status: 404,
        });
      }

      return reply.send(escrow);
    }
  );

  /**
   * POST /escrow/:escrowId/release
   * Release funds from escrow
   */
  fastify.post(
    '/:escrowId/release',
    {
      preHandler: [validateEscrowIdParam],
      schema: {
        params: {
          type: 'object',
          required: ['escrowId'],
          properties: {
            escrowId: { type: 'string', format: 'uuid' },
          },
        },
        body: {
          type: 'object',
          properties: {
            amount: { type: 'integer', minimum: 1 },
            reason: { type: 'string', maxLength: 500 },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              heldAmount: { type: 'integer' },
              releasedAmount: { type: 'integer' },
              status: { type: 'string' },
            },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const tenantId = (request as any).tenantId;
      const { escrowId } = (request as any).validatedParams as EscrowIdParam;
      const body = request.body as { amount?: number; reason?: string };

      try {
        const escrow = await escrowService.releaseEscrow({
          escrowId,
          amount: body.amount,
          reason: body.reason,
          tenantId,
        });

        log.info({
          escrowId,
          releasedAmount: body.amount || 'full',
          newStatus: escrow.status,
        }, 'Escrow released');

        return reply.send(escrow);
      } catch (error: any) {
        log.error({ error: error.message, escrowId }, 'Failed to release escrow');
        
        return reply.status(400).send({
          type: 'https://api.tickettoken.io/problems/escrow-release-failed',
          title: 'Escrow Release Failed',
          status: 400,
          detail: error.message,
        });
      }
    }
  );

  /**
   * POST /escrow/:escrowId/cancel
   * Cancel an escrow
   */
  fastify.post(
    '/:escrowId/cancel',
    {
      preHandler: [validateEscrowIdParam],
      schema: {
        params: {
          type: 'object',
          required: ['escrowId'],
          properties: {
            escrowId: { type: 'string', format: 'uuid' },
          },
        },
        body: {
          type: 'object',
          required: ['reason'],
          properties: {
            reason: { type: 'string', maxLength: 500 },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const tenantId = (request as any).tenantId;
      const { escrowId } = (request as any).validatedParams as EscrowIdParam;
      const { reason } = request.body as { reason: string };

      try {
        const escrow = await escrowService.cancelEscrow(escrowId, reason, tenantId);

        log.info({ escrowId, reason }, 'Escrow cancelled');

        return reply.send(escrow);
      } catch (error: any) {
        log.error({ error: error.message, escrowId }, 'Failed to cancel escrow');
        
        return reply.status(400).send({
          type: 'https://api.tickettoken.io/problems/escrow-cancel-failed',
          title: 'Escrow Cancellation Failed',
          status: 400,
          detail: error.message,
        });
      }
    }
  );

  /**
   * GET /escrow/order/:orderId
   * List escrows for an order
   */
  fastify.get(
    '/order/:orderId',
    {
      schema: {
        params: {
          type: 'object',
          required: ['orderId'],
          properties: {
            orderId: { type: 'string', format: 'uuid' },
          },
        },
        response: {
          200: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                orderId: { type: 'string' },
                amount: { type: 'integer' },
                status: { type: 'string' },
              },
            },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const tenantId = (request as any).tenantId;
      const { orderId } = request.params as { orderId: string };

      const escrows = await escrowService.listEscrowsForOrder(orderId, tenantId);

      return reply.send(escrows);
    }
  );
}
