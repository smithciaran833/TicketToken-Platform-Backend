import { JWTService } from '../services/jwt.service';
import { RBACService } from '../services/rbac.service';
import { AuthenticationError, AuthorizationError } from '../errors';

export function createAuthMiddleware(jwtService: JWTService, rbacService: RBACService) {
  return {
    authenticate: async (request: any, _reply: any) => {
      try {
        const authHeader = request.headers.authorization;
        
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
          throw new AuthenticationError('Missing or invalid authorization header');
        }

        const token = authHeader.substring(7);
        const payload = await jwtService.verifyAccessToken(token);

        // Get user permissions
        const permissions = await rbacService.getUserPermissions(payload.sub);

        request.user = {
          id: payload.sub,
          permissions,
        };
      } catch (error) {
        if (error instanceof AuthenticationError) {
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
          permission,
          venueId
        );

        if (!hasPermission) {
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

      const venueRoles = await rbacService.getUserVenueRoles(request.user.id);
      const hasAccess = venueRoles.some((role: any) => role.venue_id === venueId);

      if (!hasAccess) {
        throw new AuthorizationError('No access to this venue');
      }
    },
  };
}
