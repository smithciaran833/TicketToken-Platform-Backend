import { FastifyInstance } from 'fastify';
import { disputeController } from '../controllers/dispute.controller';
import { authMiddleware } from '../middleware/auth.middleware';

/**
 * Dispute Routes for Marketplace Service
 * 
 * Issues Fixed:
 * - INP-1: No dispute route validation → Added validation schemas for all endpoints
 */

// AUDIT FIX INP-1: Validation schemas for dispute routes
const createDisputeSchema = {
  body: {
    type: 'object',
    required: ['transferId', 'reason'],
    properties: {
      transferId: { 
        type: 'string', 
        format: 'uuid',
        description: 'The transfer ID to dispute'
      },
      reason: { 
        type: 'string', 
        enum: ['item_not_received', 'item_not_as_described', 'unauthorized_transaction', 'duplicate_charge', 'other'],
        description: 'Reason for the dispute'
      },
      description: { 
        type: 'string', 
        maxLength: 2000,
        description: 'Detailed description of the dispute'
      },
      evidenceUrls: {
        type: 'array',
        maxItems: 10,
        items: {
          type: 'string',
          format: 'uri',
          maxLength: 2000
        },
        description: 'URLs to supporting evidence'
      }
    },
    additionalProperties: false
  },
  response: {
    201: {
      type: 'object',
      properties: {
        id: { type: 'string', format: 'uuid' },
        transferId: { type: 'string', format: 'uuid' },
        status: { type: 'string' },
        reason: { type: 'string' },
        createdAt: { type: 'string', format: 'date-time' }
      }
    }
  }
};

const getMyDisputesSchema = {
  querystring: {
    type: 'object',
    properties: {
      status: { 
        type: 'string', 
        enum: ['open', 'pending', 'resolved', 'closed'] 
      },
      page: { type: 'integer', minimum: 1, default: 1 },
      limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 }
    },
    additionalProperties: false
  },
  response: {
    200: {
      type: 'object',
      properties: {
        disputes: { type: 'array' },
        pagination: {
          type: 'object',
          properties: {
            page: { type: 'integer' },
            limit: { type: 'integer' },
            total: { type: 'integer' }
          }
        }
      }
    }
  }
};

const getDisputeByIdSchema = {
  params: {
    type: 'object',
    required: ['disputeId'],
    properties: {
      disputeId: { type: 'string', format: 'uuid' }
    }
  },
  response: {
    200: {
      type: 'object',
      properties: {
        id: { type: 'string', format: 'uuid' },
        transferId: { type: 'string', format: 'uuid' },
        status: { type: 'string' },
        reason: { type: 'string' },
        description: { type: 'string' },
        evidenceUrls: { type: 'array', items: { type: 'string' } },
        createdAt: { type: 'string', format: 'date-time' },
        updatedAt: { type: 'string', format: 'date-time' }
      }
    },
    404: {
      type: 'object',
      properties: {
        error: { type: 'string' },
        code: { type: 'string' }
      }
    }
  }
};

const addEvidenceSchema = {
  params: {
    type: 'object',
    required: ['disputeId'],
    properties: {
      disputeId: { type: 'string', format: 'uuid' }
    }
  },
  body: {
    type: 'object',
    required: ['evidenceType'],
    properties: {
      evidenceType: { 
        type: 'string', 
        enum: ['screenshot', 'receipt', 'communication', 'tracking', 'other'],
        description: 'Type of evidence being submitted'
      },
      evidenceUrl: { 
        type: 'string', 
        format: 'uri',
        maxLength: 2000,
        description: 'URL to the evidence file'
      },
      description: { 
        type: 'string', 
        maxLength: 1000,
        description: 'Description of the evidence'
      }
    },
    additionalProperties: false
  },
  response: {
    200: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        evidenceId: { type: 'string', format: 'uuid' }
      }
    }
  }
};

export default async function disputesRoutes(fastify: FastifyInstance) {
  // All dispute routes require authentication
  const securePreHandler = [authMiddleware];

  // Create dispute - AUDIT FIX INP-1: Added validation schema
  fastify.post('/', {
    preHandler: securePreHandler,
    schema: createDisputeSchema
  }, disputeController.create.bind(disputeController));

  // Get user's disputes - AUDIT FIX INP-1: Added validation schema
  fastify.get('/my-disputes', {
    preHandler: securePreHandler,
    schema: getMyDisputesSchema
  }, disputeController.getMyDisputes.bind(disputeController));

  // Get specific dispute - AUDIT FIX INP-1: Added validation schema
  fastify.get('/:disputeId', {
    preHandler: securePreHandler,
    schema: getDisputeByIdSchema
  }, disputeController.getById.bind(disputeController));

  // Add evidence to dispute - AUDIT FIX INP-1: Added validation schema
  fastify.post('/:disputeId/evidence', {
    preHandler: securePreHandler,
    schema: addEvidenceSchema
  }, disputeController.addEvidence.bind(disputeController));
}
