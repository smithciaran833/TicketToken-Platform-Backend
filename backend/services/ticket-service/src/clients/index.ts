/**
 * Service Clients - ticket-service
 *
 * PHASE 5c REFACTORED:
 * Re-exports from @tickettoken/shared for backwards compatibility.
 * New code should import directly from '@tickettoken/shared'.
 */

// Re-export shared library clients
export {
  OrderServiceClient,
  orderServiceClient,
  MintingServiceClient,
  mintingServiceClient,
  ServiceClientError,
  createRequestContext,
} from '@tickettoken/shared';

// Legacy error class aliases for backwards compatibility
// These map to ServiceClientError from the shared library
export { ServiceClientError as OrderServiceError } from '@tickettoken/shared';
export { ServiceClientError as OrderServiceUnavailableError } from '@tickettoken/shared';
export { ServiceClientError as OrderValidationError } from '@tickettoken/shared';
export { ServiceClientError as OrderConflictError } from '@tickettoken/shared';
export { ServiceClientError as OrderNotFoundError } from '@tickettoken/shared';
