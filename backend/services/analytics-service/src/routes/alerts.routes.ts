import { FastifyInstance } from 'fastify';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { alertsController } from '../controllers/alerts.controller';

const getAlertsSchema = {
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
      enabled: { type: 'boolean' },
      severity: { type: 'string', enum: ['info', 'warning', 'error', 'critical'] },
      page: { type: 'integer', minimum: 1 },
      limit: { type: 'integer', minimum: 1, maximum: 100 }
    }
  }
} as const;

const alertParamsSchema = {
  params: {
    type: 'object',
    required: ['alertId'],
    properties: {
      alertId: { type: 'string', format: 'uuid' }
    }
  }
} as const;

const createAlertSchema = {
  body: {
    type: 'object',
    required: ['venueId', 'name', 'type', 'severity', 'conditions', 'actions'],
    properties: {
      venueId: { type: 'string', format: 'uuid' },
      name: { type: 'string', minLength: 1, maxLength: 100 },
      description: { type: 'string', maxLength: 500 },
      type: { type: 'string', minLength: 1 },
      severity: { type: 'string', enum: ['info', 'warning', 'error', 'critical'] },
      conditions: { type: 'array', minItems: 1 },
      actions: { type: 'array', minItems: 1 },
      enabled: { type: 'boolean' },
      schedule: { type: 'object' }
    }
  }
} as const;

const updateAlertSchema = {
  params: {
    type: 'object',
    required: ['alertId'],
    properties: {
      alertId: { type: 'string', format: 'uuid' }
    }
  },
  body: {
    type: 'object',
    properties: {
      name: { type: 'string', minLength: 1, maxLength: 100 },
      description: { type: 'string', maxLength: 500 },
      severity: { type: 'string', enum: ['info', 'warning', 'error', 'critical'] },
      conditions: { type: 'array' },
      actions: { type: 'array' },
      schedule: { type: 'object' }
    }
  }
} as const;

const toggleAlertSchema = {
  params: {
    type: 'object',
    required: ['alertId'],
    properties: {
      alertId: { type: 'string', format: 'uuid' }
    }
  },
  body: {
    type: 'object',
    required: ['enabled'],
    properties: {
      enabled: { type: 'boolean' }
    }
  }
} as const;

const getInstancesSchema = {
  params: {
    type: 'object',
    required: ['alertId'],
    properties: {
      alertId: { type: 'string', format: 'uuid' }
    }
  },
  querystring: {
    type: 'object',
    properties: {
      status: { type: 'string', enum: ['active', 'acknowledged', 'resolved'] },
      limit: { type: 'integer', minimum: 1, maximum: 100 }
    }
  }
} as const;

const acknowledgeAlertSchema = {
  params: {
    type: 'object',
    required: ['instanceId'],
    properties: {
      instanceId: { type: 'string', format: 'uuid' }
    }
  },
  body: {
    type: 'object',
    properties: {
      notes: { type: 'string' }
    }
  }
} as const;

export default async function alertsRoutes(app: FastifyInstance) {
  app.addHook('onRequest', authenticate);

  app.get('/venue/:venueId', {
    preHandler: [authorize(['analytics.read'])],
    schema: getAlertsSchema,
    handler: alertsController.getAlerts
  });

  app.get('/:alertId', {
    preHandler: [authorize(['analytics.read'])],
    schema: alertParamsSchema,
    handler: alertsController.getAlert
  });

  app.post('/', {
    preHandler: [authorize(['analytics.write'])],
    schema: createAlertSchema,
    handler: alertsController.createAlert
  });

  app.put('/:alertId', {
    preHandler: [authorize(['analytics.write'])],
    schema: updateAlertSchema,
    handler: alertsController.updateAlert
  });

  app.delete('/:alertId', {
    preHandler: [authorize(['analytics.delete'])],
    schema: alertParamsSchema,
    handler: alertsController.deleteAlert
  });

  app.post('/:alertId/toggle', {
    preHandler: [authorize(['analytics.write'])],
    schema: toggleAlertSchema,
    handler: alertsController.toggleAlert
  });

  app.get('/:alertId/instances', {
    preHandler: [authorize(['analytics.read'])],
    schema: getInstancesSchema,
    handler: alertsController.getAlertInstances
  });

  app.post('/instances/:instanceId/acknowledge', {
    preHandler: [authorize(['analytics.write'])],
    schema: acknowledgeAlertSchema,
    handler: alertsController.acknowledgeAlert
  });

  app.post('/:alertId/test', {
    preHandler: [authorize(['analytics.write'])],
    schema: alertParamsSchema,
    handler: alertsController.testAlert
  });
}
