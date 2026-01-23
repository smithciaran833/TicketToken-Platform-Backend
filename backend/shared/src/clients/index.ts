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
 *   mintingServiceClient,
 *   paymentServiceClient,
 *   marketplaceServiceClient,
 *   notificationServiceClient,
 *   analyticsServiceClient,
 *   blockchainIndexerClient,
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
 * const mintStatus = await mintingServiceClient.getMintStatus('ticket-123', ctx);
 * const payment = await paymentServiceClient.getPaymentStatus('pi_123', ctx);
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
  // Types (Phase 5c)
  CreateOrderItemRequest,
  CreateOrderRequest,
  CreateOrderResponse,
  CancelOrderRequest,
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

// Export MintingServiceClient (P0 - CRITICAL)
export {
  MintingServiceClient,
  mintingServiceClient,
  // Types
  TokenMetadata,
  MintTicketRequest,
  MintTicketResponse,
  MintBatchRequest,
  MintBatchResponse,
  MintStatus,
  MintStatusResponse,
  QueueMintRequest,
  QueueMintResponse,
} from './minting-service.client';

// Export PaymentServiceClient (P0 - CRITICAL)
export {
  PaymentServiceClient,
  paymentServiceClient,
  // Types
  PaymentIntentStatus,
  CreatePaymentIntentRequest,
  CreatePaymentIntentResponse,
  ConfirmPaymentIntentRequest,
  ConfirmPaymentIntentResponse,
  CancelPaymentIntentResponse,
  PaymentStatusResponse,
  ProcessRefundRequest,
  ProcessRefundResponse,
  RoyaltyInfo,
  GetRoyaltiesResponse,
  ReverseRoyaltiesRequest,
  ReverseRoyaltiesResponse,
} from './payment-service.client';

// Export MarketplaceServiceClient (P0 - CRITICAL)
export {
  MarketplaceServiceClient,
  marketplaceServiceClient,
  // Types
  PaymentEventType,
  PaymentEventRequest,
  PaymentEventResponse,
  ListingStatus,
  ListingDetails,
  GetListingResponse,
  EscrowStatus,
  EscrowDetails,
  GetEscrowResponse,
  ReleaseEscrowRequest,
  ReleaseEscrowResponse,
} from './marketplace-service.client';

// Export NotificationServiceClient (P1)
export {
  NotificationServiceClient,
  notificationServiceClient,
  // Types
  NotificationChannel,
  NotificationPriority,
  NotificationStatus,
  SendNotificationRequest,
  SendNotificationResponse,
  BatchNotificationItem,
  SendBatchNotificationRequest,
  SendBatchNotificationResponse,
  UserNotification,
  GetUserNotificationsResponse,
  GetUserNotificationsOptions,
} from './notification-service.client';

// Export AnalyticsServiceClient (P1)
export {
  AnalyticsServiceClient,
  analyticsServiceClient,
  // Types
  AnalyticsEventType,
  TrackEventRequest,
  TrackEventResponse,
  MetricType,
  TrackMetricRequest,
  TrackMetricResponse,
  TimeRange,
  TimeGranularity,
  GetVenueAnalyticsOptions,
  TimeSeriesPoint,
  EventAnalytics,
  VenueAnalyticsResponse,
} from './analytics-service.client';

// Export BlockchainIndexerClient (P2)
export {
  BlockchainIndexerClient,
  blockchainIndexerClient,
  // Types
  TransactionStatus,
  NftOwnership,
  NftTransfer,
  NftDetailsResponse,
  TransactionDetailsResponse,
  RecordMarketplaceSaleRequest,
  RecordMarketplaceSaleResponse,
} from './blockchain-indexer.client';

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
