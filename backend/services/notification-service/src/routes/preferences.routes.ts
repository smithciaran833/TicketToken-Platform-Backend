import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { preferenceManager } from '../services/preference-manager';
import { logger } from '../config/logger';
import { authMiddleware } from '../middleware/auth.middleware';

export default async function preferencesRoutes(fastify: FastifyInstance) {
  // Get user preferences
  fastify.get('/preferences/:userId', {
    preHandler: [authMiddleware]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const params = request.params as { userId: string };
      const { userId } = params;
      
      // Authorization check: users can only access their own preferences unless they're admin
      if (request.user!.id !== userId && request.user!.role !== 'admin') {
        logger.warn('Unauthorized preference access attempt', {
          requestedUserId: userId,
          authenticatedUserId: request.user!.id
        });
        return reply.status(403).send({ 
          error: 'Forbidden',
          message: 'You can only access your own preferences'
        });
      }
      
      const preferences = await preferenceManager.getPreferences(userId);
      reply.send(preferences);
    } catch (error) {
      logger.error('Failed to get preferences', { error });
      reply.status(500).send({ error: 'Failed to get preferences' });
    }
  });

  // Update user preferences
  fastify.put('/preferences/:userId', {
    preHandler: [authMiddleware]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const params = request.params as { userId: string };
      const { userId } = params;
      const updates = request.body as any; // Type depends on preference manager
      
      // Authorization check: users can only update their own preferences unless they're admin
      if (request.user!.id !== userId && request.user!.role !== 'admin') {
        logger.warn('Unauthorized preference update attempt', {
          requestedUserId: userId,
          authenticatedUserId: request.user!.id
        });
        return reply.status(403).send({ 
          error: 'Forbidden',
          message: 'You can only update your own preferences'
        });
      }
      
      const preferences = await preferenceManager.updatePreferences(
        userId,
        updates,
        request.user!.id,
        'User update'
      );
      reply.send(preferences);
    } catch (error) {
      logger.error('Failed to update preferences', { error });
      reply.status(500).send({ error: 'Failed to update preferences' });
    }
  });

  // Unsubscribe via token
  fastify.post('/unsubscribe/:token', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const params = request.params as { token: string };
      const { token } = params;
      
      const success = await preferenceManager.unsubscribe(token);

      if (success) {
        reply.send({ message: 'Successfully unsubscribed' });
      } else {
        reply.status(404).send({ error: 'Invalid unsubscribe token' });
      }
    } catch (error) {
      logger.error('Failed to unsubscribe', { error });
      reply.status(500).send({ error: 'Failed to unsubscribe' });
    }
  });

  // Check if can send notification
  fastify.post('/can-send', {
    preHandler: [authMiddleware]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = request.body as {
        userId: string;
        channel: 'email' | 'sms' | 'push';
        type: string;
      };
      
      const { userId, channel, type } = body;
      
      // Authorization check: users can only check their own permissions unless they're admin
      if (request.user!.id !== userId && request.user!.role !== 'admin') {
        logger.warn('Unauthorized can-send check attempt', {
          requestedUserId: userId,
          authenticatedUserId: request.user!.id
        });
        return reply.status(403).send({ 
          error: 'Forbidden',
          message: 'You can only check your own notification permissions'
        });
      }
      
      const canSend = await preferenceManager.canSendNotification(userId, channel, type);
      reply.send({ canSend });
    } catch (error) {
      logger.error('Failed to check notification permission', { error });
      reply.status(500).send({ error: 'Failed to check permission' });
    }
  });
}
