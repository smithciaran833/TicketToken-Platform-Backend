import { db } from '../config/database';
import { getRedis } from '../config/redis';
import { AuthenticationError } from '../errors';
import crypto from 'crypto';
import { redisKeys } from '../utils/redisKeys';

export class BiometricService {
  /**
   * Register biometric public key for a device
   */
  async registerBiometric(
    userId: string,
    tenantId: string,
    deviceId: string,
    publicKey: string,
    type: 'faceId' | 'touchId' | 'fingerprint' = 'faceId'
  ): Promise<any> {
    const existing = await db('biometric_credentials')
      .where({
        user_id: userId,
        tenant_id: tenantId,
        device_id: deviceId,
      })
      .first();

    if (existing) {
      throw new AuthenticationError('Device already registered');
    }

    const credentialId = crypto.randomUUID();

    await db('biometric_credentials').insert({
      id: credentialId,
      user_id: userId,
      tenant_id: tenantId,
      device_id: deviceId,
      public_key: publicKey,
      credential_type: type,
      created_at: new Date()
    });

    return {
      success: true,
      credentialId,
      type
    };
  }

  /**
   * Verify biometric authentication
   */
  async verifyBiometric(
    userId: string,
    tenantId: string,
    credentialId: string,
    signature: string,
    challenge: string
  ): Promise<{ valid: boolean; userId: string }> {
    const redis = getRedis();

    // Try tenant-prefixed key first, then fall back
    let storedChallenge = await redis.get(redisKeys.biometricChallenge(userId, tenantId));
    if (!storedChallenge) {
      storedChallenge = await redis.get(`biometric_challenge:${userId}`);
    }

    if (!storedChallenge) {
      throw new AuthenticationError('Challenge expired or not found');
    }

    if (storedChallenge !== challenge) {
      throw new AuthenticationError('Invalid challenge');
    }

    // Consume the challenge (one-time use) - delete both patterns
    await redis.del(redisKeys.biometricChallenge(userId, tenantId));
    await redis.del(`biometric_challenge:${userId}`);

    const credential = await db('biometric_credentials')
      .where({
        id: credentialId,
        user_id: userId,
        tenant_id: tenantId,
      })
      .first();

    if (!credential) {
      throw new AuthenticationError('Biometric credential not found');
    }

    // In production, verify signature with public key using WebAuthn
    const expectedSignature = crypto
      .createHash('sha256')
      .update(challenge + credential.public_key)
      .digest('hex');

    const valid = signature === expectedSignature;

    if (!valid) {
      throw new AuthenticationError('Invalid biometric signature');
    }

    return { valid: true, userId };
  }

  /**
   * Generate biometric challenge
   */
  async generateChallenge(userId: string, tenantId?: string): Promise<string> {
    const challenge = crypto.randomBytes(32).toString('hex');

    const redis = getRedis();
    await redis.setex(
      redisKeys.biometricChallenge(userId, tenantId),
      300,
      challenge
    );

    return challenge;
  }

  /**
   * List registered biometric devices for a user
   */
  async listBiometricDevices(userId: string, tenantId: string): Promise<any[]> {
    const devices = await db('biometric_credentials')
      .where({ user_id: userId, tenant_id: tenantId })
      .select('id', 'device_id', 'credential_type', 'created_at');

    return devices;
  }

  /**
   * Remove a biometric device
   */
  async removeBiometricDevice(userId: string, tenantId: string, credentialId: string): Promise<boolean> {
    const deleted = await db('biometric_credentials')
      .where({
        id: credentialId,
        user_id: userId,
        tenant_id: tenantId,
      })
      .del();

    if (deleted === 0) {
      throw new AuthenticationError('Biometric credential not found');
    }

    return true;
  }

  /**
   * Get credential by ID (for internal use)
   */
  async getCredential(credentialId: string, userId: string, tenantId: string): Promise<any> {
    return db('biometric_credentials')
      .where({
        id: credentialId,
        user_id: userId,
        tenant_id: tenantId,
      })
      .first();
  }
}
