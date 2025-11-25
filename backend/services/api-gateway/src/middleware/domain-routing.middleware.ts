import { FastifyRequest, FastifyReply } from 'fastify';
import axios from 'axios';

interface VenueBranding {
  venue: any;
  branding: any;
}

/**
 * Domain routing middleware for Fastify
 * Checks if request comes from a custom domain and loads venue branding
 */
export async function domainRoutingMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
) {
  try {
    const hostname = request.hostname;

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
        // Attach venue and branding to request
        (request as any).venue = response.data.venue;
        (request as any).branding = response.data.branding;
        (request as any).isWhiteLabel = response.data.venue.hide_platform_branding;

        // Add custom headers for downstream services
        request.headers['x-venue-id'] = response.data.venue.id;
        request.headers['x-white-label'] = response.data.venue.hide_platform_branding ? 'true' : 'false';
        request.headers['x-pricing-tier'] = response.data.venue.pricing_tier;

        request.log.info({ venueId: response.data.venue.id, domain: hostname }, 'White-label domain detected');
      }
    } catch (error: any) {
      // If venue lookup fails, continue without white-label
      if (error.response?.status !== 404) {
        request.log.warn({ error: error.message, hostname }, 'Error loading venue by domain');
      }
    }
  } catch (error) {
    request.log.error({ error, hostname: request.hostname }, 'Domain routing middleware error');
    // Continue even if there's an error - don't break the request
  }
}
