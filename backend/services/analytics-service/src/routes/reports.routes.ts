import { FastifyInstance } from 'fastify';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { reportsController } from '../controllers/reports.controller';

const venueParamsSchema = {
  params: {
    type: 'object',
    required: ['venueId'],
    properties: {
      venueId: { type: 'string', format: 'uuid' }
    }
  }
} as const;

const reportParamsSchema = {
  params: {
    type: 'object',
    required: ['reportId'],
    properties: {
      reportId: { type: 'string', format: 'uuid' }
    }
  }
} as const;

const getReportsSchema = {
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
      type: { type: 'string' },
      page: { type: 'integer', minimum: 1 },
      limit: { type: 'integer', minimum: 1, maximum: 100 }
    }
  }
} as const;

const generateReportSchema = {
  body: {
    type: 'object',
    required: ['venueId', 'templateId', 'name', 'parameters', 'format'],
    properties: {
      venueId: { type: 'string', format: 'uuid' },
      templateId: { type: 'string', format: 'uuid' },
      name: { type: 'string', minLength: 1, maxLength: 100 },
      parameters: { type: 'object' },
      format: { type: 'string', enum: ['pdf', 'xlsx', 'csv'] },
      schedule: { type: 'object' }
    }
  }
} as const;

const scheduleReportSchema = {
  body: {
    type: 'object',
    required: ['venueId', 'templateId', 'name', 'schedule', 'recipients'],
    properties: {
      venueId: { type: 'string', format: 'uuid' },
      templateId: { type: 'string', format: 'uuid' },
      name: { type: 'string', minLength: 1, maxLength: 100 },
      schedule: {
        type: 'object',
        required: ['frequency', 'time'],
        properties: {
          frequency: { type: 'string', enum: ['daily', 'weekly', 'monthly'] },
          time: { type: 'string', pattern: '^([01]?[0-9]|2[0-3]):[0-5][0-9]$' }
        }
      },
      recipients: {
        type: 'array',
        minItems: 1,
        items: {
          type: 'object',
          properties: {
            email: { type: 'string', format: 'email' }
          }
        }
      }
    }
  }
} as const;

const updateScheduleSchema = {
  params: {
    type: 'object',
    required: ['reportId'],
    properties: {
      reportId: { type: 'string', format: 'uuid' }
    }
  },
  body: {
    type: 'object',
    required: ['schedule'],
    properties: {
      schedule: { type: 'object' },
      recipients: { type: 'array' }
    }
  }
} as const;

const scheduleActionSchema = {
  params: {
    type: 'object',
    required: ['reportId', 'action'],
    properties: {
      reportId: { type: 'string', format: 'uuid' },
      action: { type: 'string', enum: ['pause', 'resume'] }
    }
  }
} as const;

export default async function reportsRoutes(app: FastifyInstance) {
  // Apply authentication to all routes
  app.addHook('onRequest', authenticate);

  // Get available report templates
  app.get('/templates', {
    preHandler: [authorize(['analytics.read'])],
    handler: reportsController.getReportTemplates
  });

  // Get reports for a venue
  app.get('/venue/:venueId', {
    preHandler: [authorize(['analytics.read'])],
    schema: getReportsSchema,
    handler: reportsController.getReports
  });

  // Get a specific report
  app.get('/:reportId', {
    preHandler: [authorize(['analytics.read'])],
    schema: reportParamsSchema,
    handler: reportsController.getReport
  });

  // Generate a report
  app.post('/generate', {
    preHandler: [authorize(['analytics.write'])],
    schema: generateReportSchema,
    handler: reportsController.generateReport
  });

  // Schedule a report
  app.post('/schedule', {
    preHandler: [authorize(['analytics.write'])],
    schema: scheduleReportSchema,
    handler: reportsController.scheduleReport
  });

  // Update report schedule
  app.put('/:reportId/schedule', {
    preHandler: [authorize(['analytics.write'])],
    schema: updateScheduleSchema,
    handler: reportsController.updateReportSchedule
  });

  // Delete a report
  app.delete('/:reportId', {
    preHandler: [authorize(['analytics.delete'])],
    schema: reportParamsSchema,
    handler: reportsController.deleteReport
  });

  // Get scheduled reports
  app.get('/venue/:venueId/scheduled', {
    preHandler: [authorize(['analytics.read'])],
    schema: venueParamsSchema,
    handler: reportsController.getScheduledReports
  });

  // Pause/resume scheduled report
  app.post('/:reportId/schedule/:action', {
    preHandler: [authorize(['analytics.write'])],
    schema: scheduleActionSchema,
    handler: reportsController.toggleScheduledReport
  });
}
