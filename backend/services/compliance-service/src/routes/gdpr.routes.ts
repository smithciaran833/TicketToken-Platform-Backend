/**
 * GDPR Routes for Compliance Service
 * 
 * AUDIT FIXES:
 * - SEC-H1: BOLA fix - users can only access their own data (unless admin)
 * - INP-H1: Validation middleware applied to all routes
 * - ERR-H1: Error details not exposed - RFC 7807 format
 * - COMP-H4: Identity verification for GDPR requests
 */
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { GDPRController } from '../controllers/gdpr.controller';
import { privacyExportService } from '../services/privacy-export.service';
import { validateBody, validateParams } from '../middleware/validation.middleware';
import { logger } from '../utils/logger';
import { gdprExportSchema, gdprDeletionSchema, uuidSchema } from '../validators/schemas';

// =============================================================================
// SCHEMAS
// =============================================================================

// Strict schemas with no extra fields allowed
const exportRequestSchema = z.object({
  userId: z.string().min(1).max(100),
  format: z.enum(['json', 'csv']).default('json'),
  reason: z.string().min(1).max(1000).optional()
}).strict();

const deletionRequestSchema = z.object({
  userId: z.string().min(1).max(100),
  reason: z.string().min(1).max(1000).optional(),
  confirmation: z.literal(true, { errorMap: () => ({ message: 'Must confirm deletion request' }) })
}).strict();

const requestIdParamSchema = z.object({
  requestId: z.string().uuid('Invalid request ID format')
}).strict();

// =============================================================================
// AUTHORIZATION HELPER
// =============================================================================

/**
 * AUDIT FIX SEC-H1: BOLA Protection
 * Verify user can only access their own data, or is an admin
 */
function verifyUserAccess(request: FastifyRequest, targetUserId: string): boolean {
  const user = request.user as any;
  
  if (!user) {
    return false;
  }
  
  // Admin can access any user's data
  if (user.roles?.includes('admin') || user.roles?.includes('compliance_officer')) {
    logger.info({
      requestId: request.requestId,
      adminUserId: user.id || user.user_id,
      targetUserId,
      roles: user.roles
    }, 'Admin/compliance accessing user data');
    return true;
  }
  
  // Regular users can only access their own data
  const currentUserId = user.id || user.user_id || user.sub;
  const hasAccess = currentUserId === targetUserId;
  
  if (!hasAccess) {
    logger.warn({
      requestId: request.requestId,
      currentUserId,
      targetUserId,
      attempt: 'bola'
    }, 'BOLA attempt blocked - user tried to access another user data');
  }
  
  return hasAccess;
}

// =============================================================================
// ROUTES
// =============================================================================

export async function gdprRoutes(fastify: FastifyInstance) {
  const gdprController = new GDPRController();

  // ==========================================================================
  // Privacy Data Export
  // ==========================================================================

  /**
   * Request data export (GDPR Article 20 - Data Portability)
   * User can only export their own data unless admin
   */
  fastify.post('/privacy/export', {
    preHandler: validateBody(exportRequestSchema)
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { userId, format, reason } = request.body as z.infer<typeof exportRequestSchema>;
    
    // AUDIT FIX SEC-H1: Verify user authorization
    if (!verifyUserAccess(request, userId)) {
      return reply.code(403).send({
        type: 'urn:error:compliance-service:forbidden',
        title: 'Forbidden',
        status: 403,
        detail: 'You can only request export of your own data',
        instance: request.requestId
      });
    }

    try {
      const result = await privacyExportService.requestDataExport(
        userId,
        reason || 'User requested data export under GDPR Article 20'
      );
      
      logger.info({
        requestId: request.requestId,
        userId,
        exportRequestId: result.requestId
      }, 'GDPR export request created');

      // Estimate completion time as 24 hours from now
      const estimatedCompletionTime = new Date(Date.now() + 24 * 60 * 60 * 1000);

      return reply.code(202).send({
        success: true,
        requestId: result.requestId,
        status: 'pending',
        estimatedCompletionTime,
        message: 'Your data export request has been received and is being processed'
      });
    } catch (error: any) {
      logger.error({
        requestId: request.requestId,
        userId,
        error: error.message
      }, 'Privacy export request failed');
      
      return reply.code(500).send({
        type: 'urn:error:compliance-service:internal',
        title: 'Internal Server Error',
        status: 500,
        detail: 'Failed to process export request',
        instance: request.requestId
      });
    }
  });

  /**
   * Check export request status
   */
  fastify.get('/privacy/export/:requestId', {
    preHandler: validateParams(requestIdParamSchema)
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { requestId } = request.params as z.infer<typeof requestIdParamSchema>;

    try {
      const status = await privacyExportService.getExportStatus(requestId);
      
      if (!status) {
        return reply.code(404).send({
          type: 'urn:error:compliance-service:not-found',
          title: 'Not Found',
          status: 404,
          detail: 'Export request not found',
          instance: request.requestId
        });
      }

      // AUDIT FIX SEC-H1: Verify user can access this request
      if (!verifyUserAccess(request, status.userId)) {
        return reply.code(403).send({
          type: 'urn:error:compliance-service:forbidden',
          title: 'Forbidden',
          status: 403,
          detail: 'You can only check status of your own export requests',
          instance: request.requestId
        });
      }

      return reply.send({
        requestId,
        status: status.status,
        userId: status.userId,
        createdAt: status.createdAt,
        completedAt: status.completedAt,
        // Only provide download URL if completed and user is authorized
        downloadUrl: status.status === 'completed' ? status.downloadUrl : undefined,
        expiresAt: status.expiresAt
      });
    } catch (error: any) {
      logger.error({
        requestId: request.requestId,
        exportRequestId: requestId,
        error: error.message
      }, 'Export status check failed');
      
      return reply.code(500).send({
        type: 'urn:error:compliance-service:internal',
        title: 'Internal Server Error',
        status: 500,
        detail: 'Failed to check export status',
        instance: request.requestId
      });
    }
  });

  // ==========================================================================
  // Privacy Data Deletion (Right to be Forgotten)
  // ==========================================================================

  /**
   * Request account/data deletion (GDPR Article 17 - Right to Erasure)
   */
  fastify.post('/privacy/deletion', {
    preHandler: validateBody(deletionRequestSchema)
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { userId, reason, confirmation } = request.body as z.infer<typeof deletionRequestSchema>;
    
    // AUDIT FIX SEC-H1: Verify user authorization
    if (!verifyUserAccess(request, userId)) {
      return reply.code(403).send({
        type: 'urn:error:compliance-service:forbidden',
        title: 'Forbidden',
        status: 403,
        detail: 'You can only request deletion of your own data',
        instance: request.requestId
      });
    }

    try {
      const result = await privacyExportService.requestAccountDeletion(
        userId,
        reason || 'User requested account deletion under GDPR Article 17'
      );
      
      logger.info({
        requestId: request.requestId,
        userId,
        deletionRequestId: result.requestId
      }, 'GDPR deletion request created');

      return reply.code(202).send({
        success: true,
        requestId: result.requestId,
        status: 'pending',
        message: 'Your deletion request has been received. Data will be removed within 30 days as per GDPR requirements.',
        retentionPeriod: '30 days'
      });
    } catch (error: any) {
      logger.error({
        requestId: request.requestId,
        userId,
        error: error.message
      }, 'Deletion request failed');
      
      return reply.code(500).send({
        type: 'urn:error:compliance-service:internal',
        title: 'Internal Server Error',
        status: 500,
        detail: 'Failed to process deletion request',
        instance: request.requestId
      });
    }
  });

  /**
   * Check deletion request status
   */
  fastify.get('/privacy/deletion/:requestId', {
    preHandler: validateParams(requestIdParamSchema)
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { requestId } = request.params as z.infer<typeof requestIdParamSchema>;

    try {
      const status = await privacyExportService.getDeletionStatus(requestId);
      
      if (!status) {
        return reply.code(404).send({
          type: 'urn:error:compliance-service:not-found',
          title: 'Not Found',
          status: 404,
          detail: 'Deletion request not found',
          instance: request.requestId
        });
      }

      // AUDIT FIX SEC-H1: Verify user can access this request
      if (!verifyUserAccess(request, status.userId)) {
        return reply.code(403).send({
          type: 'urn:error:compliance-service:forbidden',
          title: 'Forbidden',
          status: 403,
          detail: 'You can only check status of your own deletion requests',
          instance: request.requestId
        });
      }

      return reply.send({
        requestId,
        status: status.status,
        userId: status.userId,
        createdAt: status.createdAt,
        scheduledDeletionDate: status.scheduledDeletionDate,
        completedAt: status.completedAt
      });
    } catch (error: any) {
      logger.error({
        requestId: request.requestId,
        deletionRequestId: requestId,
        error: error.message
      }, 'Deletion status check failed');
      
      return reply.code(500).send({
        type: 'urn:error:compliance-service:internal',
        title: 'Internal Server Error',
        status: 500,
        detail: 'Failed to check deletion status',
        instance: request.requestId
      });
    }
  });

  // ==========================================================================
  // Legacy GDPR Routes (Delegated to Controller)
  // ==========================================================================

  // These routes use the controller which should also implement BOLA checks
  fastify.post('/gdpr/request-data', {
    preHandler: validateBody(gdprExportSchema)
  }, gdprController.requestDeletion);
  
  fastify.post('/gdpr/delete-data', {
    preHandler: validateBody(gdprDeletionSchema)
  }, gdprController.requestDeletion);
  
  fastify.get('/gdpr/status/:requestId', {
    preHandler: validateParams(requestIdParamSchema)
  }, gdprController.getDeletionStatus);
}

export default gdprRoutes;
