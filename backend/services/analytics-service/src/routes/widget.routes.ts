import { FastifyInstance } from 'fastify';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { widgetController } from '../controllers/widget.controller';

const dashboardParamsSchema = {
  params: {
    type: 'object',
    required: ['dashboardId'],
    properties: {
      dashboardId: { type: 'string', format: 'uuid' }
    }
  }
} as const;

const widgetParamsSchema = {
  params: {
    type: 'object',
    required: ['widgetId'],
    properties: {
      widgetId: { type: 'string', format: 'uuid' }
    }
  }
} as const;

const getWidgetDataSchema = {
  params: {
    type: 'object',
    required: ['widgetId'],
    properties: {
      widgetId: { type: 'string', format: 'uuid' }
    }
  },
  querystring: {
    type: 'object',
    properties: {
      startDate: { type: 'string', format: 'date-time' },
      endDate: { type: 'string', format: 'date-time' },
      refresh: { type: 'boolean' }
    }
  }
} as const;

const createWidgetSchema = {
  body: {
    type: 'object',
    required: ['dashboardId', 'type', 'title', 'config', 'position', 'size'],
    properties: {
      dashboardId: { type: 'string', format: 'uuid' },
      type: { type: 'string', minLength: 1 },
      title: { type: 'string', minLength: 1, maxLength: 100 },
      config: { type: 'object' },
      position: {
        type: 'object',
        required: ['x', 'y'],
        properties: {
          x: { type: 'integer', minimum: 0 },
          y: { type: 'integer', minimum: 0 }
        }
      },
      size: {
        type: 'object',
        required: ['width', 'height'],
        properties: {
          width: { type: 'integer', minimum: 1, maximum: 12 },
          height: { type: 'integer', minimum: 1, maximum: 12 }
        }
      }
    }
  }
} as const;

const updateWidgetSchema = {
  params: {
    type: 'object',
    required: ['widgetId'],
    properties: {
      widgetId: { type: 'string', format: 'uuid' }
    }
  },
  body: {
    type: 'object',
    properties: {
      title: { type: 'string', minLength: 1, maxLength: 100 },
      config: { type: 'object' },
      position: { type: 'object' },
      size: { type: 'object' }
    }
  }
} as const;

const moveWidgetSchema = {
  params: {
    type: 'object',
    required: ['widgetId'],
    properties: {
      widgetId: { type: 'string', format: 'uuid' }
    }
  },
  body: {
    type: 'object',
    required: ['targetDashboardId'],
    properties: {
      targetDashboardId: { type: 'string', format: 'uuid' },
      position: { type: 'object' }
    }
  }
} as const;

const duplicateWidgetSchema = {
  params: {
    type: 'object',
    required: ['widgetId'],
    properties: {
      widgetId: { type: 'string', format: 'uuid' }
    }
  },
  body: {
    type: 'object',
    properties: {
      targetDashboardId: { type: 'string', format: 'uuid' }
    }
  }
} as const;

const exportWidgetSchema = {
  params: {
    type: 'object',
    required: ['widgetId'],
    properties: {
      widgetId: { type: 'string', format: 'uuid' }
    }
  },
  body: {
    type: 'object',
    required: ['format'],
    properties: {
      format: { type: 'string', enum: ['csv', 'xlsx', 'json'] },
      startDate: { type: 'string', format: 'date-time' },
      endDate: { type: 'string', format: 'date-time' }
    }
  }
} as const;

export default async function widgetRoutes(app: FastifyInstance) {
  // Apply authentication to all routes
  app.addHook('onRequest', authenticate);

  // Get widgets for a dashboard
  app.get('/dashboard/:dashboardId', {
    preHandler: [authorize(['analytics.read'])],
    schema: dashboardParamsSchema,
    handler: widgetController.getWidgets
  });

  // Get a specific widget
  app.get('/:widgetId', {
    preHandler: [authorize(['analytics.read'])],
    schema: widgetParamsSchema,
    handler: widgetController.getWidget
  });

  // Get widget data
  app.get('/:widgetId/data', {
    preHandler: [authorize(['analytics.read'])],
    schema: getWidgetDataSchema,
    handler: widgetController.getWidgetData
  });

  // Create a widget
  app.post('/', {
    preHandler: [authorize(['analytics.write'])],
    schema: createWidgetSchema,
    handler: widgetController.createWidget
  });

  // Update a widget
  app.put('/:widgetId', {
    preHandler: [authorize(['analytics.write'])],
    schema: updateWidgetSchema,
    handler: widgetController.updateWidget
  });

  // Delete a widget
  app.delete('/:widgetId', {
    preHandler: [authorize(['analytics.delete'])],
    schema: widgetParamsSchema,
    handler: widgetController.deleteWidget
  });

  // Move widget to another dashboard
  app.post('/:widgetId/move', {
    preHandler: [authorize(['analytics.write'])],
    schema: moveWidgetSchema,
    handler: widgetController.moveWidget
  });

  // Duplicate a widget
  app.post('/:widgetId/duplicate', {
    preHandler: [authorize(['analytics.write'])],
    schema: duplicateWidgetSchema,
    handler: widgetController.duplicateWidget
  });

  // Export widget data
  app.post('/:widgetId/export', {
    preHandler: [authorize(['analytics.export'])],
    schema: exportWidgetSchema,
    handler: widgetController.exportWidgetData
  });
}
