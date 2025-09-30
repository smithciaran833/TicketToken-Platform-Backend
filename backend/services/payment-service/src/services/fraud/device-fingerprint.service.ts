import crypto from 'crypto';
import { query } from '../../config/database';

export class DeviceFingerprintService {
  generateFingerprint(deviceData: {
    userAgent: string;
    screenResolution: string;
    timezone: string;
    language: string;
    platform: string;
    plugins?: string[];
    fonts?: string[];
    canvas?: string;
    webgl?: string;
  }): string {
    // Create a stable fingerprint from device characteristics
    const fingerprintData = {
      ua: deviceData.userAgent,
      sr: deviceData.screenResolution,
      tz: deviceData.timezone,
      lang: deviceData.language,
      plat: deviceData.platform,
      plugins: (deviceData.plugins || []).sort().join(','),
      fonts: (deviceData.fonts || []).slice(0, 20).sort().join(','),
      canvas: deviceData.canvas ? deviceData.canvas.substring(0, 50) : '',
      webgl: deviceData.webgl ? deviceData.webgl.substring(0, 50) : ''
    };
    
    const fingerprintString = JSON.stringify(fingerprintData);
    const hash = crypto.createHash('sha256').update(fingerprintString).digest('hex');
    
    return hash;
  }
  
  async recordDeviceActivity(
    deviceFingerprint: string,
    userId: string,
    activity: string,
    metadata?: any
  ): Promise<void> {
    await query(
      `INSERT INTO device_activity 
       (device_fingerprint, user_id, activity_type, metadata, timestamp)
       VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)`,
      [deviceFingerprint, userId, activity, JSON.stringify(metadata || {})]
    );
  }
  
  async getDeviceRiskScore(deviceFingerprint: string): Promise<{
    score: number;
    factors: Array<{
      factor: string;
      weight: number;
      value: any;
    }>;
  }> {
    const factors = [];
    let totalScore = 0;
    
    // Factor 1: Number of accounts associated
    const accountCount = await this.getAssociatedAccountCount(deviceFingerprint);
    if (accountCount > 1) {
      const accountFactor = {
        factor: 'multiple_accounts',
        weight: 0.3,
        value: accountCount
      };
      factors.push(accountFactor);
      totalScore += Math.min(accountCount / 5, 1) * accountFactor.weight;
    }
    
    // Factor 2: Suspicious activity patterns
    const suspiciousActivity = await this.getSuspiciousActivityCount(deviceFingerprint);
    if (suspiciousActivity > 0) {
      const activityFactor = {
        factor: 'suspicious_activity',
        weight: 0.25,
        value: suspiciousActivity
      };
      factors.push(activityFactor);
      totalScore += Math.min(suspiciousActivity / 10, 1) * activityFactor.weight;
    }
    
    // Factor 3: Geographic anomalies
    const geoAnomalies = await this.checkGeographicAnomalies(deviceFingerprint);
    if (geoAnomalies.hasAnomalies) {
      const geoFactor = {
        factor: 'geographic_anomalies',
        weight: 0.2,
        value: geoAnomalies
      };
      factors.push(geoFactor);
      totalScore += geoFactor.weight;
    }
    
    // Factor 4: Device age
    const deviceAge = await this.getDeviceAge(deviceFingerprint);
    if (deviceAge < 24) { // Less than 24 hours old
      const ageFactor = {
        factor: 'new_device',
        weight: 0.15,
        value: `${deviceAge} hours`
      };
      factors.push(ageFactor);
      totalScore += (1 - deviceAge / 24) * ageFactor.weight;
    }
    
    // Factor 5: Failed payment attempts
    const failedAttempts = await this.getFailedPaymentAttempts(deviceFingerprint);
    if (failedAttempts > 2) {
      const failedFactor = {
        factor: 'failed_payments',
        weight: 0.1,
        value: failedAttempts
      };
      factors.push(failedFactor);
      totalScore += Math.min(failedAttempts / 5, 1) * failedFactor.weight;
    }
    
    return {
      score: Math.min(totalScore, 1),
      factors
    };
  }
  
  private async getAssociatedAccountCount(deviceFingerprint: string): Promise<number> {
    const result = await query(
      `SELECT COUNT(DISTINCT user_id) as count
       FROM device_activity
       WHERE device_fingerprint = $1`,
      [deviceFingerprint]
    );
    
    return parseInt(result.rows[0].count);
  }
  
  private async getSuspiciousActivityCount(deviceFingerprint: string): Promise<number> {
    const result = await query(
      `SELECT COUNT(*) as count
       FROM device_activity
       WHERE device_fingerprint = $1
         AND activity_type IN ('failed_payment', 'fraud_detected', 'account_locked')
         AND timestamp > CURRENT_TIMESTAMP - INTERVAL '30 days'`,
      [deviceFingerprint]
    );
    
    return parseInt(result.rows[0].count);
  }
  
  private async checkGeographicAnomalies(deviceFingerprint: string): Promise<{
    hasAnomalies: boolean;
    details?: any;
  }> {
    // Check for impossible travel scenarios
    const geoQuery = `
      SELECT 
        da1.timestamp as time1,
        da1.metadata->>'location' as location1,
        da2.timestamp as time2,
        da2.metadata->>'location' as location2
      FROM device_activity da1
      JOIN device_activity da2 ON da1.device_fingerprint = da2.device_fingerprint
      WHERE da1.device_fingerprint = $1
        AND da2.timestamp > da1.timestamp
        AND da2.timestamp < da1.timestamp + INTERVAL '1 hour'
        AND da1.metadata->>'location' != da2.metadata->>'location'
      ORDER BY da1.timestamp DESC
      LIMIT 1
    `;
    
    const result = await query(geoQuery, [deviceFingerprint]);
    
    if (result.rows.length > 0) {
      const anomaly = result.rows[0];
      // In production, calculate actual distance between locations
      return {
        hasAnomalies: true,
        details: {
          location1: anomaly.location1,
          location2: anomaly.location2,
          timeDifference: anomaly.time2 - anomaly.time1
        }
      };
    }
    
    return { hasAnomalies: false };
  }
  
  private async getDeviceAge(deviceFingerprint: string): Promise<number> {
    const result = await query(
      `SELECT MIN(timestamp) as first_seen
       FROM device_activity
       WHERE device_fingerprint = $1`,
      [deviceFingerprint]
    );
    
    if (result.rows[0].first_seen) {
      const ageMs = Date.now() - new Date(result.rows[0].first_seen).getTime();
      return ageMs / (1000 * 60 * 60); // Convert to hours
    }
    
    return 0;
  }
  
  private async getFailedPaymentAttempts(deviceFingerprint: string): Promise<number> {
    const result = await query(
      `SELECT COUNT(*) as count
       FROM payment_transactions
       WHERE device_fingerprint = $1
         AND status = 'failed'
         AND created_at > CURRENT_TIMESTAMP - INTERVAL '7 days'`,
      [deviceFingerprint]
    );
    
    return parseInt(result.rows[0].count);
  }
  
  async compareFingerprints(fp1: string, fp2: string): Promise<{
    similar: boolean;
    similarity: number;
  }> {
    // Simple comparison - in production would use more sophisticated matching
    if (fp1 === fp2) {
      return { similar: true, similarity: 1.0 };
    }
    
    // Check if fingerprints are similar (could be same device with minor changes)
    const distance = this.calculateHammingDistance(fp1, fp2);
    const similarity = 1 - (distance / Math.max(fp1.length, fp2.length));
    
    return {
      similar: similarity > 0.85,
      similarity
    };
  }
  
  private calculateHammingDistance(str1: string, str2: string): number {
    let distance = 0;
    const length = Math.min(str1.length, str2.length);
    
    for (let i = 0; i < length; i++) {
      if (str1[i] !== str2[i]) distance++;
    }
    
    distance += Math.abs(str1.length - str2.length);
    
    return distance;
  }
}
