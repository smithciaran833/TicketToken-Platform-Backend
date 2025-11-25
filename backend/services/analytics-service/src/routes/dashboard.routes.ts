import { FastifyInstance } from 'fastify';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { dashboardController } from '../controllers/dashboard.controller';

const venueParamsSchema = {
  params: {
    type: 'object',
    required: ['venueId'],
    properties: {
      venueId: { type: 'string', format: 'uuid' }
    }
  }
} as const;

const dashboardParamsSchema = {
  params: {
    type: 'object',
    required: ['dashboardId'],
    properties: {
      dashboardId: { type: 'string', format: 'uuid' }
    }
  }
} as const;

const createDashboardSchema = {
  body: {
    type: 'object',
    required: ['venueId', 'name', 'type'],
    properties: {
      venueId: { type: 'string', format: 'uuid' },
      name: { type: 'string', minLength: 1, maxLength: 100 },
      description: { type: 'string', maxLength: 500 },
      type: { type: 'string', enum: ['overview', 'sales', 'customer', 'operations', 'custom'] },
      isDefault: { type: 'boolean' },
      isPublic: { type: 'boolean' },
      config: { type: 'object' }
    }
  }
} as const;

const updateDashboardSchema = {
  params: {
    type: 'object',
    required: ['dashboardId'],
    properties: {
      dashboardId: { type: 'string', format: 'uuid' }
    }
  },
  body: {
    type: 'object',
    properties: {
      name: { type: 'string', minLength: 1, maxLength: 100 },
      description: { type: 'string', maxLength: 500 },
      isPublic: { type: 'boolean' },
      config: { type: 'object' }
    }
  }
} as const;

const cloneDashboardSchema = {
  params: {
    type: 'object',
    required: ['dashboardId'],
    properties: {
      dashboardId: { type: 'string', format: 'uuid' }
    }
  },
  body: {
    type: 'object',
    required: ['name'],
    properties: {
      name: { type: 'string', minLength: 1, maxLength: 100 },
      venueId: { type: 'string', format: 'uuid' }
    }
  }
} as const;

const shareDashboardSchema = {
  params: {
    type: 'object',
    required: ['dashboardId'],
    properties: {
      dashboardId: { type: 'string', format: 'uuid' }
    }
  },
  body: {
    type: 'object',
    required: ['userIds', 'permissions'],
    properties: {
      userIds: {
        type: 'array',
        minItems: 1,
        items: { type: 'string', format: 'uuid' }
      },
      permissions: {
        type: 'array',
        items: { type: 'string', enum: ['view', 'edit'] }
      }
    }
  }
} as const;

export default async function dashboardRoutes(app: FastifyInstance) {
  // Apply authentication to all routes
  app.addHook('onRequest', authenticate);

  // Get all dashboards for a venue
  app.get('/venue/:venueId', {
    preHandler: [authorize(['analytics.read'])],
    schema: venueParamsSchema,
    handler: dashboardController.getDashboards
  });

  // Get a specific dashboard
  app.get('/:dashboardId', {
    preHandler: [authorize(['analytics.read'])],
    schema: dashboardParamsSchema,
    handler: dashboardController.getDashboard
  });

  // Create a dashboard
  app.post('/', {
    preHandler: [authorize(['analytics.write'])],
    schema: createDashboardSchema,
    handler: dashboardController.createDashboard
  });

  // Update a dashboard
  app.put('/:dashboardId', {
    preHandler: [authorize(['analytics.write'])],
    schema: updateDashboardSchema,
    handler: dashboardController.updateDashboard
  });

  // Delete a dashboard
  app.delete('/:dashboardId', {
    preHandler: [authorize(['analytics.delete'])],
    schema: dashboardParamsSchema,
    handler: dashboardController.deleteDashboard
  });

  // Clone a dashboard
  app.post('/:dashboardId/clone', {
    preHandler: [authorize(['analytics.write'])],
    schema: cloneDashboardSchema,
    handler: dashboardController.cloneDashboard
  });

  // Share a dashboard
  app.post('/:dashboardId/share', {
    preHandler: [authorize(['analytics.share'])],
    schema: shareDashboardSchema,
    handler: dashboardController.shareDashboard
  });

  // Get dashboard permissions
  app.get('/:dashboardId/permissions', {
    preHandler: [authorize(['analytics.read'])],
    schema: dashboardParamsSchema,
    handler: dashboardController.getDashboardPermissions
  });
}
