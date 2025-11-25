import { FastifyReply } from 'fastify';
import { AuthRequest } from './auth.middleware';
import { db } from '../config/database';
import { logger } from '../utils/logger';
import { ForbiddenError } from '../utils/errors';

export const requireVenueAccess = async (
  request: AuthRequest,
  reply: FastifyReply
) => {
  try {
    const venueId = (request.params as any).venueId || (request.body as any)?.venue_id;
    const userId = request.user?.id;

    if (!userId) {
      throw new ForbiddenError('Authentication required');
    }

    if (!venueId) {
      throw new ForbiddenError('Venue ID required');
    }

    // Check if user owns or manages the venue
    const access = await db('venue_access')
      .where('venue_id', venueId)
      .where('user_id', userId)
      .whereIn('role', ['owner', 'manager', 'admin'])
      .first();

    if (!access) {
      logger.warn(`User ${userId} denied access to venue ${venueId}`);
      throw new ForbiddenError('No access to this venue');
    }

    // Attach venue role to request
    request.venueRole = access.role;
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return reply.status(403).send({ error: error.message });
    } else {
      logger.error('Venue access middleware error:', error);
      return reply.status(500).send({ error: 'Internal server error' });
    }
  }
};

export const requireVenueOwner = async (
  request: AuthRequest,
  reply: FastifyReply
) => {
  try {
    const venueId = (request.params as any).venueId || (request.body as any)?.venue_id;
    const userId = request.user?.id;

    if (!userId || !venueId) {
      throw new ForbiddenError('Invalid request');
    }

    const isOwner = await db('venue_access')
      .where('venue_id', venueId)
      .where('user_id', userId)
      .where('role', 'owner')
      .first();

    if (!isOwner) {
      throw new ForbiddenError('Only venue owner can perform this action');
    }
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return reply.status(403).send({ error: error.message });
    } else {
      logger.error('Venue owner middleware error:', error);
      return reply.status(500).send({ error: 'Internal server error' });
    }
  }
};
