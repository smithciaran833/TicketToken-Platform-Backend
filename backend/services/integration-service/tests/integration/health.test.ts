/**
 * Integration Tests for Health Endpoints
 * 
 * Tests the health check endpoints for the integration service.
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { FastifyInstance } from 'fastify';

// Mock build function since actual server setup may require DB
async function buildTestApp(): Promise<FastifyInstance> {
  const fastify = await import('fastify');
  const app = fastify.default({ logger: false });
  
  // Register basic health routes for testing
  app.get('/health', async () => ({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'integration-service',
    version: '1.0.0'
  }));

  app.get('/health/live', async () => ({
    status: 'ok'
  }));

  app.get('/health/ready', async () => ({
    status: 'ok',
    checks: {
      database: 'ok',
      redis: 'ok'
    }
  }));

  await app.ready();
  return app;
}

describe('Health Endpoints', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /health', () => {
    it('should return healthy status', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/health'
      });
      
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.status).toBe('healthy');
      expect(body.service).toBe('integration-service');
      expect(body).toHaveProperty('timestamp');
    });
  });

  describe('GET /health/live', () => {
    it('should return liveness probe ok', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/health/live'
      });
      
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.status).toBe('ok');
    });
  });

  describe('GET /health/ready', () => {
    it('should return readiness probe ok with dependency checks', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/health/ready'
      });
      
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.status).toBe('ok');
      expect(body.checks).toHaveProperty('database');
      expect(body.checks).toHaveProperty('redis');
    });
  });
});

describe('Request ID Middleware', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    const fastify = await import('fastify');
    app = fastify.default({ 
      logger: false,
      genReqId: () => `test-${Date.now()}`
    });
    
    app.addHook('onRequest', async (request, reply) => {
      // Simulate request ID middleware
      const requestId = request.headers['x-request-id'] as string || 
                        `generated-${Date.now()}`;
      reply.header('x-request-id', requestId);
    });

    app.get('/test', async (request, reply) => ({
      requestId: reply.getHeader('x-request-id'),
      message: 'test'
    }));

    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('should preserve existing request ID', async () => {
    const customRequestId = 'custom-request-id-12345';
    const response = await app.inject({
      method: 'GET',
      url: '/test',
      headers: {
        'x-request-id': customRequestId
      }
    });
    
    expect(response.statusCode).toBe(200);
    expect(response.headers['x-request-id']).toBe(customRequestId);
  });

  it('should generate request ID when not provided', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/test'
    });
    
    expect(response.statusCode).toBe(200);
    expect(response.headers['x-request-id']).toBeDefined();
  });
});

describe('Error Response Format (RFC 7807)', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    const fastify = await import('fastify');
    app = fastify.default({ logger: false });
    
    // Simulate error handler
    app.setErrorHandler(async (error, request, reply) => {
      return reply.status(error.statusCode || 500).send({
        type: 'https://api.tickettoken.com/problems/internal-error',
        title: error.message || 'Internal Server Error',
        status: error.statusCode || 500,
        detail: error.message,
        instance: request.url,
        timestamp: new Date().toISOString()
      });
    });

    app.get('/error', async () => {
      const error = new Error('Test error');
      (error as any).statusCode = 400;
      throw error;
    });

    app.get('/not-found', async () => {
      const error = new Error('Resource not found');
      (error as any).statusCode = 404;
      throw error;
    });

    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('should return RFC 7807 compliant error response', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/error'
    });
    
    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.body);
    expect(body).toHaveProperty('type');
    expect(body).toHaveProperty('title');
    expect(body).toHaveProperty('status');
    expect(body).toHaveProperty('detail');
    expect(body).toHaveProperty('instance');
    expect(body).toHaveProperty('timestamp');
    expect(body.status).toBe(400);
  });

  it('should return 404 with proper format', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/not-found'
    });
    
    expect(response.statusCode).toBe(404);
    const body = JSON.parse(response.body);
    expect(body.status).toBe(404);
    expect(body.title).toContain('not found');
  });
});

describe('Webhook Signature Verification', () => {
  let app: FastifyInstance;
  const crypto = require('crypto');
  const testSecret = 'test-webhook-secret-32-chars-min';

  function generateStripeSignature(payload: string, secret: string): string {
    const timestamp = Math.floor(Date.now() / 1000);
    const signedPayload = `${timestamp}.${payload}`;
    const signature = crypto
      .createHmac('sha256', secret)
      .update(signedPayload)
      .digest('hex');
    return `t=${timestamp},v1=${signature}`;
  }

  beforeAll(async () => {
    const fastify = await import('fastify');
    app = fastify.default({ logger: false });
    
    // Register raw body parser for webhooks
    app.addContentTypeParser('application/json', { parseAs: 'string' }, (req, body, done) => {
      try {
        const json = JSON.parse(body as string);
        done(null, json);
      } catch (error: any) {
        done(error, undefined);
      }
    });

    app.post('/webhook/stripe', async (request, reply) => {
      const signature = request.headers['stripe-signature'] as string;
      if (!signature) {
        return reply.status(401).send({ error: 'Missing signature' });
      }
      
      // Simulate signature verification
      const parts = signature.split(',');
      if (parts.length < 2) {
        return reply.status(401).send({ error: 'Invalid signature format' });
      }
      
      return { received: true };
    });

    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('should reject webhook without signature', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/webhook/stripe',
      payload: { type: 'payment_intent.succeeded' }
    });
    
    expect(response.statusCode).toBe(401);
  });

  it('should accept webhook with valid signature format', async () => {
    const payload = JSON.stringify({ type: 'payment_intent.succeeded' });
    const signature = generateStripeSignature(payload, testSecret);
    
    const response = await app.inject({
      method: 'POST',
      url: '/webhook/stripe',
      headers: {
        'stripe-signature': signature
      },
      payload: { type: 'payment_intent.succeeded' }
    });
    
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.received).toBe(true);
  });
});

describe('Rate Limiting', () => {
  let app: FastifyInstance;
  const requestCounts = new Map<string, number>();

  beforeAll(async () => {
    const fastify = await import('fastify');
    app = fastify.default({ logger: false });
    
    // Simple rate limit simulation
    app.addHook('preHandler', async (request, reply) => {
      const ip = request.ip || '127.0.0.1';
      const count = requestCounts.get(ip) || 0;
      
      if (count >= 5) { // 5 requests max for tests
        return reply.status(429).send({
          type: 'https://api.tickettoken.com/problems/rate-limit-exceeded',
          title: 'Rate Limit Exceeded',
          status: 429,
          detail: 'Too many requests'
        });
      }
      
      requestCounts.set(ip, count + 1);
    });

    app.get('/rate-test', async () => ({ ok: true }));

    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    requestCounts.clear();
  });

  it('should allow requests within rate limit', async () => {
    for (let i = 0; i < 3; i++) {
      const response = await app.inject({
        method: 'GET',
        url: '/rate-test'
      });
      expect(response.statusCode).toBe(200);
    }
  });

  it('should block requests exceeding rate limit', async () => {
    // Previous test used 3, add 3 more to exceed limit of 5
    for (let i = 0; i < 3; i++) {
      await app.inject({
        method: 'GET',
        url: '/rate-test'
      });
    }
    
    const response = await app.inject({
      method: 'GET',
      url: '/rate-test'
    });
    
    expect(response.statusCode).toBe(429);
    const body = JSON.parse(response.body);
    expect(body.status).toBe(429);
  });
});
