/**
 * Venue Service Client
 * 
 * Client for communicating with venue-service internal APIs.
 * Extends BaseServiceClient for circuit breaker, retry, and tracing support.
 */

import { BaseServiceClient, RequestContext } from '../http-client/base-service-client';
import {
  VenueWithBlockchain,
  GetVenueResponse,
  TicketValidationResult,
  ValidateTicketResponse,
  // Phase 5b types
  GetVenueBankInfoResponse,
  GetVenueChargebackRateResponse,
  // Phase 5c metrics types
  VenueMetricsResponse,
  // Phase 5c compliance types
  VenueExistsResponse,
  VenueBasicInfo,
  GetVenueBasicInfoResponse,
  BatchVenueNamesResponse,
} from './types';

/**
 * Client for venue-service internal APIs
 * 
 * @example
 * ```typescript
 * const client = new VenueServiceClient();
 * const venue = await client.getVenueInternal('venue-123', {
 *   tenantId: 'tenant-456',
 *   traceId: 'trace-789'
 * });
 * console.log(venue.walletAddress); // Blockchain wallet
 * ```
 */
export class VenueServiceClient extends BaseServiceClient {
  constructor() {
    super({
      baseURL: process.env.VENUE_SERVICE_URL || 'http://venue-service:3005',
      serviceName: 'venue-service',
      timeout: 10000,
    });
  }

  /**
   * Validate a ticket for entry at a venue
   * 
   * @param venueId - The venue ID
   * @param ticketId - The ticket ID to validate
   * @param ctx - Request context with tenant info
   * @returns Ticket validation result including scan status
   */
  async validateTicket(
    venueId: string,
    ticketId: string,
    ctx: RequestContext
  ): Promise<TicketValidationResult> {
    const response = await this.get<ValidateTicketResponse>(
      `/internal/venues/${venueId}/validate-ticket/${ticketId}`,
      ctx
    );
    return response.data;
  }

  /**
   * Get venue details including blockchain fields
   * 
   * Returns venue with blockchain-specific fields like:
   * - walletAddress: Venue's wallet address for payments
   * - ownerEmail: Owner's email for compliance
   * - ownerName: Owner's name for compliance
   * 
   * @param venueId - The venue ID
   * @param ctx - Request context with tenant info
   * @returns Venue details with blockchain fields
   */
  async getVenueInternal(venueId: string, ctx: RequestContext): Promise<VenueWithBlockchain> {
    const response = await this.get<GetVenueResponse>(
      `/internal/venues/${venueId}`,
      ctx
    );
    return response.data.venue;
  }

  /**
   * Check if ticket is valid for entry (helper method)
   * 
   * @param venueId - The venue ID
   * @param ticketId - The ticket ID
   * @param ctx - Request context with tenant info
   * @returns true if ticket is valid and not already scanned
   */
  async isTicketValidForEntry(
    venueId: string,
    ticketId: string,
    ctx: RequestContext
  ): Promise<boolean> {
    const result = await this.validateTicket(venueId, ticketId, ctx);
    return result.valid && !result.alreadyScanned;
  }

  /**
   * Get venue blockchain info (helper method)
   * 
   * @param venueId - The venue ID
   * @param ctx - Request context with tenant info
   * @returns Blockchain-related fields only
   */
  async getVenueBlockchainInfo(
    venueId: string,
    ctx: RequestContext
  ): Promise<{
    walletAddress?: string;
    ownerEmail?: string;
    ownerName?: string;
  }> {
    const venue = await this.getVenueInternal(venueId, ctx);
    return {
      walletAddress: venue.walletAddress,
      ownerEmail: venue.ownerEmail,
      ownerName: venue.ownerName,
    };
  }

  // ==========================================================================
  // PHASE 5b NEW METHODS - Methods for new internal endpoints
  // ==========================================================================

  /**
   * Get venue bank account and payout information
   * 
   * @param venueId - The venue ID
   * @param ctx - Request context with tenant info
   * @returns Venue with bank info (masked for security)
   */
  async getVenueBankInfo(venueId: string, ctx: RequestContext): Promise<GetVenueBankInfoResponse> {
    const response = await this.get<GetVenueBankInfoResponse>(
      `/internal/venues/${venueId}/bank-info`,
      ctx
    );
    return response.data;
  }

  /**
   * Get venue chargeback rate for risk assessment
   * 
   * @param venueId - The venue ID
   * @param ctx - Request context with tenant info
   * @param periodMonths - Period to check (default: 12)
   * @returns Venue chargeback metrics and risk level
   */
  async getVenueChargebackRate(
    venueId: string,
    ctx: RequestContext,
    periodMonths?: number
  ): Promise<GetVenueChargebackRateResponse> {
    const params = new URLSearchParams();
    if (periodMonths) params.append('periodMonths', periodMonths.toString());
    
    const queryString = params.toString();
    const path = `/internal/venues/${venueId}/chargeback-rate${queryString ? `?${queryString}` : ''}`;
    
    const response = await this.get<GetVenueChargebackRateResponse>(path, ctx);
    return response.data;
  }

  /**
   * Check if venue is ready for payouts (helper method)
   * 
   * @param venueId - The venue ID
   * @param ctx - Request context with tenant info
   * @returns true if venue has verified bank info
   */
  async isPayoutReady(venueId: string, ctx: RequestContext): Promise<boolean> {
    const result = await this.getVenueBankInfo(venueId, ctx);
    return result.isPayoutReady;
  }

  /**
   * Check if venue is high risk (helper method)
   * 
   * @param venueId - The venue ID
   * @param ctx - Request context with tenant info
   * @returns true if venue has high chargeback rate
   */
  async isHighRisk(venueId: string, ctx: RequestContext): Promise<boolean> {
    const result = await this.getVenueChargebackRate(venueId, ctx);
    return result.reserveRecommendation.isHighRisk;
  }

  // ==========================================================================
  // PHASE 5c METHODS - Monitoring Service Metrics Support
  // ==========================================================================

  /**
   * Get aggregated venue metrics for monitoring dashboards
   * 
   * @param ctx - Request context with tenant info
   * @returns Aggregated venue counts by status
   */
  async getVenueMetrics(ctx: RequestContext): Promise<VenueMetricsResponse> {
    const response = await this.get<VenueMetricsResponse>(
      '/internal/venues/metrics',
      ctx
    );
    return response.data;
  }

  // ==========================================================================
  // PHASE 5c METHODS - Compliance Service Support
  // ==========================================================================

  /**
   * Check if a venue exists for a tenant
   * 
   * @param venueId - The venue ID
   * @param ctx - Request context with tenant info
   * @returns Whether venue exists
   */
  async venueExists(venueId: string, ctx: RequestContext): Promise<boolean> {
    try {
      const response = await this.get<VenueExistsResponse>(
        `/internal/venues/${venueId}/exists`,
        ctx
      );
      return response.data.exists;
    } catch (error: any) {
      if (error.statusCode === 404) {
        return false;
      }
      throw error;
    }
  }

  /**
   * Get basic venue info (name, owner)
   * 
   * @param venueId - The venue ID
   * @param ctx - Request context with tenant info
   * @returns Basic venue info
   */
  async getVenueBasicInfo(venueId: string, ctx: RequestContext): Promise<VenueBasicInfo | null> {
    try {
      const response = await this.get<GetVenueBasicInfoResponse>(
        `/internal/venues/${venueId}/basic`,
        ctx
      );
      return response.data.venue;
    } catch (error: any) {
      if (error.statusCode === 404) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Get venue names for multiple venue IDs
   * 
   * @param venueIds - Array of venue IDs
   * @param ctx - Request context with tenant info
   * @returns Map of venue IDs to names
   */
  async batchGetVenueNames(venueIds: string[], ctx: RequestContext): Promise<BatchVenueNamesResponse> {
    const response = await this.post<BatchVenueNamesResponse>(
      '/internal/venues/batch-names',
      ctx,
      { venueIds }
    );
    return response.data;
  }
}

/** Singleton instance of VenueServiceClient */
export const venueServiceClient = new VenueServiceClient();
