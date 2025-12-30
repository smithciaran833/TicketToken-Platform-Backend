import { FastifyReply } from 'fastify';

/**
 * Deprecation headers helper
 * Use when deprecating API endpoints to notify clients
 * 
 * Headers added:
 * - Deprecation: true (or date when deprecated)
 * - Sunset: ISO date when endpoint will be removed
 * - Link: URL to migration guide
 * 
 * @see https://datatracker.ietf.org/doc/html/draft-ietf-httpapi-deprecation-header
 */

interface DeprecationConfig {
  deprecationDate?: Date;     // When the endpoint was deprecated
  sunsetDate: Date;           // When the endpoint will be removed
  migrationGuide?: string;    // URL to migration documentation
  alternativeEndpoint?: string; // New endpoint to use
}

/**
 * Add deprecation headers to a response
 * 
 * @example
 * // In route handler:
 * addDeprecationHeaders(reply, {
 *   sunsetDate: new Date('2025-06-01'),
 *   migrationGuide: 'https://docs.tickettoken.com/migration/v2'
 * });
 */
export function addDeprecationHeaders(reply: FastifyReply, config: DeprecationConfig): void {
  // Deprecation header - RFC draft
  if (config.deprecationDate) {
    reply.header('Deprecation', config.deprecationDate.toUTCString());
  } else {
    reply.header('Deprecation', 'true');
  }

  // Sunset header - RFC 8594
  reply.header('Sunset', config.sunsetDate.toUTCString());

  // Link header for documentation
  const links: string[] = [];
  
  if (config.migrationGuide) {
    links.push(`<${config.migrationGuide}>; rel="deprecation"`);
  }
  
  if (config.alternativeEndpoint) {
    links.push(`<${config.alternativeEndpoint}>; rel="successor-version"`);
  }

  if (links.length > 0) {
    reply.header('Link', links.join(', '));
  }
}

/**
 * Registry of deprecated endpoints
 * Add entries here when deprecating endpoints
 */
export const DEPRECATED_ENDPOINTS: Map<string, DeprecationConfig> = new Map([
  // Example (commented out - no deprecated endpoints yet):
  // ['/api/v1/tickets/legacy-purchase', {
  //   deprecationDate: new Date('2025-01-01'),
  //   sunsetDate: new Date('2025-06-01'),
  //   migrationGuide: 'https://docs.tickettoken.com/api/v2/tickets/purchase',
  //   alternativeEndpoint: '/api/v2/tickets/purchase'
  // }],
]);

/**
 * Middleware to automatically add deprecation headers for registered endpoints
 * Register with: server.addHook('onSend', deprecationMiddleware)
 */
export async function deprecationMiddleware(
  request: { url: string },
  reply: FastifyReply
): Promise<void> {
  const path = request.url.split('?')[0];
  const config = DEPRECATED_ENDPOINTS.get(path);
  
  if (config) {
    addDeprecationHeaders(reply, config);
  }
}
