import { FastifyInstance } from 'fastify';
import eventsRoutes from './events.routes';
import scheduleRoutes from './schedules.routes';
import capacityRoutes from './capacity.routes';
import pricingRoutes from './pricing.routes';
import ticketRoutes from './tickets.routes';
import notificationRoutes from './notifications.routes';
import customerRoutes from './customers.routes';
import reportRoutes from './reports.routes';
import venueAnalyticsRoutes from './venue-analytics.routes';
import healthRoutes from './health.routes';
import cancellationRoutes from './cancellation.routes';
import internalRoutes from './internal.routes';

export default async function routes(app: FastifyInstance) {
  // Register health routes (no prefix, no auth)
  await app.register(healthRoutes);
  
  // Register internal routes (S2S only, no user auth)
  await app.register(internalRoutes);
  
  // Register all route modules
  await app.register(eventsRoutes);
  await app.register(scheduleRoutes);
  await app.register(capacityRoutes);
  await app.register(pricingRoutes);
  await app.register(ticketRoutes);
  await app.register(notificationRoutes);
  await app.register(customerRoutes);
  await app.register(reportRoutes);
  await app.register(venueAnalyticsRoutes);
  await app.register(cancellationRoutes);
}
