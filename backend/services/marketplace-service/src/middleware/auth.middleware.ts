import { FastifyRequest, FastifyReply } from 'fastify';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'this-is-a-very-long-secret-key-that-is-at-least-32-characters';

export interface AuthRequest extends FastifyRequest {
  venueRole?: string;
  user?: any;
  tenantId?: string;
}

// Standard authentication middleware
export async function authMiddleware(request: AuthRequest, reply: FastifyReply) {
  const token = request.headers.authorization?.replace('Bearer ', '');

  if (!token) {
    return reply.status(401).send({ error: 'Authentication required' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    request.user = decoded;
    request.tenantId = decoded.tenant_id || '00000000-0000-0000-0000-000000000001';
  } catch (error) {
    return reply.status(401).send({ error: 'Invalid token' });
  }
}

// Admin middleware
export async function requireAdmin(request: AuthRequest, reply: FastifyReply) {
  if (!request.user?.roles?.includes('admin')) {
    return reply.status(403).send({ error: 'Admin access required' });
  }
}

// Venue owner middleware
export async function requireVenueOwner(request: AuthRequest, reply: FastifyReply) {
  const validRoles = ['admin', 'venue_owner', 'venue_manager'];
  const hasRole = request.user?.roles?.some((role: string) => validRoles.includes(role));

  if (!hasRole) {
    return reply.status(403).send({ error: 'Venue owner access required' });
  }
}

// Verify listing ownership
export async function verifyListingOwnership(request: AuthRequest, reply: FastifyReply) {
  const params = request.params as { id?: string };
  const listingId = params.id;
  const userId = request.user?.id;

  if (!listingId || !userId) {
    return reply.status(400).send({ error: 'Missing listing ID or user ID' });
  }

  // Import listing model dynamically to avoid circular dependencies
  const { listingModel } = await import('../models/listing.model');
  
  try {
    const listing = await listingModel.findById(listingId);
    
    if (!listing) {
      return reply.status(404).send({ error: 'Listing not found' });
    }
    
    if (listing.sellerId !== userId) {
      return reply.status(403).send({ error: 'Unauthorized: You do not own this listing' });
    }
    
    // User owns the listing, continue to next handler
  } catch (error: any) {
    return reply.status(500).send({ error: 'Failed to verify listing ownership' });
  }
}
