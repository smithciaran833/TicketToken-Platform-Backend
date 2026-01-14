import { FastifyInstance } from 'fastify';
import { transferController } from '../controllers/transferController';
import { validate, ticketSchemas } from '../utils/validation';
import { authMiddleware } from '../middleware/auth';
import { tenantMiddleware } from '../middleware/tenant';
import { rateLimiters } from '../middleware/rate-limit';

/**
 * Transfer routes for ticket ownership transfer
 * 
 * Fixes Batch 5 audit findings:
 * - Uses transfer-tier rate limiting (5 req/min) for actual transfers
 * - Uses read-tier rate limiting (100 req/min) for queries
 */
export default async function transferRoutes(fastify: FastifyInstance) {
  // ==========================================================================
  // POST /transfer - Transfer a ticket to another user
  // SECURITY: Uses transfer-tier rate limit (5 req/min per user)
  // Fixes Batch 5: Transfer limited - tier now applied
  // ==========================================================================
  fastify.post('/', {
    preHandler: [
      rateLimiters.transfer,  // Batch 5: Transfer-tier rate limit (5 req/min)
      authMiddleware,
      tenantMiddleware,
      validate(ticketSchemas.transferTicket)
    ]
  }, (request, reply) => transferController.transferTicket(request, reply));

  // ==========================================================================
  // GET /transfer/:ticketId/history - Get transfer history
  // Uses read-tier rate limit (100 req/min)
  // ==========================================================================
  fastify.get('/:ticketId/history', {
    preHandler: [
      rateLimiters.read,  // Read-tier rate limit
      authMiddleware,
      tenantMiddleware
    ]
  }, (request, reply) => transferController.getTransferHistory(request, reply));

  // ==========================================================================
  // POST /transfer/validate - Validate transfer before executing
  // Uses read-tier rate limit since it's a validation check
  // ==========================================================================
  fastify.post('/validate', {
    preHandler: [
      rateLimiters.read,  // Read-tier rate limit for validation
      authMiddleware,
      tenantMiddleware
    ]
  }, (request, reply) => transferController.validateTransfer(request, reply));
}
