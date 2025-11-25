import { FastifyInstance } from 'fastify';
import { syncController } from '../controllers/sync.controller';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { validateFastify } from '../middleware/validation.middleware';
import {
  queueSyncSchema,
  getSyncHistorySchema,
  retrySyncSchema,
  oauthCallbackParamsSchema,
} from '../validators/schemas';

export async function syncRoutes(fastify: FastifyInstance) {
  // All sync routes require authentication
  fastify.addHook('onRequest', authenticate);

  // POST /:provider/sync - Queue a new sync job
  fastify.post('/:provider/sync', {
    onRequest: [
      authenticate,
      authorize('admin', 'venue_admin'),
      validateFastify({
        params: oauthCallbackParamsSchema,
        body: queueSyncSchema,
      }),
    ]
  }, syncController.triggerSync);
  
  // POST /:provider/sync/stop - Stop a running sync
  fastify.post('/:provider/sync/stop', {
    onRequest: [authenticate, authorize('admin', 'venue_admin')]
  }, syncController.stopSync);
  
  // GET /:provider/sync/status - Get sync status
  fastify.get('/:provider/sync/status', {
    onRequest: [
      validateFastify({
        params: oauthCallbackParamsSchema,
      }),
    ]
  }, syncController.getSyncStatus);
  
  // GET /:provider/sync/history - Get sync history
  fastify.get('/:provider/sync/history', {
    onRequest: [
      validateFastify({
        params: oauthCallbackParamsSchema,
        query: getSyncHistorySchema,
      }),
    ]
  }, syncController.getSyncHistory);
  
  // POST /:provider/sync/retry - Retry failed sync
  fastify.post('/:provider/sync/retry', {
    onRequest: [
      authenticate,
      authorize('admin', 'venue_admin'),
      validateFastify({
        body: retrySyncSchema,
      }),
    ]
  }, syncController.retryFailed);
}
