import { FastifyRequest, FastifyReply } from 'fastify';
import jwt from 'jsonwebtoken';
import { logger } from '../utils/logger';

export interface AuthUser {
  id: string;
  venueId?: string;
  role: string;
  permissions?: string[];
}

declare module 'fastify' {
  interface FastifyRequest {
    user?: AuthUser;
  }
}

export async function authenticate(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  try {
    const token = request.headers.authorization?.replace('Bearer ', '');

    if (!token) {
      return reply.code(401).send({
        success: false,
        error: 'Authentication required'
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'dev-secret') as any;

    request.user = {
      id: decoded.userId || decoded.id,
      venueId: decoded.venueId,
      role: decoded.role || 'user',
      permissions: decoded.permissions || []
    };
  } catch (error: any) {
    logger.error('Authentication failed:', error);

    if (error.name === 'TokenExpiredError') {
      return reply.code(401).send({
        success: false,
        error: 'Token expired'
      });
    }

    return reply.code(401).send({
      success: false,
      error: 'Invalid token'
    });
  }
}

export function authorize(...roles: string[]) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    if (!request.user) {
      return reply.code(401).send({
        success: false,
        error: 'Authentication required'
      });
    }

    if (!roles.includes(request.user.role)) {
      logger.warn(`Unauthorized access attempt by user ${request.user.id} with role ${request.user.role}`);
      return reply.code(403).send({
        success: false,
        error: 'Insufficient permissions'
      });
    }
  };
}

// Webhook signature verification
export function verifyWebhookSignature(provider: string) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const signatures: Record<string, string | undefined> = {
      stripe: request.headers['stripe-signature'] as string,
      square: request.headers['x-square-signature'] as string,
      mailchimp: request.headers['x-mandrill-signature'] as string,
      quickbooks: request.headers['intuit-signature'] as string
    };

    const signature = signatures[provider];

    if (!signature) {
      logger.warn(`Missing webhook signature for ${provider}`);
      return reply.code(401).send({
        success: false,
        error: 'Invalid webhook signature'
      });
    }

    // TODO: Implement actual signature verification per provider
    logger.info(`Webhook received from ${provider}`);
  };
}
