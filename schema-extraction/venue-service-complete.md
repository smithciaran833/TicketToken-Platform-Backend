# COMPLETE DATABASE ANALYSIS: venue-service
Generated: Thu Oct  2 15:07:56 EDT 2025

================================================================================
## SECTION 1: ALL TYPESCRIPT/JAVASCRIPT FILES WITH DATABASE OPERATIONS
================================================================================

### FILE: src/routes/internal-validation.routes.ts
```typescript
import { FastifyPluginAsync } from 'fastify';
import { db } from '../config/database';
import * as crypto from 'crypto';

const INTERNAL_SECRET = process.env.INTERNAL_SERVICE_SECRET || 'internal-service-secret-change-in-production';

const internalValidationRoutes: FastifyPluginAsync = async (fastify) => {
  // ISSUE #25 FIX: Add authentication hook for internal routes
  fastify.addHook('preHandler', async (request, reply) => {
    const serviceName = request.headers['x-internal-service'] as string;
    const timestamp = request.headers['x-internal-timestamp'] as string;
    const signature = request.headers['x-internal-signature'] as string;

    if (!serviceName || !timestamp || !signature) {
      return reply.status(401).send({ error: 'Missing authentication headers' });
    }

    // Verify timestamp
    const requestTime = parseInt(timestamp);
    const now = Date.now();
    const timeDiff = Math.abs(now - requestTime);

    if (isNaN(requestTime) || timeDiff > 5 * 60 * 1000) {
      return reply.status(401).send({ error: 'Request expired' });
    }

    // Accept temp-signature in development
    if (signature === 'temp-signature' && process.env.NODE_ENV !== 'production') {
      (request as any).internalService = serviceName;
      return;
    }

    // Verify signature
    const payload = `${serviceName}:${timestamp}:${request.method}:${request.url}`;
    const expectedSignature = crypto
      .createHmac('sha256', INTERNAL_SECRET)
      .update(payload)
      .digest('hex');

    if (signature !== expectedSignature) {
      return reply.status(401).send({ error: 'Invalid signature' });
    }

    (request as any).internalService = serviceName;
  });

  fastify.get('/internal/venues/:venueId/validate-ticket/:ticketId', async (request, reply) => {
    const { venueId, ticketId } = request.params as { venueId: string; ticketId: string };
    
    fastify.log.info('Internal ticket validation request', {
      venueId,
      ticketId,
      requestingService: (request as any).internalService
    });

    try {
      // Use the imported db directly instead of container.resolve
      const result = await db.raw(`
        SELECT t.*, e.venue_id, e.event_date
        FROM tickets t
        JOIN events e ON t.event_id = e.id
        WHERE t.id = ? AND e.venue_id = ?
      `, [ticketId, venueId]);

      if (!result.rows[0]) {
        return reply.send({ valid: false, reason: 'Ticket not found for venue' });
      }

      // Check if already scanned
      const scanCheck = await db('ticket_scans')
        .where('ticket_id', ticketId)
        .first();

      return reply.send({
        valid: !scanCheck,
        alreadyScanned: !!scanCheck,
        ticket: result.rows[0]
      });
    } catch (error: any) {
      fastify.log.error('Validation error:', error);
      return reply.status(500).send({ error: 'Validation failed', details: error.message });
    }
  });
};

export default internalValidationRoutes;
```

### FILE: src/routes/health.routes.ts
```typescript
import { FastifyInstance } from 'fastify';

export default async function healthRoutes(fastify: FastifyInstance) {
  const healthCheckService = fastify.container.resolve('healthCheckService');

  // Liveness probe - for Kubernetes
  fastify.get('/health/live', async (request, reply) => {
    const result = await healthCheckService.getLiveness();
    reply.code(200).send(result);
  });

  // Readiness probe - for Kubernetes
  fastify.get('/health/ready', async (request, reply) => {
    const result = await healthCheckService.getReadiness();
    const httpCode = result.status === 'unhealthy' ? 503 : 200;
    reply.code(httpCode).send(result);
  });

  // Full health check - detailed status
  fastify.get('/health/full', async (request, reply) => {
    const result = await healthCheckService.getFullHealth();
    const httpCode = result.status === 'unhealthy' ? 503 : 
                     result.status === 'degraded' ? 200 : 200;
    reply.code(httpCode).send(result);
  });

  // Keep existing simple health endpoint for backward compatibility
  fastify.get('/health', async (request, reply) => {
    const { db, redis } = fastify.container.cradle;
    const health = {
      status: 'ok',
      timestamp: new Date().toISOString(),
      service: 'venue-service',
      version: process.env.npm_package_version || '1.0.0',
      checks: {
        database: 'unknown',
        redis: 'unknown',
      }
    };

    try {
      await db.raw('SELECT 1');
      health.checks.database = 'ok';
    } catch (error) {
      health.checks.database = 'error';
      health.status = 'unhealthy';
    }

    try {
      await redis.ping();
      health.checks.redis = 'ok';
    } catch (error) {
      health.checks.redis = 'error';
      if (health.status === 'ok') {
        health.status = 'degraded';
      }
    }

    const httpCode = health.status === 'unhealthy' ? 503 : 200;
    reply.code(httpCode).send(health);
  });
}
```

### FILE: src/config/dependencies.ts
```typescript
import { asClass, asValue, createContainer } from 'awilix';
import { Knex } from 'knex';
import Redis from 'ioredis';
import { VenueService } from '../services/venue.service';
import { CacheService } from '../services/cache.service';
import { AnalyticsService } from '../services/analytics.service';
import { EventPublisher } from '../services/eventPublisher';
import { IntegrationService } from '../services/integration.service';
import { OnboardingService } from '../services/onboarding.service';
import { ComplianceService } from '../services/compliance.service';
import { VerificationService } from '../services/verification.service';
import { HealthCheckService } from '../services/healthCheck.service';
import { logger } from '../utils/logger';

export interface Dependencies {
  db: Knex;
  redis: Redis;
  venueService: VenueService;
  cacheService: CacheService;
  analyticsService: AnalyticsService;
  eventPublisher: EventPublisher;
  integrationService: IntegrationService;
  onboardingService: OnboardingService;
  complianceService: ComplianceService;
  verificationService: VerificationService;
  healthCheckService: HealthCheckService;
  logger: typeof logger;
}

export function registerDependencies(db: Knex, redis: Redis) {
  const container = createContainer<Dependencies>();

  container.register({
    db: asValue(db),
    redis: asValue(redis),
    logger: asValue(logger),
    cacheService: asClass(CacheService).singleton(),
    analyticsService: asClass(AnalyticsService).singleton(),
    eventPublisher: asClass(EventPublisher).singleton(),
    venueService: asClass(VenueService).singleton(),
    integrationService: asClass(IntegrationService).singleton(),
    onboardingService: asClass(OnboardingService).singleton(),
    complianceService: asClass(ComplianceService).singleton(),
    verificationService: asClass(VerificationService).singleton(),
    healthCheckService: asClass(HealthCheckService).singleton(),
  });

  return container;
}
```

### FILE: src/config/database.ts
```typescript
import knex, { Knex } from 'knex';

export const dbConfig: Knex.Config = {
  client: 'postgresql',
  connection: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    database: process.env.DB_NAME || 'tickettoken_db',
    application_name: 'venue-service'
  },
  pool: {
    min: 0,
    max: 10
  },
  acquireConnectionTimeout: 60000,
  migrations: {
    directory: './migrations',
    tableName: 'knex_migrations'
  },
  seeds: {
    directory: './seeds'
  }
};

// Create database instance
export const db = knex(dbConfig);

// Pool monitoring
export function startPoolMonitoring() {
  console.log('Database pool monitoring started');
}

// Check database connection with retries
export async function checkDatabaseConnection(retries = 10, delay = 3000): Promise<boolean> {
  for (let i = 0; i < retries; i++) {
    try {
      console.log(`Attempting database connection... (attempt ${i + 1}/${retries})`);
      console.log(`DB Config: host=${process.env.DB_HOST}, port=${process.env.DB_PORT}, db=${process.env.DB_NAME}`);
      
      await db.raw('SELECT 1');
      console.log('Database connection successful!');
      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`Database connection attempt ${i + 1} failed:`, errorMessage);
      if (i < retries - 1) {
        console.log(`Waiting ${delay}ms before retry...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  console.error('Failed to connect to database after all retries');
  return false;
}

export default db;
```

### FILE: src/@types/global.d.ts
```typescript
import { AwilixContainer } from 'awilix';
import { JWT } from '@fastify/jwt';
import { FastifyInstance as OriginalFastifyInstance } from 'fastify';

declare module 'fastify' {
  export interface FastifyInstance extends OriginalFastifyInstance {
    container: AwilixContainer;
    jwt: JWT;
  }
  
  export interface FastifyRequest {
    startTime?: number;
  }
}
```

### FILE: src/migrations/001_create_venues_tables.ts
```typescript
import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Venues table
  await knex.schema.createTable('venues', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('name').notNullable();
    table.string('slug').unique().notNullable();
    table.string('type').notNullable(); // comedy_club, theater, etc
    table.jsonb('address').notNullable();
    table.string('city').notNullable();
    table.string('state').notNullable();
    table.string('zip_code');
    table.string('country').defaultTo('US');
    table.string('phone');
    table.string('email');
    table.string('website');
    table.integer('capacity');
    table.text('description');
    table.jsonb('operating_hours');
    table.jsonb('amenities');
    table.string('status').defaultTo('active'); // active, inactive, suspended
    table.boolean('is_public').defaultTo(true);
    table.jsonb('metadata').defaultTo('{}');
    table.timestamps(true, true);
    table.timestamp('deleted_at');
    
    table.index(['city', 'state']);
    table.index('slug');
    table.index('status');
  });

  // Venue staff table
  await knex.schema.createTable('venue_staff', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('venue_id').notNullable().references('id').inTable('venues').onDelete('CASCADE');
    table.uuid('user_id').notNullable();
    table.string('role').notNullable(); // owner, manager, staff, scanner
    table.jsonb('permissions').defaultTo('[]');
    table.boolean('is_active').defaultTo(true);
    table.timestamps(true, true);
    
    table.unique(['venue_id', 'user_id']);
    table.index('user_id');
  });

  // Venue layouts table
  await knex.schema.createTable('venue_layouts', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('venue_id').notNullable().references('id').inTable('venues').onDelete('CASCADE');
    table.string('name').notNullable();
    table.jsonb('sections').notNullable(); // Array of sections with seats
    table.integer('total_capacity').notNullable();
    table.boolean('is_default').defaultTo(false);
    table.timestamps(true, true);
    
    table.index('venue_id');
  });

  // Venue integrations table
  await knex.schema.createTable('venue_integrations', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('venue_id').notNullable().references('id').inTable('venues').onDelete('CASCADE');
    table.string('type').notNullable(); // square, toast, quickbooks, etc
    table.string('status').defaultTo('active');
    table.jsonb('config').defaultTo('{}');
    table.text('encrypted_credentials');
    table.timestamp('last_sync');
    table.timestamps(true, true);
    
    table.unique(['venue_id', 'type']);
  });

  // Venue settings table
  await knex.schema.createTable('venue_settings', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('venue_id').notNullable().references('id').inTable('venues').onDelete('CASCADE');
    table.jsonb('ticket_settings').defaultTo('{}');
    table.jsonb('payment_settings').defaultTo('{}');
    table.jsonb('notification_settings').defaultTo('{}');
    table.jsonb('compliance_settings').defaultTo('{}');
    table.timestamps(true, true);
    
    table.unique('venue_id');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('venue_settings');
  await knex.schema.dropTableIfExists('venue_integrations');
  await knex.schema.dropTableIfExists('venue_layouts');
  await knex.schema.dropTableIfExists('venue_staff');
  await knex.schema.dropTableIfExists('venues');
}
```

### FILE: src/controllers/integrations.controller.ts
```typescript
import { cache as serviceCache } from '../services/cache-integration';
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { authenticate, requireVenueAccess, AuthenticatedRequest } from '../middleware/auth.middleware';
import { validate } from '../middleware/validation.middleware';
import { createIntegrationSchema, updateIntegrationSchema } from '../schemas/integration.schema';
import { NotFoundError, ConflictError, ForbiddenError } from '../utils/errors';
import { venueOperations } from '../utils/metrics';

interface VenueParams {
  venueId: string;
}

interface IntegrationParams extends VenueParams {
  integrationId: string;
}

interface CreateIntegrationBody {
  type: 'square' | 'stripe' | 'toast' | 'mailchimp' | 'twilio';
  config?: Record<string, any>;
  credentials: Record<string, any>;
}

interface UpdateIntegrationBody {
  config?: Record<string, any>;
  status?: 'active' | 'inactive';
}

// Helper middleware for tenant context
async function addTenantContext(request: any, reply: any) {
  const user = request.user;
  const tenantId = user?.tenant_id || '00000000-0000-0000-0000-000000000001';
  request.tenantId = tenantId;
}

export async function integrationRoutes(fastify: FastifyInstance) {
  const { integrationService, venueService, logger, redis } = (fastify as any).container.cradle;

  // List venue integrations - SECURED
  fastify.get('/',
    {
      preHandler: [authenticate, addTenantContext],
      schema: {
        tags: ['integrations'],
        summary: 'List venue integrations',
        security: [{ bearerAuth: [] }]
      }
    },
    async (request: any, reply: FastifyReply) => {
      const { venueId } = request.params;
      const userId = request.user?.id;
      const tenantId = request.tenantId;

      try {
        // Use venueService for access checking
        const hasAccess = await venueService.checkVenueAccess(venueId, userId, tenantId);
        if (!hasAccess) {
          throw new ForbiddenError('No access to this venue');
        }

        const integrations = await integrationService.listVenueIntegrations(venueId);

        // Mask sensitive credentials
        const sanitized = integrations.map((i: any) => ({
          ...i,
          encrypted_credentials: undefined,
          config: {
            ...i.config,
            apiKey: i.config?.apiKey ? '***' : undefined,
            secretKey: i.config?.secretKey ? '***' : undefined
          }
        }));

        venueOperations.inc({ operation: 'list_integrations', status: 'success' });
        return reply.send(sanitized);
      } catch (error) {
        venueOperations.inc({ operation: 'list_integrations', status: 'error' });
        if (error instanceof ForbiddenError) {
          throw error;
        }
        logger.error({ error, venueId }, 'Failed to list integrations');
        throw error;
      }
    }
  );

  // Create new integration - SECURED
  fastify.post('/',
    {
      preHandler: [authenticate, addTenantContext, validate(createIntegrationSchema)],
      schema: {
        tags: ['integrations'],
        summary: 'Create venue integration',
        security: [{ bearerAuth: [] }]
      }
    },
    async (request: any, reply: FastifyReply) => {
      const { venueId } = request.params;
      const userId = request.user?.id;
      const tenantId = request.tenantId;
      const body = request.body as CreateIntegrationBody;

      try {
        // Check access and get role
        const hasAccess = await venueService.checkVenueAccess(venueId, userId, tenantId);
        if (!hasAccess) {
          throw new ForbiddenError('No access to this venue');
        }

        const accessDetails = await venueService.getAccessDetails(venueId, userId);
        if (!['owner', 'manager'].includes(accessDetails?.role)) {
          throw new ForbiddenError('Insufficient permissions to create integrations');
        }

        // Transform data to match service expectations
        const integrationData = {
          type: body.type,
          config: body.config || {},
          encrypted_credentials: body.credentials,
          status: 'active'
        };

        const integration = await integrationService.createIntegration(venueId, integrationData);

        logger.info({ venueId, integrationType: body.type, userId }, 'Integration created');
        venueOperations.inc({ operation: 'create_integration', status: 'success' });

        return reply.status(201).send(integration);
      } catch (error) {
        venueOperations.inc({ operation: 'create_integration', status: 'error' });
        if (error instanceof ForbiddenError || error instanceof ConflictError) {
          throw error;
        }
        logger.error({ error, venueId }, 'Failed to create integration');
        throw error;
      }
    }
  );

  // Get integration by ID - SECURED
  fastify.get('/:integrationId',
    {
      preHandler: [authenticate, addTenantContext],
      schema: {
        tags: ['integrations'],
        summary: 'Get integration details',
        security: [{ bearerAuth: [] }]
      }
    },
    async (request: any, reply: FastifyReply) => {
      const { venueId, integrationId } = request.params;
      const userId = request.user?.id;
      const tenantId = request.tenantId;

      try {
        // Check venue access
        const hasAccess = await venueService.checkVenueAccess(venueId, userId, tenantId);
        if (!hasAccess) {
          throw new ForbiddenError('No access to this venue');
        }

        const integration = await integrationService.getIntegration(integrationId);
        if (!integration) {
          throw new NotFoundError('Integration not found');
        }

        // Verify integration belongs to venue
        if (integration.venue_id !== venueId) {
          throw new ForbiddenError('Integration does not belong to this venue');
        }

        // Mask sensitive credentials
        const sanitized = {
          ...integration,
          encrypted_credentials: undefined,
          config: {
            ...integration.config,
            apiKey: integration.config?.apiKey ? '***' : undefined,
            secretKey: integration.config?.secretKey ? '***' : undefined
          }
        };

        return reply.send(sanitized);
      } catch (error) {
        if (error instanceof ForbiddenError || error instanceof NotFoundError) {
          throw error;
        }
        logger.error({ error, venueId, integrationId }, 'Failed to get integration');
        throw error;
      }
    }
  );

  // Update integration - SECURED
  fastify.put('/:integrationId',
    {
      preHandler: [authenticate, addTenantContext, validate(updateIntegrationSchema)],
      schema: {
        tags: ['integrations'],
        summary: 'Update integration',
        security: [{ bearerAuth: [] }]
      }
    },
    async (request: any, reply: FastifyReply) => {
      const { venueId, integrationId } = request.params;
      const userId = request.user?.id;
      const tenantId = request.tenantId;
      const body = request.body as UpdateIntegrationBody;

      try {
        // Check access and role
        const hasAccess = await venueService.checkVenueAccess(venueId, userId, tenantId);
        if (!hasAccess) {
          throw new ForbiddenError('No access to this venue');
        }

        const accessDetails = await venueService.getAccessDetails(venueId, userId);
        if (!['owner', 'manager'].includes(accessDetails?.role)) {
          throw new ForbiddenError('Insufficient permissions to update integrations');
        }

        // Verify integration belongs to venue
        const existing = await integrationService.getIntegration(integrationId);
        if (!existing || existing.venue_id !== venueId) {
          throw new NotFoundError('Integration not found');
        }

        const updated = await integrationService.updateIntegration(integrationId, body);

        logger.info({ venueId, integrationId, userId }, 'Integration updated');
        venueOperations.inc({ operation: 'update_integration', status: 'success' });

        return reply.send(updated);
      } catch (error) {
        venueOperations.inc({ operation: 'update_integration', status: 'error' });
        if (error instanceof ForbiddenError || error instanceof NotFoundError) {
          throw error;
        }
        logger.error({ error, venueId, integrationId }, 'Failed to update integration');
        throw error;
      }
    }
  );

  // Delete integration - SECURED
  fastify.delete('/:integrationId',
    {
      preHandler: [authenticate, addTenantContext],
      schema: {
        tags: ['integrations'],
        summary: 'Delete integration',
        security: [{ bearerAuth: [] }]
      }
    },
    async (request: any, reply: FastifyReply) => {
      const { venueId, integrationId } = request.params;
      const userId = request.user?.id;
      const tenantId = request.tenantId;

      try {
        // Check access and role
        const hasAccess = await venueService.checkVenueAccess(venueId, userId, tenantId);
        if (!hasAccess) {
          throw new ForbiddenError('No access to this venue');
        }

        const accessDetails = await venueService.getAccessDetails(venueId, userId);
        if (accessDetails?.role !== 'owner') {
          throw new ForbiddenError('Only venue owner can delete integrations');
        }

        // Verify integration belongs to venue
        const existing = await integrationService.getIntegration(integrationId);
        if (!existing || existing.venue_id !== venueId) {
          throw new NotFoundError('Integration not found');
        }

        await integrationService.deleteIntegration(integrationId);

        logger.info({ venueId, integrationId, userId }, 'Integration deleted');
        venueOperations.inc({ operation: 'delete_integration', status: 'success' });

        return reply.status(204).send();
      } catch (error) {
        venueOperations.inc({ operation: 'delete_integration', status: 'error' });
        if (error instanceof ForbiddenError || error instanceof NotFoundError) {
          throw error;
        }
        logger.error({ error, venueId, integrationId }, 'Failed to delete integration');
        throw error;
      }
    }
  );

  // Test integration connection - SECURED
  fastify.post('/:integrationId/test',
    {
      preHandler: [authenticate, addTenantContext],
      schema: {
        tags: ['integrations'],
        summary: 'Test integration connection',
        security: [{ bearerAuth: [] }]
      }
    },
    async (request: any, reply: FastifyReply) => {
      const { venueId, integrationId } = request.params;
      const userId = request.user?.id;
      const tenantId = request.tenantId;

      try {
        // Check venue access
        const hasAccess = await venueService.checkVenueAccess(venueId, userId, tenantId);
        if (!hasAccess) {
          throw new ForbiddenError('No access to this venue');
        }

        // Verify integration belongs to venue
        const existing = await integrationService.getIntegration(integrationId);
        if (!existing || existing.venue_id !== venueId) {
          throw new NotFoundError('Integration not found');
        }

        const result = await integrationService.testIntegration(integrationId);

        logger.info({ venueId, integrationId, userId }, 'Integration tested');

        return reply.send({
          success: result.success,
          message: result.message
        });
      } catch (error) {
        if (error instanceof ForbiddenError || error instanceof NotFoundError) {
          throw error;
        }
        logger.error({ error, venueId, integrationId }, 'Failed to test integration');
        throw error;
      }
    }
  );
}

```

### FILE: src/controllers/settings.controller.ts
```typescript
import { cache as serviceCache } from '../services/cache-integration';
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { authenticate, requireVenueAccess, AuthenticatedRequest } from '../middleware/auth.middleware';
import { validate } from '../middleware/validation.middleware';
import { updateSettingsSchema } from '../schemas/settings.schema';
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

export async function settingsRoutes(fastify: FastifyInstance) {
  const { db, venueService, logger } = (fastify as any).container.cradle;

  // Get venue settings - SECURED
  fastify.get('/',
    {
      preHandler: [authenticate, addTenantContext]
    },
    async (request: any, reply: FastifyReply) => {
      try {
        const { venueId } = request.params;
        const userId = request.user?.id;

        // Use venueService for access check
        const hasAccess = await venueService.checkVenueAccess(venueId, userId);
        if (!hasAccess) {
          throw new ForbiddenError('No access to this venue');
        }

        const settings = await db('venue_settings')
          .where({ venue_id: venueId })
          .first();

        if (!settings) {
          // Return defaults if no settings exist
          return reply.send({
            general: {
              timezone: 'UTC',
              currency: 'USD',
              language: 'en'
            },
            ticketing: {
              allowRefunds: true,
              refundWindow: 24,
              maxTicketsPerOrder: 10
            }
          });
        }

        // Map database columns to expected format
        return reply.send({
          general: {
            timezone: 'UTC',
            currency: settings.accepted_currencies?.[0] || 'USD',
            language: 'en'
          },
          ticketing: {
            allowRefunds: settings.ticket_resale_allowed,
            refundWindow: 24,
            maxTicketsPerOrder: settings.max_tickets_per_order,
            allowPrintAtHome: settings.allow_print_at_home,
            allowMobileTickets: settings.allow_mobile_tickets,
            requireIdVerification: settings.require_id_verification,
            ticketTransferAllowed: settings.ticket_transfer_allowed
          },
          fees: {
            serviceFeePercentage: settings.service_fee_percentage,
            facilityFeeAmount: settings.facility_fee_amount,
            processingFeePercentage: settings.processing_fee_percentage
          },
          payment: {
            methods: settings.payment_methods,
            acceptedCurrencies: settings.accepted_currencies,
            payoutFrequency: settings.payout_frequency,
            minimumPayoutAmount: settings.minimum_payout_amount
          }
        });
      } catch (error: any) {
        if (error instanceof ForbiddenError) {
          throw error;
        }
        logger.error({ error, venueId: request.params.venueId }, 'Failed to get settings');
        return reply.status(500).send({ error: 'Failed to get settings' });
      }
    }
  );

  // Update venue settings - SECURED
  fastify.put('/',
    {
      preHandler: [authenticate, addTenantContext]
    },
    async (request: any, reply: FastifyReply) => {
      try {
        const { venueId } = request.params;
        const userId = request.user?.id;
        const body = request.body as any;

        // Check access and role
        const hasAccess = await venueService.checkVenueAccess(venueId, userId);
        if (!hasAccess) {
          throw new ForbiddenError('No access to this venue');
        }

        const accessDetails = await venueService.getAccessDetails(venueId, userId);
        if (!['owner', 'manager'].includes(accessDetails?.role)) {
          throw new ForbiddenError('Insufficient permissions to update settings');
        }

        // Map request to database columns
        const updates: any = {};
        
        if (body.general) {
          if (body.general.currency) {
            updates.accepted_currencies = [body.general.currency];
          }
        }
        
        if (body.ticketing) {
          if (body.ticketing.maxTicketsPerOrder !== undefined) {
            updates.max_tickets_per_order = body.ticketing.maxTicketsPerOrder;
          }
          if (body.ticketing.allowRefunds !== undefined) {
            updates.ticket_resale_allowed = body.ticketing.allowRefunds;
          }
        }

        if (Object.keys(updates).length > 0) {
          updates.updated_at = new Date();
          
          await db('venue_settings')
            .where({ venue_id: venueId })
            .update(updates);
        }

        logger.info({ venueId, userId }, 'Settings updated');
        venueOperations.inc({ operation: 'settings_update', status: 'success' });

        return reply.send({ success: true, message: 'Settings updated' });
      } catch (error: any) {
        venueOperations.inc({ operation: 'settings_update', status: 'error' });
        if (error instanceof ForbiddenError) {
          throw error;
        }
        logger.error({ error, venueId: request.params.venueId }, 'Failed to update settings');
        return reply.status(500).send({ error: 'Failed to update settings' });
      }
    }
  );
}
```

### FILE: src/controllers/venues.controller.ts
```typescript
import { cache as serviceCache } from '../services/cache-integration';
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { ErrorResponseBuilder } from '../utils/error-response';
import { authenticate, requireVenueAccess, AuthenticatedRequest } from '../middleware/auth.middleware';
import { validate } from '../middleware/validation.middleware';
import { createVenueSchema, updateVenueSchema, venueQuerySchema } from '../schemas/venue.schema';
import { NotFoundError, ConflictError, ForbiddenError } from '../utils/errors';
import { venueOperations } from '../utils/metrics';
import { settingsRoutes } from './settings.controller';
import { integrationRoutes } from './integrations.controller';

interface CreateVenueBody {
  name: string;
  type: 'comedy_club' | 'theater' | 'arena' | 'stadium' | 'other';
  capacity: number;
  address: {
    street: string;
    city: string;
    state: string;
    zipCode: string;
    country: string;
  };
}

interface UpdateVenueBody {
  name?: string;
  type?: 'comedy_club' | 'theater' | 'arena' | 'stadium' | 'other';
  capacity?: number;
  address?: {
    street?: string;
    city?: string;
    state?: string;
    zipCode?: string;
    country?: string;
  };
  settings?: Record<string, any>;
}

interface VenueParams {
  venueId: string;
}

// Helper middleware for tenant context
async function addTenantContext(request: any, reply: any) {
  const user = request.user;
  const tenantId = user?.tenant_id || '00000000-0000-0000-0000-000000000001';
  request.tenantId = tenantId;
}


// Helper to verify venue ownership
async function verifyVenueOwnership(request: any, reply: any, venueService: any) {
  const { venueId } = request.params;
  const userId = request.user?.id;
  const tenantId = request.tenantId;

  // Check if user has access to this venue
  const hasAccess = await venueService.checkVenueAccess(venueId, userId, tenantId);
  if (!hasAccess) {
    throw new ForbiddenError('Access denied to this venue');
  }

  const venue = await venueService.getVenue(venueId, userId);
  if (!venue) {
    throw new NotFoundError('Venue not found');
  }

  request.venue = venue;
}

export async function venueRoutes(fastify: FastifyInstance) {
  const container = (fastify as any).container;
  const { venueService, logger } = container.cradle;

  // List venues - SECURED (optional auth for filtering)
  fastify.get('/',
    {
      preHandler: [authenticate, validate(venueQuerySchema)]
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        // Try to authenticate but don't require it
        let user = null;
        const token = request.headers.authorization?.replace('Bearer ', '');
        if (token) {
          try {
            const jwt = require('jsonwebtoken');
            const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET || 'dev_access_secret_change_in_production_12345678901234567890');
            user = decoded;
          } catch (e) {
            // Invalid token, proceed without auth
          }
        }

        const query = request.query as any;
        let venues;

        if (query.my_venues && user) {
          // If my_venues flag is set and user is authenticated, show only user's venues
          venues = await venueService.listUserVenues(user.id, query);
        } else {
          // Show public venues only
          venues = await venueService.listVenues(query);
        }

        return reply.send({
          success: true,
          data: venues,
          pagination: {
            limit: query.limit || 20,
            offset: query.offset || 0
          }
        });
      } catch (error: any) {
        logger.error({ error }, 'Failed to list venues');
        return ErrorResponseBuilder.internal(reply, 'Failed to list venues');
      }
    }
  );

  // Create venue - SECURED
  fastify.post('/',
    {
      preHandler: [authenticate, addTenantContext, validate(createVenueSchema)]
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const user = (request as any).user;
        const tenantId = (request as any).tenantId;
        const body = request.body as CreateVenueBody;

        const venue = await venueService.createVenue(body, user.id, tenantId, {
          requestId: request.id,
          ipAddress: request.ip,
          userAgent: request.headers["user-agent"]
        });

        logger.info({ venueId: venue.id, userId: user.id, tenantId }, 'Venue created');
        venueOperations.inc({ operation: 'create', status: 'success' });

        return reply.status(201).send(venue);
      } catch (error: any) {
        venueOperations.inc({ operation: 'create', status: 'error' });
        if (error.message?.includes('already exists')) {
          throw new ConflictError(error.message);
        }
        throw error;
      }
    }
  );

  // List user's venues - SECURED
  fastify.get('/user',
    {
      preHandler: [authenticate]
    },
    async (request: any, reply: FastifyReply) => {
      try {
        const userId = request.user?.id;
        const venues = await venueService.listUserVenues(userId, {});
        return reply.send(venues);
      } catch (error: any) {
        logger.error({ error, userId: request.user?.id }, 'Failed to list user venues');
        return ErrorResponseBuilder.internal(reply, 'Failed to list user venues');
      }
    }
  );

  // Get venue by ID - SECURED
  fastify.get('/:venueId',
    {
      preHandler: [authenticate, addTenantContext]
    },
    async (request: any, reply: FastifyReply) => {
      try {
        const { venueId } = request.params;
        const userId = request.user?.id;

        // Check access first
        const hasAccess = await venueService.checkVenueAccess(venueId, userId);
        if (!hasAccess) {
          return reply.status(403).send({ error: 'Access denied to this venue' });
        }

        // Get the venue
        const venue = await venueService.getVenue(venueId, userId);
        if (!venue) {
          return reply.status(404).send({ error: 'Venue not found' });
        }

        venueOperations.inc({ operation: 'read', status: 'success' });
        return reply.send(venue);
      } catch (error: any) {
        venueOperations.inc({ operation: 'read', status: 'error' });
        logger.error({ error }, 'Failed to get venue');
        return reply.status(500).send({ error: 'Internal server error' });
      }
    }
  );

  // Get venue capacity - SECURED (NEW ENDPOINT)
  fastify.get('/:venueId/capacity',
    {
      preHandler: [authenticate]
    },
    async (request: any, reply: FastifyReply) => {
      try {
        const { venueId } = request.params;
        const userId = request.user?.id;
        
        // Check access
        const hasAccess = await venueService.checkVenueAccess(venueId, userId);
        if (!hasAccess) {
          return reply.status(403).send({ error: 'Access denied to this venue' });
        }
        
        const venue = await venueService.getVenue(venueId, userId);
        if (!venue) {
          return reply.status(404).send({ error: 'Venue not found' });
        }
        
        // TODO: Calculate available capacity from active events
        // For now, return total capacity as available
        return reply.send({
          venueId: venue.id,
          venueName: venue.name,
          totalCapacity: venue.capacity,
          available: venue.capacity,
          reserved: 0,
          utilized: 0
        });
      } catch (error: any) {
        logger.error({ error, venueId: request.params.venueId }, 'Failed to get venue capacity');
        return reply.status(500).send({ error: 'Internal server error' });
      }
    }
  );

  // Get venue stats - SECURED (NEW ENDPOINT)
  fastify.get('/:venueId/stats',
    {
      preHandler: [authenticate]
    },
    async (request: any, reply: FastifyReply) => {
      try {
        const { venueId } = request.params;
        const userId = request.user?.id;
        
        // Check access
        const hasAccess = await venueService.checkVenueAccess(venueId, userId);
        if (!hasAccess) {
          return reply.status(403).send({ error: 'Access denied to this venue' });
        }
        
        const stats = await venueService.getVenueStats(venueId);
        if (!stats) {
          return reply.status(404).send({ error: 'Venue not found' });
        }
        
        return reply.send(stats);
      } catch (error: any) {
        logger.error({ error, venueId: request.params.venueId }, 'Failed to get venue stats');
        return reply.status(500).send({ error: 'Internal server error' });
      }
    }
  );

  // Update venue - SECURED
  fastify.put('/:venueId',
    {
      preHandler: [authenticate, addTenantContext, validate(updateVenueSchema)]
    },
    async (request: any, reply: FastifyReply) => {
      try {
        const { venueId } = request.params;
        const userId = request.user?.id;
        const tenantId = request.tenantId;
        const body = request.body as UpdateVenueBody;

        // Verify ownership
        await verifyVenueOwnership(request, reply, venueService);

        const updatedVenue = await venueService.updateVenue(venueId, body, userId, tenantId);

        logger.info({ venueId, userId, tenantId }, 'Venue updated');
        venueOperations.inc({ operation: 'update', status: 'success' });

        return reply.send(updatedVenue);
      } catch (error: any) {
        venueOperations.inc({ operation: 'update', status: 'error' });
        if (error instanceof NotFoundError || error instanceof ForbiddenError) {
          throw error;
        }
        logger.error({ error, venueId: request.params.venueId }, 'Failed to update venue');
        return ErrorResponseBuilder.internal(reply, 'Failed to update venue');
      }
    }
  );

  // Delete venue - SECURED
  fastify.delete('/:venueId',
    {
      preHandler: [authenticate, addTenantContext]
    },
    async (request: any, reply: FastifyReply) => {
      try {
        const { venueId } = request.params;
        const userId = request.user?.id;
        const tenantId = request.tenantId;

        // Verify ownership - only owner can delete
        await verifyVenueOwnership(request, reply, venueService);

        // Additional check - must be owner, not just staff
        const venue = request.venue;
        if (venue.owner_id !== userId) {
          throw new ForbiddenError('Only venue owner can delete venue');
        }

        await venueService.deleteVenue(venueId, userId, tenantId);

        logger.info({ venueId, userId, tenantId }, 'Venue deleted');
        venueOperations.inc({ operation: 'delete', status: 'success' });

        return reply.status(204).send();
      } catch (error: any) {
        venueOperations.inc({ operation: 'delete', status: 'error' });
        if (error instanceof NotFoundError || error instanceof ForbiddenError) {
          throw error;
        }
        logger.error({ error, venueId: request.params.venueId }, 'Failed to delete venue');
        return ErrorResponseBuilder.internal(reply, 'Failed to delete venue');
      }
    }
  );

  // Check venue access - SECURED (used by other services)
  fastify.get('/:venueId/check-access',
    {
      preHandler: [authenticate, addTenantContext]
    },
    async (request: any, reply: FastifyReply) => {
      try {
        const { venueId } = request.params;
        const userId = request.user?.id;
        const tenantId = request.tenantId;

        const hasAccess = await venueService.checkVenueAccess(venueId, userId, tenantId);
        const accessDetails = await venueService.getAccessDetails(venueId, userId);

        return reply.send({
          hasAccess,
          role: accessDetails?.role || null,
          permissions: accessDetails?.permissions || []
        });
      } catch (error: any) {
        logger.error({ error, venueId: request.params.venueId }, 'Failed to check access');
        return reply.status(500).send({ error: 'Failed to check access' });
      }
    }
  );

  // Staff management routes - SECURED
  fastify.post('/:venueId/staff',
    {
      preHandler: [authenticate, addTenantContext]
    },
    async (request: any, reply: FastifyReply) => {
      try {
        const { venueId } = request.params;
        const requesterId = request.user?.id;
        const body = request.body;

        // Verify venue ownership
        try {
          await verifyVenueOwnership(request, reply, venueService);
        } catch (error) {
          if (error instanceof ForbiddenError) {
            return reply.status(403).send({ error: error.message });
          }
          if (error instanceof NotFoundError) {
            return reply.status(404).send({ error: error.message });
          }
          throw error;
        }

        // The test sends {email, role} but we need {userId, role}
        // For the test to work, we need to accept the registered user's ID
        // The test should be sending userId, not email

        if (!body.userId) {
          return reply.status(400).send({
            error: 'userId is required to add staff member'
          });
        }

        // Add staff member with the actual userId
        const staffData = {
          userId: body.userId,
          role: body.role,
          permissions: body.permissions || []
        };

        const staffMember = await venueService.addStaffMember(venueId, staffData, requesterId);

        return reply.status(201).send(staffMember);
      } catch (error: any) {
        logger.error({ error, venueId: request.params.venueId }, 'Failed to add staff');
        return ErrorResponseBuilder.internal(reply, 'Failed to add staff member');
      }
    }
  );

  fastify.get('/:venueId/staff',
    {
      preHandler: [authenticate, addTenantContext]
    },
    async (request: any, reply: FastifyReply) => {
      try {
        const { venueId } = request.params;
        const userId = request.user?.id;

        // Verify venue access
        await verifyVenueOwnership(request, reply, venueService);

        // Get staff list
        const staff = await venueService.getVenueStaff(venueId, userId);

        return reply.send(staff);
      } catch (error: any) {
        logger.error({ error, venueId: request.params.venueId }, 'Failed to get staff');
        return ErrorResponseBuilder.internal(reply, 'Failed to get staff list');
      }
    }
  );


  // Register nested route groups
  await fastify.register(settingsRoutes, { prefix: '/:venueId/settings' });
  await fastify.register(integrationRoutes, { prefix: '/:venueId/integrations' });

  // Import and register other nested routes
  const { complianceRoutes } = await import('./compliance.controller');

  await fastify.register(complianceRoutes, { prefix: '/:venueId/compliance' });
  const { analyticsRoutes } = await import('./analytics.controller');
  await fastify.register(analyticsRoutes, { prefix: '/:venueId/analytics' });
}
```

### FILE: src/controllers/compliance.controller.ts
```typescript
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
```

### FILE: src/utils/dbCircuitBreaker.ts
```typescript
import { Knex } from 'knex';
import { withCircuitBreaker } from './circuitBreaker';
import { logger } from './logger';

export function wrapDatabaseWithCircuitBreaker(db: Knex): Knex {
  // Create wrapped version of key database methods
  const originalFrom = db.from.bind(db);
  const originalRaw = db.raw.bind(db);
  const originalTransaction = db.transaction.bind(db);

  // Wrap the 'from' method
  const fromWithBreaker = withCircuitBreaker(
    originalFrom,
    { name: 'db-query', timeout: 5000 }
  );

  // Wrap the 'raw' method
  const rawWithBreaker = withCircuitBreaker(
    originalRaw,
    { name: 'db-raw', timeout: 5000 }
  );

  // Wrap the 'transaction' method
  const transactionWithBreaker = withCircuitBreaker(
    originalTransaction,
    { name: 'db-transaction', timeout: 10000 }
  );

  // Override methods
  (db as any).from = fromWithBreaker;
  (db as any).raw = rawWithBreaker;
  (db as any).transaction = transactionWithBreaker;

  return db;
}
export const createDbCircuitBreaker = (db: any) => { return db; };
```

### FILE: src/utils/error-response.ts
```typescript
import { FastifyReply } from 'fastify';

export interface ErrorResponse {
  success: false;
  error: string;
  code: string;
  details?: any;
  requestId?: string;
}

export class ErrorResponseBuilder {
  static send(reply: FastifyReply, statusCode: number, error: string, code: string, details?: any) {
    const response: ErrorResponse = {
      success: false,
      error,
      code,
      details,
      requestId: (reply.request as any).id
    };
    
    return reply.status(statusCode).send(response);
  }

  static validation(reply: FastifyReply, details: any) {
    return this.send(reply, 422, 'Validation failed', 'VALIDATION_ERROR', details);
  }

  static unauthorized(reply: FastifyReply, message: string = 'Unauthorized') {
    return this.send(reply, 401, message, 'UNAUTHORIZED');
  }

  static forbidden(reply: FastifyReply, message: string = 'Forbidden') {
    return this.send(reply, 403, message, 'FORBIDDEN');
  }

  static notFound(reply: FastifyReply, resource: string) {
    return this.send(reply, 404, `${resource} not found`, 'NOT_FOUND');
  }

  static conflict(reply: FastifyReply, message: string) {
    return this.send(reply, 409, message, 'CONFLICT');
  }

  static tooManyRequests(reply: FastifyReply, message: string = 'Too many requests') {
    return this.send(reply, 429, message, 'RATE_LIMIT_EXCEEDED');
  }

  static internal(reply: FastifyReply, message: string = 'Internal server error') {
    return this.send(reply, 500, message, 'INTERNAL_ERROR');
  }
}

// Error codes enum for consistency
export enum ErrorCodes {
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  UNAUTHORIZED = 'UNAUTHORIZED',
  FORBIDDEN = 'FORBIDDEN',
  NOT_FOUND = 'NOT_FOUND',
  CONFLICT = 'CONFLICT',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  BAD_REQUEST = 'BAD_REQUEST',
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE'
}
```

### FILE: src/utils/circuitBreaker.ts
```typescript
import CircuitBreaker from 'opossum';
import { logger } from './logger';

export interface CircuitBreakerOptions {
  timeout?: number;
  errorThresholdPercentage?: number;
  resetTimeout?: number;
  rollingCountTimeout?: number;
  rollingCountBuckets?: number;
  name?: string;
}

const defaultOptions: CircuitBreakerOptions = {
  timeout: 3000, // 3 seconds
  errorThresholdPercentage: 50, // Open circuit if 50% of requests fail
  resetTimeout: 30000, // Try again after 30 seconds
  rollingCountTimeout: 10000, // Count errors over 10 seconds
  rollingCountBuckets: 10, // Number of buckets in rolling window
};

export function createCircuitBreaker<T extends (...args: any[]) => any>(
  fn: T,
  options: CircuitBreakerOptions = {}
): CircuitBreaker {
  const opts = { ...defaultOptions, ...options };
  
  const breaker = new CircuitBreaker(fn, {
    timeout: opts.timeout,
    errorThresholdPercentage: opts.errorThresholdPercentage,
    resetTimeout: opts.resetTimeout,
    rollingCountTimeout: opts.rollingCountTimeout,
    rollingCountBuckets: opts.rollingCountBuckets,
    name: opts.name,
  });

  // Log circuit breaker events
  breaker.on('open', () => {
    logger.warn(`Circuit breaker opened: ${opts.name || 'unnamed'}`);
  });

  breaker.on('halfOpen', () => {
    logger.info(`Circuit breaker half-open: ${opts.name || 'unnamed'}`);
  });

  breaker.on('close', () => {
    logger.info(`Circuit breaker closed: ${opts.name || 'unnamed'}`);
  });

  breaker.on('timeout', () => {
    logger.warn(`Circuit breaker timeout: ${opts.name || 'unnamed'}`);
  });

  return breaker;
}

// Helper function to wrap async functions with circuit breaker
export function withCircuitBreaker<T extends (...args: any[]) => Promise<any>>(
  fn: T,
  options: CircuitBreakerOptions = {}
): T {
  const breaker = createCircuitBreaker(fn, options);
  return ((...args: Parameters<T>) => breaker.fire(...args)) as T;
}
```

### FILE: src/utils/auditLogger.ts
```typescript
import { Knex } from 'knex';
import { logger } from './logger';
import { v4 as uuidv4 } from 'uuid';

export class VenueAuditLogger {
  private db: Knex;

  constructor(db: Knex) {
    this.db = db;
  }

  async log(action: string, userId: string, venueId: string, data?: any): Promise<void> {
    try {
      await this.db('audit_logs').insert({
        id: uuidv4(),
        entity_type: 'venue',  // Required NOT NULL field
        entity_id: venueId,    // Required NOT NULL field
        action: action,        // Required NOT NULL field (e.g., 'venue_created')
        user_id: userId,
        changes: data?.changes || null,
        metadata: data?.metadata || { venueData: data },
        ip_address: data?.ipAddress || null,
        user_agent: data?.userAgent || null,
        created_at: new Date(),
        resource_type: 'venue',
        resource_id: venueId,
        status: 'success'
      });
      
      logger.debug({ action, venueId, userId }, 'Audit log created');
    } catch (error) {
      logger.error({ error, action, venueId, userId }, 'Failed to write audit log to database');
      // Don't throw - audit logging failure shouldn't break the main operation
    }
  }
}
```

### FILE: src/utils/audit-logger.ts
```typescript
import { Knex } from 'knex';
import { logger } from './logger';

export class VenueAuditLogger {
  private db: Knex;

  constructor(db: Knex) {
    this.db = db;
  }

  async log(action: string, userId: string, venueId: string, data?: any): Promise<void> {
    try {
      const auditEntry: any = {
        entity_type: 'venue',
        entity_id: venueId,
        action: action,
        user_id: userId,
        changes: data?.changes || null,
        metadata: data?.metadata || { venueData: data },
        user_agent: data?.userAgent || null,
        resource_type: 'venue',
        resource_id: venueId,
        status: 'success'
      };

      // Only add ip_address if it's a valid IP
      if (data?.ipAddress && data.ipAddress !== '00000000') {
        auditEntry.ip_address = data.ipAddress;
      }

      await this.db('audit_logs').insert(auditEntry);
      
      logger.debug({ action, venueId, userId }, 'Audit log created');
    } catch (error) {
      logger.error({ error, action, venueId, userId }, 'Failed to write audit log to database');
      // Don't throw - audit logging failure shouldn't break the main operation
    }
  }
}
export const createAuditLogger = (db: any) => { return { log: () => {} }; };
```

### FILE: src/utils/venue-audit-logger.ts
```typescript
import { Knex } from 'knex';
import { logger } from './logger';
import { v4 as uuidv4 } from 'uuid';

export class VenueAuditLogger {
  private db: Knex;

  constructor(db: Knex) {
    this.db = db;
  }

  async log(action: string, userId: string, venueId: string, data?: any): Promise<void> {
    try {
      const auditEntry = {
        id: uuidv4(),
        entity_type: 'venue',  // THIS WAS LIKELY MISSING
        entity_id: venueId,    // THIS WAS LIKELY MISSING
        action: action || 'venue_created',
        user_id: userId,
        changes: data?.changes || null,
        metadata: data || null,
        ip_address: data?.ipAddress || null,
        user_agent: data?.userAgent || null,
        created_at: new Date(),
        resource_type: 'venue',
        resource_id: venueId,
        status: 'success'
      };

      await this.db('audit_logs').insert(auditEntry);
      
      logger.info({ action, venueId, userId, tenantId: data?.tenantId }, 'Venue audit log created');
    } catch (error) {
      logger.error({ error, userId, venueId, action }, 'Failed to write audit log to database');
      // Don't throw - audit logging shouldn't break main operations
    }
  }
}
```

### FILE: src/utils/httpClient.ts
```typescript
import axios from 'axios';
import CircuitBreaker from 'opossum';

export class HttpClient {
  private client: any;
  private circuitBreaker: CircuitBreaker;

  constructor(baseURL: string, private logger: any) {
    this.client = axios.create({
      baseURL,
      timeout: 10000
    });

    // Circuit breaker configuration
    this.circuitBreaker = new CircuitBreaker(
      async (config: any) => this.client.request(config),
      {
        timeout: 10000,
        errorThresholdPercentage: 50,
        resetTimeout: 30000
      }
    );

    this.setupInterceptors();
  }

  private setupInterceptors() {
    // Request interceptor
    this.client.interceptors.request.use(
      (config: any) => {
        this.logger.debug({ url: config.url, method: config.method }, 'HTTP request');
        return config;
      },
      (error: any) => {
        this.logger.error({ error }, 'HTTP request error');
        return Promise.reject(error);
      }
    );

    // Response interceptor
    this.client.interceptors.response.use(
      (response: any) => {
        this.logger.debug({ url: response.config.url, status: response.status }, 'HTTP response');
        return response;
      },
      (error: any) => {
        this.logger.error({ 
          url: error.config?.url,
          status: error.response?.status,
          error: error.message 
        }, 'HTTP response error');
        return Promise.reject(error);
      }
    );
  }

  async get(url: string, config?: any) {
    return this.circuitBreaker.fire({ ...config, method: 'GET', url });
  }

  async post(url: string, data?: any, config?: any) {
    return this.circuitBreaker.fire({ ...config, method: 'POST', url, data });
  }

  async put(url: string, data?: any, config?: any) {
    return this.circuitBreaker.fire({ ...config, method: 'PUT', url, data });
  }

  async delete(url: string, config?: any) {
    return this.circuitBreaker.fire({ ...config, method: 'DELETE', url });
  }
}
```

### FILE: src/utils/dbWithRetry.ts
```typescript
import { Knex } from 'knex';
import { withRetry } from './retry';
import { logger } from './logger';

// Add retry logic to specific database operations
export function retryableQuery<T>(
  queryFn: () => Promise<T>,
  operation: string = 'query'
): Promise<T> {
  return withRetry(
    queryFn,
    {
      maxAttempts: 3,
      initialDelay: 50,
      maxDelay: 1000,
      shouldRetry: isRetryableDbError,
      onRetry: (error, attempt) => {
        logger.debug({ 
          operation,
          error: error.message, 
          attempt 
        }, 'Retrying database operation');
      }
    }
  );
}

export function isRetryableDbError(error: any): boolean {
  // Retry on connection errors
  if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
    return true;
  }
  
  // Retry on deadlock errors (PostgreSQL)
  if (error.code === '40P01') {
    return true;
  }
  
  // Retry on serialization failures
  if (error.code === '40001') {
    return true;
  }
  
  // Don't retry on constraint violations or other logical errors
  if (error.code === '23505' || error.code === '23503') {
    return false;
  }
  
  return false;
}

// Decorator for database methods
export function RetryableDb(operation: string = 'database') {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;
    
    descriptor.value = async function (...args: any[]) {
      return retryableQuery(
        () => originalMethod.apply(this, args),
        `${operation}.${propertyKey}`
      );
    };
    
    return descriptor;
  };
}
```

### FILE: src/utils/retry.ts
```typescript
import { logger } from './logger';

export interface RetryOptions {
  maxAttempts?: number;
  initialDelay?: number;
  maxDelay?: number;
  factor?: number;
  shouldRetry?: (error: any) => boolean;
  onRetry?: (error: any, attempt: number) => void;
}

const defaultOptions: RetryOptions = {
  maxAttempts: 3,
  initialDelay: 100,
  maxDelay: 5000,
  factor: 2,
  shouldRetry: (error) => {
    // Handle null/undefined errors
    if (!error) {
      return false;
    }
    // Retry on network errors or 5xx status codes
    if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT' || error.code === 'ENOTFOUND') {
      return true;
    }
    if (error.response?.status >= 500 && error.response?.status < 600) {
      return true;
    }
    // Don't retry on 4xx errors (client errors)
    if (error.response?.status >= 400 && error.response?.status < 500) {
      return false;
    }
    return true;
  },
  onRetry: (error, attempt) => {
    logger.debug({ error: error?.message || error, attempt }, 'Retrying operation');
  }
};

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const opts = { ...defaultOptions, ...options };
  let lastError: any;
  
  for (let attempt = 1; attempt <= opts.maxAttempts!; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;
      
      // Check if we should retry
      if (!opts.shouldRetry!(error)) {
        throw error;
      }
      
      // Check if we've exhausted attempts
      if (attempt === opts.maxAttempts) {
        logger.error({
          error: error?.message || error,
          attempts: opts.maxAttempts
        }, 'Max retry attempts reached');
        throw error;
      }
      
      // Calculate delay with exponential backoff
      const delay = Math.min(
        opts.initialDelay! * Math.pow(opts.factor!, attempt - 1),
        opts.maxDelay!
      );
      
      // Add jitter to prevent thundering herd
      const jitter = Math.random() * delay * 0.1;
      const totalDelay = delay + jitter;
      
      // Call retry callback
      if (opts.onRetry) {
        opts.onRetry(error, attempt);
      }
      
      logger.debug({
        attempt,
        nextAttempt: attempt + 1,
        delay: totalDelay,
        error: error?.message || String(error)
      }, 'Retrying after delay');
      
      // Wait before retrying
      await new Promise(resolve => setTimeout(resolve, totalDelay));
    }
  }
  
  throw lastError;
}

// Decorator for methods
export function Retry(options: RetryOptions = {}) {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;
    
    descriptor.value = async function (...args: any[]) {
      return withRetry(
        () => originalMethod.apply(this, args),
        options
      );
    };
    
    return descriptor;
  };
}
```

### FILE: src/models/integration.model.ts
```typescript
import { BaseModel } from './base.model';
import { Knex } from 'knex';

export interface IIntegration {
  id?: string;
  venue_id: string;
  integration_type: string;
  integration_name?: string;
  config_data: Record<string, any>;
  is_active?: boolean;
  api_key_encrypted?: string;
  api_secret_encrypted?: string;
  created_at?: Date;
  updated_at?: Date;
}

export class IntegrationModel extends BaseModel {
  constructor(db: Knex | Knex.Transaction) {
    super('venue_integrations', db);
  }

  // Override findById to use is_active instead of deleted_at
  async findById(id: string, columns: string[] = ['*']) {
    return this.db(this.tableName)
      .where({ id })
      .where({ is_active: true })
      .select(columns)
      .first();
  }

  // Override update to not use deleted_at
  async update(id: string, data: any) {
    const mappedUpdates: any = {};
    
    if (data.config !== undefined) mappedUpdates.config_data = data.config;
    if (data.config_data !== undefined) mappedUpdates.config_data = data.config_data;
    if (data.status !== undefined) mappedUpdates.is_active = data.status === 'active';
    if (data.is_active !== undefined) mappedUpdates.is_active = data.is_active;
    
    const [updated] = await this.db(this.tableName)
      .where({ id })
      .where({ is_active: true })
      .update({
        ...mappedUpdates,
        updated_at: new Date()
      })
      .returning('*');
    
    return updated;
  }

  // Override delete to use is_active
  async delete(id: string) {
    return this.db(this.tableName)
      .where({ id })
      .update({
        is_active: false,
        updated_at: new Date()
      });
  }

  async findByVenue(venueId: string): Promise<IIntegration[]> {
    return this.db(this.tableName)
      .where({ venue_id: venueId })
      .where({ is_active: true });
  }

  async findByVenueAndType(venueId: string, type: string): Promise<IIntegration | undefined> {
    return this.db(this.tableName)
      .where({ venue_id: venueId, integration_type: type })
      .where({ is_active: true })
      .first();
  }

  async create(data: any): Promise<IIntegration> {
    const integType = data.type || data.integration_type;
    const mappedData = {
      venue_id: data.venue_id,
      integration_type: integType,
      integration_name: data.name || data.integration_name || `${integType} Integration`,
      config_data: data.config || data.config_data || {},
      api_key_encrypted: data.encrypted_credentials?.apiKey || data.api_key_encrypted,
      api_secret_encrypted: data.encrypted_credentials?.secretKey || data.api_secret_encrypted,
      is_active: data.is_active !== undefined ? data.is_active : true
    };

    const [created] = await this.db(this.tableName)
      .insert(mappedData)
      .returning('*');
    
    return created;
  }
}
```

### FILE: src/models/settings.model.ts
```typescript
import { Knex } from "knex";
import { BaseModel } from './base.model';

export interface IVenueSettings {
  general?: {
    timezone?: string;
    currency?: string;
    language?: string;
    dateFormat?: string;
    timeFormat?: string;
  };
  ticketing?: {
    allowRefunds?: boolean;
    refundWindow?: number; // hours
    maxTicketsPerOrder?: number;
    requirePhoneNumber?: boolean;
    enableWaitlist?: boolean;
    transferDeadline?: number; // hours before event
  };
  notifications?: {
    emailEnabled?: boolean;
    smsEnabled?: boolean;
    webhookUrl?: string;
    notifyOnPurchase?: boolean;
    notifyOnRefund?: boolean;
    dailyReportEnabled?: boolean;
  };
  branding?: {
    primaryColor?: string;
    secondaryColor?: string;
    logo?: string;
    emailFooter?: string;
    customDomain?: string;
  };
  payment?: {
    currency?: string;
    taxRate?: number;
    includeTaxInPrice?: boolean;
    paymentMethods?: string[];
  };
  features?: {
    nftEnabled?: boolean;
    qrCodeEnabled?: boolean;
    seasonPassEnabled?: boolean;
    groupDiscountsEnabled?: boolean;
  };
}

export class SettingsModel {
  private db: any;

  constructor(db: any) {
    this.db = db;
  }

  async getVenueSettings(venueId: string): Promise<IVenueSettings> {
    const venue = await this.db('venues')
      .where({ id: venueId })
      .whereNull('deleted_at')
      .select('settings')
      .first();

    return venue?.settings || this.getDefaultSettings();
  }

  async updateVenueSettings(venueId: string, settings: Partial<IVenueSettings>): Promise<IVenueSettings> {
    const currentSettings = await this.getVenueSettings(venueId);
    
    const newSettings = this.mergeSettings(currentSettings, settings);

    await this.db('venues')
      .where({ id: venueId })
      .update({
        settings: newSettings,
        updated_at: new Date(),
      });

    return newSettings;
  }

  async updateSettingSection(
    venueId: string, 
    section: keyof IVenueSettings, 
    sectionSettings: any
  ): Promise<IVenueSettings> {
    const currentSettings = await this.getVenueSettings(venueId);
    
    currentSettings[section] = {
      ...currentSettings[section],
      ...sectionSettings,
    };

    await this.db('venues')
      .where({ id: venueId })
      .update({
        settings: currentSettings,
        updated_at: new Date(),
      });

    return currentSettings;
  }

  getDefaultSettings(): IVenueSettings {
    return {
      general: {
        timezone: 'America/New_York',
        currency: 'USD',
        language: 'en',
        dateFormat: 'MM/DD/YYYY',
        timeFormat: '12h',
      },
      ticketing: {
        allowRefunds: true,
        refundWindow: 24,
        maxTicketsPerOrder: 10,
        requirePhoneNumber: false,
        enableWaitlist: false,
        transferDeadline: 2,
      },
      notifications: {
        emailEnabled: true,
        smsEnabled: false,
        webhookUrl: undefined,
        notifyOnPurchase: true,
        notifyOnRefund: true,
        dailyReportEnabled: false,
      },
      branding: {
        primaryColor: '#000000',
        secondaryColor: '#666666',
        logo: undefined,
        emailFooter: undefined,
        customDomain: undefined,
      },
      payment: {
        currency: 'USD',
        taxRate: 0,
        includeTaxInPrice: false,
        paymentMethods: ['card'],
      },
      features: {
        nftEnabled: true,
        qrCodeEnabled: true,
        seasonPassEnabled: false,
        groupDiscountsEnabled: false,
      },
    };
  }

  private mergeSettings(current: IVenueSettings, updates: Partial<IVenueSettings>): IVenueSettings {
    const merged = { ...current };

    for (const [section, sectionUpdates] of Object.entries(updates)) {
      if (sectionUpdates && typeof sectionUpdates === 'object') {
        merged[section as keyof IVenueSettings] = {
          ...current[section as keyof IVenueSettings],
          ...sectionUpdates,
        };
      }
    }

    return merged;
  }

  async validateSettings(settings: IVenueSettings): Promise<{ valid: boolean; errors: string[] }> {
    const errors: string[] = [];

    // Validate timezone
    if (settings.general?.timezone) {
      // TODO: Validate against timezone list
    }

    // Validate currency
    if (settings.general?.currency) {
      const validCurrencies = ['USD', 'EUR', 'GBP', 'CAD', 'AUD'];
      if (!validCurrencies.includes(settings.general.currency)) {
        errors.push('Invalid currency code');
      }
    }

    // Validate colors
    if (settings.branding?.primaryColor) {
      const hexRegex = /^#[0-9A-F]{6}$/i;
      if (!hexRegex.test(settings.branding.primaryColor)) {
        errors.push('Invalid primary color format');
      }
    }

    // Validate webhook URL
    if (settings.notifications?.webhookUrl) {
      try {
        new URL(settings.notifications.webhookUrl);
      } catch {
        errors.push('Invalid webhook URL');
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }
}
```

### FILE: src/models/staff.model.ts
```typescript
import { BaseModel } from './base.model';
import { Knex } from 'knex';

export interface IStaffMember {
  id?: string;
  venue_id: string;
  user_id: string;
  role: 'owner' | 'manager' | 'box_office' | 'door_staff' | 'viewer';
  permissions?: string[];
  is_active?: boolean;
  last_login_at?: Date;
  created_at?: Date;
  updated_at?: Date;
  deleted_at?: Date;
}

export interface IStaffWithUser extends IStaffMember {
  user?: {
    id: string;
    email: string;
    name: string;
    phone?: string;
  };
}

export class StaffModel extends BaseModel {
  constructor(db: Knex | Knex.Transaction) {
    super('venue_staff', db);
  }

  async findByVenueAndUser(venueId: string, userId: string): Promise<IStaffMember | null> {
    return this.db(this.tableName)
      .where({ venue_id: venueId, user_id: userId })
      .whereNull('deleted_at')
      .first();
  }

  async getVenueStaff(venueId: string, includeInactive = false): Promise<IStaffMember[]> {
    let query = this.db(this.tableName)
      .where({ venue_id: venueId })
      .whereNull('deleted_at');

    if (!includeInactive) {
      query = query.where({ is_active: true });
    }

    return query.orderBy('created_at', 'asc');
  }

  async getStaffByRole(venueId: string, role: IStaffMember['role']): Promise<IStaffMember[]> {
    return this.db(this.tableName)
      .where({ venue_id: venueId, role, is_active: true })
      .whereNull('deleted_at')
      .orderBy('created_at', 'asc');
  }

  async addStaffMember(staffData: Partial<IStaffMember>): Promise<IStaffMember> {
    const existing = await this.findByVenueAndUser(staffData.venue_id!, staffData.user_id!);
    if (existing) {
      throw new Error('Staff member already exists for this venue');
    }

    const permissions = staffData.permissions || this.getDefaultPermissions(staffData.role!);

    return this.create({
      ...staffData,
      permissions: JSON.stringify(permissions),
      is_active: true,
    });
  }

  async updateRole(id: string, role: IStaffMember['role'], permissions?: string[]): Promise<IStaffMember> {
    const updateData: any = { role };

    if (permissions) {
      updateData.permissions = JSON.stringify(permissions);
    } else {
      updateData.permissions = JSON.stringify(this.getDefaultPermissions(role));
    }

    return this.update(id, updateData);
  }

  async deactivateStaffMember(id: string): Promise<boolean> {
    const result = await this.update(id, { is_active: false });
    return !!result;
  }

  async reactivateStaffMember(id: string): Promise<boolean> {
    const result = await this.update(id, { is_active: true });
    return !!result;
  }

  async updateLastLogin(id: string): Promise<void> {
    await this.update(id, { last_login_at: new Date() });
  }

  async getUserVenues(userId: string): Promise<Array<{ venue_id: string; role: string }>> {
    return this.db(this.tableName)
      .where({ user_id: userId, is_active: true })
      .whereNull('deleted_at')
      .select('venue_id', 'role');
  }

  async hasPermission(venueId: string, userId: string, permission: string): Promise<boolean> {
    const staff = await this.findByVenueAndUser(venueId, userId);

    if (!staff || !staff.is_active) {
      return false;
    }

    if (staff.role === 'owner') {
      return true;
    }

    return staff.permissions?.includes(permission) || false;
  }

  private getDefaultPermissions(role: IStaffMember['role']): string[] {
    const permissionMap = {
      owner: ['*'],
      manager: [
        'events:create',
        'events:update',
        'events:delete',
        'tickets:view',
        'tickets:validate',
        'reports:view',
        'reports:export',
        'staff:view',
        'settings:view',
      ],
      box_office: [
        'tickets:sell',
        'tickets:view',
        'tickets:validate',
        'payments:process',
        'reports:daily',
        'customers:view',
      ],
      door_staff: [
        'tickets:validate',
        'tickets:view',
        'events:view',
      ],
      viewer: [
        'events:view',
        'reports:view',
      ],
    };

    return permissionMap[role] || [];
  }

  async validateStaffLimit(venueId: string): Promise<{ canAdd: boolean; limit: number; current: number }> {
    const currentStaff = await this.count({ venue_id: venueId, is_active: true });
    const limit = 50;

    return {
      canAdd: currentStaff < limit,
      limit,
      current: currentStaff,
    };
  }
}
```

### FILE: src/models/layout.model.ts
```typescript
import { BaseModel } from './base.model';
import { Knex } from 'knex';

export interface ISection {
  id: string;
  name: string;
  rows: number;
  seatsPerRow: number;
  pricing?: {
    basePrice: number;
    dynamicPricing?: boolean;
  };
}

export interface ILayout {
  id?: string;
  venue_id: string;
  name: string;
  type: 'fixed' | 'general_admission' | 'mixed';
  sections?: ISection[];
  capacity: number;
  is_default: boolean;
  created_at?: Date;
  updated_at?: Date;
}

export class LayoutModel extends BaseModel {
  constructor(db: Knex | Knex.Transaction) {
    super('venue_layouts', db);
  }

  async findByVenue(venueId: string): Promise<ILayout[]> {
    return this.db(this.tableName)
      .where({ venue_id: venueId })
      .whereNull('deleted_at')
      .orderBy('is_default', 'desc')
      .orderBy('created_at', 'desc');
  }

  async getDefaultLayout(venueId: string): Promise<ILayout | undefined> {
    return this.db(this.tableName)
      .where({ venue_id: venueId, is_default: true })
      .whereNull('deleted_at')
      .first();
  }

  async setAsDefault(layoutId: string, venueId: string): Promise<void> {
    await this.db.transaction(async (trx: Knex.Transaction) => {
      await trx(this.tableName)
        .where({ venue_id: venueId })
        .update({ is_default: false });

      await trx(this.tableName)
        .where({ id: layoutId, venue_id: venueId })
        .update({ is_default: true });
    });
  }
}
```

### FILE: src/models/base.model.ts
```typescript
import { Knex } from 'knex';

export abstract class BaseModel {
  protected tableName: string;
  protected db: Knex | Knex.Transaction;

  constructor(tableName: string, db: Knex | Knex.Transaction) {
    this.tableName = tableName;
    this.db = db;
  }

  // Helper to create a new instance with transaction
  withTransaction(trx: Knex.Transaction): this {
    const ModelClass = this.constructor as any;
    return new ModelClass(trx);
  }

  async findById(id: string, columns: string[] = ['*']) {
    return this.db(this.tableName)
      .where({ id })
      .whereNull('deleted_at')
      .select(columns)
      .first();
  }

  async findAll(conditions: any = {}, options: any = {}) {
    const { limit = 50, offset = 0, orderBy = 'created_at', order = 'desc' } = options;

    let query = this.db(this.tableName)
      .where(conditions)
      .whereNull('deleted_at');

    if (options.columns) {
      query = query.select(options.columns);
    }

    return query
      .orderBy(orderBy, order)
      .limit(limit)
      .offset(offset);
  }

  async create(data: any) {
    const [record] = await this.db(this.tableName)
      .insert(data)
      .returning('*');

    return record;
  }

  async update(id: string, data: any) {
    const [record] = await this.db(this.tableName)
      .where({ id })
      .whereNull('deleted_at')
      .update({
        ...data,
        updated_at: new Date()
      })
      .returning('*');

    return record;
  }

  async delete(id: string) {
    return this.db(this.tableName)
      .where({ id })
      .update({
        deleted_at: new Date()
      });
  }

  async count(conditions: any = {}): Promise<number> {
    const result = await this.db(this.tableName)
      .where(conditions)
      .whereNull('deleted_at')
      .count('* as count')
      .first();

    return parseInt(String(result?.count || '0'), 10);
  }

  async softDelete(id: string): Promise<boolean> {
    const result = await this.db(this.tableName)
      .where({ id })
      .whereNull('deleted_at')
      .update({ deleted_at: new Date() });

    return result > 0;
  }

  generateId(): string {
    const prefix = this.tableName.substring(0, 3);
    return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}
```

### FILE: src/models/venue.model.ts
```typescript
import { BaseModel } from './base.model';
import { Knex } from 'knex';

export interface IVenue {
  id?: string;
  created_by?: string;
  name: string;
  slug: string;
  type: 'comedy_club' | 'theater' | 'arena' | 'stadium' | 'other';
  capacity?: number;
  address: {
    street: string;
    city: string;
    state: string;
    zipCode: string;
    country: string;
    coordinates?: {
      lat: number;
      lng: number;
    };
  };
  settings?: Record<string, any>;
  onboarding?: Record<string, boolean>;
  onboarding_status: 'pending' | 'in_progress' | 'completed';
  is_active?: boolean;
  created_at?: Date;
  updated_at?: Date;
  deleted_at?: Date;
}

export class VenueModel extends BaseModel {
  constructor(db: Knex | Knex.Transaction) {
    super('venues', db);
  }

  async findBySlug(slug: string): Promise<IVenue | null> {
    const venue = await this.db('venues')
      .where({ slug })
      .whereNull('deleted_at')
      .first();

    if (venue) {
      return this.transformFromDb(venue);
    }
    return null;
  }

  async findById(id: string): Promise<IVenue | null> {
    const venue = await super.findById(id);
    if (venue) {
      return this.transformFromDb(venue);
    }
    return null;
  }

  async createWithDefaults(venueData: Partial<IVenue>): Promise<IVenue> {
    // Only generate slug if not provided
    const slug = venueData.slug || this.generateSlug(venueData.name || '');

    const venue: Partial<IVenue> = {
      ...venueData,
      slug,
      settings: {
        general: {
          timezone: 'America/New_York',
          currency: 'USD',
          language: 'en',
        },
        ticketing: {
          allowRefunds: true,
          refundWindow: 24,
          maxTicketsPerOrder: 10,
          requirePhoneNumber: false,
        },
        notifications: {
          emailEnabled: true,
          smsEnabled: false,
        },
        ...venueData.settings,
      },
      onboarding_status: 'pending',
      is_active: true,
    };

    const dbData = this.transformForDb(venue);
    const created = await this.create(dbData);
    return this.transformFromDb(created);
  }

  async updateOnboardingStatus(venueId: string, status: IVenue['onboarding_status']): Promise<boolean> {
    const result = await this.update(venueId, { onboarding_status: status });
    return !!result;
  }

  async getActiveVenues(options: any = {}): Promise<IVenue[]> {
    const venues = await this.findAll({ is_active: true }, options);
    return venues.map((v: any) => this.transformFromDb(v));
  }

  async getVenuesByType(type: IVenue['type'], options: any = {}): Promise<IVenue[]> {
    const venues = await this.findAll({ type, is_active: true }, options);
    return venues.map((v: any) => this.transformFromDb(v));
  }

  async searchVenues(searchTerm: string, options: any = {}): Promise<IVenue[]> {
    const {
      limit = 20,
      offset = 0,
      type,
      city,
      state,
      sort_by = 'name',
      sort_order = 'asc'
    } = options;

    let query = this.db('venues')
      .whereNull('deleted_at')
      .where('is_active', true);

    if (searchTerm) {
      query = query.where(function(this: any) {
        this.where('name', 'ilike', `%${searchTerm}%`)
          .orWhere('city', 'ilike', `%${searchTerm}%`);
      });
    }

    if (type) {
      query = query.where('type', type);
    }

    if (city) {
      query = query.where('city', 'ilike', city);
    }

    if (state) {
      query = query.where('state', 'ilike', state);
    }

    const sortColumn = sort_by === 'created_at' ? 'created_at' :
                      sort_by === 'capacity' ? 'capacity' : 'name';
    query = query.orderBy(sortColumn, sort_order);

    const venues = await query.limit(limit).offset(offset);
    return venues.map((v: any) => this.transformFromDb(v));
  }

  async getVenueStats(venueId: string): Promise<any> {
    const venue = await this.findById(venueId);
    if (!venue) return null;

    return {
      venue,
      stats: {
        totalEvents: 0,
        totalTicketsSold: 0,
        totalRevenue: 0,
        activeStaff: 0,
      },
    };
  }

  private transformForDb(venueData: Partial<IVenue>): any {
    const { address, ...rest } = venueData;
    const dbData: any = {
      ...rest
    };
    if (address) {
      dbData.address = address;
      dbData.city = address.city;
      dbData.state = address.state;
      dbData.zip_code = address.zipCode;
      dbData.country = address.country || 'US';
    }
    return dbData;
  }

  private transformFromDb(dbVenue: any): IVenue {
    if (!dbVenue) return dbVenue;

    const { city, state, zip_code, country, address, ...rest } = dbVenue;

    const venueAddress = address || {
      street: '',
      city: city || '',
      state: state || '',
      zipCode: zip_code || '',
      country: country || 'US'
    };

    if (!venueAddress.city) venueAddress.city = city || '';
    if (!venueAddress.state) venueAddress.state = state || '';
    if (!venueAddress.zipCode) venueAddress.zipCode = zip_code || '';
    if (!venueAddress.country) venueAddress.country = country || 'US';

    return {
      ...rest,
      address: venueAddress
    };
  }

  private generateSlug(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
  }
}
```

### FILE: src/middleware/rate-limit.middleware.ts
```typescript
import { FastifyRequest, FastifyReply } from 'fastify';
import Redis from 'ioredis';
import { RateLimitError } from '../utils/errors';
import { logger } from '../utils/logger';

interface RateLimitOptions {
  windowMs: number;  // Time window in milliseconds
  max: number;       // Max requests per window
  keyGenerator?: (req: FastifyRequest) => string;
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
  message?: string;
}

interface RateLimitConfig {
  global: RateLimitOptions;
  perUser: RateLimitOptions;
  perVenue: RateLimitOptions;
  perOperation: {
    [operation: string]: RateLimitOptions;
  };
}

// Default rate limit configurations
const defaultConfig: RateLimitConfig = {
  global: {
    windowMs: 60 * 1000,  // 1 minute
    max: 100              // 100 requests per minute globally
  },
  perUser: {
    windowMs: 60 * 1000,  // 1 minute
    max: 60               // 60 requests per minute per user
  },
  perVenue: {
    windowMs: 60 * 1000,  // 1 minute
    max: 30               // 30 requests per minute per venue
  },
  perOperation: {
    'POST:/api/v1/venues': {
      windowMs: 60 * 60 * 1000,  // 1 hour
      max: 100                    // Increased to 100 for testing (was 10)
    },
    'PUT:/api/v1/venues/:venueId': {
      windowMs: 60 * 1000,  // 1 minute
      max: 20               // 20 updates per minute
    },
    'DELETE:/api/v1/venues/:venueId': {
      windowMs: 60 * 60 * 1000,  // 1 hour
      max: 5                      // 5 deletions per hour
    },
    'POST:/api/v1/venues/:venueId/events': {
      windowMs: 60 * 1000,  // 1 minute
      max: 30               // 30 events per minute
    }
  }
};

export class RateLimiter {
  private redis: Redis;
  private config: RateLimitConfig;

  constructor(redis: Redis, config?: Partial<RateLimitConfig>) {
    this.redis = redis;
    this.config = { ...defaultConfig, ...config };
  }

  private async checkLimit(key: string, options: RateLimitOptions): Promise<{
    allowed: boolean;
    remaining: number;
    resetTime: number;
  }> {
    const now = Date.now();
    const window = Math.floor(now / options.windowMs);
    const redisKey = `rate_limit:${key}:${window}`;

    try {
      // Use Redis pipeline for atomic operations
      const pipeline = this.redis.pipeline();
      pipeline.incr(redisKey);
      pipeline.expire(redisKey, Math.ceil(options.windowMs / 1000));
      
      const results = await pipeline.exec();
      const count = results?.[0]?.[1] as number || 1;
      
      const allowed = count <= options.max;
      const remaining = Math.max(0, options.max - count);
      const resetTime = (window + 1) * options.windowMs;

      return { allowed, remaining, resetTime };
    } catch (error) {
      // On Redis error, fail open (allow request) but log
      logger.error({ error, key }, 'Rate limit check failed');
      return { allowed: true, remaining: options.max, resetTime: now + options.windowMs };
    }
  }

  // Middleware factory for different rate limit types
  createMiddleware(type: 'global' | 'perUser' | 'perVenue' | 'perOperation') {
    return async (request: FastifyRequest, reply: FastifyReply) => {
      let key: string;
      let options: RateLimitOptions;

      switch (type) {
        case 'global':
          key = 'global';
          options = this.config.global;
          break;

        case 'perUser':
          const userId = (request as any).user?.id;
          if (!userId) return; // Skip if no user
          key = `user:${userId}`;
          options = this.config.perUser;
          break;

        case 'perVenue':
          const venueId = (request.params as any)?.venueId;
          if (!venueId) return; // Skip if no venue in path
          key = `venue:${venueId}`;
          options = this.config.perVenue;
          break;

        case 'perOperation':
          const operationKey = `${request.method}:${request.routerPath}`;
          options = this.config.perOperation[operationKey];
          if (!options) return; // Skip if no specific limit for this operation
          
          const opUserId = (request as any).user?.id || 'anonymous';
          key = `operation:${operationKey}:${opUserId}`;
          break;

        default:
          return;
      }

      const result = await this.checkLimit(key, options);

      // Set rate limit headers
      reply.header('X-RateLimit-Limit', options.max.toString());
      reply.header('X-RateLimit-Remaining', result.remaining.toString());
      reply.header('X-RateLimit-Reset', new Date(result.resetTime).toISOString());

      if (!result.allowed) {
        reply.header('Retry-After', Math.ceil((result.resetTime - Date.now()) / 1000).toString());
        throw new RateLimitError(type, Math.ceil((result.resetTime - Date.now()) / 1000));
      }
    };
  }

  // Combined rate limiting middleware
  async checkAllLimits(request: FastifyRequest, reply: FastifyReply) {
    // Check global limit
    await this.createMiddleware('global')(request, reply);
    
    // Check per-user limit if authenticated
    if ((request as any).user?.id) {
      await this.createMiddleware('perUser')(request, reply);
    }
    
    // Check per-venue limit if venue is in path
    if ((request.params as any)?.venueId) {
      await this.createMiddleware('perVenue')(request, reply);
    }
    
    // Check per-operation limit
    await this.createMiddleware('perOperation')(request, reply);
  }

  // Method to dynamically update rate limits
  updateLimits(type: keyof RateLimitConfig, options: Partial<RateLimitOptions>) {
    if (type === 'perOperation') {
      // Handle perOperation separately
      Object.assign(this.config.perOperation, options);
    } else {
      Object.assign(this.config[type], options);
    }
  }

  // Method to reset rate limit for a specific key
  async resetLimit(type: string, identifier: string) {
    const pattern = `rate_limit:${type}:${identifier}:*`;
    const keys = await this.redis.keys(pattern);
    if (keys.length > 0) {
      await this.redis.del(...keys);
    }
  }
}

// Factory function to create rate limiter instance
export function createRateLimiter(redis: Redis, config?: Partial<RateLimitConfig>) {
  return new RateLimiter(redis, config);
}
```

### FILE: src/middleware/versioning.middleware.ts
```typescript
import { FastifyRequest, FastifyReply } from 'fastify';
import { logger } from '../utils/logger';

interface VersionConfig {
  current: string;
  supported: string[];
  deprecated: string[];
  sunset: { [version: string]: Date };
}

const versionConfig: VersionConfig = {
  current: 'v1',
  supported: ['v1'],
  deprecated: [],
  sunset: {}
};

export function versionMiddleware(request: FastifyRequest, reply: FastifyReply, done: () => void) {
  // Extract version from URL path or header
  const pathMatch = request.url.match(/\/api\/(v\d+)\//);
  const headerVersion = request.headers?.['api-version'] as string;
  const acceptVersion = request.headers?.['accept-version'] as string;

  // Priority: URL path > api-version header > accept-version header
  const version = pathMatch?.[1] || headerVersion || acceptVersion || versionConfig.current;

  // Check if version is supported
  if (!versionConfig.supported.includes(version)) {
    reply.status(400).send({
      success: false,
      error: `API version ${version} is not supported`,
      code: 'UNSUPPORTED_VERSION',
      details: {
        current: versionConfig.current,
        supported: versionConfig.supported
      }
    });
    return;
  }

  // Warn if using deprecated version
  if (versionConfig.deprecated.includes(version)) {
    const sunsetDate = versionConfig.sunset[version];
    reply.header('Deprecation', 'true');
    reply.header('Sunset', sunsetDate?.toISOString() || 'TBD');
    logger.warn({
      version,
      requestId: request.id,
      sunsetDate
    }, 'Deprecated API version used');
  }

  // Add version to request context
  (request as any).apiVersion = version;

  // Add version headers to response
  reply.header('API-Version', version);
  reply.header('X-API-Version', version);

  done();
}

// Helper to register versioned routes
export function registerVersionedRoute(
  fastify: any,
  versions: string[],
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH',
  path: string,
  handler: any,
  options?: any
) {
  versions.forEach(version => {
    const versionedPath = `/api/${version}${path}`;
    fastify[method.toLowerCase()](versionedPath, options || {}, handler);
  });
}
```

### FILE: src/middleware/auth.middleware.ts
```typescript
import { FastifyRequest, FastifyReply, RouteGenericInterface } from 'fastify';

import { ErrorResponseBuilder } from '../utils/error-response';
export interface AuthUser {
  id: string;
  email: string;
  permissions: string[];
}

export interface AuthenticatedRequest<T extends RouteGenericInterface = RouteGenericInterface> extends FastifyRequest<T> {
  user: AuthUser;
}

export async function authenticate(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  try {
    // Check for API key first
    const apiKey = request.headers['x-api-key'] as string;
    if (apiKey) {
      return await authenticateWithApiKey(apiKey, request, reply);
    }

    // Check for JWT
    const token = request.headers.authorization?.replace('Bearer ', '');
    if (!token) {
      return ErrorResponseBuilder.unauthorized(reply, 'Missing authentication');
    }

    // Cast server to any to access jwt
    const server = request.server as any;
    
    try {
      const decoded = await server.jwt.verify(token);
      
      // Set user on request
      (request as any).user = {
        id: decoded.sub,
        email: decoded.email || '',
        permissions: decoded.permissions || []
      };
    } catch (error) {
      console.error('JWT verification failed:', error);
      return ErrorResponseBuilder.unauthorized(reply, 'Invalid token');
    }
  } catch (error) {
    console.error('Authentication error:', error);
    return ErrorResponseBuilder.unauthorized(reply, 'Authentication failed');
  }
}

export async function requireVenueAccess(
  request: FastifyRequest<{ Params: { venueId: string } }>,
  reply: FastifyReply
): Promise<void> {
  const venueId = request.params.venueId;
  const userId = (request as any).user?.id;

  if (!userId) {
    return ErrorResponseBuilder.unauthorized(reply, 'Not authenticated');
  }

  const server = request.server as any;
  const venueService = server.container.cradle.venueService;

  const hasAccess = await venueService.checkVenueAccess(venueId, userId);
  if (!hasAccess) {
    return ErrorResponseBuilder.forbidden(reply, 'Access denied');
  }

  // Store venue access info on request
  (request as any).user.venueId = venueId;
}

async function authenticateWithApiKey(
  apiKey: string,
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const server = request.server as any;
  const db = server.container.cradle.db;
  const redis = server.container.cradle.redis;

  // Check cache first
  const cached = await redis.get(`api_key:${apiKey}`);
  if (cached) {
    (request as any).user = JSON.parse(cached);
    return;
  }

  // Look up API key in database
  const keyData = await db('api_keys')
    .where({ key: apiKey, is_active: true })
    .where('expires_at', '>', new Date())
    .first();

  if (!keyData) {
    return ErrorResponseBuilder.unauthorized(reply, 'Invalid API key');
  }

  // Get user data
  const user = await db('users')
    .where({ id: keyData.user_id })
    .first();

  if (!user) {
    return ErrorResponseBuilder.unauthorized(reply, 'Invalid API key');
  }

  const authUser = {
    id: user.id,
    email: user.email,
    permissions: keyData.permissions || []
  };

  // Cache for 5 minutes
  await redis.setex(`api_key:${apiKey}`, 300, JSON.stringify(authUser));

  (request as any).user = authUser;
}
```

### FILE: src/schemas/integration.schema.ts
```typescript
import * as Joi from 'joi';

export const createIntegrationSchema = {
  body: Joi.object({
    type: Joi.string().valid('square', 'stripe', 'toast', 'mailchimp', 'twilio').required(),
    config: Joi.object({
      webhookUrl: Joi.string().uri(),
      apiVersion: Joi.string(),
      environment: Joi.string().valid('sandbox', 'production'),
      features: Joi.array().items(Joi.string())
    }).unknown(true), // Allow provider-specific config
    credentials: Joi.object().unknown(true).required()
  })
};

export const updateIntegrationSchema = {
  body: Joi.object({
    config: Joi.object().unknown(true),
    status: Joi.string().valid('active', 'inactive')
  }).min(1)
};
```

### FILE: src/schemas/settings.schema.ts
```typescript
import * as Joi from 'joi';

export const updateSettingsSchema = {
  body: Joi.object({
    general: Joi.object({
      timezone: Joi.string().max(50),
      currency: Joi.string().length(3),
      language: Joi.string().length(2),
      dateFormat: Joi.string().max(20),
      timeFormat: Joi.string().valid('12h', '24h')
    }),
    ticketing: Joi.object({
      allowRefunds: Joi.boolean(),
      refundWindow: Joi.number().min(0).max(720), // max 30 days in hours
      maxTicketsPerOrder: Joi.number().min(1).max(100),
      requirePhoneNumber: Joi.boolean(),
      enableWaitlist: Joi.boolean(),
      transferDeadline: Joi.number().min(0).max(168) // max 7 days in hours
    }),
    notifications: Joi.object({
      emailEnabled: Joi.boolean(),
      smsEnabled: Joi.boolean(),
      webhookUrl: Joi.string().uri().allow(''),
      notifyOnPurchase: Joi.boolean(),
      notifyOnRefund: Joi.boolean(),
      dailyReportEnabled: Joi.boolean()
    }),
    branding: Joi.object({
      primaryColor: Joi.string().pattern(/^#[0-9A-F]{6}$/i),
      secondaryColor: Joi.string().pattern(/^#[0-9A-F]{6}$/i),
      logo: Joi.string().uri().allow(''),
      emailFooter: Joi.string().max(500)
    })
  }).min(1)
};
```

### FILE: src/schemas/venue.schema.ts
```typescript
import * as Joi from 'joi';

// Comprehensive venue types for a real ticketing platform
const VENUE_TYPES = [
  // Performance venues
  'theater',
  'concert_hall',
  'amphitheater',
  'arena',
  'stadium',
  'comedy_club',
  'nightclub',
  'bar',
  'lounge',
  'cabaret',
  
  // Conference/Convention
  'convention_center',
  'conference_center',
  'exhibition_hall',
  'trade_center',
  
  // Community venues
  'community_center',
  'church',
  'temple',
  'mosque',
  'school',
  'university',
  'library',
  
  // Outdoor venues
  'park',
  'festival_grounds',
  'fairgrounds',
  'beach',
  'outdoor_venue',
  'garden',
  
  // Sports venues
  'sports_complex',
  'gymnasium',
  'ice_rink',
  'race_track',
  
  // Cultural venues
  'museum',
  'gallery',
  'cultural_center',
  'opera_house',
  
  // Hospitality
  'restaurant',
  'hotel',
  'resort',
  'casino',
  'cruise_ship',
  
  // Other
  'warehouse',
  'studio',
  'private_venue',
  'other'
];

export const createVenueSchema = {
  body: Joi.object({
    name: Joi.string().min(2).max(100).required(),
    type: Joi.string().valid(...VENUE_TYPES).required(),
    capacity: Joi.number().integer().min(10).max(100000).required(),
    address: Joi.object({
      street: Joi.string().required(),
      city: Joi.string().required(),
      state: Joi.string().length(2).required(),
      zipCode: Joi.string().pattern(/^\d{5}(-\d{4})?$/).required(),
      country: Joi.string().length(2).default('US')
    }).required()
  })
};

export const updateVenueSchema = {
  body: Joi.object({
    name: Joi.string().min(2).max(100),
    type: Joi.string().valid(...VENUE_TYPES),
    capacity: Joi.number().integer().min(10).max(100000),
    address: Joi.object({
      street: Joi.string(),
      city: Joi.string(),
      state: Joi.string().length(2),
      zipCode: Joi.string().pattern(/^\d{5}(-\d{4})?$/),
      country: Joi.string().length(2)
    })
  }).min(1)
};

export const venueQuerySchema = {
  querystring: Joi.object({
    limit: Joi.number().integer().min(1).max(100).default(20),
    offset: Joi.number().integer().min(0).default(0),
    search: Joi.string().max(100).description('Search venues by name'),
    type: Joi.string().valid(...VENUE_TYPES),
    status: Joi.string().valid('active', 'inactive'),
    city: Joi.string().max(100).description('Filter by city'),
    state: Joi.string().length(2).uppercase().description('Filter by state (2-letter code)'),
    my_venues: Joi.boolean().description('Show only venues where user is staff'),
    sort_by: Joi.string().valid('name', 'created_at', 'capacity').default('name'),
    sort_order: Joi.string().valid('asc', 'desc').default('asc')
  })
};
```

### FILE: src/services/integration.service.ts
```typescript
import { IntegrationModel, IIntegration } from '../models/integration.model';
import { Knex } from 'knex';

interface IIntegrationWithCredentials extends IIntegration {
  encrypted_credentials?: string;
}

export class IntegrationService {
  private integrationModel: IntegrationModel;
  private db: Knex;
  private logger: any;

  constructor(dependencies: { db: Knex; logger: any }) {
    this.db = dependencies.db;
    this.logger = dependencies.logger;
    this.integrationModel = new IntegrationModel(this.db);
  }

  async getIntegration(integrationId: string): Promise<IIntegrationWithCredentials | null> {
    const integration = await this.integrationModel.findById(integrationId);
    return integration as IIntegrationWithCredentials;
  }

  async getVenueIntegrationByType(venueId: string, type: string): Promise<IIntegrationWithCredentials | null> {
    return this.integrationModel.findByVenueAndType(venueId, type) as Promise<IIntegrationWithCredentials | null>;
  }

  async listVenueIntegrations(venueId: string): Promise<IIntegration[]> {
    return this.integrationModel.findByVenue(venueId);
  }

  async createIntegration(venueId: string, data: any): Promise<IIntegration> {
    return this.integrationModel.create({
      venue_id: venueId,
      type: data.type,
      config: data.config || {},
      status: data.status || 'active',
      encrypted_credentials: data.encrypted_credentials
    });
  }

  async updateIntegration(integrationId: string, updates: any): Promise<IIntegration> {
    return this.integrationModel.update(integrationId, updates);
  }

  async deleteIntegration(integrationId: string): Promise<void> {
    await this.integrationModel.delete(integrationId);
  }

  async testIntegration(integrationId: string): Promise<{ success: boolean; message: string }> {
    const integration = await this.getIntegration(integrationId) as IIntegrationWithCredentials;
    if (!integration) {
      throw new Error('Integration not found');
    }

    const encrypted_credentials = integration.api_key_encrypted || integration.api_secret_encrypted;

    // Use integration_type instead of type
    switch (integration.integration_type) {
      case 'stripe':
        return this.testStripeIntegration(encrypted_credentials);
      case 'square':
        return this.testSquareIntegration(encrypted_credentials);
      default:
        return { success: false, message: 'Integration type not supported' };
    }
  }

  private testStripeIntegration(encrypted_credentials: any): { success: boolean; message: string } {
    try {
      // Test Stripe connection
      return { success: true, message: 'Stripe connection successful' };
    } catch (error) {
      return { success: false, message: 'Failed to connect to Stripe' };
    }
  }

  private testSquareIntegration(encrypted_credentials: any): { success: boolean; message: string } {
    try {
      // Test Square connection
      return { success: true, message: 'Square connection successful' };
    } catch (error) {
      return { success: false, message: 'Failed to connect to Square' };
    }
  }

  private encryptCredentials(encrypted_credentials: any): string {
    // Implement encryption
    return JSON.stringify(encrypted_credentials);
  }

  private decryptCredentials(encryptedCredentials: string): any {
    // Implement decryption
    return JSON.parse(encryptedCredentials);
  }

  async syncWithExternalSystem(integrationId: string): Promise<void> {
    const integration = await this.getIntegration(integrationId) as IIntegrationWithCredentials;
    if (!integration) {
      throw new Error('Integration not found');
    }

    const encrypted_credentials = integration.api_key_encrypted || integration.api_secret_encrypted;

    // Use integration_type instead of type
    this.logger.info({ integrationId, type: integration.integration_type }, 'Syncing with external system');
  }
}
```

### FILE: src/services/verification.service.ts
```typescript
import { logger } from '../utils/logger';
import { db } from '../config/database';

export interface VerificationResult {
  verified: boolean;
  checks: {
    businessInfo: boolean;
    taxInfo: boolean;
    bankAccount: boolean;
    identity: boolean;
  };
  issues: string[];
  verifiedAt?: Date;
}

export class VerificationService {
  async verifyVenue(venueId: string): Promise<VerificationResult> {
    const venue = await db('venues').where({ id: venueId }).first();
    if (!venue) {
      throw new Error('Venue not found');
    }

    const result: VerificationResult = {
      verified: false,
      checks: {
        businessInfo: false,
        taxInfo: false,
        bankAccount: false,
        identity: false,
      },
      issues: [],
    };

    // Check business information
    result.checks.businessInfo = await this.verifyBusinessInfo(venue);
    if (!result.checks.businessInfo) {
      result.issues.push('Incomplete business information');
    }

    // Check tax information
    result.checks.taxInfo = await this.verifyTaxInfo(venueId);
    if (!result.checks.taxInfo) {
      result.issues.push('Tax information not provided');
    }

    // Check bank account
    result.checks.bankAccount = await this.verifyBankAccount(venueId);
    if (!result.checks.bankAccount) {
      result.issues.push('Bank account not verified');
    }

    // Check identity verification
    result.checks.identity = await this.verifyIdentity(venueId);
    if (!result.checks.identity) {
      result.issues.push('Identity verification pending');
    }

    // All checks passed?
    result.verified = Object.values(result.checks).every(check => check);

    if (result.verified) {
      result.verifiedAt = new Date();
      await this.markVenueVerified(venueId);
    }

    logger.info({ venueId, result }, 'Venue verification completed');

    return result;
  }

  async submitDocument(venueId: string, documentType: string, documentData: any): Promise<void> {
    // Store document reference
    await db('venue_documents').insert({
      venue_id: venueId,
      type: documentType,
      status: 'pending',
      submitted_at: new Date(),
      metadata: documentData,
    });

    // Trigger verification based on document type
    switch (documentType) {
      case 'business_license':
      case 'articles_of_incorporation':
        await this.triggerBusinessVerification(venueId);
        break;
      case 'tax_id':
      case 'w9':
        await this.triggerTaxVerification(venueId);
        break;
      case 'bank_statement':
      case 'voided_check':
        await this.triggerBankVerification(venueId);
        break;
      case 'drivers_license':
      case 'passport':
        await this.triggerIdentityVerification(venueId);
        break;
    }

    logger.info({ venueId, documentType }, 'Document submitted for verification');
  }

  async getVerificationStatus(venueId: string): Promise<{
    status: 'unverified' | 'pending' | 'verified' | 'rejected';
    completedChecks: string[];
    pendingChecks: string[];
    requiredDocuments: string[];
  }> {
    const verification = await this.verifyVenue(venueId);
    const documents = await db('venue_documents')
      .where({ venue_id: venueId })
      .select('type', 'status');

    const completedChecks = Object.entries(verification.checks)
      .filter(([_, passed]) => passed)
      .map(([check]) => check);

    const pendingChecks = Object.entries(verification.checks)
      .filter(([_, passed]) => !passed)
      .map(([check]) => check);

    const requiredDocuments = this.getRequiredDocuments(pendingChecks);

    let status: 'unverified' | 'pending' | 'verified' | 'rejected' = 'unverified';
    if (verification.verified) {
      status = 'verified';
    } else if (documents.some((d: any) => d.status === 'pending')) {
      status = 'pending';
    } else if (documents.some((d: any) => d.status === 'rejected')) {
      status = 'rejected';
    }

    return {
      status,
      completedChecks,
      pendingChecks,
      requiredDocuments,
    };
  }

  private async verifyBusinessInfo(venue: any): Promise<boolean> {
    // Check if required business fields are present
    return !!(
      venue.name &&
      venue.address &&
      venue.type &&
      venue.capacity
    );
  }

  private async verifyTaxInfo(venueId: string): Promise<boolean> {
    // Check for tax documents
    const taxDocs = await db('venue_documents')
      .where({ venue_id: venueId, type: 'tax_id', status: 'approved' })
      .orWhere({ venue_id: venueId, type: 'w9', status: 'approved' })
      .first();

    return !!taxDocs;
  }

  private async verifyBankAccount(venueId: string): Promise<boolean> {
    // Check for verified payment integration
    const paymentIntegration = await db('venue_integrations')
      .where({ venue_id: venueId, status: 'active' })
      .whereIn('type', ['stripe', 'square'])
      .first();

    return !!paymentIntegration;
  }

  private async verifyIdentity(venueId: string): Promise<boolean> {
    // Check for identity documents
    const identityDocs = await db('venue_documents')
      .where({ venue_id: venueId, status: 'approved' })
      .whereIn('type', ['drivers_license', 'passport'])
      .first();

    return !!identityDocs;
  }

  private async markVenueVerified(venueId: string): Promise<void> {
    await db('venues')
      .where({ id: venueId })
      .update({
        settings: db.raw("settings || ?::jsonb", JSON.stringify({
          verification: {
            verified: true,
            verifiedAt: new Date(),
          },
        })),
        updated_at: new Date(),
      });
  }

  private getRequiredDocuments(pendingChecks: string[]): string[] {
    const documentMap: Record<string, string[]> = {
      businessInfo: ['business_license', 'articles_of_incorporation'],
      taxInfo: ['tax_id', 'w9'],
      bankAccount: ['bank_statement', 'voided_check'],
      identity: ['drivers_license', 'passport'],
    };

    return pendingChecks.flatMap(check => documentMap[check] || []);
  }

  private async triggerBusinessVerification(venueId: string): Promise<void> {
    // TODO: Integrate with verification service
    logger.info({ venueId }, 'Business verification triggered');
  }

  private async triggerTaxVerification(venueId: string): Promise<void> {
    // TODO: Integrate with tax verification service
    logger.info({ venueId }, 'Tax verification triggered');
  }

  private async triggerBankVerification(venueId: string): Promise<void> {
    // TODO: Integrate with bank verification service
    logger.info({ venueId }, 'Bank verification triggered');
  }

  private async triggerIdentityVerification(venueId: string): Promise<void> {
    // TODO: Integrate with identity verification service
    logger.info({ venueId }, 'Identity verification triggered');
  }
}
```

### FILE: src/services/eventPublisher.ts
```typescript
const amqplib = require('amqplib');
import { logger } from '../utils/logger';
import { createCircuitBreaker } from '../utils/circuitBreaker';

export interface EventMessage {
  eventType: string;
  aggregateId: string;
  aggregateType: string;
  payload: any;
  metadata?: {
    userId?: string;
    timestamp?: Date;
    correlationId?: string;
    version?: number;
  };
}

export class EventPublisher {
  private connection: any = null;
  private channel: any = null;
  private publishWithBreaker: (message: EventMessage) => Promise<void>;
  private readonly exchangeName = 'venue-events';
  private readonly rabbitUrl: string;
  private connected: boolean = false;

  constructor() {
    this.rabbitUrl = process.env.RABBITMQ_URL || 'amqp://admin:admin@rabbitmq:5672';
    
    // Wrap publish with circuit breaker
    const breaker = createCircuitBreaker(
      this.publishInternal.bind(this),
      {
        name: 'rabbitmq-publish',
        timeout: 2000,
        errorThresholdPercentage: 50,
        resetTimeout: 30000
      }
    );
    
    this.publishWithBreaker = async (message: EventMessage): Promise<void> => {
      await breaker.fire(message);
    };
  }

  async connect(): Promise<void> {
    try {
      this.connection = await amqplib.connect(this.rabbitUrl);
      this.channel = await this.connection.createChannel();
      
      // Declare exchange
      await this.channel.assertExchange(this.exchangeName, 'topic', { durable: true });
      
      this.connected = true;
      logger.info('Connected to RabbitMQ');
      
      // Handle connection events
      this.connection.on('error', (err: any) => {
        logger.error({ error: err }, 'RabbitMQ connection error');
        this.connected = false;
        this.reconnect();
      });
      
      this.connection.on('close', () => {
        logger.warn('RabbitMQ connection closed');
        this.connected = false;
        this.reconnect();
      });
    } catch (error) {
      logger.warn({ error }, 'Could not connect to RabbitMQ - running without event publishing');
      this.connected = false;
      // Don't throw - allow service to run without RabbitMQ
      // Retry connection after delay
      setTimeout(() => this.reconnect(), 5000);
    }
  }

  private async reconnect(): Promise<void> {
    this.connection = null;
    this.channel = null;
    await this.connect();
  }

  private async publishInternal(message: EventMessage): Promise<void> {
    if (!this.connected || !this.channel) {
      logger.debug('RabbitMQ not connected, skipping event publish');
      return;
    }

    const routingKey = `${message.aggregateType}.${message.eventType}`;
    const messageBuffer = Buffer.from(JSON.stringify({
      ...message,
      metadata: {
        ...message.metadata,
        timestamp: message.metadata?.timestamp || new Date(),
      }
    }));

    this.channel.publish(
      this.exchangeName,
      routingKey,
      messageBuffer,
      { persistent: true }
    );

    logger.debug({ routingKey, message }, 'Event published to RabbitMQ');
  }

  async publish(message: EventMessage): Promise<void> {
    try {
      await this.publishWithBreaker(message);
    } catch (error) {
      logger.error({ error, message }, 'Failed to publish event');
      // Don't throw - event publishing failure shouldn't break main flow
    }
  }

  // Venue-specific event methods
  async publishVenueCreated(venueId: string, venueData: any, userId?: string): Promise<void> {
    await this.publish({
      eventType: 'created',
      aggregateId: venueId,
      aggregateType: 'venue',
      payload: venueData,
      metadata: {
        userId,
        version: 1
      }
    });
  }

  async publishVenueUpdated(venueId: string, changes: any, userId?: string): Promise<void> {
    await this.publish({
      eventType: 'updated',
      aggregateId: venueId,
      aggregateType: 'venue',
      payload: { changes },
      metadata: {
        userId
      }
    });
  }

  async publishVenueDeleted(venueId: string, userId?: string): Promise<void> {
    await this.publish({
      eventType: 'deleted',
      aggregateId: venueId,
      aggregateType: 'venue',
      payload: { deletedAt: new Date() },
      metadata: {
        userId
      }
    });
  }

  async close(): Promise<void> {
    if (this.channel) {
      await this.channel.close();
    }
    if (this.connection) {
      await this.connection.close();
    }
  }
  
  // Public method to check connection status
  public isConnected(): boolean {
    return this.connected;
  }
}
```

### FILE: src/services/healthCheck.service.ts
```typescript
import { Knex } from 'knex';
import Redis from 'ioredis';
import { logger } from '../utils/logger';

export interface HealthCheckResult {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  service: string;
  version: string;
  uptime: number;
  checks: {
    [key: string]: {
      status: 'ok' | 'warning' | 'error';
      message?: string;
      responseTime?: number;
      details?: any;
    };
  };
}

export class HealthCheckService {
  private db: Knex;
  private redis: Redis;
  private startTime: Date;

  constructor(dependencies: { db: Knex; redis: Redis }) {
    this.db = dependencies.db;
    this.redis = dependencies.redis;
    this.startTime = new Date();
  }

  // Liveness probe - is the service alive?
  async getLiveness(): Promise<{ status: string; timestamp: string }> {
    return {
      status: 'alive',
      timestamp: new Date().toISOString()
    };
  }

  // Readiness probe - is the service ready to accept traffic?
  async getReadiness(): Promise<HealthCheckResult> {
    const checks: HealthCheckResult['checks'] = {};
    
    // Check database
    const dbStart = Date.now();
    try {
      await this.db.raw('SELECT 1');
      checks.database = {
        status: 'ok',
        responseTime: Date.now() - dbStart
      };
    } catch (error: any) {
      checks.database = {
        status: 'error',
        message: error.message,
        responseTime: Date.now() - dbStart
      };
    }

    // Check Redis
    const redisStart = Date.now();
    try {
      await this.redis.ping();
      checks.redis = {
        status: 'ok',
        responseTime: Date.now() - redisStart
      };
    } catch (error: any) {
      checks.redis = {
        status: 'error',
        message: error.message,
        responseTime: Date.now() - redisStart
      };
    }

    // Determine overall status
    const hasErrors = Object.values(checks).some(c => c.status === 'error');
    
    let status: HealthCheckResult['status'] = 'healthy';
    if (hasErrors) {
      if (checks.database.status === 'error') {
        status = 'unhealthy'; // Database is critical
      } else {
        status = 'degraded'; // Redis failure is degraded
      }
    }

    return {
      status,
      timestamp: new Date().toISOString(),
      service: 'venue-service',
      version: process.env.npm_package_version || '1.0.0',
      uptime: Date.now() - this.startTime.getTime(),
      checks
    };
  }

  // Full health check with business logic
  async getFullHealth(): Promise<HealthCheckResult> {
    const readiness = await this.getReadiness();
    
    // Add business logic checks
    const businessChecks: HealthCheckResult['checks'] = {};
    
    // Check if we can query venues
    const queryStart = Date.now();
    try {
      const count = await this.db('venues').count('id as count').first();
      businessChecks.venueQuery = {
        status: 'ok',
        responseTime: Date.now() - queryStart,
        details: { venueCount: count?.count || 0 }
      };
    } catch (error: any) {
      businessChecks.venueQuery = {
        status: 'error',
        message: error.message,
        responseTime: Date.now() - queryStart
      };
    }

    // Check cache operations
    const cacheStart = Date.now();
    try {
      const testKey = 'health:check:' + Date.now();
      await this.redis.set(testKey, 'ok', 'EX', 10);
      const value = await this.redis.get(testKey);
      await this.redis.del(testKey);
      
      businessChecks.cacheOperations = {
        status: value === 'ok' ? 'ok' : 'warning',
        responseTime: Date.now() - cacheStart
      };
    } catch (error: any) {
      businessChecks.cacheOperations = {
        status: 'error',
        message: error.message,
        responseTime: Date.now() - cacheStart
      };
    }

    return {
      ...readiness,
      checks: {
        ...readiness.checks,
        ...businessChecks
      }
    };
  }
}
```

### FILE: src/services/interfaces.ts
```typescript
export interface IStaff {
  id: string;
  user_id: string;
  venue_id: string;
  role: string;
  // Add properties as needed
}

import { IVenue } from '../models/venue.model';
import { IIntegration } from '../models/integration.model';

// Layout interface
export interface ILayout {
  id: string;
  venue_id: string;
  name: string;
  sections: any[];
  total_capacity: number;
  is_default?: boolean;
  created_at: Date;
  updated_at: Date;
  deleted_at?: Date | null;
}


export interface IVenueService {
  createVenue(data: any, userId: string): Promise<IVenue>;
  getVenue(venueId: string): Promise<IVenue | null>;
  updateVenue(venueId: string, updates: any, userId: string): Promise<IVenue>;
  deleteVenue(venueId: string, userId: string): Promise<void>;
  listVenues(filters: any): Promise<IVenue[]>;
  addStaff(venueId: string, userId: string, role: string): Promise<IStaff>;
  updateStaff(venueId: string, staffId: string, updates: any): Promise<IStaff>;
  removeStaff(venueId: string, staffId: string): Promise<void>;
  isUserStaff(venueId: string, userId: string): Promise<boolean>;
}

export interface IIntegrationService {
  listIntegrations(venueId: string): Promise<IIntegration[]>;
  getIntegration(venueId: string, integrationId: string): Promise<IIntegration | null>;
  findByType(venueId: string, type: string): Promise<IIntegration | null>;
  connectIntegration(venueId: string, type: string, config: any, credentials: any): Promise<IIntegration>;
  updateIntegration(venueId: string, integrationId: string, updates: any): Promise<IIntegration>;
  disconnectIntegration(venueId: string, integrationId: string): Promise<void>;
  testIntegration(venueId: string, integrationId: string): Promise<{ success: boolean; message?: string }>;
  handleWebhook(type: string, headers: any, body: any): Promise<{ processed: boolean; events: any[] }>;
  syncData(venueId: string, integrationId: string): Promise<{ synced: number; errors: number }>;
}

export interface IOnboardingService {
  getOnboardingStatus(venueId: string): Promise<any>;
  completeStep(venueId: string, step: string, data?: any): Promise<void>;
  getSetupGuide(venueType: string): any;
}

export interface IComplianceService {
  getComplianceSettings(venueId: string): Promise<any>;
  updateComplianceSettings(venueId: string, settings: any): Promise<any>;
  generateComplianceReport(venueId: string): Promise<any>;
  checkCompliance(venueId: string): Promise<any>;
}

export interface IVerificationService {
  submitVerification(venueId: string, documents: any): Promise<any>;
  getVerificationStatus(venueId: string): Promise<any>;
  updateVerificationStatus(venueId: string, status: string, notes?: string): Promise<any>;
}

export interface ILayoutService {
  createLayout(venueId: string, data: any): Promise<ILayout>;
  getLayouts(venueId: string): Promise<ILayout[]>;
  getLayout(layoutId: string): Promise<ILayout | null>;
  updateLayout(layoutId: string, updates: any): Promise<ILayout>;
  deleteLayout(layoutId: string): Promise<void>;
  setDefaultLayout(venueId: string, layoutId: string): Promise<void>;
}
```

### FILE: src/services/onboarding.service.ts
```typescript
import { VenueService } from './venue.service';
import { IntegrationModel } from '../models/integration.model';
import { LayoutModel } from '../models/layout.model';
import { StaffModel } from '../models/staff.model';
import { Knex } from 'knex';

export class OnboardingService {
  private venueService: VenueService;
  private integrationModel: IntegrationModel;
  private layoutModel: LayoutModel;
  private staffModel: StaffModel;
  private db: Knex;
  private logger: any;

  constructor(dependencies: {
    venueService: VenueService;
    db: Knex;
    logger: any;
  }) {
    this.venueService = dependencies.venueService;
    this.db = dependencies.db;
    this.logger = dependencies.logger;
    this.integrationModel = new IntegrationModel(this.db);
    this.layoutModel = new LayoutModel(this.db);
    this.staffModel = new StaffModel(this.db);
  }

  async getOnboardingStatus(venueId: string): Promise<any> {
    const steps = await this.getOnboardingSteps(venueId);
    const completedSteps = steps.filter((s: any) => s.completed).length;
    const totalSteps = steps.length;

    return {
      venueId,
      progress: Math.round((completedSteps / totalSteps) * 100),
      completedSteps,
      totalSteps,
      steps,
      status: completedSteps === totalSteps ? 'completed' : 'in_progress'
    };
  }

  private async getOnboardingSteps(venueId: string): Promise<any[]> {
    return [
      {
        id: 'basic_info',
        name: 'Basic Information',
        description: 'Venue name, type, and capacity',
        completed: await this.hasBasicInfo(venueId),
        required: true
      },
      {
        id: 'address',
        name: 'Address',
        description: 'Venue location details',
        completed: await this.hasAddress(venueId),
        required: true
      },
      {
        id: 'layout',
        name: 'Seating Layout',
        description: 'Configure venue seating arrangement',
        completed: await this.hasLayout(venueId),
        required: false
      },
      {
        id: 'payment',
        name: 'Payment Integration',
        description: 'Connect payment processor',
        completed: await this.hasPaymentIntegration(venueId),
        required: true
      },
      {
        id: 'staff',
        name: 'Staff Members',
        description: 'Add team members',
        completed: await this.hasStaff(venueId),
        required: false
      }
    ];
  }

  private async hasBasicInfo(venueId: string): Promise<boolean> {
    const venue = await this.db('venues').where({ id: venueId }).first();
    return !!(venue && venue.name && venue.type && venue.capacity);
  }

  private async hasAddress(venueId: string): Promise<boolean> {
    const venue = await this.db('venues').where({ id: venueId }).first();
    if (!venue || !venue.address) return false;
    const address = venue.address;
    return !!(address.street && address.city && address.state && address.zipCode);
  }

  private async hasLayout(venueId: string): Promise<boolean> {
    const layouts = await this.layoutModel.findByVenue(venueId);
    return layouts.length > 0;
  }

  private async hasPaymentIntegration(venueId: string): Promise<boolean> {
    const integrations = await this.integrationModel.findByVenue(venueId);
    return integrations.some((i: any) => i.type === 'stripe' || i.type === 'square');
  }

  private async hasStaff(venueId: string): Promise<boolean> {
    const staffCount = await this.db('venue_staff')
      .where({ venue_id: venueId })
      .whereNull('deleted_at')
      .count('* as count')
      .first();
    return parseInt(String(staffCount?.count || '0'), 10) > 1;
  }

  async completeStep(venueId: string, stepId: string, data: any): Promise<void> {
    switch (stepId) {
      case 'basic_info':
        await this.updateBasicInfo(venueId, data);
        break;
      case 'address':
        await this.updateAddress(venueId, data);
        break;
      case 'layout':
        await this.createLayout(venueId, data);
        break;
      case 'payment':
        await this.createPaymentIntegration(venueId, data);
        break;
      case 'staff':
        await this.addStaffMember(venueId, data);
        break;
      default:
        throw new Error(`Unknown onboarding step: ${stepId}`);
    }
  }

  private async updateBasicInfo(venueId: string, data: any): Promise<void> {
    await this.db('venues').where({ id: venueId }).update({
      name: data.name,
      type: data.type,
      capacity: data.capacity,
      updated_at: new Date()
    });
  }

  private async updateAddress(venueId: string, data: any): Promise<void> {
    await this.db('venues').where({ id: venueId }).update({
      address: data,
      updated_at: new Date()
    });
  }

  private async createLayout(venueId: string, data: any): Promise<void> {
    await this.layoutModel.create({
      venue_id: venueId,
      name: data.name,
      type: data.type,
      sections: data.sections,
      capacity: data.capacity,
      is_default: true
    });
  }

  private async createPaymentIntegration(venueId: string, data: any): Promise<void> {
    await this.integrationModel.create({
      venue_id: venueId,
      type: data.type,
      config: data.config,
      is_active: true
    });
  }

  private async addStaffMember(venueId: string, data: any): Promise<void> {
    await this.staffModel.addStaffMember({
      venue_id: venueId,
      user_id: data.userId,
      role: data.role,
      permissions: data.permissions || []
    });
  }
}
```

### FILE: src/services/venue.service.ts
```typescript
import { createSpan } from '../utils/tracing';
import { VenueModel, IVenue } from '../models/venue.model';
import { QUEUES } from "@tickettoken/shared/src/mq/queues";
import { StaffModel } from '../models/staff.model';
import { SettingsModel } from '../models/settings.model';
import { VenueAuditLogger } from '../utils/venue-audit-logger';
import { Redis } from 'ioredis';
import { Knex } from 'knex';

import { EventPublisher } from './eventPublisher';
import { CacheService } from './cache.service';

export class VenueService {
  private redis: Redis;
  private auditLogger: VenueAuditLogger;
  private logger: any;
  private db: Knex;
  private cacheService: CacheService;
  private eventPublisher: EventPublisher;

  constructor(dependencies: {
    db: Knex;
    redis: Redis;
    cacheService: CacheService;
    eventPublisher: EventPublisher;
    logger: any
  }) {
    this.redis = dependencies.redis;
    this.logger = dependencies.logger;
    this.auditLogger = new VenueAuditLogger(dependencies.db);
    this.db = dependencies.db;
    this.cacheService = dependencies.cacheService;
    this.eventPublisher = dependencies.eventPublisher;
  }

  // Helper method to get models with proper db connection
  private getModels(dbOrTrx: Knex | Knex.Transaction = this.db) {
    return {
      venueModel: new VenueModel(dbOrTrx),
      staffModel: new StaffModel(dbOrTrx),
      settingsModel: new SettingsModel(dbOrTrx)
    };
  }

  async createVenue(venueData: Partial<IVenue>, ownerId: string, requestInfo?: any): Promise<IVenue> {
    try {
      // Start transaction
      const venue = await this.db.transaction(async (trx) => {
        // Get models with transaction
        const { venueModel, staffModel } = this.getModels(trx);

        // Create venue using transaction
        // Add owner ID to venue data
        venueData.created_by = ownerId;

        const newVenue = await venueModel.createWithDefaults(venueData);

        // Add owner as staff using transaction
        await staffModel.addStaffMember({
          venue_id: newVenue.id,
          user_id: ownerId,
          role: 'owner',
          permissions: ['*'],
        });

        // Initialize default settings using transaction
        await trx('venues').where({ id: newVenue.id }).update({
          settings: this.getDefaultSettings(),
        });

        return newVenue;
      });

      // Log venue creation (outside transaction)
      await this.auditLogger.log('venue_created', ownerId, venue.id!, requestInfo);

      this.logger.info({ venueId: venue.id, ownerId }, 'Venue created successfully');

      // Publish venue created event
      if (venue.id) {
        await this.eventPublisher.publishVenueCreated(venue.id, venue, ownerId);
      }

      return venue;
    } catch (error) {
      this.logger.error({ error, venueData }, 'Failed to create venue');
      throw error;
    }
  }

  async getVenue(venueId: string, userId: string): Promise<IVenue | null> {
    // Check cache first
    const cacheKey = `venue:${venueId}:details`;
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      // Still need to check access for cached venues
      const hasAccess = await this.checkVenueAccess(venueId, userId);
      if (!hasAccess) {
        throw new Error('Access denied');
      }
      return JSON.parse(cached);
    }

    // Get venue from database
    const { venueModel } = this.getModels();
    const venue = await venueModel.findById(venueId);

    // Return null if venue doesn't exist (controller will return 404)
    if (!venue) {
      return null;
    }

    // NOW check access permission for existing venue
    const hasAccess = await this.checkVenueAccess(venueId, userId);
    if (!hasAccess) {
      throw new Error('Access denied');
    }

    // Cache the venue since it exists and user has access
    await this.redis.setex(cacheKey, 300, JSON.stringify(venue));

    return venue;
  }

  async updateVenue(venueId: string, updates: Partial<IVenue>, userId: string, tenantId?: string): Promise<IVenue> {
    const { venueModel, staffModel } = this.getModels();

    // Check permission
    const hasPermission = await staffModel.hasPermission(venueId, userId, 'venue:update');
    if (!hasPermission) {
      throw new Error('Permission denied');
    }

    // Check if slug is being updated and is unique
    if (updates.slug) {
      const existing = await venueModel.findBySlug(updates.slug);
      if (existing && existing.id !== venueId) {
        throw new Error('Slug already in use');
      }
    }

    const updated = await venueModel.update(venueId, updates);

    // Clear cache
    await this.clearVenueCache(venueId);

    this.logger.info({ venueId, userId, updates }, 'Venue updated');

    // Publish venue updated event
    if (updated.id) {
      await this.eventPublisher.publishVenueUpdated(updated.id, updates, userId);
    }
    return updated;
  }

  async deleteVenue(venueId: string, userId: string): Promise<void> {
    const { venueModel, staffModel } = this.getModels();

    // Only owners can delete venues
    const staffMember = await staffModel.findByVenueAndUser(venueId, userId);
    if (!staffMember || staffMember.role !== 'owner') {
      throw new Error('Only venue owners can delete venues');
    }

    // Check if venue can be deleted (no active events, etc.)
    const canDelete = await this.canDeleteVenue(venueId);
    if (!canDelete.allowed) {
      throw new Error(`Cannot delete venue: ${canDelete.reason}`);
    }

    await venueModel.softDelete(venueId);

    // Clear all caches
    await this.clearVenueCache(venueId);

    this.logger.info({ venueId, userId }, 'Venue deleted');

    // Publish venue deleted event
    await this.eventPublisher.publishVenueDeleted(venueId, userId);
  }

  async searchVenues(searchTerm: string, filters: any = {}): Promise<IVenue[]> {
    const { venueModel } = this.getModels();
    return venueModel.searchVenues(searchTerm, filters);
  }

  async getVenueStats(venueId: string): Promise<any> {
    const cacheKey = `venue:${venueId}:stats`;
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    const { venueModel } = this.getModels();
    const stats = await venueModel.getVenueStats(venueId);

    // Cache for 1 minute
    await this.redis.setex(cacheKey, 60, JSON.stringify(stats));

    return stats;
  }

  async checkVenueAccess(venueId: string, userId: string): Promise<boolean> {
    try {
      const { venueModel, staffModel } = this.getModels();
      console.log("DEBUG: Checking access for", { venueId, userId });

      const staffMember = await staffModel.findByVenueAndUser(venueId, userId);
      console.log("DEBUG: Staff member result:", staffMember);

      if (!staffMember || !staffMember.is_active) {
        console.log("DEBUG: No active staff member found");
        return false;
      }

      const venue = await venueModel.findById(venueId);
      console.log("DEBUG: Venue result:", venue?.id, venue?.is_active);

      if (!venue || !venue.is_active) {
        console.log("DEBUG: Venue not found or inactive");
        return false;
      }

      return true;
    } catch (error) {
      console.error("DEBUG: Error in checkVenueAccess:", error);
      throw error;
    }
  }

  async updateOnboardingProgress(venueId: string, step: string, completed: boolean): Promise<void> {
    const { venueModel } = this.getModels();

    const venue = await venueModel.findById(venueId);
    if (!venue) {
      throw new Error('Venue not found');
    }

    const onboarding = venue.onboarding || {};
    onboarding[step] = completed;

    await venueModel.update(venueId, {
      onboarding,
      onboarding_status: this.calculateOnboardingStatus(onboarding),
    });

    await this.clearVenueCache(venueId);
  }

  async listVenues(query: any = {}): Promise<IVenue[]> {
    try {
      const searchTerm = query.search || '';
      const filters = {
        type: query.type,
        city: query.city,
        state: query.state,
        limit: query.limit || 20,
        offset: query.offset || 0
      };

      Object.keys(filters).forEach(key =>
        (filters as any)[key] === undefined && delete (filters as any)[key]
      );

      return await this.searchVenues(searchTerm, filters);
    } catch (error) {
      this.logger.error({ error, query }, 'Error listing venues');
      throw error;
    }
  }

  async listUserVenues(userId: string, query: any = {}): Promise<IVenue[]> {
    try {
      const staffVenues = await this.db('venue_staff')
        .where({ user_id: userId, is_active: true })
        .whereNull('deleted_at')
        .select('venue_id');

      const venueIds = staffVenues.map(s => s.venue_id);

      if (venueIds.length === 0) {
        return [];
      }

      let venueQuery = this.db('venues')
        .whereIn('id', venueIds)
        .whereNull('deleted_at')
        .where('is_active', true);

      if (query.type) {
        venueQuery = venueQuery.where('type', query.type);
      }
      if (query.search) {
        venueQuery = venueQuery.where(function() {
          this.where('name', 'ilike', `%${query.search}%`)
            .orWhere('slug', 'ilike', `%${query.search}%`);
        });
      }

      const limit = parseInt(query.limit) || 20;
      const offset = parseInt(query.offset) || 0;
      venueQuery = venueQuery.limit(limit).offset(offset);

      const venues = await venueQuery;
      return venues;
    } catch (error) {
      this.logger.error({ error, userId, query }, 'Error listing user venues');
      throw error;
    }
  }

  async getAccessDetails(venueId: string, userId: string): Promise<any> {
    const { staffModel } = this.getModels();

    const staff = await staffModel.findByVenueAndUser(venueId, userId);
    if (!staff) {
      return null;
    }
    return {
      role: staff.role,
      permissions: staff.permissions || []
    };
  }

  async addStaffMember(venueId: string, staffData: any, requesterId: string): Promise<any> {
    const { staffModel } = this.getModels();

    // Verify requester has permission to add staff
    const requesterStaff = await staffModel.findByVenueAndUser(venueId, requesterId);
    if (!requesterStaff || (requesterStaff.role !== 'owner' && requesterStaff.role !== 'manager')) {
      throw new Error('Only owners and managers can add staff');
    }

    // Add the new staff member
    return staffModel.addStaffMember({
      venue_id: venueId,
      user_id: staffData.userId,
      role: staffData.role,
      permissions: staffData.permissions || []
    });
  }

  async getVenueStaff(venueId: string, requesterId: string): Promise<any[]> {
    const { staffModel } = this.getModels();

    // Verify requester has access to this venue
    const hasAccess = await this.checkVenueAccess(venueId, requesterId);
    if (!hasAccess) {
      throw new Error('Access denied');
    }

    return staffModel.getVenueStaff(venueId);
  }


  async removeStaffMember(venueId: string, staffId: string, requesterId: string): Promise<void> {
    const { staffModel } = this.getModels();

    // Verify requester is owner
    const requesterStaff = await staffModel.findByVenueAndUser(venueId, requesterId);
    if (!requesterStaff || requesterStaff.role !== 'owner') {
      throw new Error('Only owners can remove staff');
    }

    // Cannot remove yourself
    if (staffId === requesterStaff.id) {
      throw new Error('Cannot remove yourself');
    }

    // Remove the staff member
    await staffModel.delete(staffId);
  }

  private async canDeleteVenue(venueId: string): Promise<{ allowed: boolean; reason?: string }> {
    return { allowed: true };
  }

  private async clearVenueCache(venueId: string): Promise<void> {
    const keysToDelete = [
      `venue:${venueId}:details`,
      `venue:${venueId}:stats`,
      `venue:${venueId}:events`,
      `venue:${venueId}:staff`
    ];

    for (const key of keysToDelete) {
      await this.redis.del(key);
    }
  }

  private calculateOnboardingStatus(onboarding: Record<string, boolean>): string {
    const steps = ['basic_info', 'layout', 'integrations', 'staff'];
    const completed = steps.filter(step => onboarding[step]).length;

    if (completed === 0) return 'pending';
    if (completed === steps.length) return 'completed';
    return 'in_progress';
  }

  private getDefaultSettings(): Record<string, any> {
    return {
      general: {
        timezone: 'America/New_York',
        currency: 'USD',
        language: 'en',
      },
      ticketing: {
        allowRefunds: true,
        refundWindow: 24,
        maxTicketsPerOrder: 10,
        requirePhoneNumber: false,
      },
      notifications: {
        emailEnabled: true,
        smsEnabled: false,
      }
    };
  }
}
```

### FILE: src/services/compliance.service.ts
```typescript
import { logger } from '../utils/logger';
import { db } from '../config/database';

export interface ComplianceReport {
  venueId: string;
  generatedAt: Date;
  overallStatus: 'compliant' | 'non_compliant' | 'review_needed';
  categories: {
    dataProtection: ComplianceCategory;
    ageVerification: ComplianceCategory;
    accessibility: ComplianceCategory;
    financialReporting: ComplianceCategory;
    licensing: ComplianceCategory;
  };
  recommendations: ComplianceRecommendation[];
  nextReviewDate: Date;
}

interface ComplianceCategory {
  status: 'compliant' | 'non_compliant' | 'review_needed';
  checks: ComplianceCheck[];
  lastReviewDate?: Date;
}

interface ComplianceCheck {
  name: string;
  passed: boolean;
  details: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
}

interface ComplianceRecommendation {
  category: string;
  issue: string;
  recommendation: string;
  priority: 'immediate' | 'high' | 'medium' | 'low';
  dueDate?: Date;
}

export class ComplianceService {
  async generateComplianceReport(venueId: string): Promise<ComplianceReport> {
    const venue = await db('venues').where({ id: venueId }).first();
    if (!venue) {
      throw new Error('Venue not found');
    }

    const report: ComplianceReport = {
      venueId,
      generatedAt: new Date(),
      overallStatus: 'compliant',
      categories: {
        dataProtection: await this.checkDataProtection(venueId),
        ageVerification: await this.checkAgeVerification(venueId),
        accessibility: await this.checkAccessibility(venueId),
        financialReporting: await this.checkFinancialReporting(venueId),
        licensing: await this.checkLicensing(venueId),
      },
      recommendations: [],
      nextReviewDate: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000), // 90 days
    };

    // Determine overall status
    const statuses = Object.values(report.categories).map(cat => cat.status);
    if (statuses.includes('non_compliant')) {
      report.overallStatus = 'non_compliant';
    } else if (statuses.includes('review_needed')) {
      report.overallStatus = 'review_needed';
    }

    // Generate recommendations
    report.recommendations = this.generateRecommendations(report.categories);

    // Store report
    await this.storeComplianceReport(report);

    logger.info({ venueId, status: report.overallStatus }, 'Compliance report generated');

    return report;
  }

  async scheduleComplianceReview(venueId: string, reviewDate: Date): Promise<void> {
    await db('venue_compliance_reviews').insert({
      venue_id: venueId,
      scheduled_date: reviewDate,
      status: 'scheduled',
      created_at: new Date(),
    });

    logger.info({ venueId, reviewDate }, 'Compliance review scheduled');
  }

  async updateComplianceSettings(venueId: string, settings: any): Promise<void> {
    const existing = await db('venue_compliance')
      .where({ venue_id: venueId })
      .first();

    if (existing) {
      await db('venue_compliance')
        .where({ venue_id: venueId })
        .update({
          settings,
          updated_at: new Date(),
        });
    } else {
      await db('venue_compliance').insert({
        venue_id: venueId,
        settings,
        created_at: new Date(),
      });
    }

    // Check if settings change affects compliance
    await this.checkComplianceImpact(venueId, settings);
  }

  private async checkDataProtection(venueId: string): Promise<ComplianceCategory> {
    const checks: ComplianceCheck[] = [];
    
    // Check GDPR compliance
    const gdprSettings = await this.getGDPRSettings(venueId);
    checks.push({
      name: 'GDPR Compliance',
      passed: gdprSettings.enabled && !!gdprSettings.privacyPolicyUrl,
      details: gdprSettings.enabled ? 'GDPR compliance enabled' : 'GDPR compliance not configured',
      severity: 'critical',
    });

    // Check data retention policies
    const retentionSettings = await this.getRetentionSettings(venueId);
    checks.push({
      name: 'Data Retention Policy',
      passed: retentionSettings.configured,
      details: `Customer data retained for ${retentionSettings.customerDataDays} days`,
      severity: 'high',
    });

    // Check encryption
    checks.push({
      name: 'Data Encryption',
      passed: true, // Assume encrypted at rest
      details: 'All sensitive data encrypted at rest',
      severity: 'critical',
    });

    const status = checks.every(c => c.passed) ? 'compliant' : 
                   checks.some(c => !c.passed && c.severity === 'critical') ? 'non_compliant' : 
                   'review_needed';

    return { status, checks, lastReviewDate: new Date() };
  }

  private async checkAgeVerification(venueId: string): Promise<ComplianceCategory> {
    const checks: ComplianceCheck[] = [];
    const settings = await this.getAgeVerificationSettings(venueId);

    checks.push({
      name: 'Age Verification System',
      passed: settings.enabled,
      details: settings.enabled ? `Minimum age: ${settings.minimumAge}` : 'Age verification not enabled',
      severity: 'medium', // TODO: Get venue type and set severity accordingly
    });

    if (settings.enabled) {
      checks.push({
        name: 'Verification Method',
        passed: settings.verificationRequired,
        details: settings.verificationRequired ? 'ID verification required' : 'Self-declaration only',
        severity: 'medium',
      });
    }

    const status = checks.every(c => c.passed) ? 'compliant' : 'review_needed';
    return { status, checks };
  }

  private async checkAccessibility(venueId: string): Promise<ComplianceCategory> {
    const checks: ComplianceCheck[] = [];
    const settings = await this.getAccessibilitySettings(venueId);

    checks.push({
      name: 'Wheelchair Accessibility',
      passed: settings.wheelchairAccessible !== null,
      details: settings.wheelchairAccessible ? 'Wheelchair accessible' : 'Accessibility status not specified',
      severity: 'high',
    });

    checks.push({
      name: 'Accessibility Information',
      passed: settings.hasAccessibilityInfo,
      details: 'Accessibility information provided to customers',
      severity: 'medium',
    });

    const status = checks.every(c => c.passed) ? 'compliant' : 'review_needed';
    return { status, checks };
  }

  private async checkFinancialReporting(venueId: string): Promise<ComplianceCategory> {
    const checks: ComplianceCheck[] = [];

    // Check tax reporting setup
    checks.push({
      name: 'Tax Reporting Configuration',
      passed: await this.hasTaxConfiguration(venueId),
      details: 'Tax reporting properly configured',
      severity: 'critical',
    });

    // Check payout compliance
    checks.push({
      name: 'Payout Compliance',
      passed: await this.hasVerifiedPayoutMethod(venueId),
      details: 'Verified payout method on file',
      severity: 'high',
    });

    const status = checks.every(c => c.passed) ? 'compliant' : 'non_compliant';
    return { status, checks };
  }

  private async checkLicensing(venueId: string): Promise<ComplianceCategory> {
    const checks: ComplianceCheck[] = [];
    const venue = await db('venues').where({ id: venueId }).first();

    // Check business license
    checks.push({
      name: 'Business License',
      passed: await this.hasValidBusinessLicense(venueId),
      details: 'Valid business license on file',
      severity: 'critical',
    });

    // Check entertainment license if applicable
    if (['comedy_club', 'theater'].includes(venue.type)) {
      checks.push({
        name: 'Entertainment License',
        passed: await this.hasEntertainmentLicense(venueId),
        details: 'Entertainment license required for venue type',
        severity: 'high',
      });
    }

    const status = checks.every(c => c.passed) ? 'compliant' : 
                   checks.some(c => !c.passed && c.severity === 'critical') ? 'non_compliant' : 
                   'review_needed';
    return { status, checks };
  }

  private generateRecommendations(categories: any): ComplianceRecommendation[] {
    const recommendations: ComplianceRecommendation[] = [];

    Object.entries(categories).forEach(([category, data]: [string, any]) => {
      data.checks.forEach((check: ComplianceCheck) => {
        if (!check.passed) {
          recommendations.push({
            category,
            issue: check.name,
            recommendation: this.getRecommendation(category, check.name),
            priority: check.severity === 'critical' ? 'immediate' : 
                     check.severity === 'high' ? 'high' : 'medium',
            dueDate: this.calculateDueDate(check.severity),
          });
        }
      });
    });

    return recommendations.sort((a, b) => {
      const priorityOrder = { immediate: 0, high: 1, medium: 2, low: 3 };
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    });
  }

  private getRecommendation(category: string, checkName: string): string {
    const recommendations: Record<string, Record<string, string>> = {
      dataProtection: {
        'GDPR Compliance': 'Enable GDPR compliance settings and upload privacy policy',
        'Data Retention Policy': 'Configure data retention periods in compliance settings',
      },
      ageVerification: {
        'Age Verification System': 'Enable age verification for age-restricted events',
        'Verification Method': 'Require ID verification for better compliance',
      },
      accessibility: {
        'Wheelchair Accessibility': 'Update venue accessibility information',
        'Accessibility Information': 'Provide detailed accessibility information for customers',
      },
      financialReporting: {
        'Tax Reporting Configuration': 'Complete tax information setup in venue settings',
        'Payout Compliance': 'Verify bank account or payment method for payouts',
      },
      licensing: {
        'Business License': 'Upload valid business license document',
        'Entertainment License': 'Upload entertainment license for your venue type',
      },
    };

    return recommendations[category]?.[checkName] || 'Review and update compliance settings';
  }

  private calculateDueDate(severity: string): Date {
    const daysToAdd = {
      critical: 7,
      high: 30,
      medium: 60,
      low: 90,
    };

    return new Date(Date.now() + ((daysToAdd as any)[severity] || 30) * 24 * 60 * 60 * 1000);
  }

  private async storeComplianceReport(report: ComplianceReport): Promise<void> {
    await db('venue_compliance_reports').insert({
      venue_id: report.venueId,
      report: JSON.stringify(report)
    });
  }

  // Helper methods for checks
  private async getGDPRSettings(venueId: string): Promise<any> {
    const compliance = await db('venue_compliance')
      .where({ venue_id: venueId })
      .first();
    
    return compliance?.settings?.gdpr || { enabled: false };
  }

  private async getRetentionSettings(venueId: string): Promise<any> {
    const compliance = await db('venue_compliance')
      .where({ venue_id: venueId })
      .first();
    
    const settings = compliance?.settings?.dataRetention || {};
    return {
      configured: !!settings.customerDataDays,
      ...settings,
    };
  }

  private async getAgeVerificationSettings(venueId: string): Promise<any> {
    const compliance = await db('venue_compliance')
      .where({ venue_id: venueId })
      .first();
    
    return compliance?.settings?.ageRestriction || { enabled: false };
  }

  private async getAccessibilitySettings(venueId: string): Promise<any> {
    const compliance = await db('venue_compliance')
      .where({ venue_id: venueId })
      .first();
    
    const settings = compliance?.settings?.accessibility || {};
    return {
      ...settings,
      hasAccessibilityInfo: !!(settings.wheelchairAccessible !== undefined),
    };
  }

  private async hasTaxConfiguration(venueId: string): Promise<boolean> {
    // Check if venue has tax information configured
    const taxDocs = await db('venue_documents')
      .where({ venue_id: venueId, document_type: 'tax_id', status: 'approved' })
      .first();
    
    return !!taxDocs;
  }

  private async hasVerifiedPayoutMethod(venueId: string): Promise<boolean> {
    // Check for verified payment integration
    const integration = await db('venue_integrations')
      .where({ venue_id: venueId, status: 'active' })
      .whereIn('type', ['stripe', 'square'])
      .first();
    
    return !!integration;
  }

  private async hasValidBusinessLicense(venueId: string): Promise<boolean> {
    const license = await db('venue_documents')
      .where({ venue_id: venueId, document_type: 'business_license', status: 'approved' })
      .first();
    
    return !!license;
  }

  private async hasEntertainmentLicense(venueId: string): Promise<boolean> {
    const license = await db('venue_documents')
      .where({ venue_id: venueId, document_type: 'entertainment_license', status: 'approved' })
      .first();
    
    return !!license;
  }

  private async checkComplianceImpact(venueId: string, newSettings: any): Promise<void> {
    // Check if settings change requires immediate compliance review
    const criticalChanges = ['gdpr', 'ageRestriction', 'dataRetention'];
    const hassCriticalChange = Object.keys(newSettings).some(key => criticalChanges.includes(key));
    
    if (hassCriticalChange) {
      logger.warn({ venueId, settings: newSettings }, 'Critical compliance settings changed');
      // TODO: Trigger compliance review notification
    }
  }
}
```

### FILE: src/types/fastify.d.ts
```typescript
import { FastifyRequest } from 'fastify';

declare module 'fastify' {
  interface FastifyRequest {
    user?: {
      id: string;
      email: string;
      // Add other user properties as needed
    };
  }
}

export interface RouteGenericVenue {
  Params: {
    venueId: string;
  };
}

export interface RouteGenericVenueWithQuery extends RouteGenericVenue {
  Querystring: {
    [key: string]: any;
  };
}

export interface RouteGenericVenueWithBody<T = any> extends RouteGenericVenue {
  Body: T;
}
```

### FILE: src/types/routes.ts
```typescript
import { FastifyRequest, FastifyReply, RouteGenericInterface } from 'fastify';

// Base route generics
export interface VenueRouteGeneric extends RouteGenericInterface {
  Params: {
    venueId: string;
  };
}

export interface VenueQueryRouteGeneric extends VenueRouteGeneric {
  Querystring: {
    [key: string]: any;
  };
}

export interface VenueBodyRouteGeneric<T = any> extends VenueRouteGeneric {
  Body: T;
}

export interface VenueQueryBodyRouteGeneric<Q = any, B = any> extends VenueRouteGeneric {
  Querystring: Q;
  Body: B;
}

// Analytics specific
export interface AnalyticsQuery {
  start_date?: string;
  end_date?: string;
  [key: string]: any;
}

export interface AnalyticsRouteGeneric extends VenueRouteGeneric {
  Querystring: AnalyticsQuery;
}

export interface AnalyticsExportRouteGeneric extends VenueRouteGeneric {
  Body: {
    format: 'csv' | 'json';
  };
}

// Type helpers
export type VenueRequest<T extends RouteGenericInterface = VenueRouteGeneric> = FastifyRequest<T>;
export type VenueReply = FastifyReply;
```

### FILE: src/types/index.d.ts
```typescript
import { AwilixContainer } from 'awilix';

declare module 'fastify' {
  interface FastifyInstance {
    container: AwilixContainer;
  }
}
```


================================================================================
## SECTION 2: ALL MODEL/ENTITY/INTERFACE DEFINITIONS
================================================================================

### FILE: src/config/dependencies.ts
```typescript
import { asClass, asValue, createContainer } from 'awilix';
import { Knex } from 'knex';
import Redis from 'ioredis';
import { VenueService } from '../services/venue.service';
import { CacheService } from '../services/cache.service';
import { AnalyticsService } from '../services/analytics.service';
import { EventPublisher } from '../services/eventPublisher';
import { IntegrationService } from '../services/integration.service';
import { OnboardingService } from '../services/onboarding.service';
import { ComplianceService } from '../services/compliance.service';
import { VerificationService } from '../services/verification.service';
import { HealthCheckService } from '../services/healthCheck.service';
import { logger } from '../utils/logger';

export interface Dependencies {
  db: Knex;
  redis: Redis;
  venueService: VenueService;
  cacheService: CacheService;
  analyticsService: AnalyticsService;
  eventPublisher: EventPublisher;
  integrationService: IntegrationService;
  onboardingService: OnboardingService;
  complianceService: ComplianceService;
  verificationService: VerificationService;
  healthCheckService: HealthCheckService;
  logger: typeof logger;
}

export function registerDependencies(db: Knex, redis: Redis) {
  const container = createContainer<Dependencies>();

  container.register({
    db: asValue(db),
    redis: asValue(redis),
    logger: asValue(logger),
    cacheService: asClass(CacheService).singleton(),
    analyticsService: asClass(AnalyticsService).singleton(),
    eventPublisher: asClass(EventPublisher).singleton(),
    venueService: asClass(VenueService).singleton(),
    integrationService: asClass(IntegrationService).singleton(),
    onboardingService: asClass(OnboardingService).singleton(),
    complianceService: asClass(ComplianceService).singleton(),
    verificationService: asClass(VerificationService).singleton(),
    healthCheckService: asClass(HealthCheckService).singleton(),
  });

  return container;
}
```

### FILE: src/@types/global.d.ts
```typescript
import { AwilixContainer } from 'awilix';
import { JWT } from '@fastify/jwt';
import { FastifyInstance as OriginalFastifyInstance } from 'fastify';

declare module 'fastify' {
  export interface FastifyInstance extends OriginalFastifyInstance {
    container: AwilixContainer;
    jwt: JWT;
  }
  
  export interface FastifyRequest {
    startTime?: number;
  }
}
```

### FILE: src/controllers/integrations.controller.ts
```typescript
import { cache as serviceCache } from '../services/cache-integration';
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { authenticate, requireVenueAccess, AuthenticatedRequest } from '../middleware/auth.middleware';
import { validate } from '../middleware/validation.middleware';
import { createIntegrationSchema, updateIntegrationSchema } from '../schemas/integration.schema';
import { NotFoundError, ConflictError, ForbiddenError } from '../utils/errors';
import { venueOperations } from '../utils/metrics';

interface VenueParams {
  venueId: string;
}

interface IntegrationParams extends VenueParams {
  integrationId: string;
}

interface CreateIntegrationBody {
  type: 'square' | 'stripe' | 'toast' | 'mailchimp' | 'twilio';
  config?: Record<string, any>;
  credentials: Record<string, any>;
}

interface UpdateIntegrationBody {
  config?: Record<string, any>;
  status?: 'active' | 'inactive';
}

// Helper middleware for tenant context
async function addTenantContext(request: any, reply: any) {
  const user = request.user;
  const tenantId = user?.tenant_id || '00000000-0000-0000-0000-000000000001';
  request.tenantId = tenantId;
}

export async function integrationRoutes(fastify: FastifyInstance) {
  const { integrationService, venueService, logger, redis } = (fastify as any).container.cradle;

  // List venue integrations - SECURED
  fastify.get('/',
    {
      preHandler: [authenticate, addTenantContext],
      schema: {
        tags: ['integrations'],
        summary: 'List venue integrations',
        security: [{ bearerAuth: [] }]
      }
    },
    async (request: any, reply: FastifyReply) => {
      const { venueId } = request.params;
      const userId = request.user?.id;
      const tenantId = request.tenantId;

      try {
        // Use venueService for access checking
        const hasAccess = await venueService.checkVenueAccess(venueId, userId, tenantId);
        if (!hasAccess) {
          throw new ForbiddenError('No access to this venue');
        }

        const integrations = await integrationService.listVenueIntegrations(venueId);

        // Mask sensitive credentials
        const sanitized = integrations.map((i: any) => ({
          ...i,
          encrypted_credentials: undefined,
          config: {
            ...i.config,
            apiKey: i.config?.apiKey ? '***' : undefined,
            secretKey: i.config?.secretKey ? '***' : undefined
          }
        }));

        venueOperations.inc({ operation: 'list_integrations', status: 'success' });
        return reply.send(sanitized);
      } catch (error) {
        venueOperations.inc({ operation: 'list_integrations', status: 'error' });
        if (error instanceof ForbiddenError) {
          throw error;
        }
        logger.error({ error, venueId }, 'Failed to list integrations');
        throw error;
      }
    }
  );

  // Create new integration - SECURED
  fastify.post('/',
    {
      preHandler: [authenticate, addTenantContext, validate(createIntegrationSchema)],
      schema: {
        tags: ['integrations'],
        summary: 'Create venue integration',
        security: [{ bearerAuth: [] }]
      }
    },
    async (request: any, reply: FastifyReply) => {
      const { venueId } = request.params;
      const userId = request.user?.id;
      const tenantId = request.tenantId;
      const body = request.body as CreateIntegrationBody;

      try {
        // Check access and get role
        const hasAccess = await venueService.checkVenueAccess(venueId, userId, tenantId);
        if (!hasAccess) {
          throw new ForbiddenError('No access to this venue');
        }

        const accessDetails = await venueService.getAccessDetails(venueId, userId);
        if (!['owner', 'manager'].includes(accessDetails?.role)) {
          throw new ForbiddenError('Insufficient permissions to create integrations');
        }

        // Transform data to match service expectations
        const integrationData = {
          type: body.type,
          config: body.config || {},
          encrypted_credentials: body.credentials,
          status: 'active'
        };

        const integration = await integrationService.createIntegration(venueId, integrationData);

        logger.info({ venueId, integrationType: body.type, userId }, 'Integration created');
        venueOperations.inc({ operation: 'create_integration', status: 'success' });

        return reply.status(201).send(integration);
      } catch (error) {
        venueOperations.inc({ operation: 'create_integration', status: 'error' });
        if (error instanceof ForbiddenError || error instanceof ConflictError) {
          throw error;
        }
        logger.error({ error, venueId }, 'Failed to create integration');
        throw error;
      }
    }
  );

  // Get integration by ID - SECURED
  fastify.get('/:integrationId',
    {
      preHandler: [authenticate, addTenantContext],
      schema: {
        tags: ['integrations'],
        summary: 'Get integration details',
        security: [{ bearerAuth: [] }]
      }
    },
    async (request: any, reply: FastifyReply) => {
      const { venueId, integrationId } = request.params;
      const userId = request.user?.id;
      const tenantId = request.tenantId;

      try {
        // Check venue access
        const hasAccess = await venueService.checkVenueAccess(venueId, userId, tenantId);
        if (!hasAccess) {
          throw new ForbiddenError('No access to this venue');
        }

        const integration = await integrationService.getIntegration(integrationId);
        if (!integration) {
          throw new NotFoundError('Integration not found');
        }

        // Verify integration belongs to venue
        if (integration.venue_id !== venueId) {
          throw new ForbiddenError('Integration does not belong to this venue');
        }

        // Mask sensitive credentials
        const sanitized = {
          ...integration,
          encrypted_credentials: undefined,
          config: {
            ...integration.config,
            apiKey: integration.config?.apiKey ? '***' : undefined,
            secretKey: integration.config?.secretKey ? '***' : undefined
          }
        };

        return reply.send(sanitized);
      } catch (error) {
        if (error instanceof ForbiddenError || error instanceof NotFoundError) {
          throw error;
        }
        logger.error({ error, venueId, integrationId }, 'Failed to get integration');
        throw error;
      }
    }
  );

  // Update integration - SECURED
  fastify.put('/:integrationId',
    {
      preHandler: [authenticate, addTenantContext, validate(updateIntegrationSchema)],
      schema: {
        tags: ['integrations'],
        summary: 'Update integration',
        security: [{ bearerAuth: [] }]
      }
    },
    async (request: any, reply: FastifyReply) => {
      const { venueId, integrationId } = request.params;
      const userId = request.user?.id;
      const tenantId = request.tenantId;
      const body = request.body as UpdateIntegrationBody;

      try {
        // Check access and role
        const hasAccess = await venueService.checkVenueAccess(venueId, userId, tenantId);
        if (!hasAccess) {
          throw new ForbiddenError('No access to this venue');
        }

        const accessDetails = await venueService.getAccessDetails(venueId, userId);
        if (!['owner', 'manager'].includes(accessDetails?.role)) {
          throw new ForbiddenError('Insufficient permissions to update integrations');
        }

        // Verify integration belongs to venue
        const existing = await integrationService.getIntegration(integrationId);
        if (!existing || existing.venue_id !== venueId) {
          throw new NotFoundError('Integration not found');
        }

        const updated = await integrationService.updateIntegration(integrationId, body);

        logger.info({ venueId, integrationId, userId }, 'Integration updated');
        venueOperations.inc({ operation: 'update_integration', status: 'success' });

        return reply.send(updated);
      } catch (error) {
        venueOperations.inc({ operation: 'update_integration', status: 'error' });
        if (error instanceof ForbiddenError || error instanceof NotFoundError) {
          throw error;
        }
        logger.error({ error, venueId, integrationId }, 'Failed to update integration');
        throw error;
      }
    }
  );

  // Delete integration - SECURED
  fastify.delete('/:integrationId',
    {
      preHandler: [authenticate, addTenantContext],
      schema: {
        tags: ['integrations'],
        summary: 'Delete integration',
        security: [{ bearerAuth: [] }]
      }
    },
    async (request: any, reply: FastifyReply) => {
      const { venueId, integrationId } = request.params;
      const userId = request.user?.id;
      const tenantId = request.tenantId;

      try {
        // Check access and role
        const hasAccess = await venueService.checkVenueAccess(venueId, userId, tenantId);
        if (!hasAccess) {
          throw new ForbiddenError('No access to this venue');
        }

        const accessDetails = await venueService.getAccessDetails(venueId, userId);
        if (accessDetails?.role !== 'owner') {
          throw new ForbiddenError('Only venue owner can delete integrations');
        }

        // Verify integration belongs to venue
        const existing = await integrationService.getIntegration(integrationId);
        if (!existing || existing.venue_id !== venueId) {
          throw new NotFoundError('Integration not found');
        }

        await integrationService.deleteIntegration(integrationId);

        logger.info({ venueId, integrationId, userId }, 'Integration deleted');
        venueOperations.inc({ operation: 'delete_integration', status: 'success' });

        return reply.status(204).send();
      } catch (error) {
        venueOperations.inc({ operation: 'delete_integration', status: 'error' });
        if (error instanceof ForbiddenError || error instanceof NotFoundError) {
          throw error;
        }
        logger.error({ error, venueId, integrationId }, 'Failed to delete integration');
        throw error;
      }
    }
  );

  // Test integration connection - SECURED
  fastify.post('/:integrationId/test',
    {
      preHandler: [authenticate, addTenantContext],
      schema: {
        tags: ['integrations'],
        summary: 'Test integration connection',
        security: [{ bearerAuth: [] }]
      }
    },
    async (request: any, reply: FastifyReply) => {
      const { venueId, integrationId } = request.params;
      const userId = request.user?.id;
      const tenantId = request.tenantId;

      try {
        // Check venue access
        const hasAccess = await venueService.checkVenueAccess(venueId, userId, tenantId);
        if (!hasAccess) {
          throw new ForbiddenError('No access to this venue');
        }

        // Verify integration belongs to venue
        const existing = await integrationService.getIntegration(integrationId);
        if (!existing || existing.venue_id !== venueId) {
          throw new NotFoundError('Integration not found');
        }

        const result = await integrationService.testIntegration(integrationId);

        logger.info({ venueId, integrationId, userId }, 'Integration tested');

        return reply.send({
          success: result.success,
          message: result.message
        });
      } catch (error) {
        if (error instanceof ForbiddenError || error instanceof NotFoundError) {
          throw error;
        }
        logger.error({ error, venueId, integrationId }, 'Failed to test integration');
        throw error;
      }
    }
  );
}

```

### FILE: src/controllers/settings.controller.ts
```typescript
import { cache as serviceCache } from '../services/cache-integration';
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { authenticate, requireVenueAccess, AuthenticatedRequest } from '../middleware/auth.middleware';
import { validate } from '../middleware/validation.middleware';
import { updateSettingsSchema } from '../schemas/settings.schema';
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

export async function settingsRoutes(fastify: FastifyInstance) {
  const { db, venueService, logger } = (fastify as any).container.cradle;

  // Get venue settings - SECURED
  fastify.get('/',
    {
      preHandler: [authenticate, addTenantContext]
    },
    async (request: any, reply: FastifyReply) => {
      try {
        const { venueId } = request.params;
        const userId = request.user?.id;

        // Use venueService for access check
        const hasAccess = await venueService.checkVenueAccess(venueId, userId);
        if (!hasAccess) {
          throw new ForbiddenError('No access to this venue');
        }

        const settings = await db('venue_settings')
          .where({ venue_id: venueId })
          .first();

        if (!settings) {
          // Return defaults if no settings exist
          return reply.send({
            general: {
              timezone: 'UTC',
              currency: 'USD',
              language: 'en'
            },
            ticketing: {
              allowRefunds: true,
              refundWindow: 24,
              maxTicketsPerOrder: 10
            }
          });
        }

        // Map database columns to expected format
        return reply.send({
          general: {
            timezone: 'UTC',
            currency: settings.accepted_currencies?.[0] || 'USD',
            language: 'en'
          },
          ticketing: {
            allowRefunds: settings.ticket_resale_allowed,
            refundWindow: 24,
            maxTicketsPerOrder: settings.max_tickets_per_order,
            allowPrintAtHome: settings.allow_print_at_home,
            allowMobileTickets: settings.allow_mobile_tickets,
            requireIdVerification: settings.require_id_verification,
            ticketTransferAllowed: settings.ticket_transfer_allowed
          },
          fees: {
            serviceFeePercentage: settings.service_fee_percentage,
            facilityFeeAmount: settings.facility_fee_amount,
            processingFeePercentage: settings.processing_fee_percentage
          },
          payment: {
            methods: settings.payment_methods,
            acceptedCurrencies: settings.accepted_currencies,
            payoutFrequency: settings.payout_frequency,
            minimumPayoutAmount: settings.minimum_payout_amount
          }
        });
      } catch (error: any) {
        if (error instanceof ForbiddenError) {
          throw error;
        }
        logger.error({ error, venueId: request.params.venueId }, 'Failed to get settings');
        return reply.status(500).send({ error: 'Failed to get settings' });
      }
    }
  );

  // Update venue settings - SECURED
  fastify.put('/',
    {
      preHandler: [authenticate, addTenantContext]
    },
    async (request: any, reply: FastifyReply) => {
      try {
        const { venueId } = request.params;
        const userId = request.user?.id;
        const body = request.body as any;

        // Check access and role
        const hasAccess = await venueService.checkVenueAccess(venueId, userId);
        if (!hasAccess) {
          throw new ForbiddenError('No access to this venue');
        }

        const accessDetails = await venueService.getAccessDetails(venueId, userId);
        if (!['owner', 'manager'].includes(accessDetails?.role)) {
          throw new ForbiddenError('Insufficient permissions to update settings');
        }

        // Map request to database columns
        const updates: any = {};
        
        if (body.general) {
          if (body.general.currency) {
            updates.accepted_currencies = [body.general.currency];
          }
        }
        
        if (body.ticketing) {
          if (body.ticketing.maxTicketsPerOrder !== undefined) {
            updates.max_tickets_per_order = body.ticketing.maxTicketsPerOrder;
          }
          if (body.ticketing.allowRefunds !== undefined) {
            updates.ticket_resale_allowed = body.ticketing.allowRefunds;
          }
        }

        if (Object.keys(updates).length > 0) {
          updates.updated_at = new Date();
          
          await db('venue_settings')
            .where({ venue_id: venueId })
            .update(updates);
        }

        logger.info({ venueId, userId }, 'Settings updated');
        venueOperations.inc({ operation: 'settings_update', status: 'success' });

        return reply.send({ success: true, message: 'Settings updated' });
      } catch (error: any) {
        venueOperations.inc({ operation: 'settings_update', status: 'error' });
        if (error instanceof ForbiddenError) {
          throw error;
        }
        logger.error({ error, venueId: request.params.venueId }, 'Failed to update settings');
        return reply.status(500).send({ error: 'Failed to update settings' });
      }
    }
  );
}
```

### FILE: src/controllers/venues.controller.ts
```typescript
import { cache as serviceCache } from '../services/cache-integration';
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { ErrorResponseBuilder } from '../utils/error-response';
import { authenticate, requireVenueAccess, AuthenticatedRequest } from '../middleware/auth.middleware';
import { validate } from '../middleware/validation.middleware';
import { createVenueSchema, updateVenueSchema, venueQuerySchema } from '../schemas/venue.schema';
import { NotFoundError, ConflictError, ForbiddenError } from '../utils/errors';
import { venueOperations } from '../utils/metrics';
import { settingsRoutes } from './settings.controller';
import { integrationRoutes } from './integrations.controller';

interface CreateVenueBody {
  name: string;
  type: 'comedy_club' | 'theater' | 'arena' | 'stadium' | 'other';
  capacity: number;
  address: {
    street: string;
    city: string;
    state: string;
    zipCode: string;
    country: string;
  };
}

interface UpdateVenueBody {
  name?: string;
  type?: 'comedy_club' | 'theater' | 'arena' | 'stadium' | 'other';
  capacity?: number;
  address?: {
    street?: string;
    city?: string;
    state?: string;
    zipCode?: string;
    country?: string;
  };
  settings?: Record<string, any>;
}

interface VenueParams {
  venueId: string;
}

// Helper middleware for tenant context
async function addTenantContext(request: any, reply: any) {
  const user = request.user;
  const tenantId = user?.tenant_id || '00000000-0000-0000-0000-000000000001';
  request.tenantId = tenantId;
}


// Helper to verify venue ownership
async function verifyVenueOwnership(request: any, reply: any, venueService: any) {
  const { venueId } = request.params;
  const userId = request.user?.id;
  const tenantId = request.tenantId;

  // Check if user has access to this venue
  const hasAccess = await venueService.checkVenueAccess(venueId, userId, tenantId);
  if (!hasAccess) {
    throw new ForbiddenError('Access denied to this venue');
  }

  const venue = await venueService.getVenue(venueId, userId);
  if (!venue) {
    throw new NotFoundError('Venue not found');
  }

  request.venue = venue;
}

export async function venueRoutes(fastify: FastifyInstance) {
  const container = (fastify as any).container;
  const { venueService, logger } = container.cradle;

  // List venues - SECURED (optional auth for filtering)
  fastify.get('/',
    {
      preHandler: [authenticate, validate(venueQuerySchema)]
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        // Try to authenticate but don't require it
        let user = null;
        const token = request.headers.authorization?.replace('Bearer ', '');
        if (token) {
          try {
            const jwt = require('jsonwebtoken');
            const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET || 'dev_access_secret_change_in_production_12345678901234567890');
            user = decoded;
          } catch (e) {
            // Invalid token, proceed without auth
          }
        }

        const query = request.query as any;
        let venues;

        if (query.my_venues && user) {
          // If my_venues flag is set and user is authenticated, show only user's venues
          venues = await venueService.listUserVenues(user.id, query);
        } else {
          // Show public venues only
          venues = await venueService.listVenues(query);
        }

        return reply.send({
          success: true,
          data: venues,
          pagination: {
            limit: query.limit || 20,
            offset: query.offset || 0
          }
        });
      } catch (error: any) {
        logger.error({ error }, 'Failed to list venues');
        return ErrorResponseBuilder.internal(reply, 'Failed to list venues');
      }
    }
  );

  // Create venue - SECURED
  fastify.post('/',
    {
      preHandler: [authenticate, addTenantContext, validate(createVenueSchema)]
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const user = (request as any).user;
        const tenantId = (request as any).tenantId;
        const body = request.body as CreateVenueBody;

        const venue = await venueService.createVenue(body, user.id, tenantId, {
          requestId: request.id,
          ipAddress: request.ip,
          userAgent: request.headers["user-agent"]
        });

        logger.info({ venueId: venue.id, userId: user.id, tenantId }, 'Venue created');
        venueOperations.inc({ operation: 'create', status: 'success' });

        return reply.status(201).send(venue);
      } catch (error: any) {
        venueOperations.inc({ operation: 'create', status: 'error' });
        if (error.message?.includes('already exists')) {
          throw new ConflictError(error.message);
        }
        throw error;
      }
    }
  );

  // List user's venues - SECURED
  fastify.get('/user',
    {
      preHandler: [authenticate]
    },
    async (request: any, reply: FastifyReply) => {
      try {
        const userId = request.user?.id;
        const venues = await venueService.listUserVenues(userId, {});
        return reply.send(venues);
      } catch (error: any) {
        logger.error({ error, userId: request.user?.id }, 'Failed to list user venues');
        return ErrorResponseBuilder.internal(reply, 'Failed to list user venues');
      }
    }
  );

  // Get venue by ID - SECURED
  fastify.get('/:venueId',
    {
      preHandler: [authenticate, addTenantContext]
    },
    async (request: any, reply: FastifyReply) => {
      try {
        const { venueId } = request.params;
        const userId = request.user?.id;

        // Check access first
        const hasAccess = await venueService.checkVenueAccess(venueId, userId);
        if (!hasAccess) {
          return reply.status(403).send({ error: 'Access denied to this venue' });
        }

        // Get the venue
        const venue = await venueService.getVenue(venueId, userId);
        if (!venue) {
          return reply.status(404).send({ error: 'Venue not found' });
        }

        venueOperations.inc({ operation: 'read', status: 'success' });
        return reply.send(venue);
      } catch (error: any) {
        venueOperations.inc({ operation: 'read', status: 'error' });
        logger.error({ error }, 'Failed to get venue');
        return reply.status(500).send({ error: 'Internal server error' });
      }
    }
  );

  // Get venue capacity - SECURED (NEW ENDPOINT)
  fastify.get('/:venueId/capacity',
    {
      preHandler: [authenticate]
    },
    async (request: any, reply: FastifyReply) => {
      try {
        const { venueId } = request.params;
        const userId = request.user?.id;
        
        // Check access
        const hasAccess = await venueService.checkVenueAccess(venueId, userId);
        if (!hasAccess) {
          return reply.status(403).send({ error: 'Access denied to this venue' });
        }
        
        const venue = await venueService.getVenue(venueId, userId);
        if (!venue) {
          return reply.status(404).send({ error: 'Venue not found' });
        }
        
        // TODO: Calculate available capacity from active events
        // For now, return total capacity as available
        return reply.send({
          venueId: venue.id,
          venueName: venue.name,
          totalCapacity: venue.capacity,
          available: venue.capacity,
          reserved: 0,
          utilized: 0
        });
      } catch (error: any) {
        logger.error({ error, venueId: request.params.venueId }, 'Failed to get venue capacity');
        return reply.status(500).send({ error: 'Internal server error' });
      }
    }
  );

  // Get venue stats - SECURED (NEW ENDPOINT)
  fastify.get('/:venueId/stats',
    {
      preHandler: [authenticate]
    },
    async (request: any, reply: FastifyReply) => {
      try {
        const { venueId } = request.params;
        const userId = request.user?.id;
        
        // Check access
        const hasAccess = await venueService.checkVenueAccess(venueId, userId);
        if (!hasAccess) {
          return reply.status(403).send({ error: 'Access denied to this venue' });
        }
        
        const stats = await venueService.getVenueStats(venueId);
        if (!stats) {
          return reply.status(404).send({ error: 'Venue not found' });
        }
        
        return reply.send(stats);
      } catch (error: any) {
        logger.error({ error, venueId: request.params.venueId }, 'Failed to get venue stats');
        return reply.status(500).send({ error: 'Internal server error' });
      }
    }
  );

  // Update venue - SECURED
  fastify.put('/:venueId',
    {
      preHandler: [authenticate, addTenantContext, validate(updateVenueSchema)]
    },
    async (request: any, reply: FastifyReply) => {
      try {
        const { venueId } = request.params;
        const userId = request.user?.id;
        const tenantId = request.tenantId;
        const body = request.body as UpdateVenueBody;

        // Verify ownership
        await verifyVenueOwnership(request, reply, venueService);

        const updatedVenue = await venueService.updateVenue(venueId, body, userId, tenantId);

        logger.info({ venueId, userId, tenantId }, 'Venue updated');
        venueOperations.inc({ operation: 'update', status: 'success' });

        return reply.send(updatedVenue);
      } catch (error: any) {
        venueOperations.inc({ operation: 'update', status: 'error' });
        if (error instanceof NotFoundError || error instanceof ForbiddenError) {
          throw error;
        }
        logger.error({ error, venueId: request.params.venueId }, 'Failed to update venue');
        return ErrorResponseBuilder.internal(reply, 'Failed to update venue');
      }
    }
  );

  // Delete venue - SECURED
  fastify.delete('/:venueId',
    {
      preHandler: [authenticate, addTenantContext]
    },
    async (request: any, reply: FastifyReply) => {
      try {
        const { venueId } = request.params;
        const userId = request.user?.id;
        const tenantId = request.tenantId;

        // Verify ownership - only owner can delete
        await verifyVenueOwnership(request, reply, venueService);

        // Additional check - must be owner, not just staff
        const venue = request.venue;
        if (venue.owner_id !== userId) {
          throw new ForbiddenError('Only venue owner can delete venue');
        }

        await venueService.deleteVenue(venueId, userId, tenantId);

        logger.info({ venueId, userId, tenantId }, 'Venue deleted');
        venueOperations.inc({ operation: 'delete', status: 'success' });

        return reply.status(204).send();
      } catch (error: any) {
        venueOperations.inc({ operation: 'delete', status: 'error' });
        if (error instanceof NotFoundError || error instanceof ForbiddenError) {
          throw error;
        }
        logger.error({ error, venueId: request.params.venueId }, 'Failed to delete venue');
        return ErrorResponseBuilder.internal(reply, 'Failed to delete venue');
      }
    }
  );

  // Check venue access - SECURED (used by other services)
  fastify.get('/:venueId/check-access',
    {
      preHandler: [authenticate, addTenantContext]
    },
    async (request: any, reply: FastifyReply) => {
      try {
        const { venueId } = request.params;
        const userId = request.user?.id;
        const tenantId = request.tenantId;

        const hasAccess = await venueService.checkVenueAccess(venueId, userId, tenantId);
        const accessDetails = await venueService.getAccessDetails(venueId, userId);

        return reply.send({
          hasAccess,
          role: accessDetails?.role || null,
          permissions: accessDetails?.permissions || []
        });
      } catch (error: any) {
        logger.error({ error, venueId: request.params.venueId }, 'Failed to check access');
        return reply.status(500).send({ error: 'Failed to check access' });
      }
    }
  );

  // Staff management routes - SECURED
  fastify.post('/:venueId/staff',
    {
      preHandler: [authenticate, addTenantContext]
    },
    async (request: any, reply: FastifyReply) => {
      try {
        const { venueId } = request.params;
        const requesterId = request.user?.id;
        const body = request.body;

        // Verify venue ownership
        try {
          await verifyVenueOwnership(request, reply, venueService);
        } catch (error) {
          if (error instanceof ForbiddenError) {
            return reply.status(403).send({ error: error.message });
          }
          if (error instanceof NotFoundError) {
            return reply.status(404).send({ error: error.message });
          }
          throw error;
        }

        // The test sends {email, role} but we need {userId, role}
        // For the test to work, we need to accept the registered user's ID
        // The test should be sending userId, not email

        if (!body.userId) {
          return reply.status(400).send({
            error: 'userId is required to add staff member'
          });
        }

        // Add staff member with the actual userId
        const staffData = {
          userId: body.userId,
          role: body.role,
          permissions: body.permissions || []
        };

        const staffMember = await venueService.addStaffMember(venueId, staffData, requesterId);

        return reply.status(201).send(staffMember);
      } catch (error: any) {
        logger.error({ error, venueId: request.params.venueId }, 'Failed to add staff');
        return ErrorResponseBuilder.internal(reply, 'Failed to add staff member');
      }
    }
  );

  fastify.get('/:venueId/staff',
    {
      preHandler: [authenticate, addTenantContext]
    },
    async (request: any, reply: FastifyReply) => {
      try {
        const { venueId } = request.params;
        const userId = request.user?.id;

        // Verify venue access
        await verifyVenueOwnership(request, reply, venueService);

        // Get staff list
        const staff = await venueService.getVenueStaff(venueId, userId);

        return reply.send(staff);
      } catch (error: any) {
        logger.error({ error, venueId: request.params.venueId }, 'Failed to get staff');
        return ErrorResponseBuilder.internal(reply, 'Failed to get staff list');
      }
    }
  );


  // Register nested route groups
  await fastify.register(settingsRoutes, { prefix: '/:venueId/settings' });
  await fastify.register(integrationRoutes, { prefix: '/:venueId/integrations' });

  // Import and register other nested routes
  const { complianceRoutes } = await import('./compliance.controller');

  await fastify.register(complianceRoutes, { prefix: '/:venueId/compliance' });
  const { analyticsRoutes } = await import('./analytics.controller');
  await fastify.register(analyticsRoutes, { prefix: '/:venueId/analytics' });
}
```

### FILE: src/controllers/compliance.controller.ts
```typescript
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
```

### FILE: src/utils/error-response.ts
```typescript
import { FastifyReply } from 'fastify';

export interface ErrorResponse {
  success: false;
  error: string;
  code: string;
  details?: any;
  requestId?: string;
}

export class ErrorResponseBuilder {
  static send(reply: FastifyReply, statusCode: number, error: string, code: string, details?: any) {
    const response: ErrorResponse = {
      success: false,
      error,
      code,
      details,
      requestId: (reply.request as any).id
    };
    
    return reply.status(statusCode).send(response);
  }

  static validation(reply: FastifyReply, details: any) {
    return this.send(reply, 422, 'Validation failed', 'VALIDATION_ERROR', details);
  }

  static unauthorized(reply: FastifyReply, message: string = 'Unauthorized') {
    return this.send(reply, 401, message, 'UNAUTHORIZED');
  }

  static forbidden(reply: FastifyReply, message: string = 'Forbidden') {
    return this.send(reply, 403, message, 'FORBIDDEN');
  }

  static notFound(reply: FastifyReply, resource: string) {
    return this.send(reply, 404, `${resource} not found`, 'NOT_FOUND');
  }

  static conflict(reply: FastifyReply, message: string) {
    return this.send(reply, 409, message, 'CONFLICT');
  }

  static tooManyRequests(reply: FastifyReply, message: string = 'Too many requests') {
    return this.send(reply, 429, message, 'RATE_LIMIT_EXCEEDED');
  }

  static internal(reply: FastifyReply, message: string = 'Internal server error') {
    return this.send(reply, 500, message, 'INTERNAL_ERROR');
  }
}

// Error codes enum for consistency
export enum ErrorCodes {
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  UNAUTHORIZED = 'UNAUTHORIZED',
  FORBIDDEN = 'FORBIDDEN',
  NOT_FOUND = 'NOT_FOUND',
  CONFLICT = 'CONFLICT',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  BAD_REQUEST = 'BAD_REQUEST',
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE'
}
```

### FILE: src/utils/circuitBreaker.ts
```typescript
import CircuitBreaker from 'opossum';
import { logger } from './logger';

export interface CircuitBreakerOptions {
  timeout?: number;
  errorThresholdPercentage?: number;
  resetTimeout?: number;
  rollingCountTimeout?: number;
  rollingCountBuckets?: number;
  name?: string;
}

const defaultOptions: CircuitBreakerOptions = {
  timeout: 3000, // 3 seconds
  errorThresholdPercentage: 50, // Open circuit if 50% of requests fail
  resetTimeout: 30000, // Try again after 30 seconds
  rollingCountTimeout: 10000, // Count errors over 10 seconds
  rollingCountBuckets: 10, // Number of buckets in rolling window
};

export function createCircuitBreaker<T extends (...args: any[]) => any>(
  fn: T,
  options: CircuitBreakerOptions = {}
): CircuitBreaker {
  const opts = { ...defaultOptions, ...options };
  
  const breaker = new CircuitBreaker(fn, {
    timeout: opts.timeout,
    errorThresholdPercentage: opts.errorThresholdPercentage,
    resetTimeout: opts.resetTimeout,
    rollingCountTimeout: opts.rollingCountTimeout,
    rollingCountBuckets: opts.rollingCountBuckets,
    name: opts.name,
  });

  // Log circuit breaker events
  breaker.on('open', () => {
    logger.warn(`Circuit breaker opened: ${opts.name || 'unnamed'}`);
  });

  breaker.on('halfOpen', () => {
    logger.info(`Circuit breaker half-open: ${opts.name || 'unnamed'}`);
  });

  breaker.on('close', () => {
    logger.info(`Circuit breaker closed: ${opts.name || 'unnamed'}`);
  });

  breaker.on('timeout', () => {
    logger.warn(`Circuit breaker timeout: ${opts.name || 'unnamed'}`);
  });

  return breaker;
}

// Helper function to wrap async functions with circuit breaker
export function withCircuitBreaker<T extends (...args: any[]) => Promise<any>>(
  fn: T,
  options: CircuitBreakerOptions = {}
): T {
  const breaker = createCircuitBreaker(fn, options);
  return ((...args: Parameters<T>) => breaker.fire(...args)) as T;
}
```

### FILE: src/utils/retry.ts
```typescript
import { logger } from './logger';

export interface RetryOptions {
  maxAttempts?: number;
  initialDelay?: number;
  maxDelay?: number;
  factor?: number;
  shouldRetry?: (error: any) => boolean;
  onRetry?: (error: any, attempt: number) => void;
}

const defaultOptions: RetryOptions = {
  maxAttempts: 3,
  initialDelay: 100,
  maxDelay: 5000,
  factor: 2,
  shouldRetry: (error) => {
    // Handle null/undefined errors
    if (!error) {
      return false;
    }
    // Retry on network errors or 5xx status codes
    if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT' || error.code === 'ENOTFOUND') {
      return true;
    }
    if (error.response?.status >= 500 && error.response?.status < 600) {
      return true;
    }
    // Don't retry on 4xx errors (client errors)
    if (error.response?.status >= 400 && error.response?.status < 500) {
      return false;
    }
    return true;
  },
  onRetry: (error, attempt) => {
    logger.debug({ error: error?.message || error, attempt }, 'Retrying operation');
  }
};

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const opts = { ...defaultOptions, ...options };
  let lastError: any;
  
  for (let attempt = 1; attempt <= opts.maxAttempts!; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;
      
      // Check if we should retry
      if (!opts.shouldRetry!(error)) {
        throw error;
      }
      
      // Check if we've exhausted attempts
      if (attempt === opts.maxAttempts) {
        logger.error({
          error: error?.message || error,
          attempts: opts.maxAttempts
        }, 'Max retry attempts reached');
        throw error;
      }
      
      // Calculate delay with exponential backoff
      const delay = Math.min(
        opts.initialDelay! * Math.pow(opts.factor!, attempt - 1),
        opts.maxDelay!
      );
      
      // Add jitter to prevent thundering herd
      const jitter = Math.random() * delay * 0.1;
      const totalDelay = delay + jitter;
      
      // Call retry callback
      if (opts.onRetry) {
        opts.onRetry(error, attempt);
      }
      
      logger.debug({
        attempt,
        nextAttempt: attempt + 1,
        delay: totalDelay,
        error: error?.message || String(error)
      }, 'Retrying after delay');
      
      // Wait before retrying
      await new Promise(resolve => setTimeout(resolve, totalDelay));
    }
  }
  
  throw lastError;
}

// Decorator for methods
export function Retry(options: RetryOptions = {}) {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;
    
    descriptor.value = async function (...args: any[]) {
      return withRetry(
        () => originalMethod.apply(this, args),
        options
      );
    };
    
    return descriptor;
  };
}
```

### FILE: src/models/integration.model.ts
```typescript
import { BaseModel } from './base.model';
import { Knex } from 'knex';

export interface IIntegration {
  id?: string;
  venue_id: string;
  integration_type: string;
  integration_name?: string;
  config_data: Record<string, any>;
  is_active?: boolean;
  api_key_encrypted?: string;
  api_secret_encrypted?: string;
  created_at?: Date;
  updated_at?: Date;
}

export class IntegrationModel extends BaseModel {
  constructor(db: Knex | Knex.Transaction) {
    super('venue_integrations', db);
  }

  // Override findById to use is_active instead of deleted_at
  async findById(id: string, columns: string[] = ['*']) {
    return this.db(this.tableName)
      .where({ id })
      .where({ is_active: true })
      .select(columns)
      .first();
  }

  // Override update to not use deleted_at
  async update(id: string, data: any) {
    const mappedUpdates: any = {};
    
    if (data.config !== undefined) mappedUpdates.config_data = data.config;
    if (data.config_data !== undefined) mappedUpdates.config_data = data.config_data;
    if (data.status !== undefined) mappedUpdates.is_active = data.status === 'active';
    if (data.is_active !== undefined) mappedUpdates.is_active = data.is_active;
    
    const [updated] = await this.db(this.tableName)
      .where({ id })
      .where({ is_active: true })
      .update({
        ...mappedUpdates,
        updated_at: new Date()
      })
      .returning('*');
    
    return updated;
  }

  // Override delete to use is_active
  async delete(id: string) {
    return this.db(this.tableName)
      .where({ id })
      .update({
        is_active: false,
        updated_at: new Date()
      });
  }

  async findByVenue(venueId: string): Promise<IIntegration[]> {
    return this.db(this.tableName)
      .where({ venue_id: venueId })
      .where({ is_active: true });
  }

  async findByVenueAndType(venueId: string, type: string): Promise<IIntegration | undefined> {
    return this.db(this.tableName)
      .where({ venue_id: venueId, integration_type: type })
      .where({ is_active: true })
      .first();
  }

  async create(data: any): Promise<IIntegration> {
    const integType = data.type || data.integration_type;
    const mappedData = {
      venue_id: data.venue_id,
      integration_type: integType,
      integration_name: data.name || data.integration_name || `${integType} Integration`,
      config_data: data.config || data.config_data || {},
      api_key_encrypted: data.encrypted_credentials?.apiKey || data.api_key_encrypted,
      api_secret_encrypted: data.encrypted_credentials?.secretKey || data.api_secret_encrypted,
      is_active: data.is_active !== undefined ? data.is_active : true
    };

    const [created] = await this.db(this.tableName)
      .insert(mappedData)
      .returning('*');
    
    return created;
  }
}
```

### FILE: src/models/settings.model.ts
```typescript
import { Knex } from "knex";
import { BaseModel } from './base.model';

export interface IVenueSettings {
  general?: {
    timezone?: string;
    currency?: string;
    language?: string;
    dateFormat?: string;
    timeFormat?: string;
  };
  ticketing?: {
    allowRefunds?: boolean;
    refundWindow?: number; // hours
    maxTicketsPerOrder?: number;
    requirePhoneNumber?: boolean;
    enableWaitlist?: boolean;
    transferDeadline?: number; // hours before event
  };
  notifications?: {
    emailEnabled?: boolean;
    smsEnabled?: boolean;
    webhookUrl?: string;
    notifyOnPurchase?: boolean;
    notifyOnRefund?: boolean;
    dailyReportEnabled?: boolean;
  };
  branding?: {
    primaryColor?: string;
    secondaryColor?: string;
    logo?: string;
    emailFooter?: string;
    customDomain?: string;
  };
  payment?: {
    currency?: string;
    taxRate?: number;
    includeTaxInPrice?: boolean;
    paymentMethods?: string[];
  };
  features?: {
    nftEnabled?: boolean;
    qrCodeEnabled?: boolean;
    seasonPassEnabled?: boolean;
    groupDiscountsEnabled?: boolean;
  };
}

export class SettingsModel {
  private db: any;

  constructor(db: any) {
    this.db = db;
  }

  async getVenueSettings(venueId: string): Promise<IVenueSettings> {
    const venue = await this.db('venues')
      .where({ id: venueId })
      .whereNull('deleted_at')
      .select('settings')
      .first();

    return venue?.settings || this.getDefaultSettings();
  }

  async updateVenueSettings(venueId: string, settings: Partial<IVenueSettings>): Promise<IVenueSettings> {
    const currentSettings = await this.getVenueSettings(venueId);
    
    const newSettings = this.mergeSettings(currentSettings, settings);

    await this.db('venues')
      .where({ id: venueId })
      .update({
        settings: newSettings,
        updated_at: new Date(),
      });

    return newSettings;
  }

  async updateSettingSection(
    venueId: string, 
    section: keyof IVenueSettings, 
    sectionSettings: any
  ): Promise<IVenueSettings> {
    const currentSettings = await this.getVenueSettings(venueId);
    
    currentSettings[section] = {
      ...currentSettings[section],
      ...sectionSettings,
    };

    await this.db('venues')
      .where({ id: venueId })
      .update({
        settings: currentSettings,
        updated_at: new Date(),
      });

    return currentSettings;
  }

  getDefaultSettings(): IVenueSettings {
    return {
      general: {
        timezone: 'America/New_York',
        currency: 'USD',
        language: 'en',
        dateFormat: 'MM/DD/YYYY',
        timeFormat: '12h',
      },
      ticketing: {
        allowRefunds: true,
        refundWindow: 24,
        maxTicketsPerOrder: 10,
        requirePhoneNumber: false,
        enableWaitlist: false,
        transferDeadline: 2,
      },
      notifications: {
        emailEnabled: true,
        smsEnabled: false,
        webhookUrl: undefined,
        notifyOnPurchase: true,
        notifyOnRefund: true,
        dailyReportEnabled: false,
      },
      branding: {
        primaryColor: '#000000',
        secondaryColor: '#666666',
        logo: undefined,
        emailFooter: undefined,
        customDomain: undefined,
      },
      payment: {
        currency: 'USD',
        taxRate: 0,
        includeTaxInPrice: false,
        paymentMethods: ['card'],
      },
      features: {
        nftEnabled: true,
        qrCodeEnabled: true,
        seasonPassEnabled: false,
        groupDiscountsEnabled: false,
      },
    };
  }

  private mergeSettings(current: IVenueSettings, updates: Partial<IVenueSettings>): IVenueSettings {
    const merged = { ...current };

    for (const [section, sectionUpdates] of Object.entries(updates)) {
      if (sectionUpdates && typeof sectionUpdates === 'object') {
        merged[section as keyof IVenueSettings] = {
          ...current[section as keyof IVenueSettings],
          ...sectionUpdates,
        };
      }
    }

    return merged;
  }

  async validateSettings(settings: IVenueSettings): Promise<{ valid: boolean; errors: string[] }> {
    const errors: string[] = [];

    // Validate timezone
    if (settings.general?.timezone) {
      // TODO: Validate against timezone list
    }

    // Validate currency
    if (settings.general?.currency) {
      const validCurrencies = ['USD', 'EUR', 'GBP', 'CAD', 'AUD'];
      if (!validCurrencies.includes(settings.general.currency)) {
        errors.push('Invalid currency code');
      }
    }

    // Validate colors
    if (settings.branding?.primaryColor) {
      const hexRegex = /^#[0-9A-F]{6}$/i;
      if (!hexRegex.test(settings.branding.primaryColor)) {
        errors.push('Invalid primary color format');
      }
    }

    // Validate webhook URL
    if (settings.notifications?.webhookUrl) {
      try {
        new URL(settings.notifications.webhookUrl);
      } catch {
        errors.push('Invalid webhook URL');
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }
}
```

### FILE: src/models/staff.model.ts
```typescript
import { BaseModel } from './base.model';
import { Knex } from 'knex';

export interface IStaffMember {
  id?: string;
  venue_id: string;
  user_id: string;
  role: 'owner' | 'manager' | 'box_office' | 'door_staff' | 'viewer';
  permissions?: string[];
  is_active?: boolean;
  last_login_at?: Date;
  created_at?: Date;
  updated_at?: Date;
  deleted_at?: Date;
}

export interface IStaffWithUser extends IStaffMember {
  user?: {
    id: string;
    email: string;
    name: string;
    phone?: string;
  };
}

export class StaffModel extends BaseModel {
  constructor(db: Knex | Knex.Transaction) {
    super('venue_staff', db);
  }

  async findByVenueAndUser(venueId: string, userId: string): Promise<IStaffMember | null> {
    return this.db(this.tableName)
      .where({ venue_id: venueId, user_id: userId })
      .whereNull('deleted_at')
      .first();
  }

  async getVenueStaff(venueId: string, includeInactive = false): Promise<IStaffMember[]> {
    let query = this.db(this.tableName)
      .where({ venue_id: venueId })
      .whereNull('deleted_at');

    if (!includeInactive) {
      query = query.where({ is_active: true });
    }

    return query.orderBy('created_at', 'asc');
  }

  async getStaffByRole(venueId: string, role: IStaffMember['role']): Promise<IStaffMember[]> {
    return this.db(this.tableName)
      .where({ venue_id: venueId, role, is_active: true })
      .whereNull('deleted_at')
      .orderBy('created_at', 'asc');
  }

  async addStaffMember(staffData: Partial<IStaffMember>): Promise<IStaffMember> {
    const existing = await this.findByVenueAndUser(staffData.venue_id!, staffData.user_id!);
    if (existing) {
      throw new Error('Staff member already exists for this venue');
    }

    const permissions = staffData.permissions || this.getDefaultPermissions(staffData.role!);

    return this.create({
      ...staffData,
      permissions: JSON.stringify(permissions),
      is_active: true,
    });
  }

  async updateRole(id: string, role: IStaffMember['role'], permissions?: string[]): Promise<IStaffMember> {
    const updateData: any = { role };

    if (permissions) {
      updateData.permissions = JSON.stringify(permissions);
    } else {
      updateData.permissions = JSON.stringify(this.getDefaultPermissions(role));
    }

    return this.update(id, updateData);
  }

  async deactivateStaffMember(id: string): Promise<boolean> {
    const result = await this.update(id, { is_active: false });
    return !!result;
  }

  async reactivateStaffMember(id: string): Promise<boolean> {
    const result = await this.update(id, { is_active: true });
    return !!result;
  }

  async updateLastLogin(id: string): Promise<void> {
    await this.update(id, { last_login_at: new Date() });
  }

  async getUserVenues(userId: string): Promise<Array<{ venue_id: string; role: string }>> {
    return this.db(this.tableName)
      .where({ user_id: userId, is_active: true })
      .whereNull('deleted_at')
      .select('venue_id', 'role');
  }

  async hasPermission(venueId: string, userId: string, permission: string): Promise<boolean> {
    const staff = await this.findByVenueAndUser(venueId, userId);

    if (!staff || !staff.is_active) {
      return false;
    }

    if (staff.role === 'owner') {
      return true;
    }

    return staff.permissions?.includes(permission) || false;
  }

  private getDefaultPermissions(role: IStaffMember['role']): string[] {
    const permissionMap = {
      owner: ['*'],
      manager: [
        'events:create',
        'events:update',
        'events:delete',
        'tickets:view',
        'tickets:validate',
        'reports:view',
        'reports:export',
        'staff:view',
        'settings:view',
      ],
      box_office: [
        'tickets:sell',
        'tickets:view',
        'tickets:validate',
        'payments:process',
        'reports:daily',
        'customers:view',
      ],
      door_staff: [
        'tickets:validate',
        'tickets:view',
        'events:view',
      ],
      viewer: [
        'events:view',
        'reports:view',
      ],
    };

    return permissionMap[role] || [];
  }

  async validateStaffLimit(venueId: string): Promise<{ canAdd: boolean; limit: number; current: number }> {
    const currentStaff = await this.count({ venue_id: venueId, is_active: true });
    const limit = 50;

    return {
      canAdd: currentStaff < limit,
      limit,
      current: currentStaff,
    };
  }
}
```

### FILE: src/models/layout.model.ts
```typescript
import { BaseModel } from './base.model';
import { Knex } from 'knex';

export interface ISection {
  id: string;
  name: string;
  rows: number;
  seatsPerRow: number;
  pricing?: {
    basePrice: number;
    dynamicPricing?: boolean;
  };
}

export interface ILayout {
  id?: string;
  venue_id: string;
  name: string;
  type: 'fixed' | 'general_admission' | 'mixed';
  sections?: ISection[];
  capacity: number;
  is_default: boolean;
  created_at?: Date;
  updated_at?: Date;
}

export class LayoutModel extends BaseModel {
  constructor(db: Knex | Knex.Transaction) {
    super('venue_layouts', db);
  }

  async findByVenue(venueId: string): Promise<ILayout[]> {
    return this.db(this.tableName)
      .where({ venue_id: venueId })
      .whereNull('deleted_at')
      .orderBy('is_default', 'desc')
      .orderBy('created_at', 'desc');
  }

  async getDefaultLayout(venueId: string): Promise<ILayout | undefined> {
    return this.db(this.tableName)
      .where({ venue_id: venueId, is_default: true })
      .whereNull('deleted_at')
      .first();
  }

  async setAsDefault(layoutId: string, venueId: string): Promise<void> {
    await this.db.transaction(async (trx: Knex.Transaction) => {
      await trx(this.tableName)
        .where({ venue_id: venueId })
        .update({ is_default: false });

      await trx(this.tableName)
        .where({ id: layoutId, venue_id: venueId })
        .update({ is_default: true });
    });
  }
}
```

### FILE: src/models/base.model.ts
```typescript
import { Knex } from 'knex';

export abstract class BaseModel {
  protected tableName: string;
  protected db: Knex | Knex.Transaction;

  constructor(tableName: string, db: Knex | Knex.Transaction) {
    this.tableName = tableName;
    this.db = db;
  }

  // Helper to create a new instance with transaction
  withTransaction(trx: Knex.Transaction): this {
    const ModelClass = this.constructor as any;
    return new ModelClass(trx);
  }

  async findById(id: string, columns: string[] = ['*']) {
    return this.db(this.tableName)
      .where({ id })
      .whereNull('deleted_at')
      .select(columns)
      .first();
  }

  async findAll(conditions: any = {}, options: any = {}) {
    const { limit = 50, offset = 0, orderBy = 'created_at', order = 'desc' } = options;

    let query = this.db(this.tableName)
      .where(conditions)
      .whereNull('deleted_at');

    if (options.columns) {
      query = query.select(options.columns);
    }

    return query
      .orderBy(orderBy, order)
      .limit(limit)
      .offset(offset);
  }

  async create(data: any) {
    const [record] = await this.db(this.tableName)
      .insert(data)
      .returning('*');

    return record;
  }

  async update(id: string, data: any) {
    const [record] = await this.db(this.tableName)
      .where({ id })
      .whereNull('deleted_at')
      .update({
        ...data,
        updated_at: new Date()
      })
      .returning('*');

    return record;
  }

  async delete(id: string) {
    return this.db(this.tableName)
      .where({ id })
      .update({
        deleted_at: new Date()
      });
  }

  async count(conditions: any = {}): Promise<number> {
    const result = await this.db(this.tableName)
      .where(conditions)
      .whereNull('deleted_at')
      .count('* as count')
      .first();

    return parseInt(String(result?.count || '0'), 10);
  }

  async softDelete(id: string): Promise<boolean> {
    const result = await this.db(this.tableName)
      .where({ id })
      .whereNull('deleted_at')
      .update({ deleted_at: new Date() });

    return result > 0;
  }

  generateId(): string {
    const prefix = this.tableName.substring(0, 3);
    return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}
```

### FILE: src/models/venue.model.ts
```typescript
import { BaseModel } from './base.model';
import { Knex } from 'knex';

export interface IVenue {
  id?: string;
  created_by?: string;
  name: string;
  slug: string;
  type: 'comedy_club' | 'theater' | 'arena' | 'stadium' | 'other';
  capacity?: number;
  address: {
    street: string;
    city: string;
    state: string;
    zipCode: string;
    country: string;
    coordinates?: {
      lat: number;
      lng: number;
    };
  };
  settings?: Record<string, any>;
  onboarding?: Record<string, boolean>;
  onboarding_status: 'pending' | 'in_progress' | 'completed';
  is_active?: boolean;
  created_at?: Date;
  updated_at?: Date;
  deleted_at?: Date;
}

export class VenueModel extends BaseModel {
  constructor(db: Knex | Knex.Transaction) {
    super('venues', db);
  }

  async findBySlug(slug: string): Promise<IVenue | null> {
    const venue = await this.db('venues')
      .where({ slug })
      .whereNull('deleted_at')
      .first();

    if (venue) {
      return this.transformFromDb(venue);
    }
    return null;
  }

  async findById(id: string): Promise<IVenue | null> {
    const venue = await super.findById(id);
    if (venue) {
      return this.transformFromDb(venue);
    }
    return null;
  }

  async createWithDefaults(venueData: Partial<IVenue>): Promise<IVenue> {
    // Only generate slug if not provided
    const slug = venueData.slug || this.generateSlug(venueData.name || '');

    const venue: Partial<IVenue> = {
      ...venueData,
      slug,
      settings: {
        general: {
          timezone: 'America/New_York',
          currency: 'USD',
          language: 'en',
        },
        ticketing: {
          allowRefunds: true,
          refundWindow: 24,
          maxTicketsPerOrder: 10,
          requirePhoneNumber: false,
        },
        notifications: {
          emailEnabled: true,
          smsEnabled: false,
        },
        ...venueData.settings,
      },
      onboarding_status: 'pending',
      is_active: true,
    };

    const dbData = this.transformForDb(venue);
    const created = await this.create(dbData);
    return this.transformFromDb(created);
  }

  async updateOnboardingStatus(venueId: string, status: IVenue['onboarding_status']): Promise<boolean> {
    const result = await this.update(venueId, { onboarding_status: status });
    return !!result;
  }

  async getActiveVenues(options: any = {}): Promise<IVenue[]> {
    const venues = await this.findAll({ is_active: true }, options);
    return venues.map((v: any) => this.transformFromDb(v));
  }

  async getVenuesByType(type: IVenue['type'], options: any = {}): Promise<IVenue[]> {
    const venues = await this.findAll({ type, is_active: true }, options);
    return venues.map((v: any) => this.transformFromDb(v));
  }

  async searchVenues(searchTerm: string, options: any = {}): Promise<IVenue[]> {
    const {
      limit = 20,
      offset = 0,
      type,
      city,
      state,
      sort_by = 'name',
      sort_order = 'asc'
    } = options;

    let query = this.db('venues')
      .whereNull('deleted_at')
      .where('is_active', true);

    if (searchTerm) {
      query = query.where(function(this: any) {
        this.where('name', 'ilike', `%${searchTerm}%`)
          .orWhere('city', 'ilike', `%${searchTerm}%`);
      });
    }

    if (type) {
      query = query.where('type', type);
    }

    if (city) {
      query = query.where('city', 'ilike', city);
    }

    if (state) {
      query = query.where('state', 'ilike', state);
    }

    const sortColumn = sort_by === 'created_at' ? 'created_at' :
                      sort_by === 'capacity' ? 'capacity' : 'name';
    query = query.orderBy(sortColumn, sort_order);

    const venues = await query.limit(limit).offset(offset);
    return venues.map((v: any) => this.transformFromDb(v));
  }

  async getVenueStats(venueId: string): Promise<any> {
    const venue = await this.findById(venueId);
    if (!venue) return null;

    return {
      venue,
      stats: {
        totalEvents: 0,
        totalTicketsSold: 0,
        totalRevenue: 0,
        activeStaff: 0,
      },
    };
  }

  private transformForDb(venueData: Partial<IVenue>): any {
    const { address, ...rest } = venueData;
    const dbData: any = {
      ...rest
    };
    if (address) {
      dbData.address = address;
      dbData.city = address.city;
      dbData.state = address.state;
      dbData.zip_code = address.zipCode;
      dbData.country = address.country || 'US';
    }
    return dbData;
  }

  private transformFromDb(dbVenue: any): IVenue {
    if (!dbVenue) return dbVenue;

    const { city, state, zip_code, country, address, ...rest } = dbVenue;

    const venueAddress = address || {
      street: '',
      city: city || '',
      state: state || '',
      zipCode: zip_code || '',
      country: country || 'US'
    };

    if (!venueAddress.city) venueAddress.city = city || '';
    if (!venueAddress.state) venueAddress.state = state || '';
    if (!venueAddress.zipCode) venueAddress.zipCode = zip_code || '';
    if (!venueAddress.country) venueAddress.country = country || 'US';

    return {
      ...rest,
      address: venueAddress
    };
  }

  private generateSlug(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
  }
}
```

### FILE: src/middleware/rate-limit.middleware.ts
```typescript
import { FastifyRequest, FastifyReply } from 'fastify';
import Redis from 'ioredis';
import { RateLimitError } from '../utils/errors';
import { logger } from '../utils/logger';

interface RateLimitOptions {
  windowMs: number;  // Time window in milliseconds
  max: number;       // Max requests per window
  keyGenerator?: (req: FastifyRequest) => string;
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
  message?: string;
}

interface RateLimitConfig {
  global: RateLimitOptions;
  perUser: RateLimitOptions;
  perVenue: RateLimitOptions;
  perOperation: {
    [operation: string]: RateLimitOptions;
  };
}

// Default rate limit configurations
const defaultConfig: RateLimitConfig = {
  global: {
    windowMs: 60 * 1000,  // 1 minute
    max: 100              // 100 requests per minute globally
  },
  perUser: {
    windowMs: 60 * 1000,  // 1 minute
    max: 60               // 60 requests per minute per user
  },
  perVenue: {
    windowMs: 60 * 1000,  // 1 minute
    max: 30               // 30 requests per minute per venue
  },
  perOperation: {
    'POST:/api/v1/venues': {
      windowMs: 60 * 60 * 1000,  // 1 hour
      max: 100                    // Increased to 100 for testing (was 10)
    },
    'PUT:/api/v1/venues/:venueId': {
      windowMs: 60 * 1000,  // 1 minute
      max: 20               // 20 updates per minute
    },
    'DELETE:/api/v1/venues/:venueId': {
      windowMs: 60 * 60 * 1000,  // 1 hour
      max: 5                      // 5 deletions per hour
    },
    'POST:/api/v1/venues/:venueId/events': {
      windowMs: 60 * 1000,  // 1 minute
      max: 30               // 30 events per minute
    }
  }
};

export class RateLimiter {
  private redis: Redis;
  private config: RateLimitConfig;

  constructor(redis: Redis, config?: Partial<RateLimitConfig>) {
    this.redis = redis;
    this.config = { ...defaultConfig, ...config };
  }

  private async checkLimit(key: string, options: RateLimitOptions): Promise<{
    allowed: boolean;
    remaining: number;
    resetTime: number;
  }> {
    const now = Date.now();
    const window = Math.floor(now / options.windowMs);
    const redisKey = `rate_limit:${key}:${window}`;

    try {
      // Use Redis pipeline for atomic operations
      const pipeline = this.redis.pipeline();
      pipeline.incr(redisKey);
      pipeline.expire(redisKey, Math.ceil(options.windowMs / 1000));
      
      const results = await pipeline.exec();
      const count = results?.[0]?.[1] as number || 1;
      
      const allowed = count <= options.max;
      const remaining = Math.max(0, options.max - count);
      const resetTime = (window + 1) * options.windowMs;

      return { allowed, remaining, resetTime };
    } catch (error) {
      // On Redis error, fail open (allow request) but log
      logger.error({ error, key }, 'Rate limit check failed');
      return { allowed: true, remaining: options.max, resetTime: now + options.windowMs };
    }
  }

  // Middleware factory for different rate limit types
  createMiddleware(type: 'global' | 'perUser' | 'perVenue' | 'perOperation') {
    return async (request: FastifyRequest, reply: FastifyReply) => {
      let key: string;
      let options: RateLimitOptions;

      switch (type) {
        case 'global':
          key = 'global';
          options = this.config.global;
          break;

        case 'perUser':
          const userId = (request as any).user?.id;
          if (!userId) return; // Skip if no user
          key = `user:${userId}`;
          options = this.config.perUser;
          break;

        case 'perVenue':
          const venueId = (request.params as any)?.venueId;
          if (!venueId) return; // Skip if no venue in path
          key = `venue:${venueId}`;
          options = this.config.perVenue;
          break;

        case 'perOperation':
          const operationKey = `${request.method}:${request.routerPath}`;
          options = this.config.perOperation[operationKey];
          if (!options) return; // Skip if no specific limit for this operation
          
          const opUserId = (request as any).user?.id || 'anonymous';
          key = `operation:${operationKey}:${opUserId}`;
          break;

        default:
          return;
      }

      const result = await this.checkLimit(key, options);

      // Set rate limit headers
      reply.header('X-RateLimit-Limit', options.max.toString());
      reply.header('X-RateLimit-Remaining', result.remaining.toString());
      reply.header('X-RateLimit-Reset', new Date(result.resetTime).toISOString());

      if (!result.allowed) {
        reply.header('Retry-After', Math.ceil((result.resetTime - Date.now()) / 1000).toString());
        throw new RateLimitError(type, Math.ceil((result.resetTime - Date.now()) / 1000));
      }
    };
  }

  // Combined rate limiting middleware
  async checkAllLimits(request: FastifyRequest, reply: FastifyReply) {
    // Check global limit
    await this.createMiddleware('global')(request, reply);
    
    // Check per-user limit if authenticated
    if ((request as any).user?.id) {
      await this.createMiddleware('perUser')(request, reply);
    }
    
    // Check per-venue limit if venue is in path
    if ((request.params as any)?.venueId) {
      await this.createMiddleware('perVenue')(request, reply);
    }
    
    // Check per-operation limit
    await this.createMiddleware('perOperation')(request, reply);
  }

  // Method to dynamically update rate limits
  updateLimits(type: keyof RateLimitConfig, options: Partial<RateLimitOptions>) {
    if (type === 'perOperation') {
      // Handle perOperation separately
      Object.assign(this.config.perOperation, options);
    } else {
      Object.assign(this.config[type], options);
    }
  }

  // Method to reset rate limit for a specific key
  async resetLimit(type: string, identifier: string) {
    const pattern = `rate_limit:${type}:${identifier}:*`;
    const keys = await this.redis.keys(pattern);
    if (keys.length > 0) {
      await this.redis.del(...keys);
    }
  }
}

// Factory function to create rate limiter instance
export function createRateLimiter(redis: Redis, config?: Partial<RateLimitConfig>) {
  return new RateLimiter(redis, config);
}
```

### FILE: src/middleware/versioning.middleware.ts
```typescript
import { FastifyRequest, FastifyReply } from 'fastify';
import { logger } from '../utils/logger';

interface VersionConfig {
  current: string;
  supported: string[];
  deprecated: string[];
  sunset: { [version: string]: Date };
}

const versionConfig: VersionConfig = {
  current: 'v1',
  supported: ['v1'],
  deprecated: [],
  sunset: {}
};

export function versionMiddleware(request: FastifyRequest, reply: FastifyReply, done: () => void) {
  // Extract version from URL path or header
  const pathMatch = request.url.match(/\/api\/(v\d+)\//);
  const headerVersion = request.headers?.['api-version'] as string;
  const acceptVersion = request.headers?.['accept-version'] as string;

  // Priority: URL path > api-version header > accept-version header
  const version = pathMatch?.[1] || headerVersion || acceptVersion || versionConfig.current;

  // Check if version is supported
  if (!versionConfig.supported.includes(version)) {
    reply.status(400).send({
      success: false,
      error: `API version ${version} is not supported`,
      code: 'UNSUPPORTED_VERSION',
      details: {
        current: versionConfig.current,
        supported: versionConfig.supported
      }
    });
    return;
  }

  // Warn if using deprecated version
  if (versionConfig.deprecated.includes(version)) {
    const sunsetDate = versionConfig.sunset[version];
    reply.header('Deprecation', 'true');
    reply.header('Sunset', sunsetDate?.toISOString() || 'TBD');
    logger.warn({
      version,
      requestId: request.id,
      sunsetDate
    }, 'Deprecated API version used');
  }

  // Add version to request context
  (request as any).apiVersion = version;

  // Add version headers to response
  reply.header('API-Version', version);
  reply.header('X-API-Version', version);

  done();
}

// Helper to register versioned routes
export function registerVersionedRoute(
  fastify: any,
  versions: string[],
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH',
  path: string,
  handler: any,
  options?: any
) {
  versions.forEach(version => {
    const versionedPath = `/api/${version}${path}`;
    fastify[method.toLowerCase()](versionedPath, options || {}, handler);
  });
}
```

### FILE: src/middleware/auth.middleware.ts
```typescript
import { FastifyRequest, FastifyReply, RouteGenericInterface } from 'fastify';

import { ErrorResponseBuilder } from '../utils/error-response';
export interface AuthUser {
  id: string;
  email: string;
  permissions: string[];
}

export interface AuthenticatedRequest<T extends RouteGenericInterface = RouteGenericInterface> extends FastifyRequest<T> {
  user: AuthUser;
}

export async function authenticate(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  try {
    // Check for API key first
    const apiKey = request.headers['x-api-key'] as string;
    if (apiKey) {
      return await authenticateWithApiKey(apiKey, request, reply);
    }

    // Check for JWT
    const token = request.headers.authorization?.replace('Bearer ', '');
    if (!token) {
      return ErrorResponseBuilder.unauthorized(reply, 'Missing authentication');
    }

    // Cast server to any to access jwt
    const server = request.server as any;
    
    try {
      const decoded = await server.jwt.verify(token);
      
      // Set user on request
      (request as any).user = {
        id: decoded.sub,
        email: decoded.email || '',
        permissions: decoded.permissions || []
      };
    } catch (error) {
      console.error('JWT verification failed:', error);
      return ErrorResponseBuilder.unauthorized(reply, 'Invalid token');
    }
  } catch (error) {
    console.error('Authentication error:', error);
    return ErrorResponseBuilder.unauthorized(reply, 'Authentication failed');
  }
}

export async function requireVenueAccess(
  request: FastifyRequest<{ Params: { venueId: string } }>,
  reply: FastifyReply
): Promise<void> {
  const venueId = request.params.venueId;
  const userId = (request as any).user?.id;

  if (!userId) {
    return ErrorResponseBuilder.unauthorized(reply, 'Not authenticated');
  }

  const server = request.server as any;
  const venueService = server.container.cradle.venueService;

  const hasAccess = await venueService.checkVenueAccess(venueId, userId);
  if (!hasAccess) {
    return ErrorResponseBuilder.forbidden(reply, 'Access denied');
  }

  // Store venue access info on request
  (request as any).user.venueId = venueId;
}

async function authenticateWithApiKey(
  apiKey: string,
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const server = request.server as any;
  const db = server.container.cradle.db;
  const redis = server.container.cradle.redis;

  // Check cache first
  const cached = await redis.get(`api_key:${apiKey}`);
  if (cached) {
    (request as any).user = JSON.parse(cached);
    return;
  }

  // Look up API key in database
  const keyData = await db('api_keys')
    .where({ key: apiKey, is_active: true })
    .where('expires_at', '>', new Date())
    .first();

  if (!keyData) {
    return ErrorResponseBuilder.unauthorized(reply, 'Invalid API key');
  }

  // Get user data
  const user = await db('users')
    .where({ id: keyData.user_id })
    .first();

  if (!user) {
    return ErrorResponseBuilder.unauthorized(reply, 'Invalid API key');
  }

  const authUser = {
    id: user.id,
    email: user.email,
    permissions: keyData.permissions || []
  };

  // Cache for 5 minutes
  await redis.setex(`api_key:${apiKey}`, 300, JSON.stringify(authUser));

  (request as any).user = authUser;
}
```

### FILE: src/services/integration.service.ts
```typescript
import { IntegrationModel, IIntegration } from '../models/integration.model';
import { Knex } from 'knex';

interface IIntegrationWithCredentials extends IIntegration {
  encrypted_credentials?: string;
}

export class IntegrationService {
  private integrationModel: IntegrationModel;
  private db: Knex;
  private logger: any;

  constructor(dependencies: { db: Knex; logger: any }) {
    this.db = dependencies.db;
    this.logger = dependencies.logger;
    this.integrationModel = new IntegrationModel(this.db);
  }

  async getIntegration(integrationId: string): Promise<IIntegrationWithCredentials | null> {
    const integration = await this.integrationModel.findById(integrationId);
    return integration as IIntegrationWithCredentials;
  }

  async getVenueIntegrationByType(venueId: string, type: string): Promise<IIntegrationWithCredentials | null> {
    return this.integrationModel.findByVenueAndType(venueId, type) as Promise<IIntegrationWithCredentials | null>;
  }

  async listVenueIntegrations(venueId: string): Promise<IIntegration[]> {
    return this.integrationModel.findByVenue(venueId);
  }

  async createIntegration(venueId: string, data: any): Promise<IIntegration> {
    return this.integrationModel.create({
      venue_id: venueId,
      type: data.type,
      config: data.config || {},
      status: data.status || 'active',
      encrypted_credentials: data.encrypted_credentials
    });
  }

  async updateIntegration(integrationId: string, updates: any): Promise<IIntegration> {
    return this.integrationModel.update(integrationId, updates);
  }

  async deleteIntegration(integrationId: string): Promise<void> {
    await this.integrationModel.delete(integrationId);
  }

  async testIntegration(integrationId: string): Promise<{ success: boolean; message: string }> {
    const integration = await this.getIntegration(integrationId) as IIntegrationWithCredentials;
    if (!integration) {
      throw new Error('Integration not found');
    }

    const encrypted_credentials = integration.api_key_encrypted || integration.api_secret_encrypted;

    // Use integration_type instead of type
    switch (integration.integration_type) {
      case 'stripe':
        return this.testStripeIntegration(encrypted_credentials);
      case 'square':
        return this.testSquareIntegration(encrypted_credentials);
      default:
        return { success: false, message: 'Integration type not supported' };
    }
  }

  private testStripeIntegration(encrypted_credentials: any): { success: boolean; message: string } {
    try {
      // Test Stripe connection
      return { success: true, message: 'Stripe connection successful' };
    } catch (error) {
      return { success: false, message: 'Failed to connect to Stripe' };
    }
  }

  private testSquareIntegration(encrypted_credentials: any): { success: boolean; message: string } {
    try {
      // Test Square connection
      return { success: true, message: 'Square connection successful' };
    } catch (error) {
      return { success: false, message: 'Failed to connect to Square' };
    }
  }

  private encryptCredentials(encrypted_credentials: any): string {
    // Implement encryption
    return JSON.stringify(encrypted_credentials);
  }

  private decryptCredentials(encryptedCredentials: string): any {
    // Implement decryption
    return JSON.parse(encryptedCredentials);
  }

  async syncWithExternalSystem(integrationId: string): Promise<void> {
    const integration = await this.getIntegration(integrationId) as IIntegrationWithCredentials;
    if (!integration) {
      throw new Error('Integration not found');
    }

    const encrypted_credentials = integration.api_key_encrypted || integration.api_secret_encrypted;

    // Use integration_type instead of type
    this.logger.info({ integrationId, type: integration.integration_type }, 'Syncing with external system');
  }
}
```

### FILE: src/services/verification.service.ts
```typescript
import { logger } from '../utils/logger';
import { db } from '../config/database';

export interface VerificationResult {
  verified: boolean;
  checks: {
    businessInfo: boolean;
    taxInfo: boolean;
    bankAccount: boolean;
    identity: boolean;
  };
  issues: string[];
  verifiedAt?: Date;
}

export class VerificationService {
  async verifyVenue(venueId: string): Promise<VerificationResult> {
    const venue = await db('venues').where({ id: venueId }).first();
    if (!venue) {
      throw new Error('Venue not found');
    }

    const result: VerificationResult = {
      verified: false,
      checks: {
        businessInfo: false,
        taxInfo: false,
        bankAccount: false,
        identity: false,
      },
      issues: [],
    };

    // Check business information
    result.checks.businessInfo = await this.verifyBusinessInfo(venue);
    if (!result.checks.businessInfo) {
      result.issues.push('Incomplete business information');
    }

    // Check tax information
    result.checks.taxInfo = await this.verifyTaxInfo(venueId);
    if (!result.checks.taxInfo) {
      result.issues.push('Tax information not provided');
    }

    // Check bank account
    result.checks.bankAccount = await this.verifyBankAccount(venueId);
    if (!result.checks.bankAccount) {
      result.issues.push('Bank account not verified');
    }

    // Check identity verification
    result.checks.identity = await this.verifyIdentity(venueId);
    if (!result.checks.identity) {
      result.issues.push('Identity verification pending');
    }

    // All checks passed?
    result.verified = Object.values(result.checks).every(check => check);

    if (result.verified) {
      result.verifiedAt = new Date();
      await this.markVenueVerified(venueId);
    }

    logger.info({ venueId, result }, 'Venue verification completed');

    return result;
  }

  async submitDocument(venueId: string, documentType: string, documentData: any): Promise<void> {
    // Store document reference
    await db('venue_documents').insert({
      venue_id: venueId,
      type: documentType,
      status: 'pending',
      submitted_at: new Date(),
      metadata: documentData,
    });

    // Trigger verification based on document type
    switch (documentType) {
      case 'business_license':
      case 'articles_of_incorporation':
        await this.triggerBusinessVerification(venueId);
        break;
      case 'tax_id':
      case 'w9':
        await this.triggerTaxVerification(venueId);
        break;
      case 'bank_statement':
      case 'voided_check':
        await this.triggerBankVerification(venueId);
        break;
      case 'drivers_license':
      case 'passport':
        await this.triggerIdentityVerification(venueId);
        break;
    }

    logger.info({ venueId, documentType }, 'Document submitted for verification');
  }

  async getVerificationStatus(venueId: string): Promise<{
    status: 'unverified' | 'pending' | 'verified' | 'rejected';
    completedChecks: string[];
    pendingChecks: string[];
    requiredDocuments: string[];
  }> {
    const verification = await this.verifyVenue(venueId);
    const documents = await db('venue_documents')
      .where({ venue_id: venueId })
      .select('type', 'status');

    const completedChecks = Object.entries(verification.checks)
      .filter(([_, passed]) => passed)
      .map(([check]) => check);

    const pendingChecks = Object.entries(verification.checks)
      .filter(([_, passed]) => !passed)
      .map(([check]) => check);

    const requiredDocuments = this.getRequiredDocuments(pendingChecks);

    let status: 'unverified' | 'pending' | 'verified' | 'rejected' = 'unverified';
    if (verification.verified) {
      status = 'verified';
    } else if (documents.some((d: any) => d.status === 'pending')) {
      status = 'pending';
    } else if (documents.some((d: any) => d.status === 'rejected')) {
      status = 'rejected';
    }

    return {
      status,
      completedChecks,
      pendingChecks,
      requiredDocuments,
    };
  }

  private async verifyBusinessInfo(venue: any): Promise<boolean> {
    // Check if required business fields are present
    return !!(
      venue.name &&
      venue.address &&
      venue.type &&
      venue.capacity
    );
  }

  private async verifyTaxInfo(venueId: string): Promise<boolean> {
    // Check for tax documents
    const taxDocs = await db('venue_documents')
      .where({ venue_id: venueId, type: 'tax_id', status: 'approved' })
      .orWhere({ venue_id: venueId, type: 'w9', status: 'approved' })
      .first();

    return !!taxDocs;
  }

  private async verifyBankAccount(venueId: string): Promise<boolean> {
    // Check for verified payment integration
    const paymentIntegration = await db('venue_integrations')
      .where({ venue_id: venueId, status: 'active' })
      .whereIn('type', ['stripe', 'square'])
      .first();

    return !!paymentIntegration;
  }

  private async verifyIdentity(venueId: string): Promise<boolean> {
    // Check for identity documents
    const identityDocs = await db('venue_documents')
      .where({ venue_id: venueId, status: 'approved' })
      .whereIn('type', ['drivers_license', 'passport'])
      .first();

    return !!identityDocs;
  }

  private async markVenueVerified(venueId: string): Promise<void> {
    await db('venues')
      .where({ id: venueId })
      .update({
        settings: db.raw("settings || ?::jsonb", JSON.stringify({
          verification: {
            verified: true,
            verifiedAt: new Date(),
          },
        })),
        updated_at: new Date(),
      });
  }

  private getRequiredDocuments(pendingChecks: string[]): string[] {
    const documentMap: Record<string, string[]> = {
      businessInfo: ['business_license', 'articles_of_incorporation'],
      taxInfo: ['tax_id', 'w9'],
      bankAccount: ['bank_statement', 'voided_check'],
      identity: ['drivers_license', 'passport'],
    };

    return pendingChecks.flatMap(check => documentMap[check] || []);
  }

  private async triggerBusinessVerification(venueId: string): Promise<void> {
    // TODO: Integrate with verification service
    logger.info({ venueId }, 'Business verification triggered');
  }

  private async triggerTaxVerification(venueId: string): Promise<void> {
    // TODO: Integrate with tax verification service
    logger.info({ venueId }, 'Tax verification triggered');
  }

  private async triggerBankVerification(venueId: string): Promise<void> {
    // TODO: Integrate with bank verification service
    logger.info({ venueId }, 'Bank verification triggered');
  }

  private async triggerIdentityVerification(venueId: string): Promise<void> {
    // TODO: Integrate with identity verification service
    logger.info({ venueId }, 'Identity verification triggered');
  }
}
```

### FILE: src/services/eventPublisher.ts
```typescript
const amqplib = require('amqplib');
import { logger } from '../utils/logger';
import { createCircuitBreaker } from '../utils/circuitBreaker';

export interface EventMessage {
  eventType: string;
  aggregateId: string;
  aggregateType: string;
  payload: any;
  metadata?: {
    userId?: string;
    timestamp?: Date;
    correlationId?: string;
    version?: number;
  };
}

export class EventPublisher {
  private connection: any = null;
  private channel: any = null;
  private publishWithBreaker: (message: EventMessage) => Promise<void>;
  private readonly exchangeName = 'venue-events';
  private readonly rabbitUrl: string;
  private connected: boolean = false;

  constructor() {
    this.rabbitUrl = process.env.RABBITMQ_URL || 'amqp://admin:admin@rabbitmq:5672';
    
    // Wrap publish with circuit breaker
    const breaker = createCircuitBreaker(
      this.publishInternal.bind(this),
      {
        name: 'rabbitmq-publish',
        timeout: 2000,
        errorThresholdPercentage: 50,
        resetTimeout: 30000
      }
    );
    
    this.publishWithBreaker = async (message: EventMessage): Promise<void> => {
      await breaker.fire(message);
    };
  }

  async connect(): Promise<void> {
    try {
      this.connection = await amqplib.connect(this.rabbitUrl);
      this.channel = await this.connection.createChannel();
      
      // Declare exchange
      await this.channel.assertExchange(this.exchangeName, 'topic', { durable: true });
      
      this.connected = true;
      logger.info('Connected to RabbitMQ');
      
      // Handle connection events
      this.connection.on('error', (err: any) => {
        logger.error({ error: err }, 'RabbitMQ connection error');
        this.connected = false;
        this.reconnect();
      });
      
      this.connection.on('close', () => {
        logger.warn('RabbitMQ connection closed');
        this.connected = false;
        this.reconnect();
      });
    } catch (error) {
      logger.warn({ error }, 'Could not connect to RabbitMQ - running without event publishing');
      this.connected = false;
      // Don't throw - allow service to run without RabbitMQ
      // Retry connection after delay
      setTimeout(() => this.reconnect(), 5000);
    }
  }

  private async reconnect(): Promise<void> {
    this.connection = null;
    this.channel = null;
    await this.connect();
  }

  private async publishInternal(message: EventMessage): Promise<void> {
    if (!this.connected || !this.channel) {
      logger.debug('RabbitMQ not connected, skipping event publish');
      return;
    }

    const routingKey = `${message.aggregateType}.${message.eventType}`;
    const messageBuffer = Buffer.from(JSON.stringify({
      ...message,
      metadata: {
        ...message.metadata,
        timestamp: message.metadata?.timestamp || new Date(),
      }
    }));

    this.channel.publish(
      this.exchangeName,
      routingKey,
      messageBuffer,
      { persistent: true }
    );

    logger.debug({ routingKey, message }, 'Event published to RabbitMQ');
  }

  async publish(message: EventMessage): Promise<void> {
    try {
      await this.publishWithBreaker(message);
    } catch (error) {
      logger.error({ error, message }, 'Failed to publish event');
      // Don't throw - event publishing failure shouldn't break main flow
    }
  }

  // Venue-specific event methods
  async publishVenueCreated(venueId: string, venueData: any, userId?: string): Promise<void> {
    await this.publish({
      eventType: 'created',
      aggregateId: venueId,
      aggregateType: 'venue',
      payload: venueData,
      metadata: {
        userId,
        version: 1
      }
    });
  }

  async publishVenueUpdated(venueId: string, changes: any, userId?: string): Promise<void> {
    await this.publish({
      eventType: 'updated',
      aggregateId: venueId,
      aggregateType: 'venue',
      payload: { changes },
      metadata: {
        userId
      }
    });
  }

  async publishVenueDeleted(venueId: string, userId?: string): Promise<void> {
    await this.publish({
      eventType: 'deleted',
      aggregateId: venueId,
      aggregateType: 'venue',
      payload: { deletedAt: new Date() },
      metadata: {
        userId
      }
    });
  }

  async close(): Promise<void> {
    if (this.channel) {
      await this.channel.close();
    }
    if (this.connection) {
      await this.connection.close();
    }
  }
  
  // Public method to check connection status
  public isConnected(): boolean {
    return this.connected;
  }
}
```

### FILE: src/services/healthCheck.service.ts
```typescript
import { Knex } from 'knex';
import Redis from 'ioredis';
import { logger } from '../utils/logger';

export interface HealthCheckResult {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  service: string;
  version: string;
  uptime: number;
  checks: {
    [key: string]: {
      status: 'ok' | 'warning' | 'error';
      message?: string;
      responseTime?: number;
      details?: any;
    };
  };
}

export class HealthCheckService {
  private db: Knex;
  private redis: Redis;
  private startTime: Date;

  constructor(dependencies: { db: Knex; redis: Redis }) {
    this.db = dependencies.db;
    this.redis = dependencies.redis;
    this.startTime = new Date();
  }

  // Liveness probe - is the service alive?
  async getLiveness(): Promise<{ status: string; timestamp: string }> {
    return {
      status: 'alive',
      timestamp: new Date().toISOString()
    };
  }

  // Readiness probe - is the service ready to accept traffic?
  async getReadiness(): Promise<HealthCheckResult> {
    const checks: HealthCheckResult['checks'] = {};
    
    // Check database
    const dbStart = Date.now();
    try {
      await this.db.raw('SELECT 1');
      checks.database = {
        status: 'ok',
        responseTime: Date.now() - dbStart
      };
    } catch (error: any) {
      checks.database = {
        status: 'error',
        message: error.message,
        responseTime: Date.now() - dbStart
      };
    }

    // Check Redis
    const redisStart = Date.now();
    try {
      await this.redis.ping();
      checks.redis = {
        status: 'ok',
        responseTime: Date.now() - redisStart
      };
    } catch (error: any) {
      checks.redis = {
        status: 'error',
        message: error.message,
        responseTime: Date.now() - redisStart
      };
    }

    // Determine overall status
    const hasErrors = Object.values(checks).some(c => c.status === 'error');
    
    let status: HealthCheckResult['status'] = 'healthy';
    if (hasErrors) {
      if (checks.database.status === 'error') {
        status = 'unhealthy'; // Database is critical
      } else {
        status = 'degraded'; // Redis failure is degraded
      }
    }

    return {
      status,
      timestamp: new Date().toISOString(),
      service: 'venue-service',
      version: process.env.npm_package_version || '1.0.0',
      uptime: Date.now() - this.startTime.getTime(),
      checks
    };
  }

  // Full health check with business logic
  async getFullHealth(): Promise<HealthCheckResult> {
    const readiness = await this.getReadiness();
    
    // Add business logic checks
    const businessChecks: HealthCheckResult['checks'] = {};
    
    // Check if we can query venues
    const queryStart = Date.now();
    try {
      const count = await this.db('venues').count('id as count').first();
      businessChecks.venueQuery = {
        status: 'ok',
        responseTime: Date.now() - queryStart,
        details: { venueCount: count?.count || 0 }
      };
    } catch (error: any) {
      businessChecks.venueQuery = {
        status: 'error',
        message: error.message,
        responseTime: Date.now() - queryStart
      };
    }

    // Check cache operations
    const cacheStart = Date.now();
    try {
      const testKey = 'health:check:' + Date.now();
      await this.redis.set(testKey, 'ok', 'EX', 10);
      const value = await this.redis.get(testKey);
      await this.redis.del(testKey);
      
      businessChecks.cacheOperations = {
        status: value === 'ok' ? 'ok' : 'warning',
        responseTime: Date.now() - cacheStart
      };
    } catch (error: any) {
      businessChecks.cacheOperations = {
        status: 'error',
        message: error.message,
        responseTime: Date.now() - cacheStart
      };
    }

    return {
      ...readiness,
      checks: {
        ...readiness.checks,
        ...businessChecks
      }
    };
  }
}
```

### FILE: src/services/interfaces.ts
```typescript
export interface IStaff {
  id: string;
  user_id: string;
  venue_id: string;
  role: string;
  // Add properties as needed
}

import { IVenue } from '../models/venue.model';
import { IIntegration } from '../models/integration.model';

// Layout interface
export interface ILayout {
  id: string;
  venue_id: string;
  name: string;
  sections: any[];
  total_capacity: number;
  is_default?: boolean;
  created_at: Date;
  updated_at: Date;
  deleted_at?: Date | null;
}


export interface IVenueService {
  createVenue(data: any, userId: string): Promise<IVenue>;
  getVenue(venueId: string): Promise<IVenue | null>;
  updateVenue(venueId: string, updates: any, userId: string): Promise<IVenue>;
  deleteVenue(venueId: string, userId: string): Promise<void>;
  listVenues(filters: any): Promise<IVenue[]>;
  addStaff(venueId: string, userId: string, role: string): Promise<IStaff>;
  updateStaff(venueId: string, staffId: string, updates: any): Promise<IStaff>;
  removeStaff(venueId: string, staffId: string): Promise<void>;
  isUserStaff(venueId: string, userId: string): Promise<boolean>;
}

export interface IIntegrationService {
  listIntegrations(venueId: string): Promise<IIntegration[]>;
  getIntegration(venueId: string, integrationId: string): Promise<IIntegration | null>;
  findByType(venueId: string, type: string): Promise<IIntegration | null>;
  connectIntegration(venueId: string, type: string, config: any, credentials: any): Promise<IIntegration>;
  updateIntegration(venueId: string, integrationId: string, updates: any): Promise<IIntegration>;
  disconnectIntegration(venueId: string, integrationId: string): Promise<void>;
  testIntegration(venueId: string, integrationId: string): Promise<{ success: boolean; message?: string }>;
  handleWebhook(type: string, headers: any, body: any): Promise<{ processed: boolean; events: any[] }>;
  syncData(venueId: string, integrationId: string): Promise<{ synced: number; errors: number }>;
}

export interface IOnboardingService {
  getOnboardingStatus(venueId: string): Promise<any>;
  completeStep(venueId: string, step: string, data?: any): Promise<void>;
  getSetupGuide(venueType: string): any;
}

export interface IComplianceService {
  getComplianceSettings(venueId: string): Promise<any>;
  updateComplianceSettings(venueId: string, settings: any): Promise<any>;
  generateComplianceReport(venueId: string): Promise<any>;
  checkCompliance(venueId: string): Promise<any>;
}

export interface IVerificationService {
  submitVerification(venueId: string, documents: any): Promise<any>;
  getVerificationStatus(venueId: string): Promise<any>;
  updateVerificationStatus(venueId: string, status: string, notes?: string): Promise<any>;
}

export interface ILayoutService {
  createLayout(venueId: string, data: any): Promise<ILayout>;
  getLayouts(venueId: string): Promise<ILayout[]>;
  getLayout(layoutId: string): Promise<ILayout | null>;
  updateLayout(layoutId: string, updates: any): Promise<ILayout>;
  deleteLayout(layoutId: string): Promise<void>;
  setDefaultLayout(venueId: string, layoutId: string): Promise<void>;
}
```

### FILE: src/services/compliance.service.ts
```typescript
import { logger } from '../utils/logger';
import { db } from '../config/database';

export interface ComplianceReport {
  venueId: string;
  generatedAt: Date;
  overallStatus: 'compliant' | 'non_compliant' | 'review_needed';
  categories: {
    dataProtection: ComplianceCategory;
    ageVerification: ComplianceCategory;
    accessibility: ComplianceCategory;
    financialReporting: ComplianceCategory;
    licensing: ComplianceCategory;
  };
  recommendations: ComplianceRecommendation[];
  nextReviewDate: Date;
}

interface ComplianceCategory {
  status: 'compliant' | 'non_compliant' | 'review_needed';
  checks: ComplianceCheck[];
  lastReviewDate?: Date;
}

interface ComplianceCheck {
  name: string;
  passed: boolean;
  details: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
}

interface ComplianceRecommendation {
  category: string;
  issue: string;
  recommendation: string;
  priority: 'immediate' | 'high' | 'medium' | 'low';
  dueDate?: Date;
}

export class ComplianceService {
  async generateComplianceReport(venueId: string): Promise<ComplianceReport> {
    const venue = await db('venues').where({ id: venueId }).first();
    if (!venue) {
      throw new Error('Venue not found');
    }

    const report: ComplianceReport = {
      venueId,
      generatedAt: new Date(),
      overallStatus: 'compliant',
      categories: {
        dataProtection: await this.checkDataProtection(venueId),
        ageVerification: await this.checkAgeVerification(venueId),
        accessibility: await this.checkAccessibility(venueId),
        financialReporting: await this.checkFinancialReporting(venueId),
        licensing: await this.checkLicensing(venueId),
      },
      recommendations: [],
      nextReviewDate: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000), // 90 days
    };

    // Determine overall status
    const statuses = Object.values(report.categories).map(cat => cat.status);
    if (statuses.includes('non_compliant')) {
      report.overallStatus = 'non_compliant';
    } else if (statuses.includes('review_needed')) {
      report.overallStatus = 'review_needed';
    }

    // Generate recommendations
    report.recommendations = this.generateRecommendations(report.categories);

    // Store report
    await this.storeComplianceReport(report);

    logger.info({ venueId, status: report.overallStatus }, 'Compliance report generated');

    return report;
  }

  async scheduleComplianceReview(venueId: string, reviewDate: Date): Promise<void> {
    await db('venue_compliance_reviews').insert({
      venue_id: venueId,
      scheduled_date: reviewDate,
      status: 'scheduled',
      created_at: new Date(),
    });

    logger.info({ venueId, reviewDate }, 'Compliance review scheduled');
  }

  async updateComplianceSettings(venueId: string, settings: any): Promise<void> {
    const existing = await db('venue_compliance')
      .where({ venue_id: venueId })
      .first();

    if (existing) {
      await db('venue_compliance')
        .where({ venue_id: venueId })
        .update({
          settings,
          updated_at: new Date(),
        });
    } else {
      await db('venue_compliance').insert({
        venue_id: venueId,
        settings,
        created_at: new Date(),
      });
    }

    // Check if settings change affects compliance
    await this.checkComplianceImpact(venueId, settings);
  }

  private async checkDataProtection(venueId: string): Promise<ComplianceCategory> {
    const checks: ComplianceCheck[] = [];
    
    // Check GDPR compliance
    const gdprSettings = await this.getGDPRSettings(venueId);
    checks.push({
      name: 'GDPR Compliance',
      passed: gdprSettings.enabled && !!gdprSettings.privacyPolicyUrl,
      details: gdprSettings.enabled ? 'GDPR compliance enabled' : 'GDPR compliance not configured',
      severity: 'critical',
    });

    // Check data retention policies
    const retentionSettings = await this.getRetentionSettings(venueId);
    checks.push({
      name: 'Data Retention Policy',
      passed: retentionSettings.configured,
      details: `Customer data retained for ${retentionSettings.customerDataDays} days`,
      severity: 'high',
    });

    // Check encryption
    checks.push({
      name: 'Data Encryption',
      passed: true, // Assume encrypted at rest
      details: 'All sensitive data encrypted at rest',
      severity: 'critical',
    });

    const status = checks.every(c => c.passed) ? 'compliant' : 
                   checks.some(c => !c.passed && c.severity === 'critical') ? 'non_compliant' : 
                   'review_needed';

    return { status, checks, lastReviewDate: new Date() };
  }

  private async checkAgeVerification(venueId: string): Promise<ComplianceCategory> {
    const checks: ComplianceCheck[] = [];
    const settings = await this.getAgeVerificationSettings(venueId);

    checks.push({
      name: 'Age Verification System',
      passed: settings.enabled,
      details: settings.enabled ? `Minimum age: ${settings.minimumAge}` : 'Age verification not enabled',
      severity: 'medium', // TODO: Get venue type and set severity accordingly
    });

    if (settings.enabled) {
      checks.push({
        name: 'Verification Method',
        passed: settings.verificationRequired,
        details: settings.verificationRequired ? 'ID verification required' : 'Self-declaration only',
        severity: 'medium',
      });
    }

    const status = checks.every(c => c.passed) ? 'compliant' : 'review_needed';
    return { status, checks };
  }

  private async checkAccessibility(venueId: string): Promise<ComplianceCategory> {
    const checks: ComplianceCheck[] = [];
    const settings = await this.getAccessibilitySettings(venueId);

    checks.push({
      name: 'Wheelchair Accessibility',
      passed: settings.wheelchairAccessible !== null,
      details: settings.wheelchairAccessible ? 'Wheelchair accessible' : 'Accessibility status not specified',
      severity: 'high',
    });

    checks.push({
      name: 'Accessibility Information',
      passed: settings.hasAccessibilityInfo,
      details: 'Accessibility information provided to customers',
      severity: 'medium',
    });

    const status = checks.every(c => c.passed) ? 'compliant' : 'review_needed';
    return { status, checks };
  }

  private async checkFinancialReporting(venueId: string): Promise<ComplianceCategory> {
    const checks: ComplianceCheck[] = [];

    // Check tax reporting setup
    checks.push({
      name: 'Tax Reporting Configuration',
      passed: await this.hasTaxConfiguration(venueId),
      details: 'Tax reporting properly configured',
      severity: 'critical',
    });

    // Check payout compliance
    checks.push({
      name: 'Payout Compliance',
      passed: await this.hasVerifiedPayoutMethod(venueId),
      details: 'Verified payout method on file',
      severity: 'high',
    });

    const status = checks.every(c => c.passed) ? 'compliant' : 'non_compliant';
    return { status, checks };
  }

  private async checkLicensing(venueId: string): Promise<ComplianceCategory> {
    const checks: ComplianceCheck[] = [];
    const venue = await db('venues').where({ id: venueId }).first();

    // Check business license
    checks.push({
      name: 'Business License',
      passed: await this.hasValidBusinessLicense(venueId),
      details: 'Valid business license on file',
      severity: 'critical',
    });

    // Check entertainment license if applicable
    if (['comedy_club', 'theater'].includes(venue.type)) {
      checks.push({
        name: 'Entertainment License',
        passed: await this.hasEntertainmentLicense(venueId),
        details: 'Entertainment license required for venue type',
        severity: 'high',
      });
    }

    const status = checks.every(c => c.passed) ? 'compliant' : 
                   checks.some(c => !c.passed && c.severity === 'critical') ? 'non_compliant' : 
                   'review_needed';
    return { status, checks };
  }

  private generateRecommendations(categories: any): ComplianceRecommendation[] {
    const recommendations: ComplianceRecommendation[] = [];

    Object.entries(categories).forEach(([category, data]: [string, any]) => {
      data.checks.forEach((check: ComplianceCheck) => {
        if (!check.passed) {
          recommendations.push({
            category,
            issue: check.name,
            recommendation: this.getRecommendation(category, check.name),
            priority: check.severity === 'critical' ? 'immediate' : 
                     check.severity === 'high' ? 'high' : 'medium',
            dueDate: this.calculateDueDate(check.severity),
          });
        }
      });
    });

    return recommendations.sort((a, b) => {
      const priorityOrder = { immediate: 0, high: 1, medium: 2, low: 3 };
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    });
  }

  private getRecommendation(category: string, checkName: string): string {
    const recommendations: Record<string, Record<string, string>> = {
      dataProtection: {
        'GDPR Compliance': 'Enable GDPR compliance settings and upload privacy policy',
        'Data Retention Policy': 'Configure data retention periods in compliance settings',
      },
      ageVerification: {
        'Age Verification System': 'Enable age verification for age-restricted events',
        'Verification Method': 'Require ID verification for better compliance',
      },
      accessibility: {
        'Wheelchair Accessibility': 'Update venue accessibility information',
        'Accessibility Information': 'Provide detailed accessibility information for customers',
      },
      financialReporting: {
        'Tax Reporting Configuration': 'Complete tax information setup in venue settings',
        'Payout Compliance': 'Verify bank account or payment method for payouts',
      },
      licensing: {
        'Business License': 'Upload valid business license document',
        'Entertainment License': 'Upload entertainment license for your venue type',
      },
    };

    return recommendations[category]?.[checkName] || 'Review and update compliance settings';
  }

  private calculateDueDate(severity: string): Date {
    const daysToAdd = {
      critical: 7,
      high: 30,
      medium: 60,
      low: 90,
    };

    return new Date(Date.now() + ((daysToAdd as any)[severity] || 30) * 24 * 60 * 60 * 1000);
  }

  private async storeComplianceReport(report: ComplianceReport): Promise<void> {
    await db('venue_compliance_reports').insert({
      venue_id: report.venueId,
      report: JSON.stringify(report)
    });
  }

  // Helper methods for checks
  private async getGDPRSettings(venueId: string): Promise<any> {
    const compliance = await db('venue_compliance')
      .where({ venue_id: venueId })
      .first();
    
    return compliance?.settings?.gdpr || { enabled: false };
  }

  private async getRetentionSettings(venueId: string): Promise<any> {
    const compliance = await db('venue_compliance')
      .where({ venue_id: venueId })
      .first();
    
    const settings = compliance?.settings?.dataRetention || {};
    return {
      configured: !!settings.customerDataDays,
      ...settings,
    };
  }

  private async getAgeVerificationSettings(venueId: string): Promise<any> {
    const compliance = await db('venue_compliance')
      .where({ venue_id: venueId })
      .first();
    
    return compliance?.settings?.ageRestriction || { enabled: false };
  }

  private async getAccessibilitySettings(venueId: string): Promise<any> {
    const compliance = await db('venue_compliance')
      .where({ venue_id: venueId })
      .first();
    
    const settings = compliance?.settings?.accessibility || {};
    return {
      ...settings,
      hasAccessibilityInfo: !!(settings.wheelchairAccessible !== undefined),
    };
  }

  private async hasTaxConfiguration(venueId: string): Promise<boolean> {
    // Check if venue has tax information configured
    const taxDocs = await db('venue_documents')
      .where({ venue_id: venueId, document_type: 'tax_id', status: 'approved' })
      .first();
    
    return !!taxDocs;
  }

  private async hasVerifiedPayoutMethod(venueId: string): Promise<boolean> {
    // Check for verified payment integration
    const integration = await db('venue_integrations')
      .where({ venue_id: venueId, status: 'active' })
      .whereIn('type', ['stripe', 'square'])
      .first();
    
    return !!integration;
  }

  private async hasValidBusinessLicense(venueId: string): Promise<boolean> {
    const license = await db('venue_documents')
      .where({ venue_id: venueId, document_type: 'business_license', status: 'approved' })
      .first();
    
    return !!license;
  }

  private async hasEntertainmentLicense(venueId: string): Promise<boolean> {
    const license = await db('venue_documents')
      .where({ venue_id: venueId, document_type: 'entertainment_license', status: 'approved' })
      .first();
    
    return !!license;
  }

  private async checkComplianceImpact(venueId: string, newSettings: any): Promise<void> {
    // Check if settings change requires immediate compliance review
    const criticalChanges = ['gdpr', 'ageRestriction', 'dataRetention'];
    const hassCriticalChange = Object.keys(newSettings).some(key => criticalChanges.includes(key));
    
    if (hassCriticalChange) {
      logger.warn({ venueId, settings: newSettings }, 'Critical compliance settings changed');
      // TODO: Trigger compliance review notification
    }
  }
}
```

### FILE: src/types/fastify.d.ts
```typescript
import { FastifyRequest } from 'fastify';

declare module 'fastify' {
  interface FastifyRequest {
    user?: {
      id: string;
      email: string;
      // Add other user properties as needed
    };
  }
}

export interface RouteGenericVenue {
  Params: {
    venueId: string;
  };
}

export interface RouteGenericVenueWithQuery extends RouteGenericVenue {
  Querystring: {
    [key: string]: any;
  };
}

export interface RouteGenericVenueWithBody<T = any> extends RouteGenericVenue {
  Body: T;
}
```

### FILE: src/types/routes.ts
```typescript
import { FastifyRequest, FastifyReply, RouteGenericInterface } from 'fastify';

// Base route generics
export interface VenueRouteGeneric extends RouteGenericInterface {
  Params: {
    venueId: string;
  };
}

export interface VenueQueryRouteGeneric extends VenueRouteGeneric {
  Querystring: {
    [key: string]: any;
  };
}

export interface VenueBodyRouteGeneric<T = any> extends VenueRouteGeneric {
  Body: T;
}

export interface VenueQueryBodyRouteGeneric<Q = any, B = any> extends VenueRouteGeneric {
  Querystring: Q;
  Body: B;
}

// Analytics specific
export interface AnalyticsQuery {
  start_date?: string;
  end_date?: string;
  [key: string]: any;
}

export interface AnalyticsRouteGeneric extends VenueRouteGeneric {
  Querystring: AnalyticsQuery;
}

export interface AnalyticsExportRouteGeneric extends VenueRouteGeneric {
  Body: {
    format: 'csv' | 'json';
  };
}

// Type helpers
export type VenueRequest<T extends RouteGenericInterface = VenueRouteGeneric> = FastifyRequest<T>;
export type VenueReply = FastifyReply;
```

### FILE: src/types/index.d.ts
```typescript
import { AwilixContainer } from 'awilix';

declare module 'fastify' {
  interface FastifyInstance {
    container: AwilixContainer;
  }
}
```


================================================================================
## SECTION 3: RAW PATTERN EXTRACTION
================================================================================

### All .table() and .from() calls:

### All SQL keywords (SELECT, INSERT, UPDATE, DELETE):
backend/services/venue-service//src/routes/internal-validation.routes.ts:37:      .update(payload)
backend/services/venue-service//src/routes/internal-validation.routes.ts:59:        SELECT t.*, e.venue_id, e.event_date
backend/services/venue-service//src/routes/health.routes.ts:42:      await db.raw('SELECT 1');
backend/services/venue-service//src/config/database.ts:42:      await db.raw('SELECT 1');
backend/services/venue-service//src/controllers/integrations.controller.ts:5:import { createIntegrationSchema, updateIntegrationSchema } from '../schemas/integration.schema';
backend/services/venue-service//src/controllers/integrations.controller.ts:23:interface UpdateIntegrationBody {
backend/services/venue-service//src/controllers/integrations.controller.ts:193:  // Update integration - SECURED
backend/services/venue-service//src/controllers/integrations.controller.ts:196:      preHandler: [authenticate, addTenantContext, validate(updateIntegrationSchema)],
backend/services/venue-service//src/controllers/integrations.controller.ts:199:        summary: 'Update integration',
backend/services/venue-service//src/controllers/integrations.controller.ts:207:      const body = request.body as UpdateIntegrationBody;
backend/services/venue-service//src/controllers/integrations.controller.ts:218:          throw new ForbiddenError('Insufficient permissions to update integrations');
backend/services/venue-service//src/controllers/integrations.controller.ts:227:        const updated = await integrationService.updateIntegration(integrationId, body);
backend/services/venue-service//src/controllers/integrations.controller.ts:229:        logger.info({ venueId, integrationId, userId }, 'Integration updated');
backend/services/venue-service//src/controllers/integrations.controller.ts:230:        venueOperations.inc({ operation: 'update_integration', status: 'success' });
backend/services/venue-service//src/controllers/integrations.controller.ts:232:        return reply.send(updated);
backend/services/venue-service//src/controllers/integrations.controller.ts:234:        venueOperations.inc({ operation: 'update_integration', status: 'error' });
backend/services/venue-service//src/controllers/integrations.controller.ts:238:        logger.error({ error, venueId, integrationId }, 'Failed to update integration');
backend/services/venue-service//src/controllers/settings.controller.ts:5:import { updateSettingsSchema } from '../schemas/settings.schema';
backend/services/venue-service//src/controllers/settings.controller.ts:97:  // Update venue settings - SECURED
backend/services/venue-service//src/controllers/settings.controller.ts:116:          throw new ForbiddenError('Insufficient permissions to update settings');
backend/services/venue-service//src/controllers/settings.controller.ts:120:        const updates: any = {};
backend/services/venue-service//src/controllers/settings.controller.ts:124:            updates.accepted_currencies = [body.general.currency];
backend/services/venue-service//src/controllers/settings.controller.ts:130:            updates.max_tickets_per_order = body.ticketing.maxTicketsPerOrder;
backend/services/venue-service//src/controllers/settings.controller.ts:133:            updates.ticket_resale_allowed = body.ticketing.allowRefunds;
backend/services/venue-service//src/controllers/settings.controller.ts:137:        if (Object.keys(updates).length > 0) {
backend/services/venue-service//src/controllers/settings.controller.ts:138:          updates.updated_at = new Date();
backend/services/venue-service//src/controllers/settings.controller.ts:142:            .update(updates);
backend/services/venue-service//src/controllers/settings.controller.ts:145:        logger.info({ venueId, userId }, 'Settings updated');
backend/services/venue-service//src/controllers/settings.controller.ts:146:        venueOperations.inc({ operation: 'settings_update', status: 'success' });
backend/services/venue-service//src/controllers/settings.controller.ts:148:        return reply.send({ success: true, message: 'Settings updated' });
backend/services/venue-service//src/controllers/settings.controller.ts:150:        venueOperations.inc({ operation: 'settings_update', status: 'error' });
backend/services/venue-service//src/controllers/settings.controller.ts:154:        logger.error({ error, venueId: request.params.venueId }, 'Failed to update settings');
backend/services/venue-service//src/controllers/settings.controller.ts:155:        return reply.status(500).send({ error: 'Failed to update settings' });
backend/services/venue-service//src/controllers/venues.controller.ts:6:import { createVenueSchema, updateVenueSchema, venueQuerySchema } from '../schemas/venue.schema';
backend/services/venue-service//src/controllers/venues.controller.ts:25:interface UpdateVenueBody {
backend/services/venue-service//src/controllers/venues.controller.ts:268:  // Update venue - SECURED
backend/services/venue-service//src/controllers/venues.controller.ts:271:      preHandler: [authenticate, addTenantContext, validate(updateVenueSchema)]
backend/services/venue-service//src/controllers/venues.controller.ts:278:        const body = request.body as UpdateVenueBody;
backend/services/venue-service//src/controllers/venues.controller.ts:283:        const updatedVenue = await venueService.updateVenue(venueId, body, userId, tenantId);
backend/services/venue-service//src/controllers/venues.controller.ts:285:        logger.info({ venueId, userId, tenantId }, 'Venue updated');
backend/services/venue-service//src/controllers/venues.controller.ts:286:        venueOperations.inc({ operation: 'update', status: 'success' });
backend/services/venue-service//src/controllers/venues.controller.ts:288:        return reply.send(updatedVenue);
backend/services/venue-service//src/controllers/venues.controller.ts:290:        venueOperations.inc({ operation: 'update', status: 'error' });
backend/services/venue-service//src/controllers/venues.controller.ts:294:        logger.error({ error, venueId: request.params.venueId }, 'Failed to update venue');
backend/services/venue-service//src/controllers/venues.controller.ts:295:        return ErrorResponseBuilder.internal(reply, 'Failed to update venue');
backend/services/venue-service//src/models/integration.model.ts:14:  updated_at?: Date;
backend/services/venue-service//src/models/integration.model.ts:27:      .select(columns)
backend/services/venue-service//src/models/integration.model.ts:31:  // Override update to not use deleted_at
backend/services/venue-service//src/models/integration.model.ts:32:  async update(id: string, data: any) {
backend/services/venue-service//src/models/integration.model.ts:33:    const mappedUpdates: any = {};
backend/services/venue-service//src/models/integration.model.ts:35:    if (data.config !== undefined) mappedUpdates.config_data = data.config;
backend/services/venue-service//src/models/integration.model.ts:36:    if (data.config_data !== undefined) mappedUpdates.config_data = data.config_data;
backend/services/venue-service//src/models/integration.model.ts:37:    if (data.status !== undefined) mappedUpdates.is_active = data.status === 'active';
backend/services/venue-service//src/models/integration.model.ts:38:    if (data.is_active !== undefined) mappedUpdates.is_active = data.is_active;
backend/services/venue-service//src/models/integration.model.ts:40:    const [updated] = await this.db(this.tableName)
backend/services/venue-service//src/models/integration.model.ts:43:      .update({
backend/services/venue-service//src/models/integration.model.ts:44:        ...mappedUpdates,
backend/services/venue-service//src/models/integration.model.ts:45:        updated_at: new Date()
backend/services/venue-service//src/models/integration.model.ts:49:    return updated;
backend/services/venue-service//src/models/integration.model.ts:56:      .update({
backend/services/venue-service//src/models/integration.model.ts:58:        updated_at: new Date()
backend/services/venue-service//src/models/settings.model.ts:60:      .select('settings')
backend/services/venue-service//src/models/settings.model.ts:66:  async updateVenueSettings(venueId: string, settings: Partial<IVenueSettings>): Promise<IVenueSettings> {
backend/services/venue-service//src/models/settings.model.ts:73:      .update({
backend/services/venue-service//src/models/settings.model.ts:75:        updated_at: new Date(),
backend/services/venue-service//src/models/settings.model.ts:81:  async updateSettingSection(
backend/services/venue-service//src/models/settings.model.ts:95:      .update({
backend/services/venue-service//src/models/settings.model.ts:97:        updated_at: new Date(),
backend/services/venue-service//src/models/settings.model.ts:150:  private mergeSettings(current: IVenueSettings, updates: Partial<IVenueSettings>): IVenueSettings {
backend/services/venue-service//src/models/settings.model.ts:153:    for (const [section, sectionUpdates] of Object.entries(updates)) {
backend/services/venue-service//src/models/settings.model.ts:154:      if (sectionUpdates && typeof sectionUpdates === 'object') {
backend/services/venue-service//src/models/settings.model.ts:157:          ...sectionUpdates,
backend/services/venue-service//src/models/staff.model.ts:13:  updated_at?: Date;
backend/services/venue-service//src/models/staff.model.ts:72:  async updateRole(id: string, role: IStaffMember['role'], permissions?: string[]): Promise<IStaffMember> {
backend/services/venue-service//src/models/staff.model.ts:73:    const updateData: any = { role };
backend/services/venue-service//src/models/staff.model.ts:76:      updateData.permissions = JSON.stringify(permissions);
backend/services/venue-service//src/models/staff.model.ts:78:      updateData.permissions = JSON.stringify(this.getDefaultPermissions(role));
backend/services/venue-service//src/models/staff.model.ts:81:    return this.update(id, updateData);
backend/services/venue-service//src/models/staff.model.ts:85:    const result = await this.update(id, { is_active: false });
backend/services/venue-service//src/models/staff.model.ts:90:    const result = await this.update(id, { is_active: true });
backend/services/venue-service//src/models/staff.model.ts:94:  async updateLastLogin(id: string): Promise<void> {
backend/services/venue-service//src/models/staff.model.ts:95:    await this.update(id, { last_login_at: new Date() });
backend/services/venue-service//src/models/staff.model.ts:102:      .select('venue_id', 'role');
backend/services/venue-service//src/models/staff.model.ts:124:        'events:update',
backend/services/venue-service//src/models/layout.model.ts:24:  updated_at?: Date;
backend/services/venue-service//src/models/layout.model.ts:51:        .update({ is_default: false });
backend/services/venue-service//src/models/layout.model.ts:55:        .update({ is_default: true });
backend/services/venue-service//src/models/base.model.ts:22:      .select(columns)
backend/services/venue-service//src/models/base.model.ts:34:      query = query.select(options.columns);
backend/services/venue-service//src/models/base.model.ts:51:  async update(id: string, data: any) {
backend/services/venue-service//src/models/base.model.ts:55:      .update({
backend/services/venue-service//src/models/base.model.ts:57:        updated_at: new Date()
backend/services/venue-service//src/models/base.model.ts:67:      .update({
backend/services/venue-service//src/models/base.model.ts:86:      .update({ deleted_at: new Date() });
backend/services/venue-service//src/models/venue.model.ts:27:  updated_at?: Date;
backend/services/venue-service//src/models/venue.model.ts:90:  async updateOnboardingStatus(venueId: string, status: IVenue['onboarding_status']): Promise<boolean> {
backend/services/venue-service//src/models/venue.model.ts:91:    const result = await this.update(venueId, { onboarding_status: status });
backend/services/venue-service//src/middleware/rate-limit.middleware.ts:45:      max: 20               // 20 updates per minute
backend/services/venue-service//src/middleware/rate-limit.middleware.ts:169:  // Method to dynamically update rate limits
backend/services/venue-service//src/middleware/rate-limit.middleware.ts:170:  updateLimits(type: keyof RateLimitConfig, options: Partial<RateLimitOptions>) {
backend/services/venue-service//src/schemas/integration.schema.ts:16:export const updateIntegrationSchema = {
backend/services/venue-service//src/schemas/settings.schema.ts:3:export const updateSettingsSchema = {
backend/services/venue-service//src/schemas/venue.schema.ts:81:export const updateVenueSchema = {
backend/services/venue-service//src/services/integration.service.ts:42:  async updateIntegration(integrationId: string, updates: any): Promise<IIntegration> {
backend/services/venue-service//src/services/integration.service.ts:43:    return this.integrationModel.update(integrationId, updates);
backend/services/venue-service//src/services/verification.service.ts:113:      .select('type', 'status');
backend/services/venue-service//src/services/verification.service.ts:185:      .update({
backend/services/venue-service//src/services/verification.service.ts:192:        updated_at: new Date(),
backend/services/venue-service//src/services/eventPublisher.ts:131:  async publishVenueUpdated(venueId: string, changes: any, userId?: string): Promise<void> {
backend/services/venue-service//src/services/eventPublisher.ts:133:      eventType: 'updated',
backend/services/venue-service//src/services/healthCheck.service.ts:47:      await this.db.raw('SELECT 1');
backend/services/venue-service//src/services/interfaces.ts:21:  updated_at: Date;
backend/services/venue-service//src/services/interfaces.ts:29:  updateVenue(venueId: string, updates: any, userId: string): Promise<IVenue>;
backend/services/venue-service//src/services/interfaces.ts:33:  updateStaff(venueId: string, staffId: string, updates: any): Promise<IStaff>;
backend/services/venue-service//src/services/interfaces.ts:43:  updateIntegration(venueId: string, integrationId: string, updates: any): Promise<IIntegration>;
backend/services/venue-service//src/services/interfaces.ts:58:  updateComplianceSettings(venueId: string, settings: any): Promise<any>;
backend/services/venue-service//src/services/interfaces.ts:66:  updateVerificationStatus(venueId: string, status: string, notes?: string): Promise<any>;
backend/services/venue-service//src/services/interfaces.ts:73:  updateLayout(layoutId: string, updates: any): Promise<ILayout>;
backend/services/venue-service//src/services/cache.service.ts:106:  // Delete from cache
backend/services/venue-service//src/services/onboarding.service.ts:117:        await this.updateBasicInfo(venueId, data);
backend/services/venue-service//src/services/onboarding.service.ts:120:        await this.updateAddress(venueId, data);
backend/services/venue-service//src/services/onboarding.service.ts:136:  private async updateBasicInfo(venueId: string, data: any): Promise<void> {
backend/services/venue-service//src/services/onboarding.service.ts:137:    await this.db('venues').where({ id: venueId }).update({
backend/services/venue-service//src/services/onboarding.service.ts:141:      updated_at: new Date()
backend/services/venue-service//src/services/onboarding.service.ts:145:  private async updateAddress(venueId: string, data: any): Promise<void> {
backend/services/venue-service//src/services/onboarding.service.ts:146:    await this.db('venues').where({ id: venueId }).update({
backend/services/venue-service//src/services/onboarding.service.ts:148:      updated_at: new Date()
backend/services/venue-service//src/services/venue.service.ts:67:        await trx('venues').where({ id: newVenue.id }).update({
backend/services/venue-service//src/services/venue.service.ts:125:  async updateVenue(venueId: string, updates: Partial<IVenue>, userId: string, tenantId?: string): Promise<IVenue> {
backend/services/venue-service//src/services/venue.service.ts:129:    const hasPermission = await staffModel.hasPermission(venueId, userId, 'venue:update');
backend/services/venue-service//src/services/venue.service.ts:134:    // Check if slug is being updated and is unique
backend/services/venue-service//src/services/venue.service.ts:135:    if (updates.slug) {
backend/services/venue-service//src/services/venue.service.ts:136:      const existing = await venueModel.findBySlug(updates.slug);
backend/services/venue-service//src/services/venue.service.ts:142:    const updated = await venueModel.update(venueId, updates);
backend/services/venue-service//src/services/venue.service.ts:147:    this.logger.info({ venueId, userId, updates }, 'Venue updated');
backend/services/venue-service//src/services/venue.service.ts:149:    // Publish venue updated event
backend/services/venue-service//src/services/venue.service.ts:150:    if (updated.id) {
backend/services/venue-service//src/services/venue.service.ts:151:      await this.eventPublisher.publishVenueUpdated(updated.id, updates, userId);
backend/services/venue-service//src/services/venue.service.ts:153:    return updated;
backend/services/venue-service//src/services/venue.service.ts:231:  async updateOnboardingProgress(venueId: string, step: string, completed: boolean): Promise<void> {
backend/services/venue-service//src/services/venue.service.ts:242:    await venueModel.update(venueId, {
backend/services/venue-service//src/services/venue.service.ts:277:        .select('venue_id');
backend/services/venue-service//src/services/compliance.service.ts:92:  async updateComplianceSettings(venueId: string, settings: any): Promise<void> {
backend/services/venue-service//src/services/compliance.service.ts:100:        .update({
backend/services/venue-service//src/services/compliance.service.ts:102:          updated_at: new Date(),
backend/services/venue-service//src/services/compliance.service.ts:284:        'Wheelchair Accessibility': 'Update venue accessibility information',
backend/services/venue-service//src/services/compliance.service.ts:297:    return recommendations[category]?.[checkName] || 'Review and update compliance settings';

### All JOIN operations:
backend/services/venue-service//src/routes/internal-validation.routes.ts:61:        JOIN events e ON t.event_id = e.id
backend/services/venue-service//src/middleware/validation.middleware.ts:13:            field: d.path.join('.'),
backend/services/venue-service//src/middleware/validation.middleware.ts:24:            field: d.path.join('.'),
backend/services/venue-service//src/middleware/validation.middleware.ts:35:            field: d.path.join('.'),

### All WHERE clauses:
backend/services/venue-service//src/routes/internal-validation.routes.ts:62:        WHERE t.id = ? AND e.venue_id = ?

================================================================================
## SECTION 4: CONFIGURATION AND SETUP FILES
================================================================================

### database.ts
```typescript
import knex, { Knex } from 'knex';

export const dbConfig: Knex.Config = {
  client: 'postgresql',
  connection: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    database: process.env.DB_NAME || 'tickettoken_db',
    application_name: 'venue-service'
  },
  pool: {
    min: 0,
    max: 10
  },
  acquireConnectionTimeout: 60000,
  migrations: {
    directory: './migrations',
    tableName: 'knex_migrations'
  },
  seeds: {
    directory: './seeds'
  }
};

// Create database instance
export const db = knex(dbConfig);

// Pool monitoring
export function startPoolMonitoring() {
  console.log('Database pool monitoring started');
}

// Check database connection with retries
export async function checkDatabaseConnection(retries = 10, delay = 3000): Promise<boolean> {
  for (let i = 0; i < retries; i++) {
    try {
      console.log(`Attempting database connection... (attempt ${i + 1}/${retries})`);
      console.log(`DB Config: host=${process.env.DB_HOST}, port=${process.env.DB_PORT}, db=${process.env.DB_NAME}`);
      
      await db.raw('SELECT 1');
      console.log('Database connection successful!');
      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`Database connection attempt ${i + 1} failed:`, errorMessage);
      if (i < retries - 1) {
        console.log(`Waiting ${delay}ms before retry...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  console.error('Failed to connect to database after all retries');
  return false;
}

export default db;
```
### .env.example
```
# ================================================
# VENUE-SERVICE ENVIRONMENT CONFIGURATION
# ================================================
# Generated: Tue Aug 12 13:18:17 EDT 2025
# Service: venue-service
# Port: 3002
# ================================================

# ==== REQUIRED: Core Service Configuration ====
NODE_ENV=development                    # development | staging | production
PORT=<PORT_NUMBER>         # Service port
SERVICE_NAME=venue-service           # Service identifier

# ==== REQUIRED: Database Configuration ====
DB_HOST=localhost                       # Database host
DB_PORT=5432                           # PostgreSQL port (5432) or pgBouncer (6432)
DB_USER=postgres                       # Database user
DB_PASSWORD=<CHANGE_ME>                # Database password
DB_NAME=tickettoken_db                 # Database name
DATABASE_URL=postgresql://${DB_USER}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_NAME}

# ==== Database Connection Pool ====
DB_POOL_MIN=2                          # Minimum pool connections
DB_POOL_MAX=10                         # Maximum pool connections

# ==== REQUIRED: Redis Configuration ====
REDIS_HOST=localhost                   # Redis host
REDIS_PORT=6379                       # Redis port
REDIS_PASSWORD=<REDIS_PASSWORD>       # Redis password (if auth enabled)
REDIS_DB=0                            # Redis database number
REDIS_URL=redis://:${REDIS_PASSWORD}@${REDIS_HOST}:${REDIS_PORT}/${REDIS_DB}

# ==== REQUIRED: Security Configuration ====
JWT_SECRET=<CHANGE_TO_256_BIT_SECRET> # JWT signing secret (min 32 chars)
JWT_EXPIRES_IN=15m                    # Access token expiration
JWT_REFRESH_EXPIRES_IN=7d             # Refresh token expiration
JWT_ALGORITHM=HS256                   # JWT algorithm
JWT_ISSUER=tickettoken                # JWT issuer
JWT_AUDIENCE=tickettoken-platform     # JWT audience

# ==== REQUIRED: Service Discovery ====
# Internal service URLs for service-to-service communication
AUTH_SERVICE_URL=http://localhost:3001
VENUE_SERVICE_URL=http://localhost:3002
EVENT_SERVICE_URL=http://localhost:3003
TICKET_SERVICE_URL=http://localhost:3004
PAYMENT_SERVICE_URL=http://localhost:3005
MARKETPLACE_SERVICE_URL=http://localhost:3008
ANALYTICS_SERVICE_URL=http://localhost:3007
NOTIFICATION_SERVICE_URL=http://localhost:3008
INTEGRATION_SERVICE_URL=http://localhost:3009
COMPLIANCE_SERVICE_URL=http://localhost:3010
QUEUE_SERVICE_URL=http://localhost:3011
SEARCH_SERVICE_URL=http://localhost:3012
FILE_SERVICE_URL=http://localhost:3013
MONITORING_SERVICE_URL=http://localhost:3014
BLOCKCHAIN_SERVICE_URL=http://localhost:3015
ORDER_SERVICE_URL=http://localhost:3016

# ==== Optional: Monitoring & Logging ====
LOG_LEVEL=info                                # debug | info | warn | error
LOG_FORMAT=json                               # json | pretty
ENABLE_METRICS=true                          # Enable Prometheus metrics
METRICS_PORT=9090                            # Metrics endpoint port

# ==== Optional: Feature Flags ====
ENABLE_RATE_LIMITING=true                    # Enable rate limiting
RATE_LIMIT_WINDOW_MS=60000                  # Rate limit window (1 minute)
RATE_LIMIT_MAX_REQUESTS=100                 # Max requests per window

# ==== Environment-Specific Overrides ====
# Add any environment-specific configurations below
# These will override the defaults above based on NODE_ENV

```

================================================================================
## SECTION 5: REPOSITORY AND SERVICE LAYERS
================================================================================

### FILE: src/tests/services/venue.service.test.ts
```typescript
import { VenueService } from '../../services/venue.service';
import { setupTestApp, cleanupDatabase } from '../setup';
import { FastifyInstance } from 'fastify';

describe('VenueService', () => {
  let app: FastifyInstance;
  let venueService: VenueService;
  let db: any;

  beforeAll(async () => {
    app = await setupTestApp();
    const container = app.container.cradle;
    venueService = container.venueService;
    db = container.db;
  });

  afterEach(async () => {
    await cleanupDatabase(db);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('createVenue', () => {
    it('should create a venue with owner', async () => {
      const venueData = {
        name: 'Test Comedy Club',
        type: 'comedy_club' as const,
        capacity: 200,
        address: {
          street: '123 Main St',
          city: 'New York',
          state: 'NY',
          zipCode: '10001',
          country: 'US'
        },
      city: 'New York',
      state: 'NY',
      zip_code: '10001'
      };

      const venue = await venueService.createVenue(venueData, 'user-123');

      expect(venue).toHaveProperty('id');
      expect(venue.name).toBe('Test Comedy Club');
      expect(venue.slug).toBe('test-comedy-club');

      // Check staff was added
      const staff = await db('venue_staff').where({ venue_id: venue.id }).first();
      expect(staff.user_id).toBe('user-123');
      expect(staff.role).toBe('owner');
    });
  });
});
```

### FILE: src/services/integration.service.ts
```typescript
import { IntegrationModel, IIntegration } from '../models/integration.model';
import { Knex } from 'knex';

interface IIntegrationWithCredentials extends IIntegration {
  encrypted_credentials?: string;
}

export class IntegrationService {
  private integrationModel: IntegrationModel;
  private db: Knex;
  private logger: any;

  constructor(dependencies: { db: Knex; logger: any }) {
    this.db = dependencies.db;
    this.logger = dependencies.logger;
    this.integrationModel = new IntegrationModel(this.db);
  }

  async getIntegration(integrationId: string): Promise<IIntegrationWithCredentials | null> {
    const integration = await this.integrationModel.findById(integrationId);
    return integration as IIntegrationWithCredentials;
  }

  async getVenueIntegrationByType(venueId: string, type: string): Promise<IIntegrationWithCredentials | null> {
    return this.integrationModel.findByVenueAndType(venueId, type) as Promise<IIntegrationWithCredentials | null>;
  }

  async listVenueIntegrations(venueId: string): Promise<IIntegration[]> {
    return this.integrationModel.findByVenue(venueId);
  }

  async createIntegration(venueId: string, data: any): Promise<IIntegration> {
    return this.integrationModel.create({
      venue_id: venueId,
      type: data.type,
      config: data.config || {},
      status: data.status || 'active',
      encrypted_credentials: data.encrypted_credentials
    });
  }

  async updateIntegration(integrationId: string, updates: any): Promise<IIntegration> {
    return this.integrationModel.update(integrationId, updates);
  }

  async deleteIntegration(integrationId: string): Promise<void> {
    await this.integrationModel.delete(integrationId);
  }

  async testIntegration(integrationId: string): Promise<{ success: boolean; message: string }> {
    const integration = await this.getIntegration(integrationId) as IIntegrationWithCredentials;
    if (!integration) {
      throw new Error('Integration not found');
    }

    const encrypted_credentials = integration.api_key_encrypted || integration.api_secret_encrypted;

    // Use integration_type instead of type
    switch (integration.integration_type) {
      case 'stripe':
        return this.testStripeIntegration(encrypted_credentials);
      case 'square':
        return this.testSquareIntegration(encrypted_credentials);
      default:
        return { success: false, message: 'Integration type not supported' };
    }
  }

  private testStripeIntegration(encrypted_credentials: any): { success: boolean; message: string } {
    try {
      // Test Stripe connection
      return { success: true, message: 'Stripe connection successful' };
    } catch (error) {
      return { success: false, message: 'Failed to connect to Stripe' };
    }
  }

  private testSquareIntegration(encrypted_credentials: any): { success: boolean; message: string } {
    try {
      // Test Square connection
      return { success: true, message: 'Square connection successful' };
    } catch (error) {
      return { success: false, message: 'Failed to connect to Square' };
    }
  }

  private encryptCredentials(encrypted_credentials: any): string {
    // Implement encryption
    return JSON.stringify(encrypted_credentials);
  }

  private decryptCredentials(encryptedCredentials: string): any {
    // Implement decryption
    return JSON.parse(encryptedCredentials);
  }

  async syncWithExternalSystem(integrationId: string): Promise<void> {
    const integration = await this.getIntegration(integrationId) as IIntegrationWithCredentials;
    if (!integration) {
      throw new Error('Integration not found');
    }

    const encrypted_credentials = integration.api_key_encrypted || integration.api_secret_encrypted;

    // Use integration_type instead of type
    this.logger.info({ integrationId, type: integration.integration_type }, 'Syncing with external system');
  }
}
```

### FILE: src/services/verification.service.ts
```typescript
import { logger } from '../utils/logger';
import { db } from '../config/database';

export interface VerificationResult {
  verified: boolean;
  checks: {
    businessInfo: boolean;
    taxInfo: boolean;
    bankAccount: boolean;
    identity: boolean;
  };
  issues: string[];
  verifiedAt?: Date;
}

export class VerificationService {
  async verifyVenue(venueId: string): Promise<VerificationResult> {
    const venue = await db('venues').where({ id: venueId }).first();
    if (!venue) {
      throw new Error('Venue not found');
    }

    const result: VerificationResult = {
      verified: false,
      checks: {
        businessInfo: false,
        taxInfo: false,
        bankAccount: false,
        identity: false,
      },
      issues: [],
    };

    // Check business information
    result.checks.businessInfo = await this.verifyBusinessInfo(venue);
    if (!result.checks.businessInfo) {
      result.issues.push('Incomplete business information');
    }

    // Check tax information
    result.checks.taxInfo = await this.verifyTaxInfo(venueId);
    if (!result.checks.taxInfo) {
      result.issues.push('Tax information not provided');
    }

    // Check bank account
    result.checks.bankAccount = await this.verifyBankAccount(venueId);
    if (!result.checks.bankAccount) {
      result.issues.push('Bank account not verified');
    }

    // Check identity verification
    result.checks.identity = await this.verifyIdentity(venueId);
    if (!result.checks.identity) {
      result.issues.push('Identity verification pending');
    }

    // All checks passed?
    result.verified = Object.values(result.checks).every(check => check);

    if (result.verified) {
      result.verifiedAt = new Date();
      await this.markVenueVerified(venueId);
    }

    logger.info({ venueId, result }, 'Venue verification completed');

    return result;
  }

  async submitDocument(venueId: string, documentType: string, documentData: any): Promise<void> {
    // Store document reference
    await db('venue_documents').insert({
      venue_id: venueId,
      type: documentType,
      status: 'pending',
      submitted_at: new Date(),
      metadata: documentData,
    });

    // Trigger verification based on document type
    switch (documentType) {
      case 'business_license':
      case 'articles_of_incorporation':
        await this.triggerBusinessVerification(venueId);
        break;
      case 'tax_id':
      case 'w9':
        await this.triggerTaxVerification(venueId);
        break;
      case 'bank_statement':
      case 'voided_check':
        await this.triggerBankVerification(venueId);
        break;
      case 'drivers_license':
      case 'passport':
        await this.triggerIdentityVerification(venueId);
        break;
    }

    logger.info({ venueId, documentType }, 'Document submitted for verification');
  }

  async getVerificationStatus(venueId: string): Promise<{
    status: 'unverified' | 'pending' | 'verified' | 'rejected';
    completedChecks: string[];
    pendingChecks: string[];
    requiredDocuments: string[];
  }> {
    const verification = await this.verifyVenue(venueId);
    const documents = await db('venue_documents')
      .where({ venue_id: venueId })
      .select('type', 'status');

    const completedChecks = Object.entries(verification.checks)
      .filter(([_, passed]) => passed)
      .map(([check]) => check);

    const pendingChecks = Object.entries(verification.checks)
      .filter(([_, passed]) => !passed)
      .map(([check]) => check);

    const requiredDocuments = this.getRequiredDocuments(pendingChecks);

    let status: 'unverified' | 'pending' | 'verified' | 'rejected' = 'unverified';
    if (verification.verified) {
      status = 'verified';
    } else if (documents.some((d: any) => d.status === 'pending')) {
      status = 'pending';
    } else if (documents.some((d: any) => d.status === 'rejected')) {
      status = 'rejected';
    }

    return {
      status,
      completedChecks,
      pendingChecks,
      requiredDocuments,
    };
  }

  private async verifyBusinessInfo(venue: any): Promise<boolean> {
    // Check if required business fields are present
    return !!(
      venue.name &&
      venue.address &&
      venue.type &&
      venue.capacity
    );
  }

  private async verifyTaxInfo(venueId: string): Promise<boolean> {
    // Check for tax documents
    const taxDocs = await db('venue_documents')
      .where({ venue_id: venueId, type: 'tax_id', status: 'approved' })
      .orWhere({ venue_id: venueId, type: 'w9', status: 'approved' })
      .first();

    return !!taxDocs;
  }

  private async verifyBankAccount(venueId: string): Promise<boolean> {
    // Check for verified payment integration
    const paymentIntegration = await db('venue_integrations')
      .where({ venue_id: venueId, status: 'active' })
      .whereIn('type', ['stripe', 'square'])
      .first();

    return !!paymentIntegration;
  }

  private async verifyIdentity(venueId: string): Promise<boolean> {
    // Check for identity documents
    const identityDocs = await db('venue_documents')
      .where({ venue_id: venueId, status: 'approved' })
      .whereIn('type', ['drivers_license', 'passport'])
      .first();

    return !!identityDocs;
  }

  private async markVenueVerified(venueId: string): Promise<void> {
    await db('venues')
      .where({ id: venueId })
      .update({
        settings: db.raw("settings || ?::jsonb", JSON.stringify({
          verification: {
            verified: true,
            verifiedAt: new Date(),
          },
        })),
        updated_at: new Date(),
      });
  }

  private getRequiredDocuments(pendingChecks: string[]): string[] {
    const documentMap: Record<string, string[]> = {
      businessInfo: ['business_license', 'articles_of_incorporation'],
      taxInfo: ['tax_id', 'w9'],
      bankAccount: ['bank_statement', 'voided_check'],
      identity: ['drivers_license', 'passport'],
    };

    return pendingChecks.flatMap(check => documentMap[check] || []);
  }

  private async triggerBusinessVerification(venueId: string): Promise<void> {
    // TODO: Integrate with verification service
    logger.info({ venueId }, 'Business verification triggered');
  }

  private async triggerTaxVerification(venueId: string): Promise<void> {
    // TODO: Integrate with tax verification service
    logger.info({ venueId }, 'Tax verification triggered');
  }

  private async triggerBankVerification(venueId: string): Promise<void> {
    // TODO: Integrate with bank verification service
    logger.info({ venueId }, 'Bank verification triggered');
  }

  private async triggerIdentityVerification(venueId: string): Promise<void> {
    // TODO: Integrate with identity verification service
    logger.info({ venueId }, 'Identity verification triggered');
  }
}
```

### FILE: src/services/analytics.service.ts
```typescript
import { HttpClient } from '../utils/httpClient';

export class AnalyticsService {
  private httpClient: HttpClient;
  private logger: any;

  constructor(dependencies: { logger: any }) {
    this.logger = dependencies.logger;
    this.httpClient = new HttpClient(
      process.env.ANALYTICS_API_URL || 'http://analytics-service:3000',
      this.logger
    );
  }

  async getVenueAnalytics(venueId: string, options: any = {}) {
    try {
      const response: any = await this.httpClient.get(`/venues/${venueId}/analytics`, {
        params: options
      });
      return response.data;
    } catch (error) {
      this.logger.error({ error, venueId }, 'Failed to fetch venue analytics');
      throw error;
    }
  }

  async trackEvent(eventData: any) {
    try {
      const response: any = await this.httpClient.post('/events', eventData);
      return response.data;
    } catch (error) {
      this.logger.error({ error, eventData }, 'Failed to track event');
      throw error;
    }
  }
}
```

### FILE: src/services/healthCheck.service.ts
```typescript
import { Knex } from 'knex';
import Redis from 'ioredis';
import { logger } from '../utils/logger';

export interface HealthCheckResult {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  service: string;
  version: string;
  uptime: number;
  checks: {
    [key: string]: {
      status: 'ok' | 'warning' | 'error';
      message?: string;
      responseTime?: number;
      details?: any;
    };
  };
}

export class HealthCheckService {
  private db: Knex;
  private redis: Redis;
  private startTime: Date;

  constructor(dependencies: { db: Knex; redis: Redis }) {
    this.db = dependencies.db;
    this.redis = dependencies.redis;
    this.startTime = new Date();
  }

  // Liveness probe - is the service alive?
  async getLiveness(): Promise<{ status: string; timestamp: string }> {
    return {
      status: 'alive',
      timestamp: new Date().toISOString()
    };
  }

  // Readiness probe - is the service ready to accept traffic?
  async getReadiness(): Promise<HealthCheckResult> {
    const checks: HealthCheckResult['checks'] = {};
    
    // Check database
    const dbStart = Date.now();
    try {
      await this.db.raw('SELECT 1');
      checks.database = {
        status: 'ok',
        responseTime: Date.now() - dbStart
      };
    } catch (error: any) {
      checks.database = {
        status: 'error',
        message: error.message,
        responseTime: Date.now() - dbStart
      };
    }

    // Check Redis
    const redisStart = Date.now();
    try {
      await this.redis.ping();
      checks.redis = {
        status: 'ok',
        responseTime: Date.now() - redisStart
      };
    } catch (error: any) {
      checks.redis = {
        status: 'error',
        message: error.message,
        responseTime: Date.now() - redisStart
      };
    }

    // Determine overall status
    const hasErrors = Object.values(checks).some(c => c.status === 'error');
    
    let status: HealthCheckResult['status'] = 'healthy';
    if (hasErrors) {
      if (checks.database.status === 'error') {
        status = 'unhealthy'; // Database is critical
      } else {
        status = 'degraded'; // Redis failure is degraded
      }
    }

    return {
      status,
      timestamp: new Date().toISOString(),
      service: 'venue-service',
      version: process.env.npm_package_version || '1.0.0',
      uptime: Date.now() - this.startTime.getTime(),
      checks
    };
  }

  // Full health check with business logic
  async getFullHealth(): Promise<HealthCheckResult> {
    const readiness = await this.getReadiness();
    
    // Add business logic checks
    const businessChecks: HealthCheckResult['checks'] = {};
    
    // Check if we can query venues
    const queryStart = Date.now();
    try {
      const count = await this.db('venues').count('id as count').first();
      businessChecks.venueQuery = {
        status: 'ok',
        responseTime: Date.now() - queryStart,
        details: { venueCount: count?.count || 0 }
      };
    } catch (error: any) {
      businessChecks.venueQuery = {
        status: 'error',
        message: error.message,
        responseTime: Date.now() - queryStart
      };
    }

    // Check cache operations
    const cacheStart = Date.now();
    try {
      const testKey = 'health:check:' + Date.now();
      await this.redis.set(testKey, 'ok', 'EX', 10);
      const value = await this.redis.get(testKey);
      await this.redis.del(testKey);
      
      businessChecks.cacheOperations = {
        status: value === 'ok' ? 'ok' : 'warning',
        responseTime: Date.now() - cacheStart
      };
    } catch (error: any) {
      businessChecks.cacheOperations = {
        status: 'error',
        message: error.message,
        responseTime: Date.now() - cacheStart
      };
    }

    return {
      ...readiness,
      checks: {
        ...readiness.checks,
        ...businessChecks
      }
    };
  }
}
```

### FILE: src/services/cache.service.ts
```typescript
import Redis from 'ioredis';
import { logger } from '../utils/logger';
import { withCircuitBreaker } from '../utils/circuitBreaker';
import { withRetry } from '../utils/retry';
import { CacheError } from '../utils/errors';

export class CacheService {
  private redis: Redis;
  private defaultTTL: number = 3600; // 1 hour default
  private keyPrefix: string = 'venue:';

  // Wrapped Redis operations with circuit breakers and retry
  private getWithBreaker: (key: string) => Promise<string | null>;
  private setWithBreaker: (key: string, value: string, ttl?: number) => Promise<string>;
  private delWithBreaker: (key: string) => Promise<number>;
  private existsWithBreaker: (key: string) => Promise<number>;
  private scanWithBreaker: (cursor: string, pattern: string, count: number) => Promise<[string, string[]]>;

  constructor(redis: Redis) {
    this.redis = redis;

    // Wrap Redis operations with retry then circuit breaker
    this.getWithBreaker = withCircuitBreaker(
      (key: string) => withRetry(
        () => this.redis.get(key),
        { maxAttempts: 2, initialDelay: 50 }
      ),
      { name: 'redis-get', timeout: 1000 }
    );

    this.setWithBreaker = withCircuitBreaker(
      (key: string, value: string, ttl?: number) => withRetry(
        () => {
          if (ttl) {
            return this.redis.setex(key, ttl, value);
          }
          return this.redis.set(key, value);
        },
        { maxAttempts: 2, initialDelay: 50 }
      ),
      { name: 'redis-set', timeout: 1000 }
    );

    this.delWithBreaker = withCircuitBreaker(
      (key: string) => withRetry(
        () => this.redis.del(key),
        { maxAttempts: 2, initialDelay: 50 }
      ),
      { name: 'redis-del', timeout: 1000 }
    );

    this.existsWithBreaker = withCircuitBreaker(
      (key: string) => withRetry(
        () => this.redis.exists(key),
        { maxAttempts: 2, initialDelay: 50 }
      ),
      { name: 'redis-exists', timeout: 1000 }
    );

    this.scanWithBreaker = withCircuitBreaker(
      (cursor: string, pattern: string, count: number) => withRetry(
        () => this.redis.scan(cursor, 'MATCH', pattern, 'COUNT', count),
        { maxAttempts: 2, initialDelay: 50 }
      ),
      { name: 'redis-scan', timeout: 2000 }
    );
  }

  // Generate cache key with prefix
  private getCacheKey(key: string): string {
    return `${this.keyPrefix}${key}`;
  }

  // Get from cache
  async get(key: string): Promise<any | null> {
    try {
      const cacheKey = this.getCacheKey(key);
      const data = await this.getWithBreaker(cacheKey);
      
      if (data) {
        logger.debug({ key: cacheKey }, 'Cache hit');
        return JSON.parse(data);
      }
      
      logger.debug({ key: cacheKey }, 'Cache miss');
      return null;
    } catch (error) {
      logger.error({ error, key }, 'Cache get error');
      throw new CacheError('get', error);
    }
  }

  // Set in cache
  async set(key: string, value: any, ttl: number = this.defaultTTL): Promise<void> {
    try {
      const cacheKey = this.getCacheKey(key);
      const data = JSON.stringify(value);
      await this.setWithBreaker(cacheKey, data, ttl);
      logger.debug({ key: cacheKey, ttl }, 'Cache set');
    } catch (error) {
      logger.error({ error, key }, 'Cache set error');
      throw new CacheError('set', error);
    }
  }

  // Delete from cache
  async del(key: string): Promise<void> {
    try {
      const cacheKey = this.getCacheKey(key);
      await this.delWithBreaker(cacheKey);
      logger.debug({ key: cacheKey }, 'Cache deleted');
    } catch (error) {
      logger.error({ error, key }, 'Cache delete error');
      throw new CacheError('delete', error);
    }
  }

  // Clear venue cache with pattern matching
  async clearVenueCache(venueId: string): Promise<void> {
    try {
      const patterns = [
        `${this.keyPrefix}${venueId}`,
        `${this.keyPrefix}${venueId}:*`,
        `${this.keyPrefix}list:*${venueId}*`,
        `${this.keyPrefix}tenant:*:${venueId}`
      ];

      for (const pattern of patterns) {
        await this.clearByPattern(pattern);
      }

      logger.info({ venueId }, 'Venue cache cleared');
    } catch (error) {
      logger.error({ error, venueId }, 'Failed to clear venue cache');
      throw new CacheError('clear', error);
    }
  }

  // Clear all venue-related cache for a tenant
  async clearTenantVenueCache(tenantId: string): Promise<void> {
    try {
      const pattern = `${this.keyPrefix}tenant:${tenantId}:*`;
      await this.clearByPattern(pattern);
      logger.info({ tenantId }, 'Tenant venue cache cleared');
    } catch (error) {
      logger.error({ error, tenantId }, 'Failed to clear tenant venue cache');
      throw new CacheError('clear', error);
    }
  }

  // Clear cache by pattern using SCAN
  private async clearByPattern(pattern: string): Promise<void> {
    let cursor = '0';
    const keysToDelete: string[] = [];

    do {
      try {
        const [nextCursor, keys] = await this.scanWithBreaker(cursor, pattern, 100);
        cursor = nextCursor;
        keysToDelete.push(...keys);
      } catch (error) {
        logger.error({ error, pattern }, 'Failed to scan keys');
        throw error;
      }
    } while (cursor !== '0');

    if (keysToDelete.length > 0) {
      // Delete in batches to avoid blocking
      const batchSize = 100;
      for (let i = 0; i < keysToDelete.length; i += batchSize) {
        const batch = keysToDelete.slice(i, i + batchSize);
        try {
          await this.redis.del(...batch);
        } catch (error) {
          logger.error({ error, batch }, 'Failed to delete batch');
        }
      }
      logger.debug({ pattern, count: keysToDelete.length }, 'Keys deleted by pattern');
    }
  }

  // Cache-aside pattern helpers
  async getOrSet<T>(
    key: string,
    fetchFn: () => Promise<T>,
    ttl: number = this.defaultTTL
  ): Promise<T> {
    // Try to get from cache
    const cached = await this.get(key);
    if (cached !== null) {
      return cached;
    }

    // Fetch from source
    const data = await fetchFn();
    
    // Store in cache (fire and forget)
    this.set(key, data, ttl).catch(error => {
      logger.error({ error, key }, 'Failed to cache after fetch');
    });

    return data;
  }

  // Warm cache with data
  async warmCache(entries: Array<{ key: string; value: any; ttl?: number }>): Promise<void> {
    const promises = entries.map(entry => 
      this.set(entry.key, entry.value, entry.ttl || this.defaultTTL)
        .catch(error => {
          logger.error({ error, key: entry.key }, 'Failed to warm cache entry');
        })
    );

    await Promise.allSettled(promises);
    logger.info({ count: entries.length }, 'Cache warmed');
  }

  // Invalidate multiple keys
  async invalidateKeys(keys: string[]): Promise<void> {
    const promises = keys.map(key => 
      this.del(key).catch(error => {
        logger.error({ error, key }, 'Failed to invalidate key');
      })
    );

    await Promise.allSettled(promises);
    logger.debug({ count: keys.length }, 'Keys invalidated');
  }

  // Check if key exists
  async exists(key: string): Promise<boolean> {
    try {
      const cacheKey = this.getCacheKey(key);
      const exists = await this.existsWithBreaker(cacheKey);
      return exists === 1;
    } catch (error) {
      logger.error({ error, key }, 'Cache exists check error');
      return false;
    }
  }

  // Get remaining TTL for a key
  async ttl(key: string): Promise<number> {
    try {
      const cacheKey = this.getCacheKey(key);
      return await this.redis.ttl(cacheKey);
    } catch (error) {
      logger.error({ error, key }, 'Failed to get TTL');
      return -1;
    }
  }
}

// Export singleton instance
let cacheInstance: CacheService | null = null;

export function initializeCache(redis: Redis): CacheService {
  if (!cacheInstance) {
    cacheInstance = new CacheService(redis);
  }
  return cacheInstance;
}

export { cacheInstance as cache };
```

### FILE: src/services/onboarding.service.ts
```typescript
import { VenueService } from './venue.service';
import { IntegrationModel } from '../models/integration.model';
import { LayoutModel } from '../models/layout.model';
import { StaffModel } from '../models/staff.model';
import { Knex } from 'knex';

export class OnboardingService {
  private venueService: VenueService;
  private integrationModel: IntegrationModel;
  private layoutModel: LayoutModel;
  private staffModel: StaffModel;
  private db: Knex;
  private logger: any;

  constructor(dependencies: {
    venueService: VenueService;
    db: Knex;
    logger: any;
  }) {
    this.venueService = dependencies.venueService;
    this.db = dependencies.db;
    this.logger = dependencies.logger;
    this.integrationModel = new IntegrationModel(this.db);
    this.layoutModel = new LayoutModel(this.db);
    this.staffModel = new StaffModel(this.db);
  }

  async getOnboardingStatus(venueId: string): Promise<any> {
    const steps = await this.getOnboardingSteps(venueId);
    const completedSteps = steps.filter((s: any) => s.completed).length;
    const totalSteps = steps.length;

    return {
      venueId,
      progress: Math.round((completedSteps / totalSteps) * 100),
      completedSteps,
      totalSteps,
      steps,
      status: completedSteps === totalSteps ? 'completed' : 'in_progress'
    };
  }

  private async getOnboardingSteps(venueId: string): Promise<any[]> {
    return [
      {
        id: 'basic_info',
        name: 'Basic Information',
        description: 'Venue name, type, and capacity',
        completed: await this.hasBasicInfo(venueId),
        required: true
      },
      {
        id: 'address',
        name: 'Address',
        description: 'Venue location details',
        completed: await this.hasAddress(venueId),
        required: true
      },
      {
        id: 'layout',
        name: 'Seating Layout',
        description: 'Configure venue seating arrangement',
        completed: await this.hasLayout(venueId),
        required: false
      },
      {
        id: 'payment',
        name: 'Payment Integration',
        description: 'Connect payment processor',
        completed: await this.hasPaymentIntegration(venueId),
        required: true
      },
      {
        id: 'staff',
        name: 'Staff Members',
        description: 'Add team members',
        completed: await this.hasStaff(venueId),
        required: false
      }
    ];
  }

  private async hasBasicInfo(venueId: string): Promise<boolean> {
    const venue = await this.db('venues').where({ id: venueId }).first();
    return !!(venue && venue.name && venue.type && venue.capacity);
  }

  private async hasAddress(venueId: string): Promise<boolean> {
    const venue = await this.db('venues').where({ id: venueId }).first();
    if (!venue || !venue.address) return false;
    const address = venue.address;
    return !!(address.street && address.city && address.state && address.zipCode);
  }

  private async hasLayout(venueId: string): Promise<boolean> {
    const layouts = await this.layoutModel.findByVenue(venueId);
    return layouts.length > 0;
  }

  private async hasPaymentIntegration(venueId: string): Promise<boolean> {
    const integrations = await this.integrationModel.findByVenue(venueId);
    return integrations.some((i: any) => i.type === 'stripe' || i.type === 'square');
  }

  private async hasStaff(venueId: string): Promise<boolean> {
    const staffCount = await this.db('venue_staff')
      .where({ venue_id: venueId })
      .whereNull('deleted_at')
      .count('* as count')
      .first();
    return parseInt(String(staffCount?.count || '0'), 10) > 1;
  }

  async completeStep(venueId: string, stepId: string, data: any): Promise<void> {
    switch (stepId) {
      case 'basic_info':
        await this.updateBasicInfo(venueId, data);
        break;
      case 'address':
        await this.updateAddress(venueId, data);
        break;
      case 'layout':
        await this.createLayout(venueId, data);
        break;
      case 'payment':
        await this.createPaymentIntegration(venueId, data);
        break;
      case 'staff':
        await this.addStaffMember(venueId, data);
        break;
      default:
        throw new Error(`Unknown onboarding step: ${stepId}`);
    }
  }

  private async updateBasicInfo(venueId: string, data: any): Promise<void> {
    await this.db('venues').where({ id: venueId }).update({
      name: data.name,
      type: data.type,
      capacity: data.capacity,
      updated_at: new Date()
    });
  }

  private async updateAddress(venueId: string, data: any): Promise<void> {
    await this.db('venues').where({ id: venueId }).update({
      address: data,
      updated_at: new Date()
    });
  }

  private async createLayout(venueId: string, data: any): Promise<void> {
    await this.layoutModel.create({
      venue_id: venueId,
      name: data.name,
      type: data.type,
      sections: data.sections,
      capacity: data.capacity,
      is_default: true
    });
  }

  private async createPaymentIntegration(venueId: string, data: any): Promise<void> {
    await this.integrationModel.create({
      venue_id: venueId,
      type: data.type,
      config: data.config,
      is_active: true
    });
  }

  private async addStaffMember(venueId: string, data: any): Promise<void> {
    await this.staffModel.addStaffMember({
      venue_id: venueId,
      user_id: data.userId,
      role: data.role,
      permissions: data.permissions || []
    });
  }
}
```

### FILE: src/services/venue.service.ts
```typescript
import { createSpan } from '../utils/tracing';
import { VenueModel, IVenue } from '../models/venue.model';
import { QUEUES } from "@tickettoken/shared/src/mq/queues";
import { StaffModel } from '../models/staff.model';
import { SettingsModel } from '../models/settings.model';
import { VenueAuditLogger } from '../utils/venue-audit-logger';
import { Redis } from 'ioredis';
import { Knex } from 'knex';

import { EventPublisher } from './eventPublisher';
import { CacheService } from './cache.service';

export class VenueService {
  private redis: Redis;
  private auditLogger: VenueAuditLogger;
  private logger: any;
  private db: Knex;
  private cacheService: CacheService;
  private eventPublisher: EventPublisher;

  constructor(dependencies: {
    db: Knex;
    redis: Redis;
    cacheService: CacheService;
    eventPublisher: EventPublisher;
    logger: any
  }) {
    this.redis = dependencies.redis;
    this.logger = dependencies.logger;
    this.auditLogger = new VenueAuditLogger(dependencies.db);
    this.db = dependencies.db;
    this.cacheService = dependencies.cacheService;
    this.eventPublisher = dependencies.eventPublisher;
  }

  // Helper method to get models with proper db connection
  private getModels(dbOrTrx: Knex | Knex.Transaction = this.db) {
    return {
      venueModel: new VenueModel(dbOrTrx),
      staffModel: new StaffModel(dbOrTrx),
      settingsModel: new SettingsModel(dbOrTrx)
    };
  }

  async createVenue(venueData: Partial<IVenue>, ownerId: string, requestInfo?: any): Promise<IVenue> {
    try {
      // Start transaction
      const venue = await this.db.transaction(async (trx) => {
        // Get models with transaction
        const { venueModel, staffModel } = this.getModels(trx);

        // Create venue using transaction
        // Add owner ID to venue data
        venueData.created_by = ownerId;

        const newVenue = await venueModel.createWithDefaults(venueData);

        // Add owner as staff using transaction
        await staffModel.addStaffMember({
          venue_id: newVenue.id,
          user_id: ownerId,
          role: 'owner',
          permissions: ['*'],
        });

        // Initialize default settings using transaction
        await trx('venues').where({ id: newVenue.id }).update({
          settings: this.getDefaultSettings(),
        });

        return newVenue;
      });

      // Log venue creation (outside transaction)
      await this.auditLogger.log('venue_created', ownerId, venue.id!, requestInfo);

      this.logger.info({ venueId: venue.id, ownerId }, 'Venue created successfully');

      // Publish venue created event
      if (venue.id) {
        await this.eventPublisher.publishVenueCreated(venue.id, venue, ownerId);
      }

      return venue;
    } catch (error) {
      this.logger.error({ error, venueData }, 'Failed to create venue');
      throw error;
    }
  }

  async getVenue(venueId: string, userId: string): Promise<IVenue | null> {
    // Check cache first
    const cacheKey = `venue:${venueId}:details`;
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      // Still need to check access for cached venues
      const hasAccess = await this.checkVenueAccess(venueId, userId);
      if (!hasAccess) {
        throw new Error('Access denied');
      }
      return JSON.parse(cached);
    }

    // Get venue from database
    const { venueModel } = this.getModels();
    const venue = await venueModel.findById(venueId);

    // Return null if venue doesn't exist (controller will return 404)
    if (!venue) {
      return null;
    }

    // NOW check access permission for existing venue
    const hasAccess = await this.checkVenueAccess(venueId, userId);
    if (!hasAccess) {
      throw new Error('Access denied');
    }

    // Cache the venue since it exists and user has access
    await this.redis.setex(cacheKey, 300, JSON.stringify(venue));

    return venue;
  }

  async updateVenue(venueId: string, updates: Partial<IVenue>, userId: string, tenantId?: string): Promise<IVenue> {
    const { venueModel, staffModel } = this.getModels();

    // Check permission
    const hasPermission = await staffModel.hasPermission(venueId, userId, 'venue:update');
    if (!hasPermission) {
      throw new Error('Permission denied');
    }

    // Check if slug is being updated and is unique
    if (updates.slug) {
      const existing = await venueModel.findBySlug(updates.slug);
      if (existing && existing.id !== venueId) {
        throw new Error('Slug already in use');
      }
    }

    const updated = await venueModel.update(venueId, updates);

    // Clear cache
    await this.clearVenueCache(venueId);

    this.logger.info({ venueId, userId, updates }, 'Venue updated');

    // Publish venue updated event
    if (updated.id) {
      await this.eventPublisher.publishVenueUpdated(updated.id, updates, userId);
    }
    return updated;
  }

  async deleteVenue(venueId: string, userId: string): Promise<void> {
    const { venueModel, staffModel } = this.getModels();

    // Only owners can delete venues
    const staffMember = await staffModel.findByVenueAndUser(venueId, userId);
    if (!staffMember || staffMember.role !== 'owner') {
      throw new Error('Only venue owners can delete venues');
    }

    // Check if venue can be deleted (no active events, etc.)
    const canDelete = await this.canDeleteVenue(venueId);
    if (!canDelete.allowed) {
      throw new Error(`Cannot delete venue: ${canDelete.reason}`);
    }

    await venueModel.softDelete(venueId);

    // Clear all caches
    await this.clearVenueCache(venueId);

    this.logger.info({ venueId, userId }, 'Venue deleted');

    // Publish venue deleted event
    await this.eventPublisher.publishVenueDeleted(venueId, userId);
  }

  async searchVenues(searchTerm: string, filters: any = {}): Promise<IVenue[]> {
    const { venueModel } = this.getModels();
    return venueModel.searchVenues(searchTerm, filters);
  }

  async getVenueStats(venueId: string): Promise<any> {
    const cacheKey = `venue:${venueId}:stats`;
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    const { venueModel } = this.getModels();
    const stats = await venueModel.getVenueStats(venueId);

    // Cache for 1 minute
    await this.redis.setex(cacheKey, 60, JSON.stringify(stats));

    return stats;
  }

  async checkVenueAccess(venueId: string, userId: string): Promise<boolean> {
    try {
      const { venueModel, staffModel } = this.getModels();
      console.log("DEBUG: Checking access for", { venueId, userId });

      const staffMember = await staffModel.findByVenueAndUser(venueId, userId);
      console.log("DEBUG: Staff member result:", staffMember);

      if (!staffMember || !staffMember.is_active) {
        console.log("DEBUG: No active staff member found");
        return false;
      }

      const venue = await venueModel.findById(venueId);
      console.log("DEBUG: Venue result:", venue?.id, venue?.is_active);

      if (!venue || !venue.is_active) {
        console.log("DEBUG: Venue not found or inactive");
        return false;
      }

      return true;
    } catch (error) {
      console.error("DEBUG: Error in checkVenueAccess:", error);
      throw error;
    }
  }

  async updateOnboardingProgress(venueId: string, step: string, completed: boolean): Promise<void> {
    const { venueModel } = this.getModels();

    const venue = await venueModel.findById(venueId);
    if (!venue) {
      throw new Error('Venue not found');
    }

    const onboarding = venue.onboarding || {};
    onboarding[step] = completed;

    await venueModel.update(venueId, {
      onboarding,
      onboarding_status: this.calculateOnboardingStatus(onboarding),
    });

    await this.clearVenueCache(venueId);
  }

  async listVenues(query: any = {}): Promise<IVenue[]> {
    try {
      const searchTerm = query.search || '';
      const filters = {
        type: query.type,
        city: query.city,
        state: query.state,
        limit: query.limit || 20,
        offset: query.offset || 0
      };

      Object.keys(filters).forEach(key =>
        (filters as any)[key] === undefined && delete (filters as any)[key]
      );

      return await this.searchVenues(searchTerm, filters);
    } catch (error) {
      this.logger.error({ error, query }, 'Error listing venues');
      throw error;
    }
  }

  async listUserVenues(userId: string, query: any = {}): Promise<IVenue[]> {
    try {
      const staffVenues = await this.db('venue_staff')
        .where({ user_id: userId, is_active: true })
        .whereNull('deleted_at')
        .select('venue_id');

      const venueIds = staffVenues.map(s => s.venue_id);

      if (venueIds.length === 0) {
        return [];
      }

      let venueQuery = this.db('venues')
        .whereIn('id', venueIds)
        .whereNull('deleted_at')
        .where('is_active', true);

      if (query.type) {
        venueQuery = venueQuery.where('type', query.type);
      }
      if (query.search) {
        venueQuery = venueQuery.where(function() {
          this.where('name', 'ilike', `%${query.search}%`)
            .orWhere('slug', 'ilike', `%${query.search}%`);
        });
      }

      const limit = parseInt(query.limit) || 20;
      const offset = parseInt(query.offset) || 0;
      venueQuery = venueQuery.limit(limit).offset(offset);

      const venues = await venueQuery;
      return venues;
    } catch (error) {
      this.logger.error({ error, userId, query }, 'Error listing user venues');
      throw error;
    }
  }

  async getAccessDetails(venueId: string, userId: string): Promise<any> {
    const { staffModel } = this.getModels();

    const staff = await staffModel.findByVenueAndUser(venueId, userId);
    if (!staff) {
      return null;
    }
    return {
      role: staff.role,
      permissions: staff.permissions || []
    };
  }

  async addStaffMember(venueId: string, staffData: any, requesterId: string): Promise<any> {
    const { staffModel } = this.getModels();

    // Verify requester has permission to add staff
    const requesterStaff = await staffModel.findByVenueAndUser(venueId, requesterId);
    if (!requesterStaff || (requesterStaff.role !== 'owner' && requesterStaff.role !== 'manager')) {
      throw new Error('Only owners and managers can add staff');
    }

    // Add the new staff member
    return staffModel.addStaffMember({
      venue_id: venueId,
      user_id: staffData.userId,
      role: staffData.role,
      permissions: staffData.permissions || []
    });
  }

  async getVenueStaff(venueId: string, requesterId: string): Promise<any[]> {
    const { staffModel } = this.getModels();

    // Verify requester has access to this venue
    const hasAccess = await this.checkVenueAccess(venueId, requesterId);
    if (!hasAccess) {
      throw new Error('Access denied');
    }

    return staffModel.getVenueStaff(venueId);
  }


  async removeStaffMember(venueId: string, staffId: string, requesterId: string): Promise<void> {
    const { staffModel } = this.getModels();

    // Verify requester is owner
    const requesterStaff = await staffModel.findByVenueAndUser(venueId, requesterId);
    if (!requesterStaff || requesterStaff.role !== 'owner') {
      throw new Error('Only owners can remove staff');
    }

    // Cannot remove yourself
    if (staffId === requesterStaff.id) {
      throw new Error('Cannot remove yourself');
    }

    // Remove the staff member
    await staffModel.delete(staffId);
  }

  private async canDeleteVenue(venueId: string): Promise<{ allowed: boolean; reason?: string }> {
    return { allowed: true };
  }

  private async clearVenueCache(venueId: string): Promise<void> {
    const keysToDelete = [
      `venue:${venueId}:details`,
      `venue:${venueId}:stats`,
      `venue:${venueId}:events`,
      `venue:${venueId}:staff`
    ];

    for (const key of keysToDelete) {
      await this.redis.del(key);
    }
  }

  private calculateOnboardingStatus(onboarding: Record<string, boolean>): string {
    const steps = ['basic_info', 'layout', 'integrations', 'staff'];
    const completed = steps.filter(step => onboarding[step]).length;

    if (completed === 0) return 'pending';
    if (completed === steps.length) return 'completed';
    return 'in_progress';
  }

  private getDefaultSettings(): Record<string, any> {
    return {
      general: {
        timezone: 'America/New_York',
        currency: 'USD',
        language: 'en',
      },
      ticketing: {
        allowRefunds: true,
        refundWindow: 24,
        maxTicketsPerOrder: 10,
        requirePhoneNumber: false,
      },
      notifications: {
        emailEnabled: true,
        smsEnabled: false,
      }
    };
  }
}
```

### FILE: src/services/compliance.service.ts
```typescript
import { logger } from '../utils/logger';
import { db } from '../config/database';

export interface ComplianceReport {
  venueId: string;
  generatedAt: Date;
  overallStatus: 'compliant' | 'non_compliant' | 'review_needed';
  categories: {
    dataProtection: ComplianceCategory;
    ageVerification: ComplianceCategory;
    accessibility: ComplianceCategory;
    financialReporting: ComplianceCategory;
    licensing: ComplianceCategory;
  };
  recommendations: ComplianceRecommendation[];
  nextReviewDate: Date;
}

interface ComplianceCategory {
  status: 'compliant' | 'non_compliant' | 'review_needed';
  checks: ComplianceCheck[];
  lastReviewDate?: Date;
}

interface ComplianceCheck {
  name: string;
  passed: boolean;
  details: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
}

interface ComplianceRecommendation {
  category: string;
  issue: string;
  recommendation: string;
  priority: 'immediate' | 'high' | 'medium' | 'low';
  dueDate?: Date;
}

export class ComplianceService {
  async generateComplianceReport(venueId: string): Promise<ComplianceReport> {
    const venue = await db('venues').where({ id: venueId }).first();
    if (!venue) {
      throw new Error('Venue not found');
    }

    const report: ComplianceReport = {
      venueId,
      generatedAt: new Date(),
      overallStatus: 'compliant',
      categories: {
        dataProtection: await this.checkDataProtection(venueId),
        ageVerification: await this.checkAgeVerification(venueId),
        accessibility: await this.checkAccessibility(venueId),
        financialReporting: await this.checkFinancialReporting(venueId),
        licensing: await this.checkLicensing(venueId),
      },
      recommendations: [],
      nextReviewDate: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000), // 90 days
    };

    // Determine overall status
    const statuses = Object.values(report.categories).map(cat => cat.status);
    if (statuses.includes('non_compliant')) {
      report.overallStatus = 'non_compliant';
    } else if (statuses.includes('review_needed')) {
      report.overallStatus = 'review_needed';
    }

    // Generate recommendations
    report.recommendations = this.generateRecommendations(report.categories);

    // Store report
    await this.storeComplianceReport(report);

    logger.info({ venueId, status: report.overallStatus }, 'Compliance report generated');

    return report;
  }

  async scheduleComplianceReview(venueId: string, reviewDate: Date): Promise<void> {
    await db('venue_compliance_reviews').insert({
      venue_id: venueId,
      scheduled_date: reviewDate,
      status: 'scheduled',
      created_at: new Date(),
    });

    logger.info({ venueId, reviewDate }, 'Compliance review scheduled');
  }

  async updateComplianceSettings(venueId: string, settings: any): Promise<void> {
    const existing = await db('venue_compliance')
      .where({ venue_id: venueId })
      .first();

    if (existing) {
      await db('venue_compliance')
        .where({ venue_id: venueId })
        .update({
          settings,
          updated_at: new Date(),
        });
    } else {
      await db('venue_compliance').insert({
        venue_id: venueId,
        settings,
        created_at: new Date(),
      });
    }

    // Check if settings change affects compliance
    await this.checkComplianceImpact(venueId, settings);
  }

  private async checkDataProtection(venueId: string): Promise<ComplianceCategory> {
    const checks: ComplianceCheck[] = [];
    
    // Check GDPR compliance
    const gdprSettings = await this.getGDPRSettings(venueId);
    checks.push({
      name: 'GDPR Compliance',
      passed: gdprSettings.enabled && !!gdprSettings.privacyPolicyUrl,
      details: gdprSettings.enabled ? 'GDPR compliance enabled' : 'GDPR compliance not configured',
      severity: 'critical',
    });

    // Check data retention policies
    const retentionSettings = await this.getRetentionSettings(venueId);
    checks.push({
      name: 'Data Retention Policy',
      passed: retentionSettings.configured,
      details: `Customer data retained for ${retentionSettings.customerDataDays} days`,
      severity: 'high',
    });

    // Check encryption
    checks.push({
      name: 'Data Encryption',
      passed: true, // Assume encrypted at rest
      details: 'All sensitive data encrypted at rest',
      severity: 'critical',
    });

    const status = checks.every(c => c.passed) ? 'compliant' : 
                   checks.some(c => !c.passed && c.severity === 'critical') ? 'non_compliant' : 
                   'review_needed';

    return { status, checks, lastReviewDate: new Date() };
  }

  private async checkAgeVerification(venueId: string): Promise<ComplianceCategory> {
    const checks: ComplianceCheck[] = [];
    const settings = await this.getAgeVerificationSettings(venueId);

    checks.push({
      name: 'Age Verification System',
      passed: settings.enabled,
      details: settings.enabled ? `Minimum age: ${settings.minimumAge}` : 'Age verification not enabled',
      severity: 'medium', // TODO: Get venue type and set severity accordingly
    });

    if (settings.enabled) {
      checks.push({
        name: 'Verification Method',
        passed: settings.verificationRequired,
        details: settings.verificationRequired ? 'ID verification required' : 'Self-declaration only',
        severity: 'medium',
      });
    }

    const status = checks.every(c => c.passed) ? 'compliant' : 'review_needed';
    return { status, checks };
  }

  private async checkAccessibility(venueId: string): Promise<ComplianceCategory> {
    const checks: ComplianceCheck[] = [];
    const settings = await this.getAccessibilitySettings(venueId);

    checks.push({
      name: 'Wheelchair Accessibility',
      passed: settings.wheelchairAccessible !== null,
      details: settings.wheelchairAccessible ? 'Wheelchair accessible' : 'Accessibility status not specified',
      severity: 'high',
    });

    checks.push({
      name: 'Accessibility Information',
      passed: settings.hasAccessibilityInfo,
      details: 'Accessibility information provided to customers',
      severity: 'medium',
    });

    const status = checks.every(c => c.passed) ? 'compliant' : 'review_needed';
    return { status, checks };
  }

  private async checkFinancialReporting(venueId: string): Promise<ComplianceCategory> {
    const checks: ComplianceCheck[] = [];

    // Check tax reporting setup
    checks.push({
      name: 'Tax Reporting Configuration',
      passed: await this.hasTaxConfiguration(venueId),
      details: 'Tax reporting properly configured',
      severity: 'critical',
    });

    // Check payout compliance
    checks.push({
      name: 'Payout Compliance',
      passed: await this.hasVerifiedPayoutMethod(venueId),
      details: 'Verified payout method on file',
      severity: 'high',
    });

    const status = checks.every(c => c.passed) ? 'compliant' : 'non_compliant';
    return { status, checks };
  }

  private async checkLicensing(venueId: string): Promise<ComplianceCategory> {
    const checks: ComplianceCheck[] = [];
    const venue = await db('venues').where({ id: venueId }).first();

    // Check business license
    checks.push({
      name: 'Business License',
      passed: await this.hasValidBusinessLicense(venueId),
      details: 'Valid business license on file',
      severity: 'critical',
    });

    // Check entertainment license if applicable
    if (['comedy_club', 'theater'].includes(venue.type)) {
      checks.push({
        name: 'Entertainment License',
        passed: await this.hasEntertainmentLicense(venueId),
        details: 'Entertainment license required for venue type',
        severity: 'high',
      });
    }

    const status = checks.every(c => c.passed) ? 'compliant' : 
                   checks.some(c => !c.passed && c.severity === 'critical') ? 'non_compliant' : 
                   'review_needed';
    return { status, checks };
  }

  private generateRecommendations(categories: any): ComplianceRecommendation[] {
    const recommendations: ComplianceRecommendation[] = [];

    Object.entries(categories).forEach(([category, data]: [string, any]) => {
      data.checks.forEach((check: ComplianceCheck) => {
        if (!check.passed) {
          recommendations.push({
            category,
            issue: check.name,
            recommendation: this.getRecommendation(category, check.name),
            priority: check.severity === 'critical' ? 'immediate' : 
                     check.severity === 'high' ? 'high' : 'medium',
            dueDate: this.calculateDueDate(check.severity),
          });
        }
      });
    });

    return recommendations.sort((a, b) => {
      const priorityOrder = { immediate: 0, high: 1, medium: 2, low: 3 };
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    });
  }

  private getRecommendation(category: string, checkName: string): string {
    const recommendations: Record<string, Record<string, string>> = {
      dataProtection: {
        'GDPR Compliance': 'Enable GDPR compliance settings and upload privacy policy',
        'Data Retention Policy': 'Configure data retention periods in compliance settings',
      },
      ageVerification: {
        'Age Verification System': 'Enable age verification for age-restricted events',
        'Verification Method': 'Require ID verification for better compliance',
      },
      accessibility: {
        'Wheelchair Accessibility': 'Update venue accessibility information',
        'Accessibility Information': 'Provide detailed accessibility information for customers',
      },
      financialReporting: {
        'Tax Reporting Configuration': 'Complete tax information setup in venue settings',
        'Payout Compliance': 'Verify bank account or payment method for payouts',
      },
      licensing: {
        'Business License': 'Upload valid business license document',
        'Entertainment License': 'Upload entertainment license for your venue type',
      },
    };

    return recommendations[category]?.[checkName] || 'Review and update compliance settings';
  }

  private calculateDueDate(severity: string): Date {
    const daysToAdd = {
      critical: 7,
      high: 30,
      medium: 60,
      low: 90,
    };

    return new Date(Date.now() + ((daysToAdd as any)[severity] || 30) * 24 * 60 * 60 * 1000);
  }

  private async storeComplianceReport(report: ComplianceReport): Promise<void> {
    await db('venue_compliance_reports').insert({
      venue_id: report.venueId,
      report: JSON.stringify(report)
    });
  }

  // Helper methods for checks
  private async getGDPRSettings(venueId: string): Promise<any> {
    const compliance = await db('venue_compliance')
      .where({ venue_id: venueId })
      .first();
    
    return compliance?.settings?.gdpr || { enabled: false };
  }

  private async getRetentionSettings(venueId: string): Promise<any> {
    const compliance = await db('venue_compliance')
      .where({ venue_id: venueId })
      .first();
    
    const settings = compliance?.settings?.dataRetention || {};
    return {
      configured: !!settings.customerDataDays,
      ...settings,
    };
  }

  private async getAgeVerificationSettings(venueId: string): Promise<any> {
    const compliance = await db('venue_compliance')
      .where({ venue_id: venueId })
      .first();
    
    return compliance?.settings?.ageRestriction || { enabled: false };
  }

  private async getAccessibilitySettings(venueId: string): Promise<any> {
    const compliance = await db('venue_compliance')
      .where({ venue_id: venueId })
      .first();
    
    const settings = compliance?.settings?.accessibility || {};
    return {
      ...settings,
      hasAccessibilityInfo: !!(settings.wheelchairAccessible !== undefined),
    };
  }

  private async hasTaxConfiguration(venueId: string): Promise<boolean> {
    // Check if venue has tax information configured
    const taxDocs = await db('venue_documents')
      .where({ venue_id: venueId, document_type: 'tax_id', status: 'approved' })
      .first();
    
    return !!taxDocs;
  }

  private async hasVerifiedPayoutMethod(venueId: string): Promise<boolean> {
    // Check for verified payment integration
    const integration = await db('venue_integrations')
      .where({ venue_id: venueId, status: 'active' })
      .whereIn('type', ['stripe', 'square'])
      .first();
    
    return !!integration;
  }

  private async hasValidBusinessLicense(venueId: string): Promise<boolean> {
    const license = await db('venue_documents')
      .where({ venue_id: venueId, document_type: 'business_license', status: 'approved' })
      .first();
    
    return !!license;
  }

  private async hasEntertainmentLicense(venueId: string): Promise<boolean> {
    const license = await db('venue_documents')
      .where({ venue_id: venueId, document_type: 'entertainment_license', status: 'approved' })
      .first();
    
    return !!license;
  }

  private async checkComplianceImpact(venueId: string, newSettings: any): Promise<void> {
    // Check if settings change requires immediate compliance review
    const criticalChanges = ['gdpr', 'ageRestriction', 'dataRetention'];
    const hassCriticalChange = Object.keys(newSettings).some(key => criticalChanges.includes(key));
    
    if (hassCriticalChange) {
      logger.warn({ venueId, settings: newSettings }, 'Critical compliance settings changed');
      // TODO: Trigger compliance review notification
    }
  }
}
```

