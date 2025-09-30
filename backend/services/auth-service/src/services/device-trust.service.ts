import { db } from '../config/database';
import crypto from 'crypto';

export class DeviceTrustService {
  /**
   * Generate device fingerprint
   */
  generateFingerprint(request: any): string {
    const components = [
      request.headers['user-agent'] || '',
      request.headers['accept-language'] || '',
      request.headers['accept-encoding'] || '',
      request.ip || ''
    ];
    
    return crypto
      .createHash('sha256')
      .update(components.join('|'))
      .digest('hex');
  }

  /**
   * Calculate trust score
   */
  async calculateTrustScore(userId: string, fingerprint: string): Promise<number> {
    const device = await db('trusted_devices')
      .where({ user_id: userId, device_fingerprint: fingerprint })
      .first();
    
    if (!device) return 0;
    
    let score = 50; // Base score
    
    // Age bonus (up to 20 points)
    const ageInDays = (Date.now() - new Date(device.created_at).getTime()) / (1000 * 60 * 60 * 24);
    score += Math.min(20, Math.floor(ageInDays / 10));
    
    // Recent activity bonus (up to 30 points)
    const lastSeenDays = (Date.now() - new Date(device.last_seen).getTime()) / (1000 * 60 * 60 * 24);
    if (lastSeenDays < 1) score += 30;
    else if (lastSeenDays < 7) score += 20;
    else if (lastSeenDays < 30) score += 10;
    
    return Math.min(100, score);
  }

  /**
   * Record device activity
   */
  async recordDeviceActivity(userId: string, fingerprint: string, success: boolean): Promise<void> {
    const device = await db('trusted_devices')
      .where({ user_id: userId, device_fingerprint: fingerprint })
      .first();
    
    if (!device) {
      // New device
      await db('trusted_devices').insert({
        user_id: userId,
        device_fingerprint: fingerprint,
        trust_score: success ? 50 : 0,
        last_seen: new Date()
      });
    } else {
      // Update existing
      const newScore = success 
        ? Math.min(100, device.trust_score + 5)
        : Math.max(0, device.trust_score - 10);
      
      await db('trusted_devices')
        .where({ id: device.id })
        .update({
          trust_score: newScore,
          last_seen: new Date()
        });
    }
  }

  /**
   * Check if device requires additional verification
   */
  async requiresAdditionalVerification(userId: string, fingerprint: string): Promise<boolean> {
    const score = await this.calculateTrustScore(userId, fingerprint);
    return score < 30; // Require MFA for low trust devices
  }
}
