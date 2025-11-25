import { FastifyRequest, FastifyReply } from 'fastify';
import jwt from 'jsonwebtoken';

// Require JWT_SECRET - fail fast if not provided
if (!process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is required');
}

const JWT_SECRET = process.env.JWT_SECRET;

export interface AuthUser {
  roles?: string[];
  tenant_id?: string;
  [key: string]: any;
}

declare module 'fastify' {
  interface FastifyRequest {
    user?: AuthUser;
    tenantId?: string;
  }
}

// Standard authentication middleware
export async function authenticate(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const token = request.headers.authorization?.replace('Bearer ', '');

  if (!token) {
    return reply.code(401).send({ error: 'Authentication required' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as AuthUser;
    request.user = decoded;
    
    // Require tenant_id in JWT - no default fallback
    if (!decoded.tenant_id) {
      return reply.code(401).send({ error: 'Token missing tenant_id' });
    }
    
    request.tenantId = decoded.tenant_id;
  } catch (error) {
    return reply.code(401).send({ error: 'Invalid token' });
  }
}

// Admin only middleware
export async function requireAdmin(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (!request.user?.roles?.includes('admin')) {
    return reply.code(403).send({ error: 'Admin access required' });
  }
}

// Compliance officer middleware
export async function requireComplianceOfficer(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const validRoles = ['admin', 'compliance_officer', 'compliance_manager'];
  const hasRole = request.user?.roles?.some((role: string) => validRoles.includes(role));

  if (!hasRole) {
    return reply.code(403).send({ error: 'Compliance officer access required' });
  }
}

// Webhook authentication (different from user auth)
export function webhookAuth(secret: string) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const signature = request.headers['x-webhook-signature'] as string;

    if (!signature || signature !== secret) {
      return reply.code(401).send({ error: 'Invalid webhook signature' });
    }

    // Tenant ID should be provided in webhook payload
    // We'll set it when processing the webhook body
  };
}
