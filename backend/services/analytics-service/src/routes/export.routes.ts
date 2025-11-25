import { FastifyInstance } from 'fastify';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { exportController } from '../controllers/export.controller';

const getExportsSchema = {
  params: {
    type: 'object',
    required: ['venueId'],
    properties: {
      venueId: { type: 'string', format: 'uuid' }
    }
  },
  querystring: {
    type: 'object',
    properties: {
      status: { type: 'string', enum: ['pending', 'processing', 'completed', 'failed'] },
      type: { type: 'string' },
      page: { type: 'integer', minimum: 1 },
      limit: { type: 'integer', minimum: 1, maximum: 100 }
    }
  }
} as const;

const exportParamsSchema = {
  params: {
    type: 'object',
    required: ['exportId'],
    properties: {
      exportId: { type: 'string', format: 'uuid' }
    }
  }
} as const;

const createExportSchema = {
  body: {
    type: 'object',
    required: ['venueId', 'type', 'format'],
    properties: {
      venueId: { type: 'string', format: 'uuid' },
      type: { type: 'string', enum: ['analytics_report', 'customer_list', 'financial_report', 'custom'] },
      format: { type: 'string', enum: ['csv', 'xlsx', 'pdf', 'json'] },
      filters: { type: 'object' },
      dateRange: {
        type: 'object',
        properties: {
          startDate: { type: 'string', format: 'date-time' },
          endDate: { type: 'string', format: 'date-time' }
        }
      }
    }
  }
} as const;

export default async function exportRoutes(app: FastifyInstance) {
  // Apply authentication to all routes
  app.addHook('onRequest', authenticate);

  // Get export history
  app.get('/venue/:venueId', {
    preHandler: [authorize(['analytics.read'])],
    schema: getExportsSchema,
    handler: exportController.getExports
  });

  // Get export status
  app.get('/:exportId', {
    preHandler: [authorize(['analytics.read'])],
    schema: exportParamsSchema,
    handler: exportController.getExportStatus
  });

  // Create export
  app.post('/', {
    preHandler: [authorize(['analytics.export'])],
    schema: createExportSchema,
    handler: exportController.createExport
  });

  // Download export
  app.get('/:exportId/download', {
    preHandler: [authorize(['analytics.export'])],
    schema: exportParamsSchema,
    handler: exportController.downloadExport
  });

  // Cancel export
  app.post('/:exportId/cancel', {
    preHandler: [authorize(['analytics.export'])],
    schema: exportParamsSchema,
    handler: exportController.cancelExport
  });

  // Retry failed export
  app.post('/:exportId/retry', {
    preHandler: [authorize(['analytics.export'])],
    schema: exportParamsSchema,
    handler: exportController.retryExport
  });
}
