import { FastifyInstance, FastifyPluginOptions, FastifyRequest, FastifyReply } from 'fastify';
import { TaxController } from '../controllers/tax.controller';
import { validate } from '../middleware/validation.middleware';
import {
  createJurisdictionSchema,
  updateJurisdictionSchema,
  createTaxRateSchema,
  createCategorySchema,
  createExemptionSchema,
  calculateTaxSchema,
  configureProviderSchema,
  generateReportSchema,
  fileReportSchema,
  listQuerySchema,
  uuidParamSchema,
} from '../validators/tax.schemas';

/**
 * RD1, RD5: Tax routes with full input validation, authentication, and response schemas
 * All routes require authentication and use strict schema validation
 */

// HIGH: Response schemas to prevent data leakage (RD5)
const jurisdictionResponseSchema = {
  type: 'object',
  properties: {
    id: { type: 'string', format: 'uuid' },
    tenantId: { type: 'string', format: 'uuid' },
    name: { type: 'string' },
    code: { type: 'string' },
    country: { type: 'string' },
    state: { type: 'string', nullable: true },
    taxType: { type: 'string' },
    isActive: { type: 'boolean' },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
  },
};

const jurisdictionsListResponseSchema = {
  type: 'object',
  properties: {
    jurisdictions: { type: 'array', items: jurisdictionResponseSchema },
    total: { type: 'integer' },
    page: { type: 'integer' },
    pageSize: { type: 'integer' },
  },
};

const taxRateResponseSchema = {
  type: 'object',
  properties: {
    id: { type: 'string', format: 'uuid' },
    jurisdictionId: { type: 'string', format: 'uuid' },
    categoryId: { type: 'string', format: 'uuid', nullable: true },
    name: { type: 'string' },
    rate: { type: 'number' },
    isCompound: { type: 'boolean' },
    priority: { type: 'integer' },
    isActive: { type: 'boolean' },
    effectiveFrom: { type: 'string', format: 'date-time' },
    effectiveTo: { type: 'string', format: 'date-time', nullable: true },
    createdAt: { type: 'string', format: 'date-time' },
  },
};

const taxRatesListResponseSchema = {
  type: 'object',
  properties: {
    rates: { type: 'array', items: taxRateResponseSchema },
    total: { type: 'integer' },
    page: { type: 'integer' },
    pageSize: { type: 'integer' },
  },
};

const categoryResponseSchema = {
  type: 'object',
  properties: {
    id: { type: 'string', format: 'uuid' },
    tenantId: { type: 'string', format: 'uuid' },
    name: { type: 'string' },
    code: { type: 'string' },
    description: { type: 'string', nullable: true },
    isActive: { type: 'boolean' },
    createdAt: { type: 'string', format: 'date-time' },
  },
};

const categoriesListResponseSchema = {
  type: 'object',
  properties: {
    categories: { type: 'array', items: categoryResponseSchema },
    total: { type: 'integer' },
  },
};

const exemptionResponseSchema = {
  type: 'object',
  properties: {
    id: { type: 'string', format: 'uuid' },
    customerId: { type: 'string', format: 'uuid' },
    jurisdictionId: { type: 'string', format: 'uuid' },
    exemptionType: { type: 'string' },
    certificateNumber: { type: 'string', nullable: true },
    isVerified: { type: 'boolean' },
    validFrom: { type: 'string', format: 'date-time' },
    validTo: { type: 'string', format: 'date-time', nullable: true },
    createdAt: { type: 'string', format: 'date-time' },
  },
};

const exemptionsListResponseSchema = {
  type: 'object',
  properties: {
    exemptions: { type: 'array', items: exemptionResponseSchema },
    total: { type: 'integer' },
  },
};

const taxCalculationResponseSchema = {
  type: 'object',
  properties: {
    subtotalCents: { type: 'integer' },
    taxAmountCents: { type: 'integer' },
    totalCents: { type: 'integer' },
    breakdown: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          jurisdictionId: { type: 'string', format: 'uuid' },
          jurisdictionName: { type: 'string' },
          rate: { type: 'number' },
          amountCents: { type: 'integer' },
        },
      },
    },
    exemptionsApplied: { type: 'array', items: { type: 'string' } },
  },
};

const orderTaxResponseSchema = {
  type: 'object',
  properties: {
    orderId: { type: 'string', format: 'uuid' },
    taxAmountCents: { type: 'integer' },
    breakdown: { type: 'array', items: { type: 'object' } },
    calculatedAt: { type: 'string', format: 'date-time' },
  },
};

const providerConfigResponseSchema = {
  type: 'object',
  properties: {
    provider: { type: 'string' },
    isConfigured: { type: 'boolean' },
    lastSyncAt: { type: 'string', format: 'date-time', nullable: true },
  },
};

const reportResponseSchema = {
  type: 'object',
  properties: {
    id: { type: 'string', format: 'uuid' },
    tenantId: { type: 'string', format: 'uuid' },
    reportType: { type: 'string' },
    periodStart: { type: 'string', format: 'date-time' },
    periodEnd: { type: 'string', format: 'date-time' },
    status: { type: 'string' },
    totalTaxCollected: { type: 'integer' },
    filedAt: { type: 'string', format: 'date-time', nullable: true },
    createdAt: { type: 'string', format: 'date-time' },
  },
};

const reportsListResponseSchema = {
  type: 'object',
  properties: {
    reports: { type: 'array', items: reportResponseSchema },
    total: { type: 'integer' },
  },
};

const errorResponseSchema = {
  type: 'object',
  properties: {
    error: { type: 'string' },
    message: { type: 'string' },
    statusCode: { type: 'integer' },
  },
};

const successResponseSchema = {
  type: 'object',
  properties: {
    success: { type: 'boolean' },
    message: { type: 'string' },
  },
};

export default async function taxRoutes(
  fastify: FastifyInstance,
  opts: FastifyPluginOptions
): Promise<void> {
  const controller = new TaxController();

  // SEC-R1: Use the registered authenticate decorator from JWT plugin
  const authenticate = async (request: FastifyRequest, reply: FastifyReply) => {
    await fastify.authenticate(request, reply);
  };

  // Helper to check admin role
  const requireAdmin = async (request: FastifyRequest, reply: FastifyReply) => {
    const user = (request as any).user;
    if (!user || (user.role !== 'admin' && user.role !== 'superadmin')) {
      reply.status(403).send({ error: 'Forbidden', message: 'Admin access required' });
      return;
    }
  };

  // Jurisdiction routes - Admin only
  fastify.post('/jurisdictions', {
    schema: {
      response: {
        201: jurisdictionResponseSchema,
        400: errorResponseSchema,
        401: errorResponseSchema,
        403: errorResponseSchema,
      },
    },
    preHandler: [authenticate, requireAdmin, validate({ body: createJurisdictionSchema })],
  }, controller.createJurisdiction);

  fastify.get('/jurisdictions', {
    schema: {
      response: {
        200: jurisdictionsListResponseSchema,
        401: errorResponseSchema,
      },
    },
    preHandler: [authenticate, validate({ query: listQuerySchema })],
  }, controller.getJurisdictions);

  fastify.patch('/jurisdictions/:jurisdictionId', {
    schema: {
      response: {
        200: jurisdictionResponseSchema,
        400: errorResponseSchema,
        401: errorResponseSchema,
        403: errorResponseSchema,
        404: errorResponseSchema,
      },
    },
    preHandler: [authenticate, requireAdmin, validate({ params: uuidParamSchema, body: updateJurisdictionSchema })],
  }, controller.updateJurisdiction);

  // Tax rate routes - Admin only
  fastify.post('/rates', {
    schema: {
      response: {
        201: taxRateResponseSchema,
        400: errorResponseSchema,
        401: errorResponseSchema,
        403: errorResponseSchema,
      },
    },
    preHandler: [authenticate, requireAdmin, validate({ body: createTaxRateSchema })],
  }, controller.createTaxRate);

  fastify.get('/rates', {
    schema: {
      response: {
        200: taxRatesListResponseSchema,
        401: errorResponseSchema,
      },
    },
    preHandler: [authenticate, validate({ query: listQuerySchema })],
  }, controller.getTaxRates);

  // Tax category routes - Admin only
  fastify.post('/categories', {
    schema: {
      response: {
        201: categoryResponseSchema,
        400: errorResponseSchema,
        401: errorResponseSchema,
        403: errorResponseSchema,
      },
    },
    preHandler: [authenticate, requireAdmin, validate({ body: createCategorySchema })],
  }, controller.createCategory);

  fastify.get('/categories', {
    schema: {
      response: {
        200: categoriesListResponseSchema,
        401: errorResponseSchema,
      },
    },
    preHandler: [authenticate, validate({ query: listQuerySchema })],
  }, controller.getCategories);

  // Tax exemption routes
  fastify.post('/exemptions', {
    schema: {
      response: {
        201: exemptionResponseSchema,
        400: errorResponseSchema,
        401: errorResponseSchema,
        403: errorResponseSchema,
      },
    },
    preHandler: [authenticate, requireAdmin, validate({ body: createExemptionSchema })],
  }, controller.createExemption);

  fastify.get('/exemptions/customer/:customerId', {
    schema: {
      response: {
        200: exemptionsListResponseSchema,
        401: errorResponseSchema,
        404: errorResponseSchema,
      },
    },
    preHandler: [authenticate, validate({ params: uuidParamSchema })],
  }, controller.getCustomerExemptions);

  fastify.post('/exemptions/:exemptionId/verify', {
    schema: {
      response: {
        200: exemptionResponseSchema,
        401: errorResponseSchema,
        403: errorResponseSchema,
        404: errorResponseSchema,
      },
    },
    preHandler: [authenticate, requireAdmin, validate({ params: uuidParamSchema })],
  }, controller.verifyExemption);

  // Tax calculation routes
  fastify.post('/calculate', {
    schema: {
      response: {
        200: taxCalculationResponseSchema,
        400: errorResponseSchema,
        401: errorResponseSchema,
      },
    },
    preHandler: [authenticate, validate({ body: calculateTaxSchema })],
  }, controller.calculateTax);

  fastify.get('/orders/:orderId', {
    schema: {
      response: {
        200: orderTaxResponseSchema,
        401: errorResponseSchema,
        404: errorResponseSchema,
      },
    },
    preHandler: [authenticate, validate({ params: uuidParamSchema })],
  }, controller.getTaxForOrder);

  // Provider configuration routes - Admin only
  fastify.post('/provider/configure', {
    schema: {
      response: {
        200: successResponseSchema,
        400: errorResponseSchema,
        401: errorResponseSchema,
        403: errorResponseSchema,
      },
    },
    preHandler: [authenticate, requireAdmin, validate({ body: configureProviderSchema })],
  }, controller.configureProvider);

  fastify.get('/provider/config', {
    schema: {
      response: {
        200: providerConfigResponseSchema,
        401: errorResponseSchema,
        403: errorResponseSchema,
      },
    },
    preHandler: [authenticate, requireAdmin],
  }, controller.getProviderConfig);

  // Tax reporting routes - Admin only
  fastify.post('/reports', {
    schema: {
      response: {
        201: reportResponseSchema,
        400: errorResponseSchema,
        401: errorResponseSchema,
        403: errorResponseSchema,
      },
    },
    preHandler: [authenticate, requireAdmin, validate({ body: generateReportSchema })],
  }, controller.generateReport);

  fastify.get('/reports', {
    schema: {
      response: {
        200: reportsListResponseSchema,
        401: errorResponseSchema,
        403: errorResponseSchema,
      },
    },
    preHandler: [authenticate, requireAdmin, validate({ query: listQuerySchema })],
  }, controller.getReports);

  fastify.post('/reports/:reportId/file', {
    schema: {
      response: {
        200: reportResponseSchema,
        400: errorResponseSchema,
        401: errorResponseSchema,
        403: errorResponseSchema,
        404: errorResponseSchema,
      },
    },
    preHandler: [authenticate, requireAdmin, validate({ params: uuidParamSchema, body: fileReportSchema })],
  }, controller.fileReport);
}
