/**
 * Audit Logging Middleware
 * 
 * Automatically logs all admin actions and sensitive operations to the audit log.
 * Captures request context, user information, and action details for compliance.
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import { AuditLogService } from '../services/audit-log.service';
import { logger } from '../utils/logger';

// PII fields that should trigger PII access flag
const PII_FIELDS = [
  'email',
  'phone',
  'address',
  'name',
  'first_name',
  'last_name',
  'billing_address',
  'shipping_address',
  'customer_email',
  'customer_phone'
];

// Payment fields that should trigger payment access flag
const PAYMENT_FIELDS = [
  'payment_method',
  'card_number',
  'payment_id',
  'transaction_id',
  'payment_details',
  'amount',
  'total'
];

// Admin actions that should be logged
const ADMIN_ACTIONS = [
  'POST /api/v1/admin',
  'PUT /api/v1/admin',
  'PATCH /api/v1/admin',
  'DELETE /api/v1/admin',
  'POST /api/v1/orders/:orderId/refund',
  'POST /api/v1/orders/:orderId/cancel',
  'POST /api/v1/admin/overrides'
];

/**
 * Check if path contains PII fields
 */
function containsPIIFields(obj: any): boolean {
  if (!obj || typeof obj !== 'object') return false;
  
  const checkObject = (o: any): boolean => {
    for (const key of Object.keys(o)) {
      const lowerKey = key.toLowerCase();
      if (PII_FIELDS.some(field => lowerKey.includes(field))) {
        return true;
      }
      if (typeof o[key] === 'object' && o[key] !== null) {
        if (checkObject(o[key])) return true;
      }
    }
    return false;
  };
  
  return checkObject(obj);
}

/**
 * Check if path contains payment fields
 */
function containsPaymentFields(obj: any): boolean {
  if (!obj || typeof obj !== 'object') return false;
  
  const checkObject = (o: any): boolean => {
    for (const key of Object.keys(o)) {
      const lowerKey = key.toLowerCase();
      if (PAYMENT_FIELDS.some(field => lowerKey.includes(field))) {
        return true;
      }
      if (typeof o[key] === 'object' && o[key] !== null) {
        if (checkObject(o[key])) return true;
      }
    }
    return false;
  };
  
  return checkObject(obj);
}

/**
 * Check if the request is an admin action
 */
function isAdminAction(method: string, url: string): boolean {
  return ADMIN_ACTIONS.some(action => {
    const [actionMethod, actionPath] = action.split(' ');
    if (method !== actionMethod) return false;
    
    // Simple wildcard matching
    const pathRegex = actionPath.replace(':orderId', '[^/]+');
    return new RegExp(`^${pathRegex}`).test(url);
  });
}

/**
 * Extract action description from request
 */
function getActionDescription(method: string, url: string, body?: any): string {
  const actions: Record<string, string> = {
    'POST': 'Created',
    'PUT': 'Updated',
    'PATCH': 'Modified',
    'DELETE': 'Deleted',
    'GET': 'Accessed'
  };
  
  const action = actions[method] || method;
  const resource = url.split('/').filter(Boolean).pop() || 'resource';
  
  return `${action} ${resource}`;
}

/**
 * Create audit logging middleware
 */
export function createAuditLoggingMiddleware(auditLogService: AuditLogService) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const startTime = Date.now();
    
    // Skip audit logging for non-sensitive operations
    if (request.method === 'GET' && !request.url.includes('/admin')) {
      return;
    }
    
    const user = (request as any).user;
    const tenant = (request as any).tenant;
    
    // Skip if no user context (not authenticated)
    if (!user || !tenant) {
      return;
    }
    
    // Determine if this is a sensitive operation
    const isAdmin = isAdminAction(request.method, request.url);
    const isPII = containsPIIFields(request.body) || containsPIIFields(request.query);
    const isPayment = containsPaymentFields(request.body) || containsPaymentFields(request.query);
    
    // Only log admin actions or sensitive data access
    if (!isAdmin && !isPII && !isPayment) {
      return;
    }
    
    // Store context for response hook
    (request as any).auditContext = {
      startTime,
      isAdmin,
      isPII,
      isPayment,
      user,
      tenant
    };
  };
}

/**
 * Create response audit logging hook
 */
export function createAuditResponseHook(auditLogService: AuditLogService) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const auditContext = (request as any).auditContext;
    
    if (!auditContext) {
      return;
    }
    
    const { startTime, isAdmin, isPII, isPayment, user, tenant } = auditContext;
    const duration = Date.now() - startTime;
    
    try {
      // Extract resource info from URL
      const urlParts = request.url.split('/').filter(Boolean);
      const resourceType = urlParts[2] || 'unknown';
      const resourceId = urlParts[3] || undefined;
      
      // Create audit log
      await auditLogService.createAuditLog({
        tenant_id: tenant.id,
        log_type: isAdmin ? 'ADMIN_ACTION' : isPII ? 'PII_ACCESS' : 'PAYMENT_ACCESS',
        action: getActionDescription(request.method, request.url, request.body),
        severity: reply.statusCode >= 400 ? 'ERROR' : 'INFO',
        
        user_id: user.id,
        username: user.username || user.email,
        user_role: user.role,
        user_email: user.email,
        
        description: `${request.method} ${request.url} - ${reply.statusCode} (${duration}ms)`,
        metadata: {
          method: request.method,
          url: request.url,
          status_code: reply.statusCode,
          duration_ms: duration,
          query_params: request.query,
          has_body: !!request.body
        },
        
        resource_type: resourceType,
        resource_id: resourceId,
        
        ip_address: request.ip,
        user_agent: request.headers['user-agent'],
        request_id: (request as any).id,
        session_id: (request as any).session?.id,
        
        is_pii_access: isPII,
        is_payment_access: isPayment,
        requires_review: (isPayment && reply.statusCode >= 400) || false,
        is_suspicious: reply.statusCode === 429 || reply.statusCode === 403
      });
    } catch (error) {
      logger.error('Failed to create audit log', {
        error,
        url: request.url,
        method: request.method,
        user_id: user?.id
      });
      // Don't throw - audit logging failure shouldn't break the request
    }
  };
}

/**
 * Fastify plugin for audit logging
 */
export function auditLoggingPlugin(auditLogService: AuditLogService) {
  return async (fastify: any) => {
    fastify.addHook('onRequest', createAuditLoggingMiddleware(auditLogService));
  };
}
