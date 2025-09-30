import { db } from '../config/database';
import { redis } from '../config/redis';
import { AuthenticationError } from '../errors';
import crypto from 'crypto';

export class BiometricService {
  /**
   * Register biometric public key for a device
   */
  async registerBiometric(
    userId: string,
    deviceId: string,
    publicKey: string,
    type: 'faceId' | 'touchId' | 'fingerprint'
  ): Promise<any> {
    // Generate a unique credential ID
    const credentialId = crypto.randomUUID();
    
    // Store biometric credential
    await db('biometric_credentials').insert({
      id: credentialId,
      user_id: userId,
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
    deviceId: string,
    credentialId: string,
    signature: string,
    challenge: string
  ): Promise<boolean> {
    // Get stored credential
    const credential = await db('biometric_credentials')
      .where({
        id: credentialId,
        user_id: userId,
        device_id: deviceId,
        is_active: true
      })
      .first();
    
    if (!credential) {
      throw new AuthenticationError('Biometric credential not found');
    }
    
    // In production, verify signature with public key
    // For now, we'll do a simple check
    const expectedSignature = crypto
      .createHash('sha256')
      .update(challenge + credential.public_key)
      .digest('hex');
    
    return signature === expectedSignature;
  }

  /**
   * Generate biometric challenge
   */
  async generateChallenge(userId: string): Promise<string> {
    const challenge = crypto.randomBytes(32).toString('hex');
    
    // Store challenge in Redis with 5 minute expiry
    await redis.setex(
      `biometric_challenge:${userId}`,
      300,
      challenge
    );
    
    return challenge;
  }

  /**
   * List registered biometric devices
   */
  async listBiometricDevices(userId: string): Promise<any[]> {
    return db('biometric_credentials')
      .where({ user_id: userId, is_active: true })
      .select('id', 'device_id', 'credential_type', 'created_at');
  }
}
