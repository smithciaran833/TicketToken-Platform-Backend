import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { gdprService } from '../services/gdpr.service';
import { dataRetentionService } from '../services/data-retention.service';
import { logger } from '../config/logger';
import { authMiddleware } from '../middleware/auth.middleware';

/**
 * GDPR/CCPA Compliance Routes
 * 
 * Provides endpoints for:
 * - Data export (right to access)
 * - Data deletion (right to be forgotten)
 * - Data portability
 */
export default async function gdprRoutes(fastify: FastifyInstance) {
  
  /**
   * Export user data (GDPR Article 15 - Right of Access)
   * GET /api/gdpr/export/:userId
   */
  fastify.get('/gdpr/export/:userId', {
    preHandler: [authMiddleware]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const params = request.params as { userId: string };
      const { userId } = params;
      
      // Verify user can only export their own data (unless admin)
      if (request.user!.id !== userId && request.user!.role !== 'admin') {
        return reply.status(403).send({
          success: false,
          error: 'Forbidden',
          message: 'You can only export your own data'
        });
      }
      
      const data = await gdprService.exportUserData(userId, request.user!.id);
      
      reply.send({
        success: true,
        data
      });
    } catch (error) {
      logger.error('Failed to export user data', { error });
      reply.status(500).send({
        success: false,
        error: 'Failed to export data'
      });
    }
  });

  /**
   * Get data portability report
   * GET /api/gdpr/portability/:userId
   */
  fastify.get('/gdpr/portability/:userId', {
    preHandler: [authMiddleware]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const params = request.params as { userId: string };
      const { userId } = params;
      
      // Verify user can only access their own data
      if (request.user!.id !== userId && request.user!.role !== 'admin') {
        return reply.status(403).send({
          success: false,
          error: 'Forbidden'
        });
      }
      
      const data = await gdprService.getPortabilityData(userId);
      
      // Set headers for data portability
      reply.header('Content-Type', 'application/json');
      reply.header('Content-Disposition', `attachment; filename="data-export-${userId}.json"`);
      
      reply.send(data);
    } catch (error) {
      logger.error('Failed to generate portability data', { error });
      reply.status(500).send({
        success: false,
        error: 'Failed to generate portability data'
      });
    }
  });

  /**
   * Get processing activities (GDPR Article 30)
   * GET /api/gdpr/processing-activities/:userId
   */
  fastify.get('/gdpr/processing-activities/:userId', {
    preHandler: [authMiddleware]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const params = request.params as { userId: string };
      const { userId } = params;
      
      const activities = await gdprService.getProcessingActivities(userId);
      
      reply.send({
        success: true,
        data: activities
      });
    } catch (error) {
      logger.error('Failed to get processing activities', { error });
      reply.status(500).send({
        success: false,
        error: 'Failed to get processing activities'
      });
    }
  });

  /**
   * Validate deletion request
   * GET /api/gdpr/validate-deletion/:userId
   */
  fastify.get('/gdpr/validate-deletion/:userId', {
    preHandler: [authMiddleware]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const params = request.params as { userId: string };
      const { userId } = params;
      
      // Verify user can only check their own data
      if (request.user!.id !== userId && request.user!.role !== 'admin') {
        return reply.status(403).send({
          success: false,
          error: 'Forbidden'
        });
      }
      
      const validation = await gdprService.validateDeletionRequest(userId);
      
      reply.send({
        success: true,
        data: validation
      });
    } catch (error) {
      logger.error('Failed to validate deletion request', { error });
      reply.status(500).send({
        success: false,
        error: 'Failed to validate deletion request'
      });
    }
  });

  /**
   * Request data deletion (GDPR Article 17 - Right to Erasure)
   * DELETE /api/gdpr/user/:userId
   */
  fastify.delete('/gdpr/user/:userId', {
    preHandler: [authMiddleware]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const params = request.params as { userId: string };
      const body = request.body as {
        method?: 'hard_delete' | 'anonymize';
        reason?: string;
        confirm?: boolean;
      };
      
      const { userId } = params;
      const { method = 'anonymize', reason, confirm = false } = body;
      
      // Verify user can only delete their own data (unless admin)
      if (request.user!.id !== userId && request.user!.role !== 'admin') {
        return reply.status(403).send({
          success: false,
          error: 'Forbidden',
          message: 'You can only delete your own data'
        });
      }

      // Require confirmation
      if (!confirm) {
        return reply.status(400).send({
          success: false,
          error: 'Confirmation required',
          message: 'Please set confirm=true to proceed with deletion'
        });
      }
      
      // Validate deletion request
      const validation = await gdprService.validateDeletionRequest(userId);
      if (!validation.can_delete) {
        return reply.status(400).send({
          success: false,
          error: 'Cannot delete',
          reasons: validation.reasons
        });
      }
      
      // Process deletion
      await gdprService.deleteUserData(userId, request.user!.id, {
        method,
        reason
      });
      
      reply.send({
        success: true,
        message: method === 'hard_delete' 
          ? 'User data has been permanently deleted'
          : 'User data has been anonymized',
        method
      });
    } catch (error) {
      logger.error('Failed to delete user data', { error });
      reply.status(500).send({
        success: false,
        error: 'Failed to delete data'
      });
    }
  });

  /**
   * Get user data size
   * GET /api/gdpr/data-size/:userId
   */
  fastify.get('/gdpr/data-size/:userId', {
    preHandler: [authMiddleware]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const params = request.params as { userId: string };
      const { userId } = params;
      
      // Verify user can only check their own data
      if (request.user!.id !== userId && request.user!.role !== 'admin') {
        return reply.status(403).send({
          success: false,
          error: 'Forbidden'
        });
      }
      
      const dataSize = await dataRetentionService.getUserDataSize(userId);
      
      reply.send({
        success: true,
        data: dataSize
      });
    } catch (error) {
      logger.error('Failed to get user data size', { error });
      reply.status(500).send({
        success: false,
        error: 'Failed to get data size'
      });
    }
  });

  /**
   * Admin: Get data retention statistics
   * GET /api/gdpr/admin/retention-stats
   */
  fastify.get('/gdpr/admin/retention-stats', {
    preHandler: [authMiddleware]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      // Admin only
      if (request.user!.role !== 'admin') {
        return reply.status(403).send({
          success: false,
          error: 'Forbidden',
          message: 'Admin access required'
        });
      }
      
      const stats = await dataRetentionService.getRetentionStats();
      
      reply.send({
        success: true,
        data: stats
      });
    } catch (error) {
      logger.error('Failed to get retention stats', { error });
      reply.status(500).send({
        success: false,
        error: 'Failed to get retention stats'
      });
    }
  });

  /**
   * Admin: Run data retention cleanup
   * POST /api/gdpr/admin/cleanup
   */
  fastify.post('/gdpr/admin/cleanup', {
    preHandler: [authMiddleware]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      // Admin only
      if (request.user!.role !== 'admin') {
        return reply.status(403).send({
          success: false,
          error: 'Forbidden',
          message: 'Admin access required'
        });
      }
      
      const results = await dataRetentionService.runCleanup();
      
      reply.send({
        success: true,
        message: 'Data retention cleanup completed',
        data: results
      });
    } catch (error) {
      logger.error('Failed to run cleanup', { error });
      reply.status(500).send({
        success: false,
        error: 'Failed to run cleanup'
      });
    }
  });
}
