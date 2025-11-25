import { Pool } from 'pg';
import { getPool } from '../config/database';
import { getRedis } from '../config/redis';
import logger from '../utils/logger';

/**
 * PHASE 5.5: Anomaly Detection Service
 * 
 * Detects suspicious patterns in scanning activity:
 * - Ticket screenshot fraud
 * - Duplicate device scans
 * - Timing anomalies
 * - Geographic anomalies
 * - Unusual denial patterns
 */

interface AnomalyResult {
  detected: boolean;
  anomalies: Anomaly[];
  riskScore: number;
}

interface Anomaly {
  type: 'screenshot_fraud' | 'duplicate_device' | 'timing' | 'geographic' | 'pattern';
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  evidence: any;
  timestamp: Date;
  ticketId?: string;
  deviceId?: string;
}

export class AnomalyDetectorService {
  private pool: Pool;
  private redis: any;

  constructor() {
    this.pool = getPool();
    this.redis = getRedis();
  }

  /**
   * Analyze scan for anomalies
   */
  async analyzeScan(
    ticketId: string,
    deviceId: string,
    timestamp: Date
  ): Promise<AnomalyResult> {
    const anomalies: Anomaly[] = [];

    // Run multiple detection algorithms in parallel
    const [
      screenshotFraud,
      duplicateDevice,
      timingAnomaly,
      patternAnomaly
    ] = await Promise.all([
      this.detectScreenshotFraud(ticketId, deviceId, timestamp),
      this.detectDuplicateDeviceScans(ticketId, timestamp),
      this.detectTimingAnomalies(ticketId, timestamp),
      this.detectPatternAnomalies(ticketId, deviceId)
    ]);

    if (screenshotFraud) anomalies.push(screenshotFraud);
    if (duplicateDevice) anomalies.push(duplicateDevice);
    if (timingAnomaly) anomalies.push(timingAnomaly);
    if (patternAnomaly) anomalies.push(patternAnomaly);

    // Calculate risk score
    const riskScore = this.calculateRiskScore(anomalies);

    // Log high-risk anomalies
    if (riskScore > 70) {
      logger.warn('High-risk anomaly detected', {
        ticketId,
        deviceId,
        riskScore,
        anomalies: anomalies.map(a => a.type)
      });

      await this.recordAnomaly(ticketId, deviceId, anomalies, riskScore);
    }

    return {
      detected: anomalies.length > 0,
      anomalies,
      riskScore
    };
  }

  /**
   * Detect screenshot fraud (multiple scans within seconds)
   */
  private async detectScreenshotFraud(
    ticketId: string,
    deviceId: string,
    timestamp: Date
  ): Promise<Anomaly | null> {
    // Check for multiple scan attempts within 5 seconds
    const fiveSecondsAgo = new Date(timestamp.getTime() - 5000);
    
    const result = await this.pool.query(`
      SELECT COUNT(*) as count, array_agg(DISTINCT device_id) as devices
      FROM scans
      WHERE ticket_id = $1
        AND scanned_at > $2
    `, [ticketId, fiveSecondsAgo]);

    const count = parseInt(result.rows[0].count);
    const devices = result.rows[0].devices || [];

    if (count > 3 || devices.length > 1) {
      return {
        type: 'screenshot_fraud',
        severity: devices.length > 1 ? 'critical' : 'high',
        description: `Ticket scanned ${count} times in 5 seconds across ${devices.length} device(s)`,
        evidence: { count, devices, timeWindow: '5s' },
        timestamp: new Date(),
        ticketId
      };
    }

    return null;
  }

  /**
   * Detect duplicate device scans (same ticket, multiple devices simultaneously)
   */
  private async detectDuplicateDeviceScans(
    ticketId: string,
    timestamp: Date
  ): Promise<Anomaly | null> {
    const oneMinuteAgo = new Date(timestamp.getTime() - 60000);

    const result = await this.pool.query(`
      SELECT 
        COUNT(DISTINCT device_id) as device_count,
        array_agg(DISTINCT device_id) as devices
      FROM scans
      WHERE ticket_id = $1
        AND scanned_at > $2
    `, [ticketId, oneMinuteAgo]);

    const deviceCount = parseInt(result.rows[0].device_count);
    const devices = result.rows[0].devices;

    if (deviceCount > 2) {
      return {
        type: 'duplicate_device',
        severity: 'high',
        description: `Ticket scanned on ${deviceCount} different devices within 1 minute`,
        evidence: { deviceCount, devices, timeWindow: '1m' },
        timestamp: new Date(),
        ticketId
      };
    }

    return null;
  }

  /**
   * Detect timing anomalies (scans at unusual times)
   */
  private async detectTimingAnomalies(
    ticketId: string,
    timestamp: Date
  ): Promise<Anomaly | null> {
    // Check if scan is happening at unusual hour (e.g., 2-5 AM)
    const hour = timestamp.getHours();
    
    if (hour >= 2 && hour < 5) {
      return {
        type: 'timing',
        severity: 'low',
        description: `Scan at unusual hour: ${hour}:00`,
        evidence: { hour, timestamp },
        timestamp: new Date(),
        ticketId
      };
    }

    return null;
  }

  /**
   * Detect pattern anomalies (unusual scan patterns for this ticket/user)
   */
  private async detectPatternAnomalies(
    ticketId: string,
    deviceId: string
  ): Promise<Anomaly | null> {
    // Check if this device has unusually high denial rate
    const result = await this.pool.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE result = 'DENY') as denied
      FROM scans
      WHERE device_id = $1
        AND scanned_at > NOW() - INTERVAL '1 hour'
    `, [deviceId]);

    const total = parseInt(result.rows[0].total);
    const denied = parseInt(result.rows[0].denied);

    if (total > 10 && (denied / total) > 0.5) {
      return {
        type: 'pattern',
        severity: 'medium',
        description: `Device has high denial rate: ${denied}/${total} (${Math.round((denied/total)*100)}%)`,
        evidence: { total, denied, denialRate: denied/total },
        timestamp: new Date(),
        deviceId
      };
    }

    return null;
  }

  /**
   * Calculate overall risk score
   */
  private calculateRiskScore(anomalies: Anomaly[]): number {
    if (anomalies.length === 0) return 0;

    const severityScores = {
      low: 10,
      medium: 30,
      high: 60,
      critical: 100
    };

    const scores = anomalies.map(a => severityScores[a.severity]);
    const maxScore = Math.max(...scores);
    const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;

    // Weighted average: 70% max score, 30% average
    return Math.min(100, Math.round(maxScore * 0.7 + avgScore * 0.3));
  }

  /**
   * Record anomaly in database
   */
  private async recordAnomaly(
    ticketId: string,
    deviceId: string,
    anomalies: Anomaly[],
    riskScore: number
  ): Promise<void> {
    try {
      await this.pool.query(`
        INSERT INTO scan_anomalies (
          ticket_id,
          device_id,
          anomaly_types,
          risk_score,
          details,
          detected_at
        ) VALUES ($1, $2, $3, $4, $5, NOW())
      `, [
        ticketId,
        deviceId,
        anomalies.map(a => a.type),
        riskScore,
        JSON.stringify(anomalies)
      ]);
    } catch (error) {
      logger.error('Failed to record anomaly', { error, ticketId, deviceId });
    }
  }

  /**
   * Get anomaly statistics
   */
  async getAnomalyStats(venueId: string, timeRange: { start: Date; end: Date }) {
    const result = await this.pool.query(`
      SELECT 
        COUNT(*) as total_anomalies,
        AVG(risk_score) as avg_risk_score,
        COUNT(*) FILTER (WHERE 'screenshot_fraud' = ANY(anomaly_types)) as screenshot_fraud_count,
        COUNT(*) FILTER (WHERE 'duplicate_device' = ANY(anomaly_types)) as duplicate_device_count,
        COUNT(*) FILTER (WHERE risk_score > 70) as high_risk_count
      FROM scan_anomalies sa
      JOIN devices d ON sa.device_id = d.device_id
      WHERE d.venue_id = $1
        AND sa.detected_at BETWEEN $2 AND $3
    `, [venueId, timeRange.start, timeRange.end]);

    return result.rows[0];
  }
}

export default AnomalyDetectorService;
