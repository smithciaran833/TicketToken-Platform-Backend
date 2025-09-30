import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth.middleware';
import { db } from '../config/database';
import { logger } from '../utils/logger';
import { ForbiddenError } from '../utils/errors';

export const requireVenueAccess = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const venueId = req.params.venueId || req.body.venue_id;
    const userId = req.user?.id;
    
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
    req.venueRole = access.role;
    
    next();
  } catch (error) {
    if (error instanceof ForbiddenError) {
      res.status(403).json({ error: error.message });
    } else {
      logger.error('Venue access middleware error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
};

export const requireVenueOwner = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const venueId = req.params.venueId || req.body.venue_id;
    const userId = req.user?.id;
    
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
    
    next();
  } catch (error) {
    if (error instanceof ForbiddenError) {
      res.status(403).json({ error: error.message });
    } else {
      logger.error('Venue owner middleware error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
};
