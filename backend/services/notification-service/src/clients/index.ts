/**
 * Service Clients - notification-service
 *
 * Re-exports from @tickettoken/shared for backwards compatibility.
 * New code should import directly from '@tickettoken/shared'.
 */

// Re-export shared library clients for any legacy imports
export {
  authServiceClient,
  AuthServiceClient,
  eventServiceClient,
  EventServiceClient,
} from '@tickettoken/shared';
