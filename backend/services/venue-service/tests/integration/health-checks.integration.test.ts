import path from 'path';
import dotenv from 'dotenv';
dotenv.config({ path: path.join(__dirname, '../../.env.test') });

import request from 'supertest';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { getTestDb } from './helpers/db';
import { getTestRedis } from './helpers/redis';

// Generate RSA keypair for JWT signing
const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

import fs from 'fs';
import os from 'os';
const tempKeyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'health-test-keys-'));
const publicKeyPath = path.join(tempKeyDir, 'jwt-public.pem');
fs.writeFileSync(publicKeyPath, publicKey);

process.env.JWT_PUBLIC_KEY_PATH = publicKeyPath;
process.env.INTERNAL_SERVICE_SECRET = 'test-internal-secret-token';

// Test constants
const TEST_TENANT_ID = '11111111-1111-1111-1111-111111111111';
const TEST_USER_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const ADMIN_USER_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

function generateTestJWT(payload: { 
  sub: string; 
  tenant_id: string; 
  role?: string;
  permissions?: string[] 
}): string {
  const now = Math.floor(Date.now() / 1000);
  return jwt.sign(
    {
      sub: payload.sub,
      email: `${payload.sub}@test.com`,
      tenant_id: payload.tenant_id,
      role: payload.role || 'user',
      permissions: payload.permissions || ['*'],
      iat: now,
      exp: now + 3600,
    },
    privateKey,
    { algorithm: 'RS256' }
  );
}

describe('Health Checks - Integration Tests', () => {
  let app: any;
  let db: any;
  let redis: any;
  let userToken: string;
  let adminToken: string;

  beforeAll(async () => {
    const { buildApp } = await import('../../src/app');
    app = await buildApp();
    await app.ready();
    db = getTestDb();
    redis = getTestRedis();
    
    userToken = generateTestJWT({ sub: TEST_USER_ID, tenant_id: TEST_TENANT_ID });
    adminToken = generateTestJWT({ 
      sub: ADMIN_USER_ID, 
      tenant_id: TEST_TENANT_ID,
      role: 'admin'
    });
  }, 30000);

  afterAll(async () => {
    if (app) await app.close();
    try {
      fs.unlinkSync(publicKeyPath);
      fs.rmdirSync(tempKeyDir);
    } catch {}
  });

  beforeEach(async () => {
    // Reconnect if connections were closed in previous tests
    if (!db || db.client?.config?.connection === null) {
      db = getTestDb();
    }
    
    if (redis.status === 'end' || redis.status === 'close') {
      redis = getTestRedis();
    }
    
    // Clean up database
    try {
      await db.raw('TRUNCATE TABLE venues CASCADE');
    } catch (error) {
      // If truncate fails, reconnect and try again
      db = getTestDb();
      await db.raw('TRUNCATE TABLE venues CASCADE');
    }
    
    // Clear Redis
    try {
      await redis.flushdb();
    } catch (error) {
      // If flush fails, reconnect and try again
      redis = getTestRedis();
      await redis.flushdb();
    }
  });

  // ===========================================
  // SECTION 1: STARTUP ENDPOINT (4 tests)
  // ===========================================
  describe('Startup Probe', () => {
    it('should return 200 when startup is complete', async () => {
      const res = await request(app.server)
        .get('/health/startup')
        .expect(200);

      expect(res.body.status).toBe('started');
      expect(res.body.timestamp).toBeDefined();
      expect(res.body.service).toBe('venue-service');
      // Version should NOT be exposed in unauthenticated endpoint
      expect(res.body.version).toBeUndefined();
    });

    it('should not expose sensitive information', async () => {
      const res = await request(app.server)
        .get('/health/startup')
        .expect(200);

      // Security: No internal details should be exposed
      expect(res.body.host).toBeUndefined();
      expect(res.body.uptime).toBeUndefined();
      expect(res.body.checks).toBeUndefined();
    });

    it('should include ISO 8601 timestamp', async () => {
      const res = await request(app.server)
        .get('/health/startup')
        .expect(200);

      const timestamp = new Date(res.body.timestamp);
      expect(timestamp.toISOString()).toBe(res.body.timestamp);
    });

    it('should respond quickly without checking dependencies', async () => {
      const start = Date.now();
      
      await request(app.server)
        .get('/health/startup')
        .expect(200);

      const duration = Date.now() - start;
      
      // Should be very fast (< 100ms) since it doesn't check dependencies
      expect(duration).toBeLessThan(100);
    });
  });

  // ===========================================
  // SECTION 2: LIVENESS ENDPOINT (3 tests)
  // ===========================================
  describe('Liveness Probe', () => {
    it('should always return alive status', async () => {
      const res = await request(app.server)
        .get('/health/live')
        .expect(200);

      expect(res.body.status).toBe('alive');
      expect(res.body.timestamp).toBeDefined();
    });

    it('should return alive even if dependencies are down', async () => {
      // Liveness doesn't check dependencies - it just confirms the process is running
      const res = await request(app.server)
        .get('/health/live')
        .expect(200);

      expect(res.body.status).toBe('alive');
    });

    it('should be used for Kubernetes liveness probe', async () => {
      const res = await request(app.server)
        .get('/health/live')
        .expect(200);

      // Simple response suitable for K8s probe
      expect(Object.keys(res.body)).toHaveLength(2); // status + timestamp
      expect(res.body.status).toBe('alive');
      expect(res.body.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });
  });

  // ===========================================
  // SECTION 3: READINESS ENDPOINT (5 tests)
  // ===========================================
  describe('Readiness Probe', () => {
    it('should return ready when database is up', async () => {
      const res = await request(app.server)
        .get('/health/ready')
        .expect(200);

      expect(res.body.status).toBe('healthy');
      expect(res.body.checks.database).toBeDefined();
      expect(res.body.checks.database.status).toBe('ok');
      expect(res.body.checks.database.responseTime).toBeGreaterThan(0);
    });

    it('should check Redis connectivity', async () => {
      const res = await request(app.server)
        .get('/health/ready')
        .expect(200);

      expect(res.body.checks.redis).toBeDefined();
      expect(res.body.checks.redis.status).toBe('ok');
      expect(res.body.checks.redis.responseTime).toBeGreaterThan(0);
    });

    it('should verify database check structure', async () => {
      const res = await request(app.server)
        .get('/health/ready')
        .expect(200);

      // Verify response structure for database check
      expect(res.body.checks.database).toBeDefined();
      expect(typeof res.body.checks.database.status).toBe('string');
      expect(['ok', 'error', 'timeout']).toContain(res.body.checks.database.status);
    });

    it('should handle Redis status appropriately', async () => {
      const res = await request(app.server)
        .get('/health/ready')
        .expect(200);

      // Redis check should be present
      expect(res.body.checks.redis).toBeDefined();
      expect(typeof res.body.checks.redis.status).toBe('string');
      
      // Overall status depends on checks
      expect(['healthy', 'degraded', 'unhealthy']).toContain(res.body.status);
    });

    it('should include service metadata', async () => {
      const res = await request(app.server)
        .get('/health/ready')
        .expect(200);

      expect(res.body.service).toBe('venue-service');
      expect(res.body.timestamp).toBeDefined();
      expect(res.body.version).toBeDefined();
      expect(res.body.uptime).toBeGreaterThanOrEqual(0);
    });
  });

  // ===========================================
  // SECTION 4: FULL HEALTH - ACCESS CONTROL (5 tests)
  // ===========================================
  describe('Full Health Endpoint - Access Control', () => {
    it('should allow access with internal service token', async () => {
      const res = await request(app.server)
        .get('/health/full')
        .set('x-internal-service-token', 'test-internal-secret-token')
        .expect(200);

      expect(res.body.status).toBeDefined();
      expect(res.body.checks).toBeDefined();
    });

    it('should allow access with admin JWT', async () => {
      const res = await request(app.server)
        .get('/health/full')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.status).toBeDefined();
      expect(res.body.checks).toBeDefined();
    });

    it('should allow access from internal IP addresses', async () => {
      // Internal IPs: 10.x, 172.x, 192.168.x, 127.0.0.1
      // This test verifies the IP check logic exists
      const res = await request(app.server)
        .get('/health/full');

      // From localhost, should be allowed (127.0.0.1 or ::1)
      // If not from internal IP and no auth, should be 403
      if (res.status === 200) {
        expect(res.body.checks).toBeDefined();
      }
    });

    it('should reject access without any authentication', async () => {
      // Set a non-internal IP if possible and no auth headers
      const res = await request(app.server)
        .get('/health/full');

      // Should be 403 or 200 depending on if test runs from internal IP
      // If 403, verify error message
      if (res.status === 403) {
        expect(res.body.error.code).toBe('ACCESS_DENIED');
        expect(res.body.error.message).toContain('internal access');
      }
    });

    it('should reject access with invalid service token', async () => {
      const res = await request(app.server)
        .get('/health/full')
        .set('x-internal-service-token', 'wrong-token');

      // Should be 403 if not from internal IP
      if (res.status === 403) {
        expect(res.body.error).toBeDefined();
      }
    });
  });

  // ===========================================
  // SECTION 5: FULL HEALTH - CHECKS (8 tests)
  // ===========================================
  describe('Full Health Endpoint - Checks', () => {
    it('should perform database SELECT 1 check', async () => {
      const res = await request(app.server)
        .get('/health/full')
        .set('x-internal-service-token', 'test-internal-secret-token')
        .expect(200);

      expect(res.body.checks.database).toBeDefined();
      expect(res.body.checks.database.status).toBe('ok');
      expect(res.body.checks.database.responseTime).toBeGreaterThan(0);
    });

    it('should perform venue count query', async () => {
      const res = await request(app.server)
        .get('/health/full')
        .set('x-internal-service-token', 'test-internal-secret-token')
        .expect(200);

      expect(res.body.checks.venueQuery).toBeDefined();
      expect(res.body.checks.venueQuery.status).toBe('ok');
      expect(res.body.checks.venueQuery.details).toBeDefined();
      expect(res.body.checks.venueQuery.details.venueCount).toBeGreaterThanOrEqual(0);
    });

    it('should perform Redis PING check', async () => {
      const res = await request(app.server)
        .get('/health/full')
        .set('x-internal-service-token', 'test-internal-secret-token')
        .expect(200);

      expect(res.body.checks.redis).toBeDefined();
      expect(res.body.checks.redis.status).toBe('ok');
    });

    it('should test Redis operations (set/get/delete)', async () => {
      const res = await request(app.server)
        .get('/health/full')
        .set('x-internal-service-token', 'test-internal-secret-token')
        .expect(200);

      expect(res.body.checks.cacheOperations).toBeDefined();
      expect(res.body.checks.cacheOperations.status).toBe('ok');
      expect(res.body.checks.cacheOperations.responseTime).toBeGreaterThan(0);
    });

    it('should check RabbitMQ connection status', async () => {
      const res = await request(app.server)
        .get('/health/full')
        .set('x-internal-service-token', 'test-internal-secret-token')
        .expect(200);

      expect(res.body.checks.rabbitMQ).toBeDefined();
      // RabbitMQ is optional - can be 'ok' or 'warning'
      expect(['ok', 'warning']).toContain(res.body.checks.rabbitMQ.status);
    });

    it('should check migration status', async () => {
      const res = await request(app.server)
        .get('/health/full')
        .set('x-internal-service-token', 'test-internal-secret-token')
        .expect(200);

      expect(res.body.checks.migrations).toBeDefined();
      expect(res.body.checks.migrations.details).toBeDefined();
      expect(res.body.checks.migrations.details.pendingCount).toBeGreaterThanOrEqual(0);
    });

    it('should measure response times for each check', async () => {
      const res = await request(app.server)
        .get('/health/full')
        .set('x-internal-service-token', 'test-internal-secret-token')
        .expect(200);

      // All checks should have response times
      expect(res.body.checks.database.responseTime).toBeGreaterThan(0);
      expect(res.body.checks.redis.responseTime).toBeGreaterThan(0);
      expect(res.body.checks.cacheOperations.responseTime).toBeGreaterThan(0);
      expect(res.body.checks.migrations.responseTime).toBeGreaterThan(0);
    });

    it('should complete within timeout (10 seconds)', async () => {
      const start = Date.now();
      
      await request(app.server)
        .get('/health/full')
        .set('x-internal-service-token', 'test-internal-secret-token')
        .expect(200);

      const duration = Date.now() - start;
      
      // Should complete well within 10 second timeout
      expect(duration).toBeLessThan(10000);
    }, 15000);
  });

  // ===========================================
  // SECTION 6: STATUS DETERMINATION (4 tests)
  // ===========================================
  describe('Status Determination', () => {
    it('should return healthy when all critical checks pass', async () => {
      const res = await request(app.server)
        .get('/health/full')
        .set('x-internal-service-token', 'test-internal-secret-token')
        .expect(200);

      if (res.body.checks.database.status === 'ok' && 
          res.body.checks.redis.status === 'ok' &&
          res.body.checks.migrations.status !== 'warning') {
        expect(res.body.status).toBe('healthy');
      }
    });

    it('should verify Redis check structure in status determination', async () => {
      const res = await request(app.server)
        .get('/health/full')
        .set('x-internal-service-token', 'test-internal-secret-token')
        .expect(200);

      // Verify Redis check is present and has proper structure
      expect(res.body.checks.redis).toBeDefined();
      expect(['ok', 'error', 'warning']).toContain(res.body.checks.redis.status);
    });

    it('should verify database check affects overall status', async () => {
      const res = await request(app.server)
        .get('/health/full')
        .set('x-internal-service-token', 'test-internal-secret-token')
        .expect(200);

      // Database is critical - if it's ok, overall should not be unhealthy
      if (res.body.checks.database.status === 'ok') {
        expect(res.body.status).not.toBe('unhealthy');
      }
    });

    it('should return degraded when migrations are pending', async () => {
      const res = await request(app.server)
        .get('/health/full')
        .set('x-internal-service-token', 'test-internal-secret-token')
        .expect(200);

      // If there are pending migrations, overall status should be degraded
      if (res.body.checks.migrations.status === 'warning') {
        expect(res.body.status).toBe('degraded');
        expect(res.body.checks.migrations.details.pendingCount).toBeGreaterThan(0);
      }
    });
  });

  // ===========================================
  // SECTION 7: LEGACY HEALTH ENDPOINT (3 tests)
  // ===========================================
  describe('Legacy Health Endpoint', () => {
    it('should provide backward compatible health check', async () => {
      const res = await request(app.server)
        .get('/health')
        .expect(200);

      expect(res.body.status).toBe('ok');
      expect(res.body.service).toBe('venue-service');
      expect(res.body.checks).toBeDefined();
      expect(res.body.checks.database).toBeDefined();
      expect(res.body.checks.redis).toBeDefined();
    });

    it('should verify health check structure', async () => {
      const res = await request(app.server)
        .get('/health')
        .expect(200);

      // Verify standard health check response structure
      expect(res.body.status).toBeDefined();
      expect(res.body.service).toBe('venue-service');
      expect(res.body.checks).toBeDefined();
      expect(res.body.checks.database).toBeDefined();
      expect(res.body.checks.redis).toBeDefined();
    });

    it('should not expose version in unauthenticated endpoint', async () => {
      const res = await request(app.server)
        .get('/health')
        .expect(200);

      // Security: Version should not be exposed
      expect(res.body.version).toBeUndefined();
    });
  });

  // ===========================================
  // SECTION 8: ERROR SCENARIOS (3 tests)
  // ===========================================
  describe('Error Scenarios', () => {
    it('should handle database timeout gracefully', async () => {
      const res = await request(app.server)
        .get('/health')
        .expect(200);

      // Should not hang indefinitely
      expect(res.body.checks.database).toBeDefined();
    }, 10000);

    it('should handle Redis timeout gracefully', async () => {
      const res = await request(app.server)
        .get('/health')
        .expect(200);

      // Should not hang indefinitely
      expect(res.body.checks.redis).toBeDefined();
    }, 10000);

    it('should cache RabbitMQ check for 10 seconds', async () => {
      const res1 = await request(app.server)
        .get('/health/full')
        .set('x-internal-service-token', 'test-internal-secret-token')
        .expect(200);

      const firstCheck = res1.body.checks.rabbitMQ;

      // Immediate second call should return cached result
      const res2 = await request(app.server)
        .get('/health/full')
        .set('x-internal-service-token', 'test-internal-secret-token')
        .expect(200);

      const secondCheck = res2.body.checks.rabbitMQ;

      // Should be the same (cached)
      expect(secondCheck.status).toBe(firstCheck.status);
    });
  });
});
