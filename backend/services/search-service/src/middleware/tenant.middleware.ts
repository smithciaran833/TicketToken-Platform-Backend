import { FastifyRequest, FastifyReply } from 'fastify';
import { AuthenticatedRequest } from './auth.middleware';
import { validateVenueId } from '../utils/tenant-filter';

/**
 * Tenant Middleware
 * Validates and enforces tenant isolation for all search operations
 * MUST be used after authenticate middleware
 */
export async function requireTenant(
  request: AuthenticatedRequest,
  reply: FastifyReply
): Promise<void> {
  // Ensure user is authenticated first
  if (!request.user) {
    return reply.status(401).send({
      error: 'Authentication required'
    });
  }

  // Validate venueId exists on user object
  if (!request.user.venueId) {
    return reply.status(403).send({
      error: 'Tenant information missing',
      message: 'User must be associated with a venue'
    });
  }

  try {
    // Validate venueId format
    validateVenueId(request.user.venueId);
  } catch (error: any) {
    return reply.status(400).send({
      error: 'Invalid tenant information',
      message: error.message
    });
  }

  // Tenant validation passed, continue to route handler
}

/**
 * Optional tenant middleware that allows requests without tenant
 * Only use this for public/non-tenant-specific endpoints
 */
export async function optionalTenant(
  request: AuthenticatedRequest,
  reply: FastifyReply
): Promise<void> {
  // If user is authenticated and has venueId, validate it
  if (request.user?.venueId) {
    try {
      validateVenueId(request.user.venueId);
    } catch (error: any) {
      return reply.status(400).send({
        error: 'Invalid tenant information',
        message: error.message
      });
    }
  }
  // Allow request to continue even without tenant
}
