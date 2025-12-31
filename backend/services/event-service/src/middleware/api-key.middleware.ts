import { FastifyRequest, FastifyReply } from 'fastify';
import { verifyApiKey, verifyServiceToken, isTrustedService } from '../config/service-auth';
import { logger } from '../utils/logger';

/**
 * API Key Middleware for Service-to-Service Authentication
 * 
 * CRITICAL FIX for audit findings:
 * - IA2: Service token validation
 * - IA3: API key middleware
 * - IA4: User vs service differentiated
 * 
 * This middleware validates incoming requests from other services
 * using either API keys or service tokens.
 */

export interface ServiceContext {
  isServiceRequest: boolean;
  serviceId?: string;
  serviceName?: string;
}

/**
 * Verify API key from X-API-Key header
 * 
 * Use this for service-to-service calls that use static API keys.
 * The calling service must include its API key in the X-API-Key header.
 */
export async function apiKeyMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const apiKey = request.headers['x-api-key'] as string;
  
  if (!apiKey) {
    logger.warn({ 
      path: request.url, 
      method: request.method 
    }, 'API key missing from service request');
    
    reply.status(401).send({
      type: 'https://api.tickettoken.com/errors/unauthorized',
      title: 'API Key Required',
      status: 401,
      detail: 'A valid API key is required for service-to-service requests.',
      code: 'API_KEY_REQUIRED',
    });
    return;
  }
  
  const result = verifyApiKey(apiKey);
  
  if (!result.valid) {
    logger.warn({ 
      path: request.url, 
      method: request.method,
      error: result.error,
    }, 'Invalid API key');
    
    reply.status(401).send({
      type: 'https://api.tickettoken.com/errors/unauthorized',
      title: 'Invalid API Key',
      status: 401,
      detail: 'The provided API key is invalid or has expired.',
      code: 'INVALID_API_KEY',
    });
    return;
  }
  
  // Set service context on request
  (request as any).serviceContext = {
    isServiceRequest: true,
    serviceId: result.serviceId,
  } as ServiceContext;
  
  logger.debug({ 
    serviceId: result.serviceId, 
    path: request.url 
  }, 'API key verified successfully');
}

/**
 * Verify service token from X-Service-Token header
 * 
 * Use this for service-to-service calls that use dynamic tokens.
 * The calling service must include a signed token in the X-Service-Token header.
 */
export async function serviceTokenMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const serviceToken = request.headers['x-service-token'] as string;
  
  if (!serviceToken) {
    logger.warn({ 
      path: request.url, 
      method: request.method 
    }, 'Service token missing from request');
    
    reply.status(401).send({
      type: 'https://api.tickettoken.com/errors/unauthorized',
      title: 'Service Token Required',
      status: 401,
      detail: 'A valid service token is required for service-to-service requests.',
      code: 'SERVICE_TOKEN_REQUIRED',
    });
    return;
  }
  
  const result = verifyServiceToken(serviceToken);
  
  if (!result.valid) {
    logger.warn({ 
      path: request.url, 
      method: request.method,
      error: result.error,
    }, 'Invalid service token');
    
    reply.status(401).send({
      type: 'https://api.tickettoken.com/errors/unauthorized',
      title: 'Invalid Service Token',
      status: 401,
      detail: 'The provided service token is invalid or has expired.',
      code: 'INVALID_SERVICE_TOKEN',
    });
    return;
  }
  
  // Set service context on request
  (request as any).serviceContext = {
    isServiceRequest: true,
    serviceId: result.serviceId,
  } as ServiceContext;
  
  logger.debug({ 
    serviceId: result.serviceId, 
    path: request.url 
  }, 'Service token verified successfully');
}

/**
 * Combined S2S authentication middleware
 * 
 * Accepts either API key (X-API-Key) or service token (X-Service-Token).
 * At least one must be present and valid.
 */
export async function s2sAuthMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const apiKey = request.headers['x-api-key'] as string;
  const serviceToken = request.headers['x-service-token'] as string;
  
  // Neither auth method provided
  if (!apiKey && !serviceToken) {
    logger.warn({ 
      path: request.url, 
      method: request.method 
    }, 'No S2S authentication provided');
    
    reply.status(401).send({
      type: 'https://api.tickettoken.com/errors/unauthorized',
      title: 'Authentication Required',
      status: 401,
      detail: 'Service-to-service authentication is required. Provide X-API-Key or X-Service-Token header.',
      code: 'S2S_AUTH_REQUIRED',
    });
    return;
  }
  
  // Try service token first (preferred)
  if (serviceToken) {
    const tokenResult = verifyServiceToken(serviceToken);
    if (tokenResult.valid) {
      (request as any).serviceContext = {
        isServiceRequest: true,
        serviceId: tokenResult.serviceId,
      } as ServiceContext;
      
      logger.debug({ 
        serviceId: tokenResult.serviceId, 
        path: request.url,
        authMethod: 'service-token'
      }, 'S2S authentication successful');
      return;
    }
  }
  
  // Fall back to API key
  if (apiKey) {
    const keyResult = verifyApiKey(apiKey);
    if (keyResult.valid) {
      (request as any).serviceContext = {
        isServiceRequest: true,
        serviceId: keyResult.serviceId,
      } as ServiceContext;
      
      logger.debug({ 
        serviceId: keyResult.serviceId, 
        path: request.url,
        authMethod: 'api-key'
      }, 'S2S authentication successful');
      return;
    }
  }
  
  // Both methods failed
  logger.warn({ 
    path: request.url, 
    method: request.method,
    hasApiKey: !!apiKey,
    hasServiceToken: !!serviceToken,
  }, 'S2S authentication failed');
  
  reply.status(401).send({
    type: 'https://api.tickettoken.com/errors/unauthorized',
    title: 'Invalid Credentials',
    status: 401,
    detail: 'The provided service credentials are invalid.',
    code: 'INVALID_S2S_CREDENTIALS',
  });
}

/**
 * Optional S2S middleware - doesn't require auth but sets context if present
 * 
 * Use this for endpoints that accept both user and service requests.
 */
export async function optionalS2sMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const apiKey = request.headers['x-api-key'] as string;
  const serviceToken = request.headers['x-service-token'] as string;
  
  // Check service token
  if (serviceToken) {
    const tokenResult = verifyServiceToken(serviceToken);
    if (tokenResult.valid) {
      (request as any).serviceContext = {
        isServiceRequest: true,
        serviceId: tokenResult.serviceId,
      } as ServiceContext;
      return;
    }
  }
  
  // Check API key
  if (apiKey) {
    const keyResult = verifyApiKey(apiKey);
    if (keyResult.valid) {
      (request as any).serviceContext = {
        isServiceRequest: true,
        serviceId: keyResult.serviceId,
      } as ServiceContext;
      return;
    }
  }
  
  // No valid S2S auth - that's okay, this is optional
  (request as any).serviceContext = {
    isServiceRequest: false,
  } as ServiceContext;
}

/**
 * Check if a request is from a trusted service
 */
export function isFromTrustedService(request: FastifyRequest): boolean {
  const context = (request as any).serviceContext as ServiceContext | undefined;
  if (!context?.isServiceRequest || !context.serviceId) {
    return false;
  }
  return isTrustedService(context.serviceId);
}

/**
 * Get the service context from a request
 */
export function getServiceContext(request: FastifyRequest): ServiceContext | undefined {
  return (request as any).serviceContext;
}
