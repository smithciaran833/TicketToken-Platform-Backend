import crypto from 'crypto';
import { query } from '../../config/database';
import { logger } from '../../utils/logger';

const log = logger.child({ component: 'DeviceFingerprintService' });

export interface DeviceData {
  userAgent: string;
  screenResolution: string;
  timezone: string;
  language: string;
  platform: string;
  plugins?: string[];
  fonts?: string[];
  canvas?: string;
  webgl?: string;
}

export interface RiskFactor {
  factor: string;
  weight: number;
  value: any;
}

export interface DeviceRiskScore {
  score: number;
  factors: RiskFactor[];
}

export class DeviceFingerprintService {
  /**
   * Generate a fingerprint from device characteristics
   */
  generateFingerprint(deviceData: DeviceData): string {
    const fingerprintData = {
      ua: deviceData.userAgent,
      sr: deviceData.screenResolution,
      tz: deviceData.timezone,
      lang: deviceData.language,
      plat: deviceData.platform,
      plugins: (deviceData.plugins || []).sort().join(','),
      fonts: (deviceData.fonts || []).slice(0, 20).sort().join(','),
      canvas: deviceData.canvas ? deviceData.canvas.substring(0, 50) : '',
      webgl: deviceData.webgl ? deviceData.webgl.substring(0, 50) : '',
    };

    const fingerprintString = JSON.stringify(fingerprintData);
    const hash = crypto.createHash('sha256').update(fingerprintString).digest('hex');

    return hash;
  }

  /**
   * Record device activity
   */
  async recordDeviceActivity(
    tenantId: string,
    deviceFingerprint: string,
    userId: string,
    activity: string,
    metadata?: Record<string, any>
  ): Promise<void> {
    await query(
      `INSERT INTO device_activity
       (tenant_id, device_fingerprint, user_id, activity_type, metadata, timestamp)
       VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)`,
      [tenantId, deviceFingerprint, userId, activity, JSON.stringify(metadata || {})]
    );

    log.debug({ deviceFingerprint: deviceFingerprint.slice(0, 8), activity }, 'Device activity recorded');
  }

  /**
   * Get device risk score based on multiple factors
   */
  async getDeviceRiskScore(deviceFingerprint: string, tenantId: string): Promise<DeviceRiskScore> {
    const factors: RiskFactor[] = [];
    let totalScore = 0;

    // Factor 1: Number of accounts associated with device
    const accountCount = await this.getAssociatedAccountCount(deviceFingerprint, tenantId);
    if (accountCount > 1) {
      const weight = 0.3;
      const contribution = Math.min(accountCount / 5, 1) * weight;
      factors.push({
        factor: 'multiple_accounts',
        weight,
        value: accountCount,
      });
      totalScore += contribution;
    }

    // Factor 2: Suspicious activity patterns
    const suspiciousActivity = await this.getSuspiciousActivityCount(deviceFingerprint, tenantId);
    if (suspiciousActivity > 0) {
      const weight = 0.25;
      const contribution = Math.min(suspiciousActivity / 10, 1) * weight;
      factors.push({
        factor: 'suspicious_activity',
        weight,
        value: suspiciousActivity,
      });
      totalScore += contribution;
    }

    // Factor 3: Geographic anomalies
    const geoAnomalies = await this.checkGeographicAnomalies(deviceFingerprint, tenantId);
    if (geoAnomalies.hasAnomalies) {
      const weight = 0.2;
      factors.push({
        factor: 'geographic_anomalies',
        weight,
        value: geoAnomalies.details,
      });
      totalScore += weight;
    }

    // Factor 4: Device age (new devices are higher risk)
    const deviceAge = await this.getDeviceAge(deviceFingerprint, tenantId);
    if (deviceAge >= 0 && deviceAge < 24) {
      const weight = 0.15;
      const contribution = (1 - deviceAge / 24) * weight;
      factors.push({
        factor: 'new_device',
        weight,
        value: `${deviceAge.toFixed(1)} hours`,
      });
      totalScore += contribution;
    }

    // Factor 5: Failed payment attempts
    const failedAttempts = await this.getFailedPaymentAttempts(deviceFingerprint, tenantId);
    if (failedAttempts > 2) {
      const weight = 0.1;
      const contribution = Math.min(failedAttempts / 5, 1) * weight;
      factors.push({
        factor: 'failed_payments',
        weight,
        value: failedAttempts,
      });
      totalScore += contribution;
    }

    return {
      score: Math.min(totalScore, 1),
      factors,
    };
  }

  /**
   * Get count of unique accounts associated with this device
   */
  async getAssociatedAccountCount(deviceFingerprint: string, tenantId: string): Promise<number> {
    const result = await query(
      `SELECT COUNT(DISTINCT user_id) as count
       FROM device_activity
       WHERE device_fingerprint = $1 AND tenant_id = $2`,
      [deviceFingerprint, tenantId]
    );

    return parseInt(result.rows[0].count) || 0;
  }

  /**
   * Get count of suspicious activities for this device
   */
  async getSuspiciousActivityCount(deviceFingerprint: string, tenantId: string): Promise<number> {
    const result = await query(
      `SELECT COUNT(*) as count
       FROM device_activity
       WHERE device_fingerprint = $1
         AND tenant_id = $2
         AND activity_type IN ('failed_payment', 'fraud_detected', 'account_locked')
         AND timestamp > CURRENT_TIMESTAMP - INTERVAL '30 days'`,
      [deviceFingerprint, tenantId]
    );

    return parseInt(result.rows[0].count) || 0;
  }

  /**
   * Check for geographic anomalies (impossible travel)
   */
  async checkGeographicAnomalies(deviceFingerprint: string, tenantId: string): Promise<{
    hasAnomalies: boolean;
    details?: any;
  }> {
    const geoQuery = `
      SELECT
        da1.timestamp as time1,
        da1.metadata->>'location' as location1,
        da2.timestamp as time2,
        da2.metadata->>'location' as location2
      FROM device_activity da1
      JOIN device_activity da2 ON da1.device_fingerprint = da2.device_fingerprint
        AND da1.tenant_id = da2.tenant_id
      WHERE da1.device_fingerprint = $1
        AND da1.tenant_id = $2
        AND da2.timestamp > da1.timestamp
        AND da2.timestamp < da1.timestamp + INTERVAL '1 hour'
        AND da1.metadata->>'location' IS NOT NULL
        AND da2.metadata->>'location' IS NOT NULL
        AND da1.metadata->>'location' != da2.metadata->>'location'
      ORDER BY da1.timestamp DESC
      LIMIT 1
    `;

    const result = await query(geoQuery, [deviceFingerprint, tenantId]);

    if (result.rows.length > 0) {
      const anomaly = result.rows[0];
      return {
        hasAnomalies: true,
        details: {
          location1: anomaly.location1,
          location2: anomaly.location2,
          time1: anomaly.time1,
          time2: anomaly.time2,
        },
      };
    }

    return { hasAnomalies: false };
  }

  /**
   * Get device age in hours
   */
  async getDeviceAge(deviceFingerprint: string, tenantId: string): Promise<number> {
    const result = await query(
      `SELECT MIN(timestamp) as first_seen
       FROM device_activity
       WHERE device_fingerprint = $1 AND tenant_id = $2`,
      [deviceFingerprint, tenantId]
    );

    if (result.rows[0].first_seen) {
      const ageMs = Date.now() - new Date(result.rows[0].first_seen).getTime();
      return ageMs / (1000 * 60 * 60); // Convert to hours
    }

    return -1; // No activity found
  }

  /**
   * Get failed payment attempts for this device
   */
  async getFailedPaymentAttempts(deviceFingerprint: string, tenantId: string): Promise<number> {
    const result = await query(
      `SELECT COUNT(*) as count
       FROM payment_transactions
       WHERE device_fingerprint = $1
         AND tenant_id = $2
         AND status = 'failed'
         AND created_at > CURRENT_TIMESTAMP - INTERVAL '7 days'`,
      [deviceFingerprint, tenantId]
    );

    return parseInt(result.rows[0].count) || 0;
  }

  /**
   * Compare two fingerprints for similarity
   */
  compareFingerprints(fp1: string, fp2: string): {
    similar: boolean;
    similarity: number;
  } {
    if (fp1 === fp2) {
      return { similar: true, similarity: 1.0 };
    }

    const distance = this.calculateHammingDistance(fp1, fp2);
    const similarity = 1 - (distance / Math.max(fp1.length, fp2.length));

    return {
      similar: similarity > 0.85,
      similarity,
    };
  }

  /**
   * Calculate Hamming distance between two strings
   */
  private calculateHammingDistance(str1: string, str2: string): number {
    let distance = 0;
    const length = Math.min(str1.length, str2.length);

    for (let i = 0; i < length; i++) {
      if (str1[i] !== str2[i]) distance++;
    }

    distance += Math.abs(str1.length - str2.length);

    return distance;
  }

  /**
   * Get all activity for a device
   */
  async getDeviceActivity(
    deviceFingerprint: string,
    tenantId: string,
    limit: number = 50
  ): Promise<any[]> {
    const result = await query(
      `SELECT id, user_id, activity_type, metadata, timestamp
       FROM device_activity
       WHERE device_fingerprint = $1 AND tenant_id = $2
       ORDER BY timestamp DESC
       LIMIT $3`,
      [deviceFingerprint, tenantId, limit]
    );

    return result.rows.map(row => ({
      id: row.id,
      userId: row.user_id,
      activityType: row.activity_type,
      metadata: row.metadata,
      timestamp: row.timestamp,
    }));
  }
}
