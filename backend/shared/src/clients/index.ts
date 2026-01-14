/**
 * Service Clients
 * 
 * Centralized exports for all service-to-service clients.
 * These clients extend BaseServiceClient and provide type-safe
 * access to internal APIs with built-in circuit breaker, retry,
 * and distributed tracing.
 * 
 * @example
 * ```typescript
 * import { 
 *   ticketServiceClient, 
 *   authServiceClient,
 *   orderServiceClient,
 *   eventServiceClient,
 *   venueServiceClient,
 *   createRequestContext 
 * } from '@tickettoken/shared/clients';
 * 
 * // Create context
 * const ctx = createRequestContext('tenant-123', 'user-456');
 * 
 * // Use singleton instances
 * const ticket = await ticketServiceClient.getTicketFull('ticket-123', ctx);
 * const user = await authServiceClient.getUser('user-456', ctx);
 * const order = await orderServiceClient.getOrder('order-789', ctx);
 * const event = await eventServiceClient.getEventInternal('event-abc', ctx);
 * const venue = await venueServiceClient.getVenueInternal('venue-def', ctx);
 * 
 * // Or create new instances with custom config
 * const client = new TicketServiceClient();
 * ```
 */

// Export types
export * from './types';

// Export TicketServiceClient
export { 
  TicketServiceClient, 
  ticketServiceClient,
  GetTicketsByEventOptions,
} from './ticket-service.client';

// Export AuthServiceClient
export { 
  AuthServiceClient, 
  authServiceClient,
  GetAdminUsersOptions,
} from './auth-service.client';

// Export OrderServiceClient
export { 
  OrderServiceClient, 
  orderServiceClient,
} from './order-service.client';

// Export EventServiceClient
export { 
  EventServiceClient, 
  eventServiceClient,
} from './event-service.client';

// Export VenueServiceClient
export { 
  VenueServiceClient, 
  venueServiceClient,
} from './venue-service.client';

// Re-export base client utilities
export {
  BaseServiceClient,
  ServiceClientConfig,
  RequestContext,
  ServiceResponse,
  ServiceClientError,
  createRequestContext,
  extractRequestContext,
} from '../http-client/base-service-client';
