import { testPool, testRedis, cleanupAll, closeConnections, createTestUser, TEST_TENANT_ID } from './setup';
import { BiometricService } from '../../src/services/biometric.service';
import bcrypt from 'bcrypt';
import crypto from 'crypto';

// Override the database and redis imports to use test instances
jest.mock('../../src/config/database', () => ({
  pool: require('./setup').testPool,
  db: require('knex')({
    client: 'pg',
    connection: {
      host: process.env.TEST_DB_HOST || 'localhost',
      port: parseInt(process.env.TEST_DB_PORT || '5432'),
      database: process.env.TEST_DB_NAME || 'tickettoken_test',
      user: process.env.TEST_DB_USER || 'postgres',
      password: process.env.TEST_DB_PASSWORD || 'postgres',
    },
  }),
}));

jest.mock('../../src/config/redis', () => ({
  getRedis: () => require('./setup').testRedis,
  initRedis: jest.fn(),
}));

describe('BiometricService Integration Tests', () => {
  let biometricService: BiometricService;

  beforeAll(async () => {
    biometricService = new BiometricService();
  });

  beforeEach(async () => {
    await cleanupAll();
  });

  afterAll(async () => {
    await cleanupAll();
    await closeConnections();
  });

  // Helper to create a user in the database
  async function createDbUser(overrides: Partial<any> = {}) {
    const userData = createTestUser(overrides);
    const hashedPassword = await bcrypt.hash(userData.password, 10);
    const result = await testPool.query(
      `INSERT INTO users (email, password_hash, first_name, last_name, tenant_id, status, email_verified)
       VALUES ($1, $2, $3, $4, $5, 'ACTIVE', true)
       RETURNING id, email, tenant_id`,
      [
        userData.email,
        hashedPassword,
        userData.firstName,
        userData.lastName,
        userData.tenant_id,
      ]
    );
    return { ...result.rows[0], password: userData.password };
  }

  describe('registerBiometric', () => {
    it('should register a new biometric credential', async () => {
      const user = await createDbUser();
      const deviceId = 'device-123';
      const publicKey = 'test-public-key-base64';

      const result = await biometricService.registerBiometric(
        user.id,
        deviceId,
        publicKey,
        'faceId'
      );

      expect(result.success).toBe(true);
      expect(result.credentialId).toBeDefined();
      expect(result.type).toBe('faceId');
    });

    it('should store credential in database', async () => {
      const user = await createDbUser();
      const deviceId = 'device-456';
      const publicKey = 'test-public-key-456';

      const result = await biometricService.registerBiometric(
        user.id,
        deviceId,
        publicKey,
        'touchId'
      );

      const dbCredential = await testPool.query(
        'SELECT * FROM biometric_credentials WHERE id = $1',
        [result.credentialId]
      );

      expect(dbCredential.rows.length).toBe(1);
      expect(dbCredential.rows[0].user_id).toBe(user.id);
      expect(dbCredential.rows[0].device_id).toBe(deviceId);
      expect(dbCredential.rows[0].public_key).toBe(publicKey);
      expect(dbCredential.rows[0].credential_type).toBe('touchId');
    });

    it('should reject duplicate device registration', async () => {
      const user = await createDbUser();
      const deviceId = 'device-duplicate';
      const publicKey = 'test-public-key';

      await biometricService.registerBiometric(user.id, deviceId, publicKey);

      await expect(
        biometricService.registerBiometric(user.id, deviceId, 'another-key')
      ).rejects.toThrow('Device already registered');
    });

    it('should allow same device for different users', async () => {
      const user1 = await createDbUser();
      const user2 = await createDbUser();
      const deviceId = 'shared-device';

      const result1 = await biometricService.registerBiometric(user1.id, deviceId, 'key1');
      const result2 = await biometricService.registerBiometric(user2.id, deviceId, 'key2');

      expect(result1.success).toBe(true);
      expect(result2.success).toBe(true);
    });

    it('should default to faceId type', async () => {
      const user = await createDbUser();

      const result = await biometricService.registerBiometric(
        user.id,
        'device-default',
        'public-key'
      );

      expect(result.type).toBe('faceId');
    });
  });

  describe('generateChallenge', () => {
    it('should generate a 64-character hex challenge', async () => {
      const user = await createDbUser();

      const challenge = await biometricService.generateChallenge(user.id, TEST_TENANT_ID);

      expect(challenge).toBeDefined();
      expect(challenge.length).toBe(64); // 32 bytes = 64 hex chars
      expect(/^[0-9a-f]+$/i.test(challenge)).toBe(true);
    });

    it('should store challenge in Redis with TTL', async () => {
      const user = await createDbUser();

      const challenge = await biometricService.generateChallenge(user.id, TEST_TENANT_ID);

      const redisKey = `tenant:${TEST_TENANT_ID}:biometric_challenge:${user.id}`;
      const storedChallenge = await testRedis.get(redisKey);
      const ttl = await testRedis.ttl(redisKey);

      expect(storedChallenge).toBe(challenge);
      expect(ttl).toBeGreaterThan(250); // ~5 minutes
      expect(ttl).toBeLessThanOrEqual(300);
    });

    it('should generate unique challenges', async () => {
      const user = await createDbUser();

      const challenge1 = await biometricService.generateChallenge(user.id, TEST_TENANT_ID);
      const challenge2 = await biometricService.generateChallenge(user.id, TEST_TENANT_ID);

      expect(challenge1).not.toBe(challenge2);
    });
  });

  describe('verifyBiometric', () => {
    async function setupBiometricUser() {
      const user = await createDbUser();
      const deviceId = 'verify-device';
      const publicKey = crypto.randomBytes(32).toString('hex');

      const { credentialId } = await biometricService.registerBiometric(
        user.id,
        deviceId,
        publicKey,
        'fingerprint'
      );

      const challenge = await biometricService.generateChallenge(user.id, TEST_TENANT_ID);

      // Create valid signature (matches the service's verification logic)
      const signature = crypto
        .createHash('sha256')
        .update(challenge + publicKey)
        .digest('hex');

      return { user, credentialId, challenge, signature, publicKey };
    }

    it('should verify valid biometric signature', async () => {
      const { user, credentialId, challenge, signature } = await setupBiometricUser();

      const result = await biometricService.verifyBiometric(
        user.id,
        credentialId,
        signature,
        challenge,
        TEST_TENANT_ID
      );

      expect(result.valid).toBe(true);
      expect(result.userId).toBe(user.id);
    });

    it('should consume challenge after verification (one-time use)', async () => {
      const { user, credentialId, challenge, signature } = await setupBiometricUser();

      await biometricService.verifyBiometric(
        user.id,
        credentialId,
        signature,
        challenge,
        TEST_TENANT_ID
      );

      // Try to use same challenge again
      await expect(
        biometricService.verifyBiometric(
          user.id,
          credentialId,
          signature,
          challenge,
          TEST_TENANT_ID
        )
      ).rejects.toThrow('Challenge expired or not found');
    });

    it('should reject expired/missing challenge', async () => {
      const user = await createDbUser();
      const { credentialId } = await biometricService.registerBiometric(
        user.id,
        'device-1',
        'public-key'
      );

      await expect(
        biometricService.verifyBiometric(
          user.id,
          credentialId,
          'signature',
          'non-existent-challenge',
          TEST_TENANT_ID
        )
      ).rejects.toThrow('Challenge expired or not found');
    });

    it('should reject invalid challenge', async () => {
      const { user, credentialId, signature } = await setupBiometricUser();

      // Generate a new challenge but use the old signature
      await biometricService.generateChallenge(user.id, TEST_TENANT_ID);

      await expect(
        biometricService.verifyBiometric(
          user.id,
          credentialId,
          signature,
          'wrong-challenge',
          TEST_TENANT_ID
        )
      ).rejects.toThrow('Invalid challenge');
    });

    it('should reject invalid signature', async () => {
      const { user, credentialId, challenge } = await setupBiometricUser();

      await expect(
        biometricService.verifyBiometric(
          user.id,
          credentialId,
          'invalid-signature',
          challenge,
          TEST_TENANT_ID
        )
      ).rejects.toThrow('Invalid biometric signature');
    });

    it('should reject non-existent credential', async () => {
      const user = await createDbUser();
      const challenge = await biometricService.generateChallenge(user.id, TEST_TENANT_ID);

      await expect(
        biometricService.verifyBiometric(
          user.id,
          '00000000-0000-0000-0000-000000000099',
          'signature',
          challenge,
          TEST_TENANT_ID
        )
      ).rejects.toThrow('Biometric credential not found');
    });

    it('should reject credential belonging to different user', async () => {
      const user1 = await createDbUser();
      const user2 = await createDbUser();

      const { credentialId } = await biometricService.registerBiometric(
        user1.id,
        'device-1',
        'public-key'
      );

      const challenge = await biometricService.generateChallenge(user2.id, TEST_TENANT_ID);

      await expect(
        biometricService.verifyBiometric(
          user2.id,
          credentialId,
          'signature',
          challenge,
          TEST_TENANT_ID
        )
      ).rejects.toThrow('Biometric credential not found');
    });
  });

  describe('listBiometricDevices', () => {
    it('should return empty array for user with no devices', async () => {
      const user = await createDbUser();

      const devices = await biometricService.listBiometricDevices(user.id);

      expect(devices).toEqual([]);
    });

    it('should return all devices for user', async () => {
      const user = await createDbUser();

      await biometricService.registerBiometric(user.id, 'device-1', 'key1', 'faceId');
      await biometricService.registerBiometric(user.id, 'device-2', 'key2', 'touchId');
      await biometricService.registerBiometric(user.id, 'device-3', 'key3', 'fingerprint');

      const devices = await biometricService.listBiometricDevices(user.id);

      expect(devices.length).toBe(3);
      expect(devices.map(d => d.device_id).sort()).toEqual(['device-1', 'device-2', 'device-3']);
    });

    it('should return correct fields', async () => {
      const user = await createDbUser();

      await biometricService.registerBiometric(user.id, 'device-fields', 'key', 'touchId');

      const devices = await biometricService.listBiometricDevices(user.id);

      expect(devices[0]).toHaveProperty('id');
      expect(devices[0]).toHaveProperty('device_id', 'device-fields');
      expect(devices[0]).toHaveProperty('credential_type', 'touchId');
      expect(devices[0]).toHaveProperty('created_at');
      // Should NOT include public_key for security
      expect(devices[0]).not.toHaveProperty('public_key');
    });

    it('should not return devices from other users', async () => {
      const user1 = await createDbUser();
      const user2 = await createDbUser();

      await biometricService.registerBiometric(user1.id, 'device-user1', 'key1');
      await biometricService.registerBiometric(user2.id, 'device-user2', 'key2');

      const devices = await biometricService.listBiometricDevices(user1.id);

      expect(devices.length).toBe(1);
      expect(devices[0].device_id).toBe('device-user1');
    });
  });

  describe('removeBiometricDevice', () => {
    it('should remove existing device', async () => {
      const user = await createDbUser();
      const { credentialId } = await biometricService.registerBiometric(
        user.id,
        'device-to-remove',
        'key'
      );

      const result = await biometricService.removeBiometricDevice(user.id, credentialId);

      expect(result).toBe(true);

      const devices = await biometricService.listBiometricDevices(user.id);
      expect(devices.length).toBe(0);
    });

    it('should throw for non-existent credential', async () => {
      const user = await createDbUser();

      await expect(
        biometricService.removeBiometricDevice(user.id, '00000000-0000-0000-0000-000000000099')
      ).rejects.toThrow('Biometric credential not found');
    });

    it('should not allow removing another user credential', async () => {
      const user1 = await createDbUser();
      const user2 = await createDbUser();

      const { credentialId } = await biometricService.registerBiometric(
        user1.id,
        'device-1',
        'key'
      );

      await expect(
        biometricService.removeBiometricDevice(user2.id, credentialId)
      ).rejects.toThrow('Biometric credential not found');

      // Verify it still exists for user1
      const devices = await biometricService.listBiometricDevices(user1.id);
      expect(devices.length).toBe(1);
    });
  });

  describe('getCredential', () => {
    it('should return credential for valid user and id', async () => {
      const user = await createDbUser();
      const publicKey = 'test-public-key';
      const { credentialId } = await biometricService.registerBiometric(
        user.id,
        'device-1',
        publicKey,
        'faceId'
      );

      const credential = await biometricService.getCredential(credentialId, user.id);

      expect(credential).toBeDefined();
      expect(credential.id).toBe(credentialId);
      expect(credential.user_id).toBe(user.id);
      expect(credential.public_key).toBe(publicKey);
    });

    it('should return undefined for wrong user', async () => {
      const user1 = await createDbUser();
      const user2 = await createDbUser();

      const { credentialId } = await biometricService.registerBiometric(
        user1.id,
        'device-1',
        'key'
      );

      const credential = await biometricService.getCredential(credentialId, user2.id);

      expect(credential).toBeUndefined();
    });

    it('should return undefined for non-existent credential', async () => {
      const user = await createDbUser();

      const credential = await biometricService.getCredential(
        '00000000-0000-0000-0000-000000000099',
        user.id
      );

      expect(credential).toBeUndefined();
    });
  });
});
