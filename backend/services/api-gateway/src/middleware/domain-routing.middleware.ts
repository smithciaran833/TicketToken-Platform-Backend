import { FastifyRequest, FastifyReply } from 'fastify';
import axios from 'axios';

interface VenueBranding {
  venue: any;
  branding: any;
}

/**
 * Domain routing middleware for Fastify
 * Checks if request comes from a custom domain and loads venue branding
 *
 * SECURITY: Venue context is attached to request object, NOT headers.
 * This prevents header spoofing attacks.
 */
export async function domainRoutingMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
) {
  let hostname: string | undefined;
  
  try {
    hostname = request.hostname;

    // Skip for main domain and localhost
    if (
      hostname === 'tickettoken.com' ||
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname.endsWith('.tickettoken.com')
    ) {
      return;
    }

    // Check if this is a custom domain
    try {
      const venueServiceUrl = process.env.VENUE_SERVICE_URL || 'http://venue-service:3002';
      const response = await axios.get<VenueBranding>(
        `${venueServiceUrl}/api/v1/branding/domain/${hostname}`,
        {
          timeout: 2000,
          headers: {
            'X-Request-ID': request.id
          }
        }
      );

      if (response.data) {
        // Attach venue and branding to request object (trusted internal state)
        (request as any).venue = response.data.venue;
        (request as any).branding = response.data.branding;
        (request as any).isWhiteLabel = response.data.venue.hide_platform_branding;

        // Store venue context on request object - NOT in headers
        // This is the trusted source for downstream middleware
        (request as any).domainVenueContext = {
          venueId: response.data.venue.id,
          isWhiteLabel: response.data.venue.hide_platform_branding,
          pricingTier: response.data.venue.pricing_tier,
          source: 'domain-lookup'
        };

        request.log.info({
          venueId: response.data.venue.id,
          domain: hostname
        }, 'White-label domain detected');
      }
    } catch (error: any) {
      // If venue lookup fails, continue without white-label
      if (error.response?.status !== 404) {
        request.log.warn({ error: error.message, hostname }, 'Error loading venue by domain');
      }
    }
  } catch (error) {
    // Use the captured hostname or undefined to avoid re-accessing request.hostname
    request.log.error({ error, hostname }, 'Domain routing middleware error');
    // Continue even if there's an error - don't break the request
  }
}
