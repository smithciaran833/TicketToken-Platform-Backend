import { FastifyInstance } from 'fastify';
import { createLogger } from '../utils/logger';

const logger = createLogger('routes');

// Import all route files
import healthRoutes from './health.routes';
import authRoutes from './auth.routes';
import venuesRoutes from './venues.routes';
import eventsRoutes from './events.routes';
import ticketsRoutes from './tickets.routes';
import paymentRoutes from './payment.routes';
import webhookRoutes from './webhook.routes';  // Added webhook routes
import marketplaceRoutes from './marketplace.routes';
import analyticsRoutes from './analytics.routes';
import notificationRoutes from './notification.routes';
import complianceRoutes from './compliance.routes';
import queueRoutes from './queue.routes';
import searchRoutes from './search.routes';

// These might not exist yet
let fileRoutes: any;
let monitoringRoutes: any;
let integrationRoutes: any;
let eventRoutes: any;
let ticketRoutes: any;

// Try to import optional routes
try { fileRoutes = require('./file.routes').default; } catch {}
try { monitoringRoutes = require('./monitoring.routes').default; } catch {}
try { integrationRoutes = require('./integration.routes').default; } catch {}
try { eventRoutes = require('./event.routes').default; } catch {}
try { ticketRoutes = require('./ticket.routes').default; } catch {}

export async function setupRoutes(server: FastifyInstance) {
  logger.info('Registering routes...');

  // Health check (no prefix)
  await server.register(healthRoutes);

  // API v1 routes
  await server.register(async function apiRoutes(server) {
    await server.register(authRoutes, { prefix: '/auth' });
    await server.register(venuesRoutes, { prefix: '/venues' });
    await server.register(eventsRoutes, { prefix: '/events' });
    await server.register(ticketsRoutes, { prefix: '/tickets' });
    await server.register(paymentRoutes, { prefix: '/payments' });
    await server.register(webhookRoutes, { prefix: '/webhooks' });  // Added webhook registration
    await server.register(marketplaceRoutes, { prefix: '/marketplace' });
    await server.register(notificationRoutes, { prefix: '/notifications' });
    await server.register(complianceRoutes, { prefix: '/compliance' });
    await server.register(queueRoutes, { prefix: '/queue' });
    await server.register(analyticsRoutes, { prefix: '/analytics' });
    await server.register(searchRoutes, { prefix: '/search' });

    // Optional routes
    if (fileRoutes) await server.register(fileRoutes, { prefix: '/files' });
    if (monitoringRoutes) await server.register(monitoringRoutes, { prefix: '/monitoring' });
    if (integrationRoutes) await server.register(integrationRoutes, { prefix: '/integrations' });
    if (eventRoutes) await server.register(eventRoutes, { prefix: '/event' });
    if (ticketRoutes) await server.register(ticketRoutes, { prefix: '/ticket' });

    logger.info('All route modules registered');
  }, { prefix: '/api/v1' });

  logger.info('All routes registered successfully');
}
