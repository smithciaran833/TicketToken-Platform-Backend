/**
 * Ticket Service Client
 * 
 * Client for communicating with ticket-service internal APIs.
 * Extends BaseServiceClient for circuit breaker, retry, and tracing support.
 */

import { BaseServiceClient, RequestContext, ServiceClientError } from '../http-client/base-service-client';
import {
  TicketStatus,
  TicketStatusResponse,
  CancelBatchResponse,
  CalculatePriceResponse,
  TicketFull,
  TicketFullResponse,
  TicketsByEventResponse,
  TicketByToken,
  TicketByTokenResponse,
  TransferResult,
  TransferTicketResponse,
  // Phase 5b types
  TicketCountForOrderResponse,
  RecordScanData,
  RecordScanResponse,
  UpdateNftData,
  UpdateNftResponse,
  BatchGetByTokenResponse,
  TicketByTokenBatch,
  TicketForValidationResponse,
  TicketForRefundResponse,
  // Phase 5c types (blockchain-indexer support)
  TicketForReconciliation,
  GetTicketsForReconciliationOptions,
  GetTicketsForReconciliationResponse,
  UpdateBlockchainSyncData,
  UpdateBlockchainSyncResponse,
  RecordBlockchainTransferData,
  RecordBlockchainTransferResponse,
  UpdateMarketplaceStatusData,
  UpdateMarketplaceStatusResponse,
  CheckTokenExistsResponse,
  // Phase 5c metrics types
  TicketMetricsResponse,
  // Phase 5d types (event cancellation)
  GetTicketsByUserResponse,
} from './types';

/**
 * Options for getTicketsByEvent query
 */
export interface GetTicketsByEventOptions {
  /** Filter by ticket status */
  status?: string;
  /** Maximum number of tickets to return */
  limit?: number;
  /** Offset for pagination */
  offset?: number;
}

/**
 * Options for getAdminUsers query
 */
export interface GetAdminUsersOptions {
  /** Filter by roles */
  roles?: string[];
}

/**
 * Client for ticket-service internal APIs
 * 
 * @example
 * ```typescript
 * const client = new TicketServiceClient();
 * const ticket = await client.getTicketFull('ticket-123', {
 *   tenantId: 'tenant-456',
 *   traceId: 'trace-789'
 * });
 * ```
 */
export class TicketServiceClient extends BaseServiceClient {
  constructor() {
    super({
      baseURL: process.env.TICKET_SERVICE_URL || 'http://ticket-service:3002',
      serviceName: 'ticket-service',
      timeout: 10000,
    });
  }

  /**
   * Get ticket status for refund validation
   * 
   * @param ticketId - The ticket ID
   * @param ctx - Request context with tenant info
   * @returns Ticket status information
   */
  async getTicketStatus(ticketId: string, ctx: RequestContext): Promise<TicketStatus> {
    const response = await this.get<TicketStatusResponse>(
      `/internal/tickets/${ticketId}/status`,
      ctx
    );
    return response.data.ticket;
  }

  /**
   * Cancel multiple tickets in a batch operation
   * 
   * @param ticketIds - Array of ticket IDs to cancel
   * @param reason - Reason for cancellation
   * @param refundId - Associated refund ID
   * @param ctx - Request context with tenant info
   * @returns Results of the batch cancellation
   */
  async cancelTicketsBatch(
    ticketIds: string[],
    reason: string,
    refundId: string,
    ctx: RequestContext
  ): Promise<CancelBatchResponse> {
    const response = await this.post<CancelBatchResponse>(
      '/internal/tickets/cancel-batch',
      ctx,
      { ticketIds, reason, refundId }
    );
    return response.data;
  }

  /**
   * Calculate total price for multiple tickets
   * 
   * @param ticketIds - Array of ticket IDs
   * @param ctx - Request context with tenant info
   * @returns Price breakdown for all tickets
   */
  async calculatePrice(ticketIds: string[], ctx: RequestContext): Promise<CalculatePriceResponse> {
    const response = await this.post<CalculatePriceResponse>(
      '/internal/tickets/calculate-price',
      ctx,
      { ticketIds }
    );
    return response.data;
  }

  /**
   * Get full ticket details including event and ticket type info
   * 
   * @param ticketId - The ticket ID
   * @param ctx - Request context with tenant info
   * @returns Full ticket details with event and type info
   */
  async getTicketFull(ticketId: string, ctx: RequestContext): Promise<TicketFull> {
    const response = await this.get<TicketFullResponse>(
      `/internal/tickets/${ticketId}/full`,
      ctx
    );
    return response.data.ticket;
  }

  /**
   * Get all tickets for an event
   * 
   * @param eventId - The event ID
   * @param ctx - Request context with tenant info
   * @param options - Query options for filtering and pagination
   * @returns List of tickets for the event
   */
  async getTicketsByEvent(
    eventId: string,
    ctx: RequestContext,
    options?: GetTicketsByEventOptions
  ): Promise<TicketsByEventResponse> {
    // Build query string
    const params = new URLSearchParams();
    if (options?.status) params.append('status', options.status);
    if (options?.limit) params.append('limit', options.limit.toString());
    if (options?.offset) params.append('offset', options.offset.toString());
    
    const queryString = params.toString();
    const path = `/internal/tickets/by-event/${eventId}${queryString ? `?${queryString}` : ''}`;
    
    const response = await this.get<TicketsByEventResponse>(path, ctx);
    return response.data;
  }

  /**
   * Get ticket by blockchain token ID
   * 
   * @param tokenId - The blockchain token ID
   * @param ctx - Request context with tenant info
   * @returns Ticket information or null if not found
   */
  async getTicketByToken(tokenId: string, ctx: RequestContext): Promise<TicketByToken | null> {
    try {
      const response = await this.get<TicketByTokenResponse>(
        `/internal/tickets/by-token/${tokenId}`,
        ctx
      );
      return response.data.ticket;
    } catch (error) {
      // Return null for 404 errors (ticket not found)
      if (error instanceof ServiceClientError && error.statusCode === 404) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Transfer ticket ownership to another user
   * 
   * @param ticketId - The ticket ID to transfer
   * @param toUserId - The user ID to transfer to
   * @param ctx - Request context with tenant info
   * @param reason - Optional reason for transfer
   * @returns Transfer result
   */
  async transferTicket(
    ticketId: string,
    toUserId: string,
    ctx: RequestContext,
    reason?: string
  ): Promise<TransferResult> {
    const response = await this.post<TransferTicketResponse>(
      `/internal/tickets/${ticketId}/transfer`,
      ctx,
      { toUserId, reason }
    );
    return response.data.transfer;
  }

  /**
   * Check if a ticket has been transferred (helper method)
   * 
   * @param ticketId - The ticket ID
   * @param originalBuyerId - The original buyer's user ID
   * @param ctx - Request context with tenant info
   * @returns true if ticket is still owned by original buyer
   */
  async checkTicketNotTransferred(
    ticketId: string,
    originalBuyerId: string,
    ctx: RequestContext
  ): Promise<boolean> {
    const ticket = await this.getTicketStatus(ticketId, ctx);
    return ticket.ownerId === originalBuyerId && !ticket.hasBeenTransferred;
  }

  // ==========================================================================
  // PHASE 5b NEW METHODS - Methods for new internal endpoints
  // ==========================================================================

  /**
   * Get ticket count for an order
   * 
   * @param orderId - The order ID
   * @param ctx - Request context with tenant info
   * @returns Ticket count response
   */
  async getTicketCountForOrder(orderId: string, ctx: RequestContext): Promise<TicketCountForOrderResponse> {
    const response = await this.get<TicketCountForOrderResponse>(
      `/internal/orders/${orderId}/tickets/count`,
      ctx
    );
    return response.data;
  }

  /**
   * Record a scan event on a ticket
   * 
   * @param ticketId - The ticket ID
   * @param scanData - Scan metadata (device, venue, type)
   * @param ctx - Request context with tenant info
   * @returns Scan recording result
   */
  async recordScan(
    ticketId: string,
    scanData: RecordScanData,
    ctx: RequestContext
  ): Promise<RecordScanResponse> {
    const response = await this.post<RecordScanResponse>(
      `/internal/tickets/${ticketId}/record-scan`,
      ctx,
      scanData
    );
    return response.data;
  }

  /**
   * Update NFT-related fields on a ticket
   * 
   * @param ticketId - The ticket ID
   * @param nftData - NFT metadata to update
   * @param ctx - Request context with tenant info
   * @returns Update result
   */
  async updateNft(
    ticketId: string,
    nftData: UpdateNftData,
    ctx: RequestContext
  ): Promise<UpdateNftResponse> {
    const response = await this.post<UpdateNftResponse>(
      `/internal/tickets/${ticketId}/update-nft`,
      ctx,
      nftData
    );
    return response.data;
  }

  /**
   * Get multiple tickets by their blockchain token IDs
   * 
   * @param tokenIds - Array of token IDs to lookup
   * @param ctx - Request context with tenant info
   * @returns Map of token IDs to tickets
   */
  async batchGetByToken(
    tokenIds: string[],
    ctx: RequestContext
  ): Promise<BatchGetByTokenResponse> {
    const response = await this.post<BatchGetByTokenResponse>(
      '/internal/tickets/batch-by-token',
      ctx,
      { tokenIds }
    );
    return response.data;
  }

  /**
   * Get ticket optimized for QR validation workflow
   * 
   * @param ticketId - The ticket ID
   * @param ctx - Request context with tenant info
   * @returns Ticket with validation status
   */
  async getTicketForValidation(
    ticketId: string,
    ctx: RequestContext
  ): Promise<TicketForValidationResponse> {
    const response = await this.get<TicketForValidationResponse>(
      `/internal/tickets/${ticketId}/for-validation`,
      ctx
    );
    return response.data;
  }

  /**
   * Get ticket with refund eligibility information
   * 
   * @param ticketId - The ticket ID
   * @param ctx - Request context with tenant info
   * @returns Ticket with refund eligibility
   */
  async getTicketForRefund(
    ticketId: string,
    ctx: RequestContext
  ): Promise<TicketForRefundResponse> {
    const response = await this.get<TicketForRefundResponse>(
      `/internal/tickets/${ticketId}/for-refund`,
      ctx
    );
    return response.data;
  }

  /**
   * Check if a ticket is eligible for refund (helper method)
   * 
   * @param ticketId - The ticket ID
   * @param ctx - Request context with tenant info
   * @returns true if ticket can be refunded
   */
  async isTicketRefundable(ticketId: string, ctx: RequestContext): Promise<boolean> {
    const result = await this.getTicketForRefund(ticketId, ctx);
    return result.refundEligibility.canRefund;
  }

  // ==========================================================================
  // PHASE 5c METHODS - Blockchain Indexer Support
  // ==========================================================================

  /**
   * Get tickets needing reconciliation with blockchain state
   * 
   * @param ctx - Request context with tenant info
   * @param options - Query options for filtering
   * @returns List of tickets to reconcile
   */
  async getTicketsForReconciliation(
    ctx: RequestContext,
    options?: GetTicketsForReconciliationOptions
  ): Promise<GetTicketsForReconciliationResponse> {
    const params = new URLSearchParams();
    if (options?.limit) params.append('limit', options.limit.toString());
    if (options?.syncStatus) params.append('syncStatus', options.syncStatus);
    if (options?.staleHours) params.append('staleHours', options.staleHours.toString());
    
    const queryString = params.toString();
    const path = `/internal/tickets/for-reconciliation${queryString ? `?${queryString}` : ''}`;
    
    const response = await this.get<GetTicketsForReconciliationResponse>(path, ctx);
    return response.data;
  }

  /**
   * Update blockchain sync status on a ticket
   * 
   * @param ticketId - The ticket ID
   * @param syncData - Blockchain sync data to update
   * @param ctx - Request context with tenant info
   * @returns Update result
   */
  async updateBlockchainSync(
    ticketId: string,
    syncData: UpdateBlockchainSyncData,
    ctx: RequestContext
  ): Promise<UpdateBlockchainSyncResponse> {
    const response = await this.post<UpdateBlockchainSyncResponse>(
      `/internal/tickets/${ticketId}/blockchain-sync`,
      ctx,
      syncData
    );
    return response.data;
  }

  /**
   * Update blockchain sync status by token ID
   * 
   * @param tokenId - The blockchain token ID
   * @param syncData - Blockchain sync data to update
   * @param ctx - Request context with tenant info
   * @returns Update result
   */
  async updateBlockchainSyncByToken(
    tokenId: string,
    syncData: UpdateBlockchainSyncData,
    ctx: RequestContext
  ): Promise<UpdateBlockchainSyncResponse> {
    const response = await this.post<UpdateBlockchainSyncResponse>(
      `/internal/tickets/by-token/${tokenId}/blockchain-sync`,
      ctx,
      syncData
    );
    return response.data;
  }

  /**
   * Record a blockchain transfer event
   * 
   * @param transferData - Transfer event data
   * @param ctx - Request context with tenant info
   * @returns Transfer recording result
   */
  async recordBlockchainTransfer(
    transferData: RecordBlockchainTransferData,
    ctx: RequestContext
  ): Promise<RecordBlockchainTransferResponse> {
    const response = await this.post<RecordBlockchainTransferResponse>(
      '/internal/tickets/blockchain-transfer',
      ctx,
      transferData
    );
    return response.data;
  }

  /**
   * Update marketplace listing status
   * 
   * @param marketplaceData - Marketplace status data
   * @param ctx - Request context with tenant info
   * @returns Update result
   */
  async updateMarketplaceStatus(
    marketplaceData: UpdateMarketplaceStatusData,
    ctx: RequestContext
  ): Promise<UpdateMarketplaceStatusResponse> {
    const response = await this.post<UpdateMarketplaceStatusResponse>(
      '/internal/tickets/marketplace-status',
      ctx,
      marketplaceData
    );
    return response.data;
  }

  /**
   * Check if a token ID belongs to our platform
   * 
   * @param tokenId - The blockchain token ID
   * @param ctx - Request context with tenant info
   * @returns Whether the token exists in our system
   */
  async checkTokenExists(tokenId: string, ctx: RequestContext): Promise<CheckTokenExistsResponse> {
    try {
      const response = await this.get<CheckTokenExistsResponse>(
        `/internal/tickets/by-token/${tokenId}/exists`,
        ctx
      );
      return response.data;
    } catch (error) {
      if (error instanceof ServiceClientError && error.statusCode === 404) {
        return { exists: false };
      }
      throw error;
    }
  }

  // ==========================================================================
  // PHASE 5c METHODS - Monitoring Service Metrics Support
  // ==========================================================================

  /**
   * Get aggregated ticket metrics for monitoring dashboards
   * 
   * @param ctx - Request context with tenant info
   * @param periodHours - Period in hours to aggregate (default: 24)
   * @returns Aggregated ticket counts by status
   */
  async getTicketMetrics(ctx: RequestContext, periodHours?: number): Promise<TicketMetricsResponse> {
    const params = new URLSearchParams();
    if (periodHours) params.append('periodHours', periodHours.toString());
    
    const queryString = params.toString();
    const path = `/internal/tickets/metrics${queryString ? `?${queryString}` : ''}`;
    
    const response = await this.get<TicketMetricsResponse>(path, ctx);
    return response.data;
  }

  // ==========================================================================
  // PHASE 5d METHODS - Event Cancellation Workflow Support
  // ==========================================================================

  /**
   * Get all tickets for a specific user
   * Used for event cancellation to notify ticket holders
   *
   * @param userId - The user ID
   * @param ctx - Request context with tenant info
   * @param options - Query options for filtering and pagination
   * @returns List of tickets owned by the user
   */
  async getTicketsByUser(
    userId: string,
    ctx: RequestContext,
    options?: {
      status?: string;
      eventId?: string;
      limit?: number;
      offset?: number;
    }
  ): Promise<GetTicketsByUserResponse> {
    const params = new URLSearchParams();
    if (options?.status) params.append('status', options.status);
    if (options?.eventId) params.append('eventId', options.eventId);
    if (options?.limit) params.append('limit', options.limit.toString());
    if (options?.offset) params.append('offset', options.offset.toString());

    const queryString = params.toString();
    const path = `/internal/tickets/user/${userId}${queryString ? `?${queryString}` : ''}`;

    const response = await this.get<GetTicketsByUserResponse>(path, ctx);
    return response.data;
  }

  // ==========================================================================
  // PHASE 5c METHODS - Transfer Service Support
  // ==========================================================================

  /**
   * Get ticket for transfer validation
   * 
   * @param ticketId - The ticket ID
   * @param userId - The current owner's user ID
   * @param ctx - Request context with tenant info
   * @returns Ticket transfer info
   */
  async getTicketForTransfer(
    ticketId: string,
    userId: string,
    ctx: RequestContext
  ): Promise<{ ticket: any; transferable: boolean; reason?: string }> {
    const response = await this.get<{ ticket: any; transferable: boolean; reason?: string }>(
      `/internal/tickets/${ticketId}/for-transfer?userId=${userId}`,
      ctx
    );
    return response.data;
  }

  /**
   * Get ticket type transfer rules
   * 
   * @param ticketTypeId - The ticket type ID
   * @param ctx - Request context with tenant info
   * @returns Ticket type with transfer rules
   */
  async getTicketTypeTransferInfo(
    ticketTypeId: string,
    ctx: RequestContext
  ): Promise<{ ticketType: any }> {
    const response = await this.get<{ ticketType: any }>(
      `/internal/ticket-types/${ticketTypeId}/transfer-info`,
      ctx
    );
    return response.data;
  }

  /**
   * Get ticket's event start date for proximity checks
   * 
   * @param ticketId - The ticket ID
   * @param ctx - Request context with tenant info
   * @returns Event date info
   */
  async getTicketEventDate(
    ticketId: string,
    ctx: RequestContext
  ): Promise<{ eventStartDate: string; eventName: string; daysUntilEvent: number }> {
    const response = await this.get<{ eventStartDate: string; eventName: string; daysUntilEvent: number }>(
      `/internal/tickets/${ticketId}/event-date`,
      ctx
    );
    return response.data;
  }
}

/** Singleton instance of TicketServiceClient */
export const ticketServiceClient = new TicketServiceClient();
