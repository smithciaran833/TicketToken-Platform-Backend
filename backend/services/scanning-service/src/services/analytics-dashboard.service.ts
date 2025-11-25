import { Pool } from 'pg';
import { getPool } from '../config/database';
import { getRedis } from '../config/redis';
import logger from '../utils/logger';

/**
 * PHASE 5.4: Analytics Dashboard Service
 * 
 * Provides comprehensive scanning analytics for:
 * - Real-time scan metrics
 * - Historical trends
 * - Device performance
 * - Entry patterns
 * - Fraud detection insights
 */

interface TimeRange {
  start: Date;
  end: Date;
}

interface DashboardMetrics {
  realtime: RealtimeMetrics;
  historical: HistoricalMetrics;
  devices: DeviceMetrics[];
  patterns: EntryPatterns;
  alerts: Alert[];
}

interface RealtimeMetrics {
  currentScansPerMinute: number;
  activeDevices: number;
  successRate: number;
  avgResponseTime: number;
  topDenialReasons: Array<{ reason: string; count: number }>;
}

interface HistoricalMetrics {
  totalScans: number;
  uniqueTickets: number;
  allowedScans: number;
  deniedScans: number;
  successRate: number;
  peakHour: string;
  scansByHour: Array<{ hour: number; count: number }>;
  scansByDay: Array<{ date: string; count: number }>;
}

interface DeviceMetrics {
  deviceId: string;
  deviceName: string;
  totalScans: number;
  successRate: number;
  avgScanTime: number;
  lastScan: Date;
  status: 'active' | 'idle' | 'offline';
}

interface EntryPatterns {
  peakTimes: Array<{ time: string; count: number }>;
  entryDistribution: Array<{ zone: string; count: number }>;
  reentryRate: number;
  avgScansPerTicket: number;
}

interface Alert {
  id: string;
  type: 'anomaly' | 'fraud' | 'performance' | 'security';
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  timestamp: Date;
  metadata?: any;
}

export class AnalyticsDashboardService {
  private pool: Pool;

  constructor() {
    this.pool = getPool();
  }

  /**
   * Get comprehensive dashboard metrics for an event
   */
  async getDashboardMetrics(
    eventId: string,
    venueId: string,
    timeRange: TimeRange
  ): Promise<DashboardMetrics> {
    try {
      const [realtime, historical, devices, patterns, alerts] = await Promise.all([
        this.getRealtimeMetrics(eventId),
        this.getHistoricalMetrics(eventId, timeRange),
        this.getDeviceMetrics(venueId, timeRange),
        this.getEntryPatterns(eventId, timeRange),
        this.getAlerts(eventId, venueId)
      ]);

      return {
        realtime,
        historical,
        devices,
        patterns,
        alerts
      };
    } catch (error) {
      logger.error('Error fetching dashboard metrics', { eventId, error });
      throw error;
    }
  }

  /**
   * Get real-time scanning metrics
   */
  private async getRealtimeMetrics(eventId: string): Promise<RealtimeMetrics> {
    const redis = getRedis();

    // Get scans from last minute
    const oneMinuteAgo = new Date(Date.now() - 60000);
    
    const scanResult = await this.pool.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE result = 'ALLOW') as allowed,
        COUNT(*) FILTER (WHERE result = 'DENY') as denied,
        AVG(EXTRACT(EPOCH FROM (scanned_at - created_at))) as avg_time
      FROM scans s
      JOIN tickets t ON s.ticket_id = t.id
      WHERE t.event_id = $1
        AND s.scanned_at > $2
    `, [eventId, oneMinuteAgo]);

    const denialResult = await this.pool.query(`
      SELECT reason, COUNT(*) as count
      FROM scans s
      JOIN tickets t ON s.ticket_id = t.id
      WHERE t.event_id = $1
        AND s.result = 'DENY'
        AND s.scanned_at > $2
      GROUP BY reason
      ORDER BY count DESC
      LIMIT 5
    `, [eventId, oneMinuteAgo]);

    const deviceResult = await this.pool.query(`
      SELECT COUNT(DISTINCT d.id) as active_devices
      FROM devices d
      JOIN scans s ON d.id = s.device_id
      JOIN tickets t ON s.ticket_id = t.id
      WHERE t.event_id = $1
        AND s.scanned_at > $2
        AND d.is_active = true
    `, [eventId, oneMinuteAgo]);

    const stats = scanResult.rows[0];
    const successRate = stats.total > 0 
      ? (parseInt(stats.allowed) / parseInt(stats.total)) * 100 
      : 0;

    return {
      currentScansPerMinute: parseInt(stats.total),
      activeDevices: parseInt(deviceResult.rows[0].active_devices || 0),
      successRate: Math.round(successRate * 100) / 100,
      avgResponseTime: parseFloat(stats.avg_time || 0),
      topDenialReasons: denialResult.rows.map(row => ({
        reason: row.reason,
        count: parseInt(row.count)
      }))
    };
  }

  /**
   * Get historical metrics
   */
  private async getHistoricalMetrics(
    eventId: string,
    timeRange: TimeRange
  ): Promise<HistoricalMetrics> {
    const summaryResult = await this.pool.query(`
      SELECT 
        COUNT(*) as total_scans,
        COUNT(DISTINCT s.ticket_id) as unique_tickets,
        COUNT(*) FILTER (WHERE result = 'ALLOW') as allowed,
        COUNT(*) FILTER (WHERE result = 'DENY') as denied
      FROM scans s
      JOIN tickets t ON s.ticket_id = t.id
      WHERE t.event_id = $1
        AND s.scanned_at BETWEEN $2 AND $3
    `, [eventId, timeRange.start, timeRange.end]);

    const hourlyResult = await this.pool.query(`
      SELECT 
        EXTRACT(HOUR FROM scanned_at) as hour,
        COUNT(*) as count
      FROM scans s
      JOIN tickets t ON s.ticket_id = t.id
      WHERE t.event_id = $1
        AND s.scanned_at BETWEEN $2 AND $3
      GROUP BY hour
      ORDER BY count DESC
    `, [eventId, timeRange.start, timeRange.end]);

    const dailyResult = await this.pool.query(`
      SELECT 
        DATE(scanned_at) as date,
        COUNT(*) as count
      FROM scans s
      JOIN tickets t ON s.ticket_id = t.id
      WHERE t.event_id = $1
        AND s.scanned_at BETWEEN $2 AND $3
      GROUP BY date
      ORDER BY date
    `, [eventId, timeRange.start, timeRange.end]);

    const summary = summaryResult.rows[0];
    const successRate = parseInt(summary.total_scans) > 0
      ? (parseInt(summary.allowed) / parseInt(summary.total_scans)) * 100
      : 0;

    const peakHour = hourlyResult.rows.length > 0
      ? `${hourlyResult.rows[0].hour}:00`
      : 'N/A';

    return {
      totalScans: parseInt(summary.total_scans),
      uniqueTickets: parseInt(summary.unique_tickets),
      allowedScans: parseInt(summary.allowed),
      deniedScans: parseInt(summary.denied),
      successRate: Math.round(successRate * 100) / 100,
      peakHour,
      scansByHour: hourlyResult.rows.map(row => ({
        hour: parseInt(row.hour),
        count: parseInt(row.count)
      })),
      scansByDay: dailyResult.rows.map(row => ({
        date: row.date.toISOString().split('T')[0],
        count: parseInt(row.count)
      }))
    };
  }

  /**
   * Get device performance metrics
   */
  private async getDeviceMetrics(
    venueId: string,
    timeRange: TimeRange
  ): Promise<DeviceMetrics[]> {
    const result = await this.pool.query(`
      SELECT 
        d.device_id,
        d.device_name,
        COUNT(s.id) as total_scans,
        COUNT(*) FILTER (WHERE s.result = 'ALLOW') as allowed,
        AVG(EXTRACT(EPOCH FROM (s.scanned_at - s.created_at))) as avg_time,
        MAX(s.scanned_at) as last_scan,
        d.is_active
      FROM devices d
      LEFT JOIN scans s ON d.id = s.device_id
        AND s.scanned_at BETWEEN $2 AND $3
      WHERE d.venue_id = $1
      GROUP BY d.id, d.device_id, d.device_name, d.is_active
      ORDER BY total_scans DESC
    `, [venueId, timeRange.start, timeRange.end]);

    const now = Date.now();

    return result.rows.map(row => {
      const totalScans = parseInt(row.total_scans);
      const successRate = totalScans > 0
        ? (parseInt(row.allowed) / totalScans) * 100
        : 0;

      const lastScan = row.last_scan ? new Date(row.last_scan) : null;
      const minutesSinceLastScan = lastScan
        ? (now - lastScan.getTime()) / 60000
        : Infinity;

      let status: 'active' | 'idle' | 'offline' = 'offline';
      if (row.is_active) {
        status = minutesSinceLastScan < 5 ? 'active' : 'idle';
      }

      return {
        deviceId: row.device_id,
        deviceName: row.device_name,
        totalScans,
        successRate: Math.round(successRate * 100) / 100,
        avgScanTime: parseFloat(row.avg_time || 0),
        lastScan: lastScan || new Date(0),
        status
      };
    });
  }

  /**
   * Analyze entry patterns
   */
  private async getEntryPatterns(
    eventId: string,
    timeRange: TimeRange
  ): Promise<EntryPatterns> {
    const peakTimesResult = await this.pool.query(`
      SELECT 
        TO_CHAR(scanned_at, 'HH24:MI') as time,
        COUNT(*) as count
      FROM scans s
      JOIN tickets t ON s.ticket_id = t.id
      WHERE t.event_id = $1
        AND s.result = 'ALLOW'
        AND s.scanned_at BETWEEN $2 AND $3
      GROUP BY time
      ORDER BY count DESC
      LIMIT 10
    `, [eventId, timeRange.start, timeRange.end]);

    const zoneResult = await this.pool.query(`
      SELECT 
        d.zone,
        COUNT(*) as count
      FROM scans s
      JOIN devices d ON s.device_id = d.id
      JOIN tickets t ON s.ticket_id = t.id
      WHERE t.event_id = $1
        AND s.result = 'ALLOW'
        AND s.scanned_at BETWEEN $2 AND $3
      GROUP BY d.zone
      ORDER BY count DESC
    `, [eventId, timeRange.start, timeRange.end]);

    const reentryResult = await this.pool.query(`
      SELECT 
        COUNT(DISTINCT ticket_id) FILTER (WHERE scan_count > 1) as reentry_tickets,
        COUNT(DISTINCT ticket_id) as total_tickets,
        AVG(scan_count) as avg_scans
      FROM tickets
      WHERE event_id = $1
        AND first_scanned_at BETWEEN $2 AND $3
    `, [eventId, timeRange.start, timeRange.end]);

    const reentryStats = reentryResult.rows[0];
    const reentryRate = parseInt(reentryStats.total_tickets) > 0
      ? (parseInt(reentryStats.reentry_tickets) / parseInt(reentryStats.total_tickets)) * 100
      : 0;

    return {
      peakTimes: peakTimesResult.rows.map(row => ({
        time: row.time,
        count: parseInt(row.count)
      })),
      entryDistribution: zoneResult.rows.map(row => ({
        zone: row.zone,
        count: parseInt(row.count)
      })),
      reentryRate: Math.round(reentryRate * 100) / 100,
      avgScansPerTicket: parseFloat(reentryStats.avg_scans || 1)
    };
  }

  /**
   * Get active alerts
   */
  private async getAlerts(eventId: string, venueId: string): Promise<Alert[]> {
    const alerts: Alert[] = [];

    // Check for anomalies
    const anomalyResult = await this.pool.query(`
      SELECT 
        reason,
        COUNT(*) as count
      FROM scans s
      JOIN tickets t ON s.ticket_id = t.id
      WHERE t.event_id = $1
        AND s.result = 'DENY'
        AND s.scanned_at > NOW() - INTERVAL '5 minutes'
      GROUP BY reason
      HAVING COUNT(*) > 10
    `, [eventId]);

    anomalyResult.rows.forEach(row => {
      alerts.push({
        id: `anomaly-${row.reason}-${Date.now()}`,
        type: 'anomaly',
        severity: parseInt(row.count) > 50 ? 'high' : 'medium',
        message: `High denial rate for ${row.reason}: ${row.count} in last 5 minutes`,
        timestamp: new Date(),
        metadata: { reason: row.reason, count: row.count }
      });
    });

    // Check for device issues
    const deviceResult = await this.pool.query(`
      SELECT 
        d.device_name,
        COUNT(*) FILTER (WHERE s.result = 'DENY') as denied,
        COUNT(*) as total
      FROM devices d
      JOIN scans s ON d.id = s.device_id
      WHERE d.venue_id = $1
        AND s.scanned_at > NOW() - INTERVAL '10 minutes'
      GROUP BY d.id, d.device_name
      HAVING COUNT(*) > 20 
        AND COUNT(*) FILTER (WHERE s.result = 'DENY')::float / COUNT(*) > 0.5
    `, [venueId]);

    deviceResult.rows.forEach(row => {
      alerts.push({
        id: `device-${row.device_name}-${Date.now()}`,
        type: 'performance',
        severity: 'high',
        message: `Device ${row.device_name} has high denial rate: ${row.denied}/${row.total}`,
        timestamp: new Date(),
        metadata: { device: row.device_name, denied: row.denied, total: row.total }
      });
    });

    return alerts.slice(0, 10); // Return top 10 alerts
  }

  /**
   * Export analytics data to CSV
   */
  async exportAnalytics(
    eventId: string,
    timeRange: TimeRange,
    format: 'csv' | 'json' = 'csv'
  ): Promise<string> {
    const result = await this.pool.query(`
      SELECT 
        s.scanned_at,
        t.ticket_number,
        d.device_name,
        d.zone,
        s.result,
        s.reason
      FROM scans s
      JOIN tickets t ON s.ticket_id = t.id
      JOIN devices d ON s.device_id = d.id
      WHERE t.event_id = $1
        AND s.scanned_at BETWEEN $2 AND $3
      ORDER BY s.scanned_at DESC
    `, [eventId, timeRange.start, timeRange.end]);

    if (format === 'json') {
      return JSON.stringify(result.rows, null, 2);
    }

    // CSV format
    const headers = ['Timestamp', 'Ticket Number', 'Device', 'Zone', 'Result', 'Reason'];
    const csv = [
      headers.join(','),
      ...result.rows.map(row => [
        row.scanned_at.toISOString(),
        row.ticket_number,
        row.device_name,
        row.zone,
        row.result,
        row.reason || ''
      ].join(','))
    ].join('\n');

    return csv;
  }
}

export default AnalyticsDashboardService;
