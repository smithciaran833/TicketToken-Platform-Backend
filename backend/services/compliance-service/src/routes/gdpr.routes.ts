import { FastifyInstance } from 'fastify';
import { GDPRController } from '../controllers/gdpr.controller';
import { privacyExportService } from '../services/privacy-export.service';

export async function gdprRoutes(fastify: FastifyInstance) {
  const gdprController = new GDPRController();

  // GDPR Data Deletion routes
  fastify.post('/gdpr/request-data', gdprController.requestDeletion);
  fastify.post('/gdpr/delete-data', gdprController.requestDeletion);
  fastify.get('/gdpr/status/:requestId', gdprController.getDeletionStatus);

  // Privacy Export routes
  fastify.post('/privacy/export', async (request, reply) => {
    try {
      const { userId, reason } = request.body as { userId: string; reason: string };
      
      if (!userId) {
        return reply.status(400).send({ error: 'userId is required' });
      }
      
      const result = await privacyExportService.requestDataExport(userId, reason || 'User requested data export');
      return reply.status(200).send(result);
    } catch (error) {
      fastify.log.error({ err: error }, 'Privacy export request failed');
      return reply.status(500).send({ error: 'Failed to create export request' });
    }
  });

  fastify.get('/privacy/export/:requestId', async (request, reply) => {
    try {
      const { requestId } = request.params as { requestId: string };
      
      // TODO: Implement getExportStatus method in privacy-export.service
      // For now, return a placeholder response
      return reply.status(200).send({ 
        requestId, 
        status: 'pending',
        message: 'Status check not yet implemented' 
      });
    } catch (error) {
      fastify.log.error({ err: error }, 'Privacy export status check failed');
      return reply.status(500).send({ error: 'Failed to check export status' });
    }
  });

  // Account Deletion routes
  fastify.post('/privacy/deletion', async (request, reply) => {
    try {
      const { userId, reason } = request.body as { userId: string; reason: string };
      
      if (!userId) {
        return reply.status(400).send({ error: 'userId is required' });
      }
      
      const result = await privacyExportService.requestAccountDeletion(userId, reason || 'User requested account deletion');
      return reply.status(200).send(result);
    } catch (error) {
      fastify.log.error({ err: error }, 'Account deletion request failed');
      return reply.status(500).send({ error: 'Failed to create deletion request' });
    }
  });

  fastify.get('/privacy/deletion/:requestId', async (request, reply) => {
    try {
      const { requestId } = request.params as { requestId: string };
      
      // TODO: Implement getDeletionStatus method in privacy-export.service
      // For now, return a placeholder response
      return reply.status(200).send({ 
        requestId, 
        status: 'pending',
        message: 'Deletion status check not yet implemented' 
      });
    } catch (error) {
      fastify.log.error({ err: error }, 'Deletion status check failed');
      return reply.status(500).send({ error: 'Failed to check deletion status' });
    }
  });
}
