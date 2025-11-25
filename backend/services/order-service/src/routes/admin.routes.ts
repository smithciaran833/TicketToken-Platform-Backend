import { FastifyInstance, FastifyRequest } from 'fastify';
import { AdminController } from '../controllers/admin.controller';
import { authenticate } from '../middleware';
import { validate } from '../middleware/validation.middleware';
import * as schemas from '../validators/admin.schemas';

export async function adminRoutes(fastify: FastifyInstance) {
  const controller = new AdminController();

  // Search routes
  fastify.post('/search', {
    preHandler: [authenticate, validate({ body: schemas.searchOrdersSchema })],
  }, async (request, reply) => controller.searchOrders(request, reply));

  fastify.post('/search/saved', {
    preHandler: [authenticate, validate({ body: schemas.savedSearchSchema })],
  }, async (request, reply) => controller.saveSearch(request, reply));

  fastify.get('/search/saved', {
    preHandler: [authenticate],
  }, async (request, reply) => controller.getSavedSearches(request, reply));

  fastify.delete<{ Params: { id: string } }>('/search/saved/:id', {
    preHandler: [authenticate, validate({ params: schemas.uuidParamSchema })],
  }, async (request, reply) => controller.deleteSavedSearch(request, reply));

  fastify.get('/search/history', {
    preHandler: [authenticate],
  }, async (request, reply) => controller.getSearchHistory(request, reply));

  // Admin override routes
  fastify.post<{ Params: { orderId: string } }>('/orders/:orderId/overrides', {
    preHandler: [
      authenticate,
      validate({ params: schemas.orderIdParamSchema, body: schemas.createOverrideSchema }),
    ],
  }, async (request, reply) => controller.createOverride(request, reply));

  fastify.get<{ Params: { orderId: string } }>('/orders/:orderId/overrides', {
    preHandler: [authenticate, validate({ params: schemas.orderIdParamSchema })],
  }, async (request, reply) => controller.getOrderOverrides(request, reply));

  fastify.post<{ Params: { id: string } }>('/overrides/:id/approve', {
    preHandler: [
      authenticate,
      validate({ params: schemas.uuidParamSchema, body: schemas.approveOverrideSchema }),
    ],
  }, async (request, reply) => controller.approveOverride(request, reply));

  fastify.post<{ Params: { id: string } }>('/overrides/:id/reject', {
    preHandler: [
      authenticate,
      validate({ params: schemas.uuidParamSchema, body: schemas.rejectOverrideSchema }),
    ],
  }, async (request, reply) => controller.rejectOverride(request, reply));

  fastify.get('/overrides/pending', {
    preHandler: [authenticate],
  }, async (request, reply) => controller.getPendingApprovals(request, reply));

  // Order notes routes
  fastify.post<{ Params: { orderId: string } }>('/orders/:orderId/notes', {
    preHandler: [
      authenticate,
      validate({ params: schemas.orderIdParamSchema, body: schemas.createNoteSchema }),
    ],
  }, async (request, reply) => controller.createNote(request, reply));

  fastify.get<{ Params: { orderId: string } }>('/orders/:orderId/notes', {
    preHandler: [authenticate, validate({ params: schemas.orderIdParamSchema })],
  }, async (request, reply) => controller.getOrderNotes(request, reply));

  fastify.patch<{ Params: { id: string } }>('/notes/:id', {
    preHandler: [
      authenticate,
      validate({ params: schemas.uuidParamSchema, body: schemas.updateNoteSchema }),
    ],
  }, async (request, reply) => controller.updateNote(request, reply));

  fastify.delete<{ Params: { id: string } }>('/notes/:id', {
    preHandler: [authenticate, validate({ params: schemas.uuidParamSchema })],
  }, async (request, reply) => controller.deleteNote(request, reply));

  fastify.get('/notes/flagged', {
    preHandler: [authenticate],
  }, async (request, reply) => controller.getFlaggedNotes(request, reply));

  // Note templates
  fastify.post('/notes/templates', {
    preHandler: [authenticate, validate({ body: schemas.noteTemplateSchema })],
  }, async (request, reply) => controller.createNoteTemplate(request, reply));

  fastify.get('/notes/templates', {
    preHandler: [authenticate],
  }, async (request, reply) => controller.getNoteTemplates(request, reply));

  // Customer interaction routes
  fastify.post('/interactions', {
    preHandler: [authenticate, validate({ body: schemas.recordInteractionSchema })],
  }, async (request, reply) => controller.recordInteraction(request, reply));

  fastify.get<{ Params: { userId: string } }>('/interactions/user/:userId', {
    preHandler: [authenticate],
  }, async (request, reply) => controller.getUserInteractions(request, reply));

  fastify.get<{ Params: { orderId: string } }>('/interactions/order/:orderId', {
    preHandler: [authenticate],
  }, async (request, reply) => controller.getOrderInteractions(request, reply));

  fastify.get('/interactions/unresolved', {
    preHandler: [authenticate],
  }, async (request, reply) => controller.getUnresolvedInteractions(request, reply));

  fastify.patch<{ Params: { id: string } }>('/interactions/:id', {
    preHandler: [
      authenticate,
      validate({ params: schemas.uuidParamSchema, body: schemas.updateInteractionSchema }),
    ],
  }, async (request, reply) => controller.updateInteraction(request, reply));

  fastify.get('/interactions/stats', {
    preHandler: [authenticate, validate({ query: schemas.dateRangeSchema })],
  }, async (request, reply) => controller.getInteractionStats(request, reply));

  // Fraud detection routes
  fastify.get<{ Params: { orderId: string } }>('/orders/:orderId/fraud', {
    preHandler: [authenticate, validate({ params: schemas.orderIdParamSchema })],
  }, async (request, reply) => controller.getFraudScore(request, reply));

  fastify.get('/fraud/high-risk', {
    preHandler: [authenticate, validate({ query: schemas.paginationSchema })],
  }, async (request, reply) => controller.getHighRiskOrders(request, reply));

  fastify.post<{ Params: { id: string } }>('/fraud/:id/review', {
    preHandler: [
      authenticate,
      validate({ params: schemas.uuidParamSchema, body: schemas.reviewFraudScoreSchema }),
    ],
  }, async (request, reply) => controller.reviewFraudScore(request, reply));

  fastify.post('/fraud/block', {
    preHandler: [authenticate, validate({ body: schemas.blockEntitySchema })],
  }, async (request, reply) => controller.blockEntity(request, reply));

  fastify.post('/fraud/rules', {
    preHandler: [authenticate, validate({ body: schemas.createFraudRuleSchema })],
  }, async (request, reply) => controller.createFraudRule(request, reply));
}
