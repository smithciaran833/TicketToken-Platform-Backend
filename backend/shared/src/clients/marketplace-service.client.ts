/**
 * Marketplace Service Client
 *
 * Client for communicating with marketplace-service internal APIs.
 * Extends BaseServiceClient for circuit breaker, retry, and tracing support.
 *
 * Used by: payment-service
 */

import { BaseServiceClient, RequestContext, ServiceClientError } from '../http-client/base-service-client';

// =============================================================================
// Request/Response Types
// =============================================================================

/**
 * Payment event types
 */
export type PaymentEventType =
  | 'payment.succeeded'
  | 'payment.failed'
  | 'payment.refunded'
  | 'payment.disputed'
  | 'transfer.completed'
  | 'transfer.failed';

/**
 * Request to send a payment event to marketplace
 */
export interface PaymentEventRequest {
  /** Event type */
  eventType: PaymentEventType;
  /** Payment intent ID */
  paymentIntentId: string;
  /** Associated listing ID (if applicable) */
  listingId?: string;
  /** Associated transfer ID (if applicable) */
  transferId?: string;
  /** Buyer user ID */
  buyerId: string;
  /** Seller user ID */
  sellerId: string;
  /** Amount in cents */
  amount: number;
  /** Currency */
  currency: string;
  /** Event timestamp */
  timestamp: string;
  /** Additional metadata */
  metadata?: Record<string, string | number | boolean>;
}

/**
 * Response from payment event
 */
export interface PaymentEventResponse {
  /** Whether event was processed */
  success: boolean;
  /** Event ID for tracking */
  eventId: string;
  /** Any actions taken */
  actions?: string[];
  /** Message */
  message?: string;
}

/**
 * Listing status values
 */
export type ListingStatus =
  | 'draft'
  | 'active'
  | 'pending'
  | 'sold'
  | 'cancelled'
  | 'expired';

/**
 * Listing details
 */
export interface ListingDetails {
  /** Listing ID */
  listingId: string;
  /** Ticket ID being sold */
  ticketId: string;
  /** Seller user ID */
  sellerId: string;
  /** Listing price in cents */
  price: number;
  /** Currency */
  currency: string;
  /** Current status */
  status: ListingStatus;
  /** Event ID */
  eventId: string;
  /** Event name */
  eventName: string;
  /** Event date */
  eventDate: string;
  /** Ticket type/section */
  ticketType: string;
  /** Seat information */
  seat?: string;
  /** Row */
  row?: string;
  /** Section */
  section?: string;
  /** Created timestamp */
  createdAt: string;
  /** Updated timestamp */
  updatedAt: string;
  /** When listing expires */
  expiresAt?: string;
}

/**
 * Response from getting listing
 */
export interface GetListingResponse {
  /** Listing details */
  listing: ListingDetails;
}

/**
 * Escrow status values
 */
export type EscrowStatus =
  | 'pending'
  | 'funded'
  | 'released'
  | 'refunded'
  | 'disputed';

/**
 * Escrow details
 */
export interface EscrowDetails {
  /** Escrow ID */
  escrowId: string;
  /** Transfer ID */
  transferId: string;
  /** Listing ID */
  listingId: string;
  /** Buyer user ID */
  buyerId: string;
  /** Seller user ID */
  sellerId: string;
  /** Amount held in escrow */
  amount: number;
  /** Currency */
  currency: string;
  /** Current status */
  status: EscrowStatus;
  /** Payment intent ID (if funded via Stripe) */
  paymentIntentId?: string;
  /** When escrow was funded */
  fundedAt?: string;
  /** When escrow was released */
  releasedAt?: string;
  /** Created timestamp */
  createdAt: string;
  /** Updated timestamp */
  updatedAt: string;
}

/**
 * Response from getting escrow status
 */
export interface GetEscrowResponse {
  /** Escrow details */
  escrow: EscrowDetails;
}

/**
 * Request to release escrow funds
 */
export interface ReleaseEscrowRequest {
  /** Transfer ID */
  transferId: string;
  /** Reason for release */
  reason?: string;
  /** Whether to pay seller immediately */
  paySellerNow?: boolean;
}

/**
 * Response from releasing escrow
 */
export interface ReleaseEscrowResponse {
  /** Whether release succeeded */
  success: boolean;
  /** Escrow ID */
  escrowId: string;
  /** New status */
  status: EscrowStatus;
  /** Amount released to seller */
  amountReleased: number;
  /** Platform fee deducted */
  platformFee: number;
  /** Seller payout ID (if paid immediately) */
  sellerPayoutId?: string;
  /** Message */
  message?: string;
}

// =============================================================================
// Client Class
// =============================================================================

/**
 * Client for marketplace-service internal APIs
 *
 * @example
 * ```typescript
 * const client = new MarketplaceServiceClient();
 *
 * // Send payment event
 * await client.sendPaymentEvent({
 *   eventType: 'payment.succeeded',
 *   paymentIntentId: 'pi_123',
 *   listingId: 'listing-456',
 *   buyerId: 'user-buyer',
 *   sellerId: 'user-seller',
 *   amount: 5000,
 *   currency: 'usd',
 *   timestamp: new Date().toISOString()
 * }, ctx);
 *
 * // Get listing details
 * const listing = await client.getListing('listing-456', ctx);
 * ```
 */
export class MarketplaceServiceClient extends BaseServiceClient {
  constructor() {
    super({
      baseURL: process.env.MARKETPLACE_SERVICE_URL || 'http://marketplace-service:3010',
      serviceName: 'marketplace-service',
      timeout: 15000,
    });
  }

  /**
   * Send a payment event to marketplace for processing
   *
   * @param event - Payment event details
   * @param ctx - Request context with tenant/user IDs
   * @returns Event processing result
   */
  async sendPaymentEvent(
    event: PaymentEventRequest,
    ctx: RequestContext
  ): Promise<PaymentEventResponse> {
    const response = await this.post<PaymentEventResponse>(
      '/internal/events',
      ctx,
      event
    );
    return response.data;
  }

  /**
   * Get listing details by ID
   *
   * @param listingId - The listing ID
   * @param ctx - Request context with tenant/user IDs
   * @returns Listing details
   */
  async getListing(
    listingId: string,
    ctx: RequestContext
  ): Promise<ListingDetails> {
    const response = await this.get<GetListingResponse>(
      `/internal/listings/${listingId}`,
      ctx
    );
    return response.data.listing;
  }

  /**
   * Get listing details, returning null if not found
   *
   * @param listingId - The listing ID
   * @param ctx - Request context with tenant/user IDs
   * @returns Listing details or null
   */
  async getListingSafe(
    listingId: string,
    ctx: RequestContext
  ): Promise<ListingDetails | null> {
    try {
      return await this.getListing(listingId, ctx);
    } catch (error) {
      if (error instanceof ServiceClientError && error.statusCode === 404) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Get escrow status for a transfer
   *
   * @param transferId - The transfer ID
   * @param ctx - Request context with tenant/user IDs
   * @returns Escrow details
   */
  async getEscrowStatus(
    transferId: string,
    ctx: RequestContext
  ): Promise<EscrowDetails> {
    const response = await this.get<GetEscrowResponse>(
      `/internal/escrow/${transferId}`,
      ctx
    );
    return response.data.escrow;
  }

  /**
   * Release escrow funds to seller
   *
   * @param request - Release request details
   * @param ctx - Request context with tenant/user IDs
   * @returns Release result
   */
  async releaseEscrow(
    request: ReleaseEscrowRequest,
    ctx: RequestContext
  ): Promise<ReleaseEscrowResponse> {
    const response = await this.post<ReleaseEscrowResponse>(
      '/internal/escrow/release',
      ctx,
      request
    );
    return response.data;
  }

  /**
   * Check if a listing is still active (helper method)
   *
   * @param listingId - The listing ID
   * @param ctx - Request context with tenant/user IDs
   * @returns true if listing is active and purchasable
   */
  async isListingActive(
    listingId: string,
    ctx: RequestContext
  ): Promise<boolean> {
    try {
      const listing = await this.getListing(listingId, ctx);
      return listing.status === 'active';
    } catch (error) {
      if (error instanceof ServiceClientError && error.statusCode === 404) {
        return false;
      }
      throw error;
    }
  }

  /**
   * Check if escrow is funded and ready for release (helper method)
   *
   * @param transferId - The transfer ID
   * @param ctx - Request context with tenant/user IDs
   * @returns true if escrow is funded
   */
  async isEscrowFunded(
    transferId: string,
    ctx: RequestContext
  ): Promise<boolean> {
    try {
      const escrow = await this.getEscrowStatus(transferId, ctx);
      return escrow.status === 'funded';
    } catch (error) {
      if (error instanceof ServiceClientError && error.statusCode === 404) {
        return false;
      }
      throw error;
    }
  }
}

/** Singleton instance of MarketplaceServiceClient */
export const marketplaceServiceClient = new MarketplaceServiceClient();
