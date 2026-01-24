/**
 * Event Service Client
 * 
 * Client for communicating with event-service internal APIs.
 * Extends BaseServiceClient for circuit breaker, retry, and tracing support.
 */

import { BaseServiceClient, RequestContext } from '../http-client/base-service-client';
import {
  EventWithBlockchain,
  GetEventResponse,
  // Phase 5b types
  GetEventPdaResponse,
  GetEventScanStatsResponse,
  // Phase 5c metrics types
  EventMetricsResponse,
  ActiveEventsResponse,
  // Phase 5d types (event cancellation)
  UpdateBlockchainStatusRequest,
  UpdateBlockchainStatusResponse,
} from './types';

/**
 * Client for event-service internal APIs
 * 
 * @example
 * ```typescript
 * const client = new EventServiceClient();
 * const event = await client.getEventInternal('event-123', {
 *   tenantId: 'tenant-456',
 *   traceId: 'trace-789'
 * });
 * console.log(event.eventPda); // Blockchain PDA
 * ```
 */
export class EventServiceClient extends BaseServiceClient {
  constructor() {
    super({
      baseURL: process.env.EVENT_SERVICE_URL || 'http://event-service:3004',
      serviceName: 'event-service',
      timeout: 10000,
    });
  }

  /**
   * Get event details including blockchain fields
   * 
   * Returns event with blockchain-specific fields like:
   * - eventPda: Program Derived Address for Solana
   * - artistWallet: Artist's wallet address for royalties
   * - artistPercentage: Artist's royalty percentage
   * - venuePercentage: Venue's royalty percentage
   * - resaleable: Whether tickets can be resold
   * 
   * @param eventId - The event ID
   * @param ctx - Request context with tenant info
   * @returns Event details with blockchain fields
   */
  async getEventInternal(eventId: string, ctx: RequestContext): Promise<EventWithBlockchain> {
    const response = await this.get<GetEventResponse>(
      `/internal/events/${eventId}`,
      ctx
    );
    return response.data.event;
  }

  /**
   * Check if an event is resaleable (helper method)
   * 
   * @param eventId - The event ID
   * @param ctx - Request context with tenant info
   * @returns true if tickets for this event can be resold
   */
  async isEventResaleable(eventId: string, ctx: RequestContext): Promise<boolean> {
    const event = await this.getEventInternal(eventId, ctx);
    return event.resaleable;
  }

  /**
   * Get event blockchain info (helper method)
   * 
   * @param eventId - The event ID
   * @param ctx - Request context with tenant info
   * @returns Blockchain-related fields only
   */
  async getEventBlockchainInfo(
    eventId: string,
    ctx: RequestContext
  ): Promise<{
    eventPda?: string;
    artistWallet?: string;
    artistPercentage?: number;
    venuePercentage?: number;
    resaleable: boolean;
  }> {
    const event = await this.getEventInternal(eventId, ctx);
    return {
      eventPda: event.eventPda,
      artistWallet: event.artistWallet,
      artistPercentage: event.artistPercentage,
      venuePercentage: event.venuePercentage,
      resaleable: event.resaleable,
    };
  }

  // ==========================================================================
  // PHASE 5b NEW METHODS - Methods for new internal endpoints
  // ==========================================================================

  /**
   * Get event PDA and blockchain configuration for minting
   * 
   * @param eventId - The event ID
   * @param ctx - Request context with tenant info
   * @returns Event with blockchain PDA and config
   */
  async getEventPda(eventId: string, ctx: RequestContext): Promise<GetEventPdaResponse> {
    const response = await this.get<GetEventPdaResponse>(
      `/internal/events/${eventId}/pda`,
      ctx
    );
    return response.data;
  }

  /**
   * Get aggregated scan statistics for an event
   * 
   * @param eventId - The event ID
   * @param ctx - Request context with tenant info
   * @returns Event scan stats with ticket counts
   */
  async getEventScanStats(eventId: string, ctx: RequestContext): Promise<GetEventScanStatsResponse> {
    const response = await this.get<GetEventScanStatsResponse>(
      `/internal/events/${eventId}/scan-stats`,
      ctx
    );
    return response.data;
  }

  /**
   * Check if event has blockchain configuration (helper method)
   * 
   * @param eventId - The event ID
   * @param ctx - Request context with tenant info
   * @returns true if event has PDA configured
   */
  async hasBlockchainConfig(eventId: string, ctx: RequestContext): Promise<boolean> {
    const result = await this.getEventPda(eventId, ctx);
    return result.hasBlockchainConfig;
  }

  /**
   * Get event capacity utilization (helper method)
   * 
   * @param eventId - The event ID
   * @param ctx - Request context with tenant info
   * @returns Capacity utilization percentage (0-100)
   */
  async getCapacityUtilization(eventId: string, ctx: RequestContext): Promise<number> {
    const stats = await this.getEventScanStats(eventId, ctx);
    return stats.metrics.capacityUtilization;
  }

  // ==========================================================================
  // PHASE 5c METHODS - Monitoring Service Metrics Support
  // ==========================================================================

  /**
   * Get aggregated event metrics for monitoring dashboards
   * 
   * @param ctx - Request context with tenant info
   * @param periodDays - Period in days to aggregate (default: 30)
   * @returns Aggregated event counts by status
   */
  async getEventMetrics(ctx: RequestContext, periodDays?: number): Promise<EventMetricsResponse> {
    const params = new URLSearchParams();
    if (periodDays) params.append('periodDays', periodDays.toString());
    
    const queryString = params.toString();
    const path = `/internal/events/metrics${queryString ? `?${queryString}` : ''}`;
    
    const response = await this.get<EventMetricsResponse>(path, ctx);
    return response.data;
  }

  /**
   * Get events currently in active sale period
   *
   * @param ctx - Request context with tenant info
   * @returns List of events with ticket inventory info
   */
  async getActiveEvents(ctx: RequestContext): Promise<ActiveEventsResponse> {
    const response = await this.get<ActiveEventsResponse>(
      '/internal/events/active',
      ctx
    );
    return response.data;
  }

  // ==========================================================================
  // PHASE 5d METHODS - Event Cancellation Workflow Support
  // ==========================================================================

  /**
   * Update blockchain sync status for an event
   *
   * Called by blockchain-service after processing sync requests.
   * Updates event with PDA and signature on success, or error on failure.
   *
   * @param eventId - The event ID
   * @param request - Status update with PDA/signature or error
   * @param ctx - Request context with tenant info
   * @returns Update confirmation
   */
  async updateBlockchainStatus(
    eventId: string,
    request: UpdateBlockchainStatusRequest,
    ctx: RequestContext
  ): Promise<UpdateBlockchainStatusResponse> {
    const response = await this.put<UpdateBlockchainStatusResponse>(
      `/internal/events/${eventId}/blockchain-status`,
      ctx,
      request
    );
    return response.data;
  }

  /**
   * Mark event as synced with blockchain (helper method)
   *
   * @param eventId - The event ID
   * @param eventPda - The program derived address
   * @param signature - The transaction signature
   * @param ctx - Request context with tenant info
   * @returns Update confirmation
   */
  async markEventSynced(
    eventId: string,
    eventPda: string,
    signature: string,
    ctx: RequestContext
  ): Promise<UpdateBlockchainStatusResponse> {
    return this.updateBlockchainStatus(eventId, {
      status: 'synced',
      eventPda,
      signature,
      syncedAt: new Date().toISOString(),
    }, ctx);
  }

  /**
   * Mark event blockchain sync as failed (helper method)
   *
   * @param eventId - The event ID
   * @param error - Error message
   * @param ctx - Request context with tenant info
   * @returns Update confirmation
   */
  async markEventSyncFailed(
    eventId: string,
    error: string,
    ctx: RequestContext
  ): Promise<UpdateBlockchainStatusResponse> {
    return this.updateBlockchainStatus(eventId, {
      status: 'failed',
      error,
    }, ctx);
  }
}

/** Singleton instance of EventServiceClient */
export const eventServiceClient = new EventServiceClient();
