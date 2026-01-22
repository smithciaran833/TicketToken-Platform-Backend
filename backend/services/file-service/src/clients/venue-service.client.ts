/**
 * Venue Service Client
 *
 * Provides authenticated communication with venue-service using HMAC authentication
 * from the shared library.
 */

import {
  BaseServiceClient,
  ServiceClientConfig,
  RequestContext,
  ServiceResponse,
} from '@tickettoken/shared';

interface VenueBranding {
  primaryColor?: string;
  secondaryColor?: string;
  logoUrl?: string;
  ticketBackgroundImage?: string;
  ticketHeaderText?: string;
  ticketFooterText?: string;
  fontFamily?: string;
}

interface VenueDetails {
  id: string;
  name: string;
  hide_platform_branding?: boolean;
  address?: string;
}

interface BrandingResponse {
  branding: VenueBranding;
}

interface VenueResponse {
  venue: VenueDetails;
}

export class VenueServiceClient extends BaseServiceClient {
  constructor(config?: Partial<ServiceClientConfig>) {
    super({
      baseURL: process.env.VENUE_SERVICE_URL || 'http://venue-service:3002',
      serviceName: 'venue-service',
      timeout: 5000,
      ...config,
    });
  }

  /**
   * Get venue branding configuration
   */
  async getVenueBranding(
    venueId: string,
    ctx: RequestContext
  ): Promise<VenueBranding | null> {
    try {
      const response = await this.get<BrandingResponse>(
        `/api/v1/branding/${venueId}`,
        ctx
      );
      return response.data.branding;
    } catch (error: any) {
      // Return null on 404 or other errors - branding is optional
      if (error.statusCode === 404) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Get venue details including white-label settings
   */
  async getVenueDetails(
    venueId: string,
    ctx: RequestContext
  ): Promise<VenueDetails | null> {
    try {
      const response = await this.get<VenueResponse>(
        `/api/v1/venues/${venueId}`,
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
   * Get branding and white-label status in one call (for PDF generation)
   */
  async getVenueBrandingWithWhiteLabel(
    venueId: string,
    ctx: RequestContext
  ): Promise<{ branding: VenueBranding; isWhiteLabel: boolean } | null> {
    try {
      // Fetch both in parallel
      const [branding, venue] = await Promise.all([
        this.getVenueBranding(venueId, ctx),
        this.getVenueDetails(venueId, ctx),
      ]);

      if (!branding && !venue) {
        return null;
      }

      return {
        branding: branding || {},
        isWhiteLabel: venue?.hide_platform_branding || false,
      };
    } catch (error) {
      // Log and return null - branding is optional
      return null;
    }
  }
}

// Singleton instance
let venueServiceClient: VenueServiceClient | null = null;

export function getVenueServiceClient(): VenueServiceClient {
  if (!venueServiceClient) {
    venueServiceClient = new VenueServiceClient();
  }
  return venueServiceClient;
}

export default VenueServiceClient;
