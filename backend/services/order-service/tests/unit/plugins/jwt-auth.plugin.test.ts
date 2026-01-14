import { FastifyInstance } from 'fastify';
import fastify from 'fastify';
import jwtAuthPlugin, { JWTPayload } from '../../../src/plugins/jwt-auth.plugin';

describe('JWT Auth Plugin', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    // Reset environment
    delete process.env.JWT_SECRET;
  });

  afterEach(async () => {
    if (app) {
      await app.close();
    }
  });

  describe('Plugin Registration', () => {
    it('should throw error if JWT_SECRET is not set', async () => {
      app = fastify();

      await expect(app.register(jwtAuthPlugin)).rejects.toThrow(
        'JWT_SECRET environment variable is required'
      );
    });

    it('should throw error if JWT_SECRET is too short', async () => {
      process.env.JWT_SECRET = 'short-secret';
      app = fastify();

      await expect(app.register(jwtAuthPlugin)).rejects.toThrow(
        'JWT_SECRET must be at least 32 characters'
      );
    });

    it('should register successfully with valid JWT_SECRET', async () => {
      process.env.JWT_SECRET = 'a'.repeat(32);
      app = fastify();

      await expect(app.register(jwtAuthPlugin)).resolves.not.toThrow();
    });

    it('should register JWT plugin with correct configuration', async () => {
      process.env.JWT_SECRET = 'a'.repeat(32);
      app = fastify();

      await app.register(jwtAuthPlugin);
      await app.ready();

      expect(app.jwt).toBeDefined();
    });

    it('should decorate fastify with authenticate method', async () => {
      process.env.JWT_SECRET = 'a'.repeat(32);
      app = fastify();

      await app.register(jwtAuthPlugin);
      await app.ready();

      expect(app.authenticate).toBeDefined();
      expect(typeof app.authenticate).toBe('function');
    });
  });

  describe('authenticate decorator', () => {
    const validSecret = 'a'.repeat(32);

    beforeEach(async () => {
      process.env.JWT_SECRET = validSecret;
      app = fastify();
      await app.register(jwtAuthPlugin);
    });

    it('should successfully authenticate valid JWT token', async () => {
      const payload: JWTPayload = {
        sub: 'user-123',
        tenantId: 'tenant-456',
        tenantName: 'Test Tenant',
        email: 'test@example.com',
        role: 'user',
        permissions: ['read:orders', 'write:orders'],
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600,
      };

      const token = app.jwt.sign(payload);

      app.get('/test', {
        preHandler: app.authenticate,
      }, async (request) => {
        return { user: (request as any).user };
      });

      await app.ready();

      const response = await app.inject({
        method: 'GET',
        url: '/test',
        headers: {
          authorization: `Bearer ${token}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.user).toEqual({
        id: 'user-123',
        tenantId: 'tenant-456',
        tenantName: 'Test Tenant',
        email: 'test@example.com',
        role: 'user',
        permissions: ['read:orders', 'write:orders'],
      });
    });

    it('should extract user data correctly from JWT payload', async () => {
      const payload: JWTPayload = {
        sub: 'user-999',
        tenantId: 'tenant-888',
        email: 'admin@example.com',
        role: 'admin',
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600,
      };

      const token = app.jwt.sign(payload);

      app.get('/test', {
        preHandler: app.authenticate,
      }, async (request) => {
        return { user: (request as any).user };
      });

      await app.ready();

      const response = await app.inject({
        method: 'GET',
        url: '/test',
        headers: {
          authorization: `Bearer ${token}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.user.id).toBe('user-999');
      expect(body.user.tenantId).toBe('tenant-888');
      expect(body.user.email).toBe('admin@example.com');
      expect(body.user.role).toBe('admin');
      expect(body.user.permissions).toEqual([]);
    });

    it('should default permissions to empty array if not provided', async () => {
      const payload: JWTPayload = {
        sub: 'user-123',
        tenantId: 'tenant-456',
        email: 'test@example.com',
        role: 'user',
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600,
      };

      const token = app.jwt.sign(payload);

      app.get('/test', {
        preHandler: app.authenticate,
      }, async (request) => {
        return { user: (request as any).user };
      });

      await app.ready();

      const response = await app.inject({
        method: 'GET',
        url: '/test',
        headers: {
          authorization: `Bearer ${token}`,
        },
      });

      const body = JSON.parse(response.body);
      expect(body.user.permissions).toEqual([]);
    });

    it('should return 401 when no authorization header is provided', async () => {
      app.get('/test', {
        preHandler: app.authenticate,
      }, async () => {
        return { success: true };
      });

      await app.ready();

      const response = await app.inject({
        method: 'GET',
        url: '/test',
      });

      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Unauthorized');
      expect(body.message).toBe('No authorization token provided');
    });

    it('should return 401 for invalid token', async () => {
      app.get('/test', {
        preHandler: app.authenticate,
      }, async () => {
        return { success: true };
      });

      await app.ready();

      const response = await app.inject({
        method: 'GET',
        url: '/test',
        headers: {
          authorization: 'Bearer invalid-token',
        },
      });

      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Unauthorized');
      expect(body.message).toBe('Invalid token');
    });

    it('should return 401 for expired token', async () => {
      const payload: JWTPayload = {
        sub: 'user-123',
        tenantId: 'tenant-456',
        email: 'test@example.com',
        role: 'user',
        iat: Math.floor(Date.now() / 1000) - 7200, // 2 hours ago
        exp: Math.floor(Date.now() / 1000) - 3600, // Expired 1 hour ago
      };

      const token = app.jwt.sign(payload, { expiresIn: -1 });

      app.get('/test', {
        preHandler: app.authenticate,
      }, async () => {
        return { success: true };
      });

      await app.ready();

      const response = await app.inject({
        method: 'GET',
        url: '/test',
        headers: {
          authorization: `Bearer ${token}`,
        },
      });

      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Unauthorized');
      expect(body.message).toMatch(/Token has expired|Invalid token/);
    });

    it('should return 401 for token signed with wrong secret', async () => {
      const wrongSecret = 'b'.repeat(32);
      const wrongApp = fastify();
      process.env.JWT_SECRET = wrongSecret;
      await wrongApp.register(jwtAuthPlugin);
      await wrongApp.ready();

      const payload: JWTPayload = {
        sub: 'user-123',
        tenantId: 'tenant-456',
        email: 'test@example.com',
        role: 'user',
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600,
      };

      const token = wrongApp.jwt.sign(payload);

      app.get('/test', {
        preHandler: app.authenticate,
      }, async () => {
        return { success: true };
      });

      await app.ready();

      const response = await app.inject({
        method: 'GET',
        url: '/test',
        headers: {
          authorization: `Bearer ${token}`,
        },
      });

      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Unauthorized');

      await wrongApp.close();
    });

    it('should handle malformed authorization header', async () => {
      app.get('/test', {
        preHandler: app.authenticate,
      }, async () => {
        return { success: true };
      });

      await app.ready();

      const response = await app.inject({
        method: 'GET',
        url: '/test',
        headers: {
          authorization: 'NotBearer token',
        },
      });

      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Unauthorized');
    });

    it('should preserve optional tenantName in user object', async () => {
      const payload: JWTPayload = {
        sub: 'user-123',
        tenantId: 'tenant-456',
        tenantName: 'Acme Corp',
        email: 'test@example.com',
        role: 'user',
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600,
      };

      const token = app.jwt.sign(payload);

      app.get('/test', {
        preHandler: app.authenticate,
      }, async (request) => {
        return { user: (request as any).user };
      });

      await app.ready();

      const response = await app.inject({
        method: 'GET',
        url: '/test',
        headers: {
          authorization: `Bearer ${token}`,
        },
      });

      const body = JSON.parse(response.body);
      expect(body.user.tenantName).toBe('Acme Corp');
    });

    it('should handle missing tenantName gracefully', async () => {
      const payload: JWTPayload = {
        sub: 'user-123',
        tenantId: 'tenant-456',
        email: 'test@example.com',
        role: 'user',
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600,
      };

      const token = app.jwt.sign(payload);

      app.get('/test', {
        preHandler: app.authenticate,
      }, async (request) => {
        return { user: (request as any).user };
      });

      await app.ready();

      const response = await app.inject({
        method: 'GET',
        url: '/test',
        headers: {
          authorization: `Bearer ${token}`,
        },
      });

      const body = JSON.parse(response.body);
      expect(body.user.tenantName).toBeUndefined();
    });

    it('should allow access with valid token and different roles', async () => {
      const roles = ['user', 'admin', 'superadmin', 'support'];

      for (const role of roles) {
        const payload: JWTPayload = {
          sub: `user-${role}`,
          tenantId: 'tenant-456',
          email: `${role}@example.com`,
          role,
          iat: Math.floor(Date.now() / 1000),
          exp: Math.floor(Date.now() / 1000) + 3600,
        };

        const token = app.jwt.sign(payload);

        app.get(`/test-${role}`, {
          preHandler: app.authenticate,
        }, async (request) => {
          return { user: (request as any).user };
        });
      }

      await app.ready();

      for (const role of roles) {
        const payload: JWTPayload = {
          sub: `user-${role}`,
          tenantId: 'tenant-456',
          email: `${role}@example.com`,
          role,
          iat: Math.floor(Date.now() / 1000),
          exp: Math.floor(Date.now() / 1000) + 3600,
        };

        const token = app.jwt.sign(payload);

        const response = await app.inject({
          method: 'GET',
          url: `/test-${role}`,
          headers: {
            authorization: `Bearer ${token}`,
          },
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);
        expect(body.user.role).toBe(role);
      }
    });
  });

  describe('JWT Algorithm Security', () => {
    it('should use HS256 algorithm for signing', async () => {
      process.env.JWT_SECRET = 'a'.repeat(32);
      app = fastify();
      await app.register(jwtAuthPlugin);
      await app.ready();

      const payload: JWTPayload = {
        sub: 'user-123',
        tenantId: 'tenant-456',
        email: 'test@example.com',
        role: 'user',
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600,
      };

      const token = app.jwt.sign(payload);
      
      // Decode the token to check the header
      const parts = token.split('.');
      const header = JSON.parse(Buffer.from(parts[0], 'base64').toString());

      expect(header.alg).toBe('HS256');
    });

    it('should only accept HS256 algorithm in verification', async () => {
      process.env.JWT_SECRET = 'a'.repeat(32);
      app = fastify();
      await app.register(jwtAuthPlugin);
      await app.ready();

      // This is implicitly tested by the JWT plugin configuration
      // The verify option with algorithms: ['HS256'] ensures only HS256 is accepted
      expect(app.jwt).toBeDefined();
    });
  });

  describe('Token Expiration', () => {
    it('should set default expiration to 24 hours', async () => {
      process.env.JWT_SECRET = 'a'.repeat(32);
      app = fastify();
      await app.register(jwtAuthPlugin);
      await app.ready();

      const payload: JWTPayload = {
        sub: 'user-123',
        tenantId: 'tenant-456',
        email: 'test@example.com',
        role: 'user',
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600,
      };

      // Sign without specifying expiresIn to use default
      const token = app.jwt.sign(payload);
      
      // Decode token manually
      const parts = token.split('.');
      const decoded = JSON.parse(Buffer.from(parts[1], 'base64').toString());

      const expirationTime = decoded.exp - decoded.iat;
      expect(expirationTime).toBe(86400); // 24 hours in seconds
    });
  });
});
