import { JWTService } from '../services/jwt.service';
import { RBACService } from '../services/rbac.service';
import { AuthenticationError, AuthorizationError, TenantError } from '../errors';
import { auditLogger } from '../config/logger';
import { db } from '../config/database';

// UUID validation regex
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isValidUUID(value: string): boolean {
  return UUID_REGEX.test(value);
}

export function createAuthMiddleware(jwtService: JWTService, rbacService: RBACService) {
  return {
    authenticate: async (request: any, _reply: any) => {
      try {
        const authHeader = request.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
          throw new AuthenticationError('Missing or invalid authorization header');
        }

        const token = authHeader.substring(7);

        // Verify JWT signature
        let payload;
        try {
          payload = await jwtService.verifyAccessToken(token);
        } catch (error) {
          throw new AuthenticationError('Invalid token');
        }

        // FIX Issue #4: Validate tenant_id format BEFORE any database queries
        if (!payload.tenant_id) {
          throw new TenantError('Missing tenant_id in token');
        }

        if (!isValidUUID(payload.tenant_id)) {
          throw new TenantError('Invalid tenant_id format');
        }

        // Now safe to query database with valid tenant_id

        // Check if token is invalidated (after logout)
        const invalidated = await db('invalidated_tokens')
          .where({ token: payload.jti })
          .first();

        if (invalidated) {
          throw new AuthenticationError('Token has been revoked');
        }

        // Verify user exists and is active
        const user = await db('users')
          .where({ id: payload.sub })
          .whereNull('deleted_at')
          .first();

        if (!user) {
          const error: any = new Error('User not found or deleted');
          error.statusCode = 401;
          error.code = 'UNAUTHORIZED';
          throw error;
        }

        // Check if user is suspended
        if (user.status === 'SUSPENDED') {
          throw new AuthenticationError('Account suspended');
        }

        // Check if user is locked
        if (user.locked_until && new Date(user.locked_until) > new Date()) {
          throw new AuthenticationError('Account temporarily locked');
        }

        // Get user permissions (safe now that tenant_id is validated)
        let permissions: string[] = [];
        try {
          permissions = await rbacService.getUserPermissions(payload.sub, payload.tenant_id);
        } catch (error) {
          request.log.error('Failed to get user permissions', {
            userId: payload.sub,
            tenantId: payload.tenant_id,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
          // Continue with empty permissions
        }

        request.user = {
          id: payload.sub,
          tenant_id: payload.tenant_id,
          email: payload.email,
          role: payload.role,
          permissions,
        };
      } catch (error) {
        if (error instanceof AuthenticationError || error instanceof TenantError) {
          throw error;
        }
        if (error && typeof error === 'object' && 'code' in error && error.code === 'UNAUTHORIZED') {
          throw error;
        }
        throw new AuthenticationError('Invalid token');
      }
    },

    requirePermission: (permission: string) => {
      return async (request: any, _reply: any) => {
        if (!request.user) {
          throw new AuthenticationError('Authentication required');
        }

        const venueId = request.params?.venueId || request.body?.venueId;

        const hasPermission = await rbacService.checkPermission(
          request.user.id,
          request.user.tenant_id,
          permission,
          venueId
        );

        if (!hasPermission) {
          // Wrap audit logging in try-catch to prevent crashes
          try {
            auditLogger.warn({
              userId: request.user.id,
              tenantId: request.user.tenant_id,
              email: request.user.email,
              permission,
              resource: venueId,
              url: request.url,
              method: request.method,
              ip: request.ip,
              userAgent: request.headers['user-agent']
            }, 'Authorization denied: Missing required permission');
          } catch (auditError) {
            request.log.error('Audit logging failed', { error: auditError });
          }

          throw new AuthorizationError(`Missing required permission: ${permission}`);
        }
      };
    },

    requireVenueAccess: async (request: any, _reply: any) => {
      if (!request.user) {
        throw new AuthenticationError('Authentication required');
      }

      const venueId = request.params?.venueId;
      if (!venueId) {
        throw new Error('Venue ID required');
      }

      const venueRoles = await rbacService.getUserVenueRoles(request.user.id, request.user.tenant_id);
      const hasAccess = venueRoles.some((role: any) => role.venue_id === venueId);

      if (!hasAccess) {
        // Wrap audit logging in try-catch to prevent crashes
        try {
          auditLogger.warn({
            userId: request.user.id,
            tenantId: request.user.tenant_id,
            email: request.user.email,
            venueId,
            url: request.url,
            method: request.method,
            ip: request.ip,
            userAgent: request.headers['user-agent']
          }, 'Authorization denied: No access to venue');
        } catch (auditError) {
          request.log.error('Audit logging failed', { error: auditError });
        }

        throw new AuthorizationError('No access to this venue');
      }
    },
  };
}
