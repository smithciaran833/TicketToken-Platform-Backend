/**
 * Service Clients - queue-service
 *
 * PHASE 5c NOTES:
 * - PaymentServiceClient: Custom client with processPayment() method (different from shared library's
 *   Stripe payment intent pattern). Extends BaseServiceClient from shared library.
 * - MintingServiceClient & AnalyticsServiceClient: Prefer using shared library singletons directly:
 *   import { mintingServiceClient, analyticsServiceClient } from '@tickettoken/shared';
 *
 * Local clients are kept for backward compatibility and specific use cases.
 */

// Re-export shared library clients as preferred option
export {
  mintingServiceClient,
  analyticsServiceClient,
  createRequestContext,
} from '@tickettoken/shared';

// Local clients for specific queue-service patterns
export { PaymentServiceClient, getPaymentServiceClient } from './payment-service.client';
export { MintingServiceClient, getMintingServiceClient } from './minting-service.client';
export { AnalyticsServiceClient, getAnalyticsServiceClient } from './analytics-service.client';
