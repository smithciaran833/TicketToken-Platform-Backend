import { cache as serviceCache } from '../services/cache-integration';
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { authenticate } from '../middleware/auth.middleware';
import { validate } from '../middleware/validation.middleware';
import { NotFoundError, ForbiddenError } from '../utils/errors';
import { venueOperations } from '../utils/metrics';

interface VenueParams {
  venueId: string;
}

// Helper middleware for tenant context
async function addTenantContext(request: any, reply: any) {
  const user = request.user;
  const tenantId = user?.tenant_id || '00000000-0000-0000-0000-000000000001';
  request.tenantId = tenantId;
}

// Helper to verify venue access with role check
async function verifyVenueAccess(request: any, reply: any, complianceService: any) {
  const { venueId } = request.params;
  const userId = request.user?.id;
  const tenantId = request.tenantId;
  
  const hasAccess = await complianceService.checkVenueAccess(venueId, userId, tenantId);
  if (!hasAccess) {
    throw new ForbiddenError('No access to this venue');
  }
  
  const accessDetails = await complianceService.getVenueAccessDetails(venueId, userId);
  request.venueRole = accessDetails?.role;
  
  // For compliance, only owner and manager should have access
  if (!['owner', 'manager'].includes(request.venueRole)) {
    throw new ForbiddenError('Insufficient permissions for compliance data');
  }
}

export async function complianceRoutes(fastify: FastifyInstance) {
  const { complianceService, logger } = (fastify as any).container.cradle;

  // Get compliance status - SECURED
  fastify.get('/status',
    {
      preHandler: [authenticate, addTenantContext],
      schema: {
        tags: ['compliance'],
        summary: 'Get venue compliance status',
        security: [{ bearerAuth: [] }]
      }
    },
    async (request: any, reply: FastifyReply) => {
      const { venueId } = request.params;
      const userId = request.user?.id;
      const tenantId = request.tenantId;
      
      try {
        // Verify access
        await verifyVenueAccess(request, reply, complianceService);
        
        const status = await complianceService.getComplianceStatus(venueId, tenantId);
        
        logger.info({ venueId, userId }, 'Compliance status retrieved');
        venueOperations.inc({ operation: 'get_compliance_status', status: 'success' });
        
        return reply.send(status);
      } catch (error) {
        venueOperations.inc({ operation: 'get_compliance_status', status: 'error' });
        if (error instanceof ForbiddenError) {
          throw error;
        }
        logger.error({ error, venueId }, 'Failed to get compliance status');
        throw error;
      }
    }
  );

  // Get compliance documents - SECURED
  fastify.get('/documents',
    {
      preHandler: [authenticate, addTenantContext],
      schema: {
        tags: ['compliance'],
        summary: 'List compliance documents',
        security: [{ bearerAuth: [] }]
      }
    },
    async (request: any, reply: FastifyReply) => {
      const { venueId } = request.params;
      const userId = request.user?.id;
      const tenantId = request.tenantId;
      
      try {
        // Verify access
        await verifyVenueAccess(request, reply, complianceService);
        
        const documents = await complianceService.getComplianceDocuments(venueId, tenantId);
        
        logger.info({ venueId, userId }, 'Compliance documents listed');
        venueOperations.inc({ operation: 'list_compliance_docs', status: 'success' });
        
        return reply.send(documents);
      } catch (error) {
        venueOperations.inc({ operation: 'list_compliance_docs', status: 'error' });
        if (error instanceof ForbiddenError) {
          throw error;
        }
        logger.error({ error, venueId }, 'Failed to list compliance documents');
        throw error;
      }
    }
  );

  // Submit compliance document - SECURED
  fastify.post('/documents',
    {
      preHandler: [authenticate, addTenantContext],
      schema: {
        tags: ['compliance'],
        summary: 'Submit compliance document',
        security: [{ bearerAuth: [] }]
      }
    },
    async (request: any, reply: FastifyReply) => {
      const { venueId } = request.params;
      const userId = request.user?.id;
      const tenantId = request.tenantId;
      const body = request.body as any;
      
      try {
        // Verify access - only owner can submit compliance docs
        await verifyVenueAccess(request, reply, complianceService);
        
        if (request.venueRole !== 'owner') {
          throw new ForbiddenError('Only venue owner can submit compliance documents');
        }
        
        const document = await complianceService.submitDocument(
          venueId,
          body,
          userId,
          tenantId
        );
        
        logger.info({ venueId, userId, documentType: body.type }, 'Compliance document submitted');
        venueOperations.inc({ operation: 'submit_compliance_doc', status: 'success' });
        
        return reply.status(201).send(document);
      } catch (error) {
        venueOperations.inc({ operation: 'submit_compliance_doc', status: 'error' });
        if (error instanceof ForbiddenError) {
          throw error;
        }
        logger.error({ error, venueId }, 'Failed to submit compliance document');
        throw error;
      }
    }
  );
}
