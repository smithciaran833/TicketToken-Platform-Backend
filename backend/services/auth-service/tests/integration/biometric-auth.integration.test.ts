import request from 'supertest';
import crypto from 'crypto';
import {
  testPool,
  testRedis,
  TEST_TENANT_ID,
  cleanupAll,
  closeConnections,
  createTestUser,
  initAppRedis,
} from './setup';

import { buildApp } from '../../src/app';
import { redisKeys } from '../../src/utils/redisKeys';

let app: any;

// ============================================
// TEST HELPERS
// ============================================

async function registerUser(overrides: Partial<any> = {}) {
  const userData = createTestUser(overrides);
  const response = await request(app.server)
    .post('/auth/register')
    .send(userData)
    .expect(201);

  return {
    userId: response.body.user.id,
    tenantId: response.body.user.tenant_id,
    accessToken: response.body.tokens.accessToken,
    refreshToken: response.body.tokens.refreshToken,
    email: userData.email,
  };
}

function generateValidSignature(challenge: string, publicKey: string): string {
  return crypto
    .createHash('sha256')
    .update(challenge + publicKey)
    .digest('hex');
}

async function registerBiometricDevice(
  accessToken: string,
  deviceId: string = `device-${Date.now()}`,
  publicKey: string = `pubkey-${crypto.randomBytes(16).toString('hex')}`,
  biometricType: string = 'faceId'
) {
  const response = await request(app.server)
    .post('/auth/biometric/register')
    .set('Authorization', `Bearer ${accessToken}`)
    .send({ publicKey, deviceId, biometricType })
    .expect(201);

  return {
    credentialId: response.body.credentialId,
    publicKey,
    deviceId,
  };
}

async function getBiometricCredentials(userId: string) {
  const result = await testPool.query(
    'SELECT * FROM biometric_credentials WHERE user_id = $1',
    [userId]
  );
  return result.rows;
}

async function getAuditLogs(userId: string, action?: string) {
  let query = 'SELECT * FROM audit_logs WHERE user_id = $1';
  const params: any[] = [userId];

  if (action) {
    query += ' AND action = $2';
    params.push(action);
  }

  query += ' ORDER BY created_at DESC';

  const result = await testPool.query(query, params);
  return result.rows;
}

async function performBiometricAuth(
  userId: string,
  tenantId: string,
  credentialId: string,
  publicKey: string
) {
  const challengeResponse = await request(app.server)
    .post('/auth/biometric/challenge')
    .send({ userId, tenantId })
    .expect(200);

  const challenge = challengeResponse.body.challenge;
  const signature = generateValidSignature(challenge, publicKey);

  return request(app.server)
    .post('/auth/biometric/authenticate')
    .send({
      userId,
      tenantId,
      credentialId,
      signature,
      challenge,
    });
}

// ============================================
// MAIN TEST SUITE
// ============================================

describe('Biometric Auth Integration Tests', () => {
  beforeAll(async () => {
    await initAppRedis();
    app = await buildApp();
    await app.ready();
  }, 30000);

  beforeEach(async () => {
    await cleanupAll();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
    await closeConnections();
  });

  // ============================================
  // POST /auth/biometric/challenge (Public)
  // ============================================

  describe('POST /auth/biometric/challenge (Public)', () => {
    it('should generate challenge for valid userId and tenantId', async () => {
      const user = await registerUser();

      const response = await request(app.server)
        .post('/auth/biometric/challenge')
        .send({
          userId: user.userId,
          tenantId: user.tenantId,
        })
        .expect(200);

      expect(response.body.challenge).toBeDefined();
      expect(response.body.challenge.length).toBe(64);
    });

    it('should generate different challenges each time', async () => {
      const user = await registerUser();

      const response1 = await request(app.server)
        .post('/auth/biometric/challenge')
        .send({ userId: user.userId, tenantId: user.tenantId })
        .expect(200);

      const response2 = await request(app.server)
        .post('/auth/biometric/challenge')
        .send({ userId: user.userId, tenantId: user.tenantId })
        .expect(200);

      expect(response1.body.challenge).not.toBe(response2.body.challenge);
    });

    it('should store challenge in Redis with TTL', async () => {
      const user = await registerUser();

      await request(app.server)
        .post('/auth/biometric/challenge')
        .send({ userId: user.userId, tenantId: user.tenantId })
        .expect(200);

      const keys = await testRedis.keys(`*biometric*${user.userId}*`);
      expect(keys.length).toBeGreaterThan(0);
    });

    it('should return 400 when userId is missing', async () => {
      const response = await request(app.server)
        .post('/auth/biometric/challenge')
        .send({ tenantId: TEST_TENANT_ID })
        .expect(400);

      expect(response.body.detail).toBeDefined();
    });

    it('should return 400 when tenantId is missing', async () => {
      const user = await registerUser();

      const response = await request(app.server)
        .post('/auth/biometric/challenge')
        .send({ userId: user.userId })
        .expect(400);

      expect(response.body.detail).toBeDefined();
    });

    it('should return 400 when userId is invalid format', async () => {
      const response = await request(app.server)
        .post('/auth/biometric/challenge')
        .send({ userId: 'not-a-uuid', tenantId: TEST_TENANT_ID })
        .expect(400);

      expect(response.body.detail).toBeDefined();
    });

    it('should return 400 when tenantId is invalid UUID format', async () => {
      const user = await registerUser();

      const response = await request(app.server)
        .post('/auth/biometric/challenge')
        .send({ userId: user.userId, tenantId: 'invalid-tenant' })
        .expect(400);

      expect(response.body.detail).toBeDefined();
    });
  });

  // ============================================
  // POST /auth/biometric/authenticate (Public)
  // ============================================

  describe('POST /auth/biometric/authenticate (Public)', () => {
    it('should authenticate with valid biometric signature', async () => {
      const user = await registerUser();
      const device = await registerBiometricDevice(user.accessToken);

      const challengeResponse = await request(app.server)
        .post('/auth/biometric/challenge')
        .send({ userId: user.userId, tenantId: user.tenantId })
        .expect(200);

      const challenge = challengeResponse.body.challenge;
      const signature = generateValidSignature(challenge, device.publicKey);

      const response = await request(app.server)
        .post('/auth/biometric/authenticate')
        .send({
          userId: user.userId,
          tenantId: user.tenantId,
          credentialId: device.credentialId,
          signature,
          challenge,
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.tokens).toBeDefined();
      expect(response.body.tokens.accessToken).toBeDefined();
      expect(response.body.tokens.refreshToken).toBeDefined();
    });

    it('should return 401 for invalid signature', async () => {
      const user = await registerUser();
      const device = await registerBiometricDevice(user.accessToken);

      const challengeResponse = await request(app.server)
        .post('/auth/biometric/challenge')
        .send({ userId: user.userId, tenantId: user.tenantId })
        .expect(200);

      const response = await request(app.server)
        .post('/auth/biometric/authenticate')
        .send({
          userId: user.userId,
          tenantId: user.tenantId,
          credentialId: device.credentialId,
          signature: 'invalid-signature',
          challenge: challengeResponse.body.challenge,
        })
        .expect(401);

      expect(response.body.error).toBeDefined();
    });

    it('should return 401 for expired/missing challenge', async () => {
      const user = await registerUser();
      const device = await registerBiometricDevice(user.accessToken);

      const fakeChallenge = crypto.randomBytes(32).toString('hex');
      const signature = generateValidSignature(fakeChallenge, device.publicKey);

      const response = await request(app.server)
        .post('/auth/biometric/authenticate')
        .send({
          userId: user.userId,
          tenantId: user.tenantId,
          credentialId: device.credentialId,
          signature,
          challenge: fakeChallenge,
        })
        .expect(401);

      expect(response.body.error).toBeDefined();
    });

    it('should return 401 for non-existent credential', async () => {
      const user = await registerUser();

      const challengeResponse = await request(app.server)
        .post('/auth/biometric/challenge')
        .send({ userId: user.userId, tenantId: user.tenantId })
        .expect(200);

      const response = await request(app.server)
        .post('/auth/biometric/authenticate')
        .send({
          userId: user.userId,
          tenantId: user.tenantId,
          credentialId: crypto.randomUUID(),
          signature: 'some-signature',
          challenge: challengeResponse.body.challenge,
        })
        .expect(401);

      expect(response.body.error).toBeDefined();
    });

    it('should consume challenge after use (one-time)', async () => {
      const user = await registerUser();
      const device = await registerBiometricDevice(user.accessToken);

      const challengeResponse = await request(app.server)
        .post('/auth/biometric/challenge')
        .send({ userId: user.userId, tenantId: user.tenantId })
        .expect(200);

      const challenge = challengeResponse.body.challenge;
      const signature = generateValidSignature(challenge, device.publicKey);

      // First authentication
      const firstResponse = await request(app.server)
        .post('/auth/biometric/authenticate')
        .send({
          userId: user.userId,
          tenantId: user.tenantId,
          credentialId: device.credentialId,
          signature,
          challenge,
        });

      expect(firstResponse.status).toBe(200);

      // Second authentication with same challenge should fail
      const secondResponse = await request(app.server)
        .post('/auth/biometric/authenticate')
        .send({
          userId: user.userId,
          tenantId: user.tenantId,
          credentialId: device.credentialId,
          signature,
          challenge,
        })
        .expect(401);

      expect(secondResponse.body.error).toBeDefined();
    });

    it('should return 400 when required fields are missing', async () => {
      const response = await request(app.server)
        .post('/auth/biometric/authenticate')
        .send({
          userId: crypto.randomUUID(),
          tenantId: TEST_TENANT_ID,
        })
        .expect(400);

      expect(response.body.detail).toBeDefined();
    });

    it('should return 400 when credentialId is missing', async () => {
      const user = await registerUser();

      const challengeResponse = await request(app.server)
        .post('/auth/biometric/challenge')
        .send({ userId: user.userId, tenantId: user.tenantId })
        .expect(200);

      const response = await request(app.server)
        .post('/auth/biometric/authenticate')
        .send({
          userId: user.userId,
          tenantId: user.tenantId,
          signature: 'some-signature',
          challenge: challengeResponse.body.challenge,
        })
        .expect(400);

      expect(response.body.detail).toBeDefined();
    });

    it('should return 400 when signature is missing', async () => {
      const user = await registerUser();

      const challengeResponse = await request(app.server)
        .post('/auth/biometric/challenge')
        .send({ userId: user.userId, tenantId: user.tenantId })
        .expect(200);

      const response = await request(app.server)
        .post('/auth/biometric/authenticate')
        .send({
          userId: user.userId,
          tenantId: user.tenantId,
          credentialId: crypto.randomUUID(),
          challenge: challengeResponse.body.challenge,
        })
        .expect(400);

      expect(response.body.detail).toBeDefined();
    });

    it('should return 400 when challenge is missing', async () => {
      const user = await registerUser();

      const response = await request(app.server)
        .post('/auth/biometric/authenticate')
        .send({
          userId: user.userId,
          tenantId: user.tenantId,
          credentialId: crypto.randomUUID(),
          signature: 'some-signature',
        })
        .expect(400);

      expect(response.body.detail).toBeDefined();
    });
  });

  // ============================================
  // POST /auth/biometric/register (Authenticated)
  // ============================================

  describe('POST /auth/biometric/register (Authenticated)', () => {
    it('should register biometric device for authenticated user', async () => {
      const user = await registerUser();
      const deviceId = `device-${Date.now()}`;
      const publicKey = `pubkey-${crypto.randomBytes(16).toString('hex')}`;

      const response = await request(app.server)
        .post('/auth/biometric/register')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .send({
          publicKey,
          deviceId,
          biometricType: 'faceId',
        })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.credentialId).toBeDefined();

      const credentials = await getBiometricCredentials(user.userId);
      expect(credentials.length).toBe(1);
      expect(credentials[0].device_id).toBe(deviceId);
      expect(credentials[0].public_key).toBe(publicKey);
      expect(credentials[0].credential_type).toBe('faceId');
    });

    it('should support different biometric types', async () => {
      const user = await registerUser();

      for (const biometricType of ['faceId', 'touchId', 'fingerprint']) {
        const response = await request(app.server)
          .post('/auth/biometric/register')
          .set('Authorization', `Bearer ${user.accessToken}`)
          .send({
            publicKey: `pubkey-${crypto.randomBytes(16).toString('hex')}`,
            deviceId: `device-${biometricType}-${Date.now()}`,
            biometricType,
          })
          .expect(201);

        expect(response.body.success).toBe(true);
      }

      const credentials = await getBiometricCredentials(user.userId);
      expect(credentials.length).toBe(3);
    });

    it('should default to faceId when biometricType not specified', async () => {
      const user = await registerUser();

      const response = await request(app.server)
        .post('/auth/biometric/register')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .send({
          publicKey: `pubkey-${crypto.randomBytes(16).toString('hex')}`,
          deviceId: `device-${Date.now()}`,
        })
        .expect(201);

      expect(response.body.success).toBe(true);

      const credentials = await getBiometricCredentials(user.userId);
      expect(credentials[0].credential_type).toBe('faceId');
    });

    it('should return 409 for duplicate device registration', async () => {
      const user = await registerUser();
      const deviceId = `device-${Date.now()}`;

      await request(app.server)
        .post('/auth/biometric/register')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .send({
          publicKey: 'pubkey-1',
          deviceId,
          biometricType: 'faceId',
        })
        .expect(201);

      const response = await request(app.server)
        .post('/auth/biometric/register')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .send({
          publicKey: 'pubkey-2',
          deviceId,
          biometricType: 'faceId',
        })
        .expect(409);

      expect(response.body.error).toContain('already registered');
    });

    it('should return 401 without authorization header', async () => {
      await request(app.server)
        .post('/auth/biometric/register')
        .send({
          publicKey: 'some-key',
          deviceId: 'some-device',
          biometricType: 'faceId',
        })
        .expect(401);
    });

    it('should return 400 when publicKey is missing', async () => {
      const user = await registerUser();

      const response = await request(app.server)
        .post('/auth/biometric/register')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .send({
          deviceId: 'some-device',
          biometricType: 'faceId',
        })
        .expect(400);

      expect(response.body.detail).toBeDefined();
    });

    it('should return 400 when deviceId is missing', async () => {
      const user = await registerUser();

      const response = await request(app.server)
        .post('/auth/biometric/register')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .send({
          publicKey: 'some-key',
          biometricType: 'faceId',
        })
        .expect(400);

      expect(response.body.detail).toBeDefined();
    });

    it('should return 400 for invalid biometricType', async () => {
      const user = await registerUser();

      const response = await request(app.server)
        .post('/auth/biometric/register')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .send({
          publicKey: 'some-key',
          deviceId: 'some-device',
          biometricType: 'invalidType',
        })
        .expect(400);

      expect(response.body.detail).toBeDefined();
    });

    it('should allow same deviceId for different users', async () => {
      const user1 = await registerUser();
      const user2 = await registerUser();
      const sharedDeviceId = `shared-device-${Date.now()}`;

      const response1 = await request(app.server)
        .post('/auth/biometric/register')
        .set('Authorization', `Bearer ${user1.accessToken}`)
        .send({
          publicKey: `pubkey-user1-${crypto.randomBytes(16).toString('hex')}`,
          deviceId: sharedDeviceId,
          biometricType: 'faceId',
        })
        .expect(201);

      const response2 = await request(app.server)
        .post('/auth/biometric/register')
        .set('Authorization', `Bearer ${user2.accessToken}`)
        .send({
          publicKey: `pubkey-user2-${crypto.randomBytes(16).toString('hex')}`,
          deviceId: sharedDeviceId,
          biometricType: 'faceId',
        })
        .expect(201);

      expect(response1.body.success).toBe(true);
      expect(response2.body.success).toBe(true);
    });

    it('should store tenant_id correctly in biometric_credentials', async () => {
      const user = await registerUser();
      const deviceId = `device-tenant-${Date.now()}`;

      await request(app.server)
        .post('/auth/biometric/register')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .send({
          publicKey: `pubkey-${crypto.randomBytes(16).toString('hex')}`,
          deviceId,
          biometricType: 'faceId',
        })
        .expect(201);

      const result = await testPool.query(
        'SELECT tenant_id FROM biometric_credentials WHERE device_id = $1',
        [deviceId]
      );

      expect(result.rows[0].tenant_id).toBe(user.tenantId);
    });
  });

  // ============================================
  // GET /auth/biometric/challenge (Authenticated)
  // ============================================

  describe('GET /auth/biometric/challenge (Authenticated)', () => {
    it('should generate challenge for authenticated user', async () => {
      const user = await registerUser();

      const response = await request(app.server)
        .get('/auth/biometric/challenge')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .expect(200);

      expect(response.body.challenge).toBeDefined();
      expect(response.body.challenge.length).toBe(64);
    });

    it('should return 401 without authorization header', async () => {
      await request(app.server)
        .get('/auth/biometric/challenge')
        .expect(401);
    });

    it('should store challenge in Redis with correct key pattern', async () => {
      const user = await registerUser();

      await request(app.server)
        .get('/auth/biometric/challenge')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .expect(200);

      const expectedKey = redisKeys.biometricChallenge(user.userId, user.tenantId);
      const storedChallenge = await testRedis.get(expectedKey);

      expect(storedChallenge).toBeDefined();
      expect(storedChallenge!.length).toBe(64);
    });

    it('should store challenge with TTL around 300 seconds', async () => {
      const user = await registerUser();

      await request(app.server)
        .get('/auth/biometric/challenge')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .expect(200);

      const expectedKey = redisKeys.biometricChallenge(user.userId, user.tenantId);
      const ttl = await testRedis.ttl(expectedKey);

      expect(ttl).toBeGreaterThan(290);
      expect(ttl).toBeLessThanOrEqual(300);
    });
  });

  // ============================================
  // GET /auth/biometric/devices (Authenticated)
  // ============================================

  describe('GET /auth/biometric/devices (Authenticated)', () => {
    it('should list registered devices for user', async () => {
      const user = await registerUser();

      await registerBiometricDevice(user.accessToken, 'device-1', 'pubkey-1', 'faceId');
      await registerBiometricDevice(user.accessToken, 'device-2', 'pubkey-2', 'touchId');

      const response = await request(app.server)
        .get('/auth/biometric/devices')
        .set('Authorization', `Bearer ${user.accessToken}`);

      expect(response.status).toBe(200);
      expect(response.body.devices).toBeDefined();
      expect(response.body.devices.length).toBe(2);
    });

    it('should return empty array when no devices registered', async () => {
      const user = await registerUser();

      const response = await request(app.server)
        .get('/auth/biometric/devices')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .expect(200);

      expect(response.body.devices).toBeDefined();
      expect(response.body.devices.length).toBe(0);
    });

    it('should not return devices from other users', async () => {
      const user1 = await registerUser();
      const user2 = await registerUser();

      await registerBiometricDevice(user1.accessToken, 'device-1', 'pubkey-1', 'faceId');

      const response = await request(app.server)
        .get('/auth/biometric/devices')
        .set('Authorization', `Bearer ${user2.accessToken}`)
        .expect(200);

      expect(response.body.devices.length).toBe(0);
    });

    it('should return 401 without authorization header', async () => {
      await request(app.server)
        .get('/auth/biometric/devices')
        .expect(401);
    });

    it('should return correct fields in device response', async () => {
      const user = await registerUser();
      const deviceId = `device-fields-${Date.now()}`;

      await registerBiometricDevice(user.accessToken, deviceId, 'pubkey-fields', 'touchId');

      const response = await request(app.server)
        .get('/auth/biometric/devices')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .expect(200);

      const device = response.body.devices[0];
      expect(device.credentialId).toBeDefined();
      expect(device.deviceId).toBe(deviceId);
      expect(device.biometricType).toBe('touchId');
      expect(device.createdAt).toBeDefined();
    });

    it('should NOT expose public_key in device response', async () => {
      const user = await registerUser();

      await registerBiometricDevice(user.accessToken, 'device-1', 'secret-pubkey', 'faceId');

      const response = await request(app.server)
        .get('/auth/biometric/devices')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .expect(200);

      const device = response.body.devices[0];
      expect(device.publicKey).toBeUndefined();
      expect(device.public_key).toBeUndefined();
    });
  });

  // ============================================
  // DELETE /auth/biometric/devices/:credentialId (Authenticated)
  // ============================================

  describe('DELETE /auth/biometric/devices/:credentialId (Authenticated)', () => {
    it('should delete a registered device', async () => {
      const user = await registerUser();
      const device = await registerBiometricDevice(user.accessToken);

      let credentials = await getBiometricCredentials(user.userId);
      expect(credentials.length).toBe(1);

      await request(app.server)
        .delete(`/auth/biometric/devices/${device.credentialId}`)
        .set('Authorization', `Bearer ${user.accessToken}`)
        .expect(204);

      credentials = await getBiometricCredentials(user.userId);
      expect(credentials.length).toBe(0);
    });

    it('should return 404 for non-existent credential', async () => {
      const user = await registerUser();

      const response = await request(app.server)
        .delete(`/auth/biometric/devices/${crypto.randomUUID()}`)
        .set('Authorization', `Bearer ${user.accessToken}`)
        .expect(404);

      expect(response.body.error).toBeDefined();
    });

    it('should not allow deleting another user\'s device', async () => {
      const user1 = await registerUser();
      const user2 = await registerUser();

      const device = await registerBiometricDevice(user1.accessToken);

      const response = await request(app.server)
        .delete(`/auth/biometric/devices/${device.credentialId}`)
        .set('Authorization', `Bearer ${user2.accessToken}`)
        .expect(404);

      expect(response.body.error).toBeDefined();

      const credentials = await getBiometricCredentials(user1.userId);
      expect(credentials.length).toBe(1);
    });

    it('should return 401 without authorization header', async () => {
      await request(app.server)
        .delete(`/auth/biometric/devices/${crypto.randomUUID()}`)
        .expect(401);
    });
  });

  // ============================================
  // SECURITY: User Status Checks
  // ============================================

  describe('Security: User Status Checks', () => {
    it('should reject biometric auth for soft-deleted user', async () => {
      const user = await registerUser();
      const device = await registerBiometricDevice(user.accessToken);

      // Soft delete the user
      await testPool.query(
        'UPDATE users SET deleted_at = NOW() WHERE id = $1',
        [user.userId]
      );

      const response = await performBiometricAuth(
        user.userId,
        user.tenantId,
        device.credentialId,
        device.publicKey
      );

      expect(response.status).toBe(401);
      expect(response.body.error).toBeDefined();
    });

    it('should reject biometric auth for locked user', async () => {
      const user = await registerUser();
      const device = await registerBiometricDevice(user.accessToken);

      // Lock the user
      await testPool.query(
        "UPDATE users SET locked_until = NOW() + INTERVAL '1 hour' WHERE id = $1",
        [user.userId]
      );

      const response = await performBiometricAuth(
        user.userId,
        user.tenantId,
        device.credentialId,
        device.publicKey
      );

      expect(response.status).toBe(401);
      expect(response.body.error).toBeDefined();
    });

    it('should reject biometric auth for suspended user', async () => {
      const user = await registerUser();
      const device = await registerBiometricDevice(user.accessToken);

      // Suspend the user
      await testPool.query(
        "UPDATE users SET status = 'SUSPENDED' WHERE id = $1",
        [user.userId]
      );

      const response = await performBiometricAuth(
        user.userId,
        user.tenantId,
        device.credentialId,
        device.publicKey
      );

      expect(response.status).toBe(401);
      expect(response.body.error).toBeDefined();
    });

    it('should allow biometric auth for user with PENDING status', async () => {
      const user = await registerUser();
      const device = await registerBiometricDevice(user.accessToken);

      // Ensure user is PENDING (default)
      await testPool.query(
        "UPDATE users SET status = 'PENDING' WHERE id = $1",
        [user.userId]
      );

      const response = await performBiometricAuth(
        user.userId,
        user.tenantId,
        device.credentialId,
        device.publicKey
      );

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    it('should allow biometric auth for user with ACTIVE status', async () => {
      const user = await registerUser();
      const device = await registerBiometricDevice(user.accessToken);

      // Set user to ACTIVE
      await testPool.query(
        "UPDATE users SET status = 'ACTIVE' WHERE id = $1",
        [user.userId]
      );

      const response = await performBiometricAuth(
        user.userId,
        user.tenantId,
        device.credentialId,
        device.publicKey
      );

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    it('should handle expired lock (locked_until in the past)', async () => {
      const user = await registerUser();
      const device = await registerBiometricDevice(user.accessToken);

      // Set lock in the past (expired)
      await testPool.query(
        "UPDATE users SET locked_until = NOW() - INTERVAL '1 hour' WHERE id = $1",
        [user.userId]
      );

      const response = await performBiometricAuth(
        user.userId,
        user.tenantId,
        device.credentialId,
        device.publicKey
      );

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });
  });

  // ============================================
  // SECURITY: Cross-Tenant Isolation
  // ============================================

  describe('Security: Cross-Tenant Isolation', () => {
    it('should not allow user to authenticate with another user\'s credential (same tenant)', async () => {
      const user1 = await registerUser();
      const user2 = await registerUser();
      const device = await registerBiometricDevice(user1.accessToken);

      // User2 tries to authenticate with User1's credential
      const challengeResponse = await request(app.server)
        .post('/auth/biometric/challenge')
        .send({ userId: user2.userId, tenantId: user2.tenantId })
        .expect(200);

      const challenge = challengeResponse.body.challenge;
      const signature = generateValidSignature(challenge, device.publicKey);

      const response = await request(app.server)
        .post('/auth/biometric/authenticate')
        .send({
          userId: user2.userId,
          tenantId: user2.tenantId,
          credentialId: device.credentialId,
          signature,
          challenge,
        })
        .expect(401);

      expect(response.body.error).toBeDefined();
    });
  });

  // ============================================
  // AUDIT LOGGING
  // ============================================

  describe('Audit Logging', () => {
    it('should create audit log on biometric registration', async () => {
      const user = await registerUser();

      await registerBiometricDevice(user.accessToken, 'audit-device-1', 'audit-pubkey-1', 'faceId');

      const logs = await getAuditLogs(user.userId, 'biometric.registered');
      expect(logs.length).toBe(1);
      expect(logs[0].action).toBe('biometric.registered');
      expect(logs[0].resource_type).toBe('biometric_credential');
    });

    it('should create audit log on successful biometric authentication', async () => {
      const user = await registerUser();
      const device = await registerBiometricDevice(user.accessToken);

      await performBiometricAuth(
        user.userId,
        user.tenantId,
        device.credentialId,
        device.publicKey
      );

      const logs = await getAuditLogs(user.userId, 'biometric.authenticated');
      expect(logs.length).toBe(1);
      expect(logs[0].action).toBe('biometric.authenticated');
      expect(logs[0].success).toBe(true);
    });

    it('should create audit log on failed biometric authentication', async () => {
      const user = await registerUser();
      const device = await registerBiometricDevice(user.accessToken);

      const challengeResponse = await request(app.server)
        .post('/auth/biometric/challenge')
        .send({ userId: user.userId, tenantId: user.tenantId })
        .expect(200);

      // Use invalid signature
      await request(app.server)
        .post('/auth/biometric/authenticate')
        .send({
          userId: user.userId,
          tenantId: user.tenantId,
          credentialId: device.credentialId,
          signature: 'invalid-signature',
          challenge: challengeResponse.body.challenge,
        })
        .expect(401);

      const logs = await getAuditLogs(user.userId, 'biometric.auth_failed');
      expect(logs.length).toBe(1);
      expect(logs[0].action).toBe('biometric.auth_failed');
      expect(logs[0].success).toBe(false);
    });

    it('should create audit log on biometric device deletion', async () => {
      const user = await registerUser();
      const device = await registerBiometricDevice(user.accessToken);

      await request(app.server)
        .delete(`/auth/biometric/devices/${device.credentialId}`)
        .set('Authorization', `Bearer ${user.accessToken}`)
        .expect(204);

      const logs = await getAuditLogs(user.userId, 'biometric.device_deleted');
      expect(logs.length).toBe(1);
      expect(logs[0].action).toBe('biometric.device_deleted');
      expect(logs[0].resource_id).toBe(device.credentialId);
    });
  });

  // ============================================
  // EDGE CASES
  // ============================================

  describe('Edge Cases', () => {
    it('should accept publicKey at max length (2048 chars)', async () => {
      const user = await registerUser();
      const longPublicKey = 'k'.repeat(2048);

      const response = await request(app.server)
        .post('/auth/biometric/register')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .send({
          publicKey: longPublicKey,
          deviceId: `device-long-key-${Date.now()}`,
          biometricType: 'faceId',
        })
        .expect(201);

      expect(response.body.success).toBe(true);
    });

    it('should accept deviceId at max length (255 chars)', async () => {
      const user = await registerUser();
      const longDeviceId = 'd'.repeat(255);

      const response = await request(app.server)
        .post('/auth/biometric/register')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .send({
          publicKey: `pubkey-${crypto.randomBytes(16).toString('hex')}`,
          deviceId: longDeviceId,
          biometricType: 'faceId',
        })
        .expect(201);

      expect(response.body.success).toBe(true);
    });
  });
});
