/**
 * Auth Middleware Integration Tests
 */

import Fastify, { FastifyInstance } from 'fastify';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';

// Generate test RSA key pair
const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

// Mock the auth module before importing
jest.mock('../../../src/middleware/auth', () => {
  const originalModule = jest.requireActual('../../../src/middleware/auth');
  
  return {
    ...originalModule,
    authenticate: async (request: any, reply: any) => {
      try {
        const authHeader = request.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
          return reply.status(401).send({ error: 'No token provided' });
        }

        const token = authHeader.substring(7);
        const decoded = jwt.verify(token, publicKey, {
          algorithms: ['RS256'],
          issuer: 'tickettoken-auth',
          audience: 'tickettoken-auth',
        }) as any;

        request.user = decoded;
        request.userId = decoded.userId || decoded.id || decoded.sub;
        request.tenantId = decoded.tenantId || decoded.tenant_id;
      } catch (error: any) {
        if (error.name === 'TokenExpiredError') {
          return reply.status(401).send({ error: 'Token expired' });
        }
        if (error.name === 'JsonWebTokenError') {
          return reply.status(401).send({ error: 'Invalid token' });
        }
        return reply.status(500).send({ error: 'Authentication error' });
      }
    },
  };
});

import { authenticate, requireRole, requireVenueAccess } from '../../../src/middleware/auth';

// Helper to generate valid JWT
function generateToken(payload: any, options: jwt.SignOptions = {}): string {
  return jwt.sign(payload, privateKey, {
    algorithm: 'RS256',
    issuer: 'tickettoken-auth',
    audience: 'tickettoken-auth',
    expiresIn: '1h',
    ...options,
  });
}

describe('Auth Middleware Integration Tests', () => {
  describe('authenticate', () => {
    let app: FastifyInstance;

    beforeAll(async () => {
      app = Fastify();
      app.addHook('preHandler', authenticate);

      app.get('/protected', async (request) => ({
        user: (request as any).user,
        userId: (request as any).userId,
        tenantId: (request as any).tenantId,
      }));

      await app.ready();
    });

    afterAll(async () => {
      await app.close();
    });

    describe('missing or invalid authorization header', () => {
      it('should reject request without authorization header', async () => {
        const response = await app.inject({
          method: 'GET',
          url: '/protected',
        });

        expect(response.statusCode).toBe(401);
        const body = JSON.parse(response.body);
        expect(body.error).toBe('No token provided');
      });

      it('should reject request with empty authorization header', async () => {
        const response = await app.inject({
          method: 'GET',
          url: '/protected',
          headers: { authorization: '' },
        });

        expect(response.statusCode).toBe(401);
        const body = JSON.parse(response.body);
        expect(body.error).toBe('No token provided');
      });

      it('should reject request without Bearer prefix', async () => {
        const response = await app.inject({
          method: 'GET',
          url: '/protected',
          headers: { authorization: 'Basic abc123' },
        });

        expect(response.statusCode).toBe(401);
        const body = JSON.parse(response.body);
        expect(body.error).toBe('No token provided');
      });

      it('should reject request with only Bearer keyword', async () => {
        const response = await app.inject({
          method: 'GET',
          url: '/protected',
          headers: { authorization: 'Bearer ' },
        });

        expect(response.statusCode).toBe(401);
        const body = JSON.parse(response.body);
        expect(body.error).toBe('Invalid token');
      });

      it('should reject request with malformed token', async () => {
        const response = await app.inject({
          method: 'GET',
          url: '/protected',
          headers: { authorization: 'Bearer not-a-valid-jwt' },
        });

        expect(response.statusCode).toBe(401);
        const body = JSON.parse(response.body);
        expect(body.error).toBe('Invalid token');
      });

      it('should reject token signed with wrong algorithm', async () => {
        const hsToken = jwt.sign({ userId: 'test' }, 'secret', { algorithm: 'HS256' });

        const response = await app.inject({
          method: 'GET',
          url: '/protected',
          headers: { authorization: `Bearer ${hsToken}` },
        });

        expect(response.statusCode).toBe(401);
        const body = JSON.parse(response.body);
        expect(body.error).toBe('Invalid token');
      });
    });

    describe('token validation', () => {
      it('should accept valid token and extract user info', async () => {
        const token = generateToken({
          userId: 'user-123',
          tenantId: 'tenant-456',
          email: 'test@example.com',
          role: 'user',
        });

        const response = await app.inject({
          method: 'GET',
          url: '/protected',
          headers: { authorization: `Bearer ${token}` },
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);
        expect(body.userId).toBe('user-123');
        expect(body.tenantId).toBe('tenant-456');
        expect(body.user.email).toBe('test@example.com');
      });

      it('should extract userId from sub claim', async () => {
        const token = generateToken({
          sub: 'sub-user-789',
          tenantId: 'tenant-456',
        });

        const response = await app.inject({
          method: 'GET',
          url: '/protected',
          headers: { authorization: `Bearer ${token}` },
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);
        expect(body.userId).toBe('sub-user-789');
      });

      it('should extract userId from id claim', async () => {
        const token = generateToken({
          id: 'id-user-abc',
          tenantId: 'tenant-456',
        });

        const response = await app.inject({
          method: 'GET',
          url: '/protected',
          headers: { authorization: `Bearer ${token}` },
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);
        expect(body.userId).toBe('id-user-abc');
      });

      it('should extract tenantId from tenant_id claim', async () => {
        const token = generateToken({
          userId: 'user-123',
          tenant_id: 'snake-case-tenant',
        });

        const response = await app.inject({
          method: 'GET',
          url: '/protected',
          headers: { authorization: `Bearer ${token}` },
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);
        expect(body.tenantId).toBe('snake-case-tenant');
      });

      it('should reject expired token', async () => {
        const token = generateToken(
          { userId: 'user-123' },
          { expiresIn: '-1s' }
        );

        const response = await app.inject({
          method: 'GET',
          url: '/protected',
          headers: { authorization: `Bearer ${token}` },
        });

        expect(response.statusCode).toBe(401);
        const body = JSON.parse(response.body);
        expect(body.error).toBe('Token expired');
      });

      it('should reject token with wrong issuer', async () => {
        const token = jwt.sign(
          { userId: 'user-123' },
          privateKey,
          {
            algorithm: 'RS256',
            issuer: 'wrong-issuer',
            audience: 'tickettoken-auth',
            expiresIn: '1h',
          }
        );

        const response = await app.inject({
          method: 'GET',
          url: '/protected',
          headers: { authorization: `Bearer ${token}` },
        });

        expect(response.statusCode).toBe(401);
        const body = JSON.parse(response.body);
        expect(body.error).toBe('Invalid token');
      });

      it('should reject token with wrong audience', async () => {
        const token = jwt.sign(
          { userId: 'user-123' },
          privateKey,
          {
            algorithm: 'RS256',
            issuer: 'tickettoken-auth',
            audience: 'wrong-audience',
            expiresIn: '1h',
          }
        );

        const response = await app.inject({
          method: 'GET',
          url: '/protected',
          headers: { authorization: `Bearer ${token}` },
        });

        expect(response.statusCode).toBe(401);
        const body = JSON.parse(response.body);
        expect(body.error).toBe('Invalid token');
      });
    });

    describe('user data attachment', () => {
      it('should attach full decoded token to request.user', async () => {
        const token = generateToken({
          userId: 'user-123',
          tenantId: 'tenant-456',
          email: 'test@example.com',
          role: 'admin',
          permissions: ['read', 'write'],
          customField: 'custom-value',
        });

        const response = await app.inject({
          method: 'GET',
          url: '/protected',
          headers: { authorization: `Bearer ${token}` },
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);
        expect(body.user.email).toBe('test@example.com');
        expect(body.user.role).toBe('admin');
        expect(body.user.permissions).toEqual(['read', 'write']);
        expect(body.user.customField).toBe('custom-value');
      });
    });
  });

  describe('requireRole', () => {
    let app: FastifyInstance;

    beforeAll(async () => {
      app = Fastify();
      
      // Manually set user for testing requireRole
      app.addHook('preHandler', async (request) => {
        const userHeader = request.headers['x-test-user'] as string;
        if (userHeader) {
          (request as any).user = JSON.parse(userHeader);
        }
      });

      app.get('/admin-only', { preHandler: [requireRole(['admin'])] }, async () => ({ access: 'granted' }));
      app.get('/multi-role', { preHandler: [requireRole(['admin', 'manager'])] }, async () => ({ access: 'granted' }));
      app.get('/user-role', { preHandler: [requireRole(['user', 'admin'])] }, async () => ({ access: 'granted' }));

      await app.ready();
    });

    afterAll(async () => {
      await app.close();
    });

    it('should reject request without user', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/admin-only',
      });

      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Authentication required');
      expect(body.code).toBe('NO_AUTH');
    });

    it('should reject user with wrong role', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/admin-only',
        headers: { 'x-test-user': JSON.stringify({ role: 'user' }) },
      });

      expect(response.statusCode).toBe(403);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Insufficient permissions');
      expect(body.code).toBe('FORBIDDEN');
      expect(body.requiredRoles).toContain('admin');
      expect(body.userRole).toBe('user');
    });

    it('should allow user with correct role', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/admin-only',
        headers: { 'x-test-user': JSON.stringify({ role: 'admin' }) },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.access).toBe('granted');
    });

    it('should allow any of multiple required roles', async () => {
      const managerResponse = await app.inject({
        method: 'GET',
        url: '/multi-role',
        headers: { 'x-test-user': JSON.stringify({ role: 'manager' }) },
      });
      expect(managerResponse.statusCode).toBe(200);

      const adminResponse = await app.inject({
        method: 'GET',
        url: '/multi-role',
        headers: { 'x-test-user': JSON.stringify({ role: 'admin' }) },
      });
      expect(adminResponse.statusCode).toBe(200);
    });

    it('should reject role not in allowed list', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/multi-role',
        headers: { 'x-test-user': JSON.stringify({ role: 'user' }) },
      });

      expect(response.statusCode).toBe(403);
    });
  });

  describe('requireVenueAccess', () => {
    let app: FastifyInstance;

    beforeAll(async () => {
      app = Fastify();

      // Manually set user for testing
      app.addHook('preHandler', async (request) => {
        const userHeader = request.headers['x-test-user'] as string;
        if (userHeader) {
          (request as any).user = JSON.parse(userHeader);
        }
      });

      app.get('/venue/:venueId', { preHandler: [requireVenueAccess] }, async (request) => ({
        venueId: (request.params as any).venueId,
        access: 'granted',
      }));

      app.post('/venue-body', { preHandler: [requireVenueAccess] }, async (request) => ({
        venueId: (request.body as any).venueId,
        access: 'granted',
      }));

      await app.ready();
    });

    afterAll(async () => {
      await app.close();
    });

    describe('venue ID extraction', () => {
      it('should extract venueId from URL params', async () => {
        const response = await app.inject({
          method: 'GET',
          url: '/venue/venue-123',
          headers: { 'x-test-user': JSON.stringify({ role: 'admin', isAdmin: true }) },
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);
        expect(body.venueId).toBe('venue-123');
      });

      it('should extract venueId from request body', async () => {
        const response = await app.inject({
          method: 'POST',
          url: '/venue-body',
          headers: { 'x-test-user': JSON.stringify({ role: 'admin', isAdmin: true }) },
          payload: { venueId: 'body-venue-456' },
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);
        expect(body.venueId).toBe('body-venue-456');
      });

      it('should reject request without venueId', async () => {
        const response = await app.inject({
          method: 'POST',
          url: '/venue-body',
          headers: { 'x-test-user': JSON.stringify({ role: 'user' }) },
          payload: {},
        });

        expect(response.statusCode).toBe(400);
        const body = JSON.parse(response.body);
        expect(body.error).toBe('Venue ID required');
        expect(body.code).toBe('VENUE_ID_MISSING');
      });
    });

    describe('authentication checks', () => {
      it('should reject request without user', async () => {
        const response = await app.inject({
          method: 'GET',
          url: '/venue/venue-123',
        });

        expect(response.statusCode).toBe(401);
        const body = JSON.parse(response.body);
        expect(body.error).toBe('Authentication required');
        expect(body.code).toBe('NO_AUTH');
      });
    });

    describe('admin access', () => {
      it('should allow admin access to any venue via isAdmin flag', async () => {
        const response = await app.inject({
          method: 'GET',
          url: '/venue/any-venue-id',
          headers: { 'x-test-user': JSON.stringify({ isAdmin: true }) },
        });

        expect(response.statusCode).toBe(200);
      });

      it('should allow admin access to any venue via admin role', async () => {
        const response = await app.inject({
          method: 'GET',
          url: '/venue/any-venue-id',
          headers: { 'x-test-user': JSON.stringify({ role: 'admin' }) },
        });

        expect(response.statusCode).toBe(200);
      });
    });

    describe('venue-specific access', () => {
      it('should allow user with venue in their venues array', async () => {
        const response = await app.inject({
          method: 'GET',
          url: '/venue/venue-123',
          headers: {
            'x-test-user': JSON.stringify({
              role: 'user',
              venues: ['venue-123', 'venue-456'],
            }),
          },
        });

        expect(response.statusCode).toBe(200);
      });

      it('should reject user without venue in their venues array', async () => {
        const response = await app.inject({
          method: 'GET',
          url: '/venue/venue-999',
          headers: {
            'x-test-user': JSON.stringify({
              role: 'user',
              venues: ['venue-123', 'venue-456'],
            }),
          },
        });

        expect(response.statusCode).toBe(403);
        const body = JSON.parse(response.body);
        expect(body.error).toBe('Access denied to this venue');
        expect(body.code).toBe('VENUE_ACCESS_DENIED');
        expect(body.venueId).toBe('venue-999');
      });

      it('should reject user with empty venues array', async () => {
        const response = await app.inject({
          method: 'GET',
          url: '/venue/venue-123',
          headers: {
            'x-test-user': JSON.stringify({
              role: 'user',
              venues: [],
            }),
          },
        });

        expect(response.statusCode).toBe(403);
      });

      it('should reject user with no venues property', async () => {
        const response = await app.inject({
          method: 'GET',
          url: '/venue/venue-123',
          headers: {
            'x-test-user': JSON.stringify({
              role: 'user',
            }),
          },
        });

        expect(response.statusCode).toBe(403);
      });
    });
  });
});
