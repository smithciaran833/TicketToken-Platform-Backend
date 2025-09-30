import { EventEmitter } from 'events';
import { Pool } from 'pg';
import Redis from 'ioredis';
import nodemailer from 'nodemailer';
import axios from 'axios';

interface SecurityEvent {
  type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  metadata: any;
  timestamp: Date;
}

export class SecurityMonitor extends EventEmitter {
  private static instance: SecurityMonitor;
  private pool: Pool;
  private redis: Redis;
  private alertThresholds: Map<string, number>;
  private alertCounts: Map<string, number>;

  private constructor() {
    super();
    
    this.pool = new Pool({
      connectionString: process.env.DATABASE_URL
    });
    
    this.redis = new Redis({
      host: process.env.REDIS_HOST || 'localhost'
    });
    
    this.alertThresholds = new Map([
      ['failed_login', 5],
      ['rate_limit', 100],
      ['sql_injection', 1],
      ['xss_attempt', 1],
      ['suspicious_ip', 10],
      ['payment_fraud', 1],
    ]);
    
    this.alertCounts = new Map();
    
    this.startMonitoring();
  }

  static getInstance(): SecurityMonitor {
    if (!SecurityMonitor.instance) {
      SecurityMonitor.instance = new SecurityMonitor();
    }
    return SecurityMonitor.instance;
  }

  private startMonitoring() {
    // Monitor failed logins
    setInterval(() => this.checkFailedLogins(), 60000);
    
    // Monitor rate limits
    setInterval(() => this.checkRateLimits(), 30000);
    
    // Monitor suspicious activities
    setInterval(() => this.checkSuspiciousActivities(), 60000);
    
    // Monitor system health
    setInterval(() => this.checkSystemHealth(), 300000);
    
    // Monitor payment anomalies
    setInterval(() => this.checkPaymentAnomalies(), 120000);
  }

  private async checkFailedLogins() {
    const result = await this.pool.query(`
      SELECT ip_address, COUNT(*) as attempts
      FROM failed_login_attempts
      WHERE created_at > NOW() - INTERVAL '15 minutes'
      GROUP BY ip_address
      HAVING COUNT(*) > 5
    `);

    for (const row of result.rows) {
      this.emit('security:event', {
        type: 'failed_login',
        severity: 'high',
        description: `Multiple failed login attempts from ${row.ip_address}`,
        metadata: { ip: row.ip_address, attempts: row.attempts },
        timestamp: new Date()
      });
      
      // Auto-block IP after threshold
      if (row.attempts > 10) {
        await this.blockIP(row.ip_address);
      }
    }
  }

  private async checkRateLimits() {
    const keys = await this.redis.keys('rl:*');
    
    for (const key of keys) {
      const value = await this.redis.get(key);
      const count = parseInt(value || '0');
      
      if (count > 1000) {
        const [, type, identifier] = key.split(':');
        
        this.emit('security:event', {
          type: 'rate_limit',
          severity: 'medium',
          description: `High rate limit consumption: ${type}`,
          metadata: { identifier, count },
          timestamp: new Date()
        });
      }
    }
  }

  private async checkSuspiciousActivities() {
    // Check for SQL injection attempts
    const sqlInjections = await this.pool.query(`
      SELECT COUNT(*) as count
      FROM security_audit_logs
      WHERE action = 'security.sql_injection'
      AND created_at > NOW() - INTERVAL '1 hour'
    `);

    if (sqlInjections.rows[0].count > 0) {
      this.emit('security:event', {
        type: 'sql_injection',
        severity: 'critical',
        description: 'SQL injection attempts detected',
        metadata: { count: sqlInjections.rows[0].count },
        timestamp: new Date()
      });
    }

    // Check for suspicious patterns
    const patterns = await this.pool.query(`
      SELECT 
        ip_address,
        COUNT(DISTINCT resource) as resources_accessed,
        COUNT(*) as total_requests
      FROM security_audit_logs
      WHERE created_at > NOW() - INTERVAL '5 minutes'
      GROUP BY ip_address
      HAVING COUNT(DISTINCT resource) > 20
      OR COUNT(*) > 500
    `);

    for (const pattern of patterns.rows) {
      this.emit('security:event', {
        type: 'suspicious_pattern',
        severity: 'high',
        description: 'Suspicious access pattern detected',
        metadata: pattern,
        timestamp: new Date()
      });
    }
  }

  private async checkSystemHealth() {
    // Check database connections
    const dbStats = await this.pool.query(`
      SELECT count(*) as connections
      FROM pg_stat_activity
    `);

    if (dbStats.rows[0].connections > 90) {
      this.emit('security:event', {
        type: 'system_health',
        severity: 'high',
        description: 'Database connection pool near limit',
        metadata: { connections: dbStats.rows[0].connections },
        timestamp: new Date()
      });
    }

    // Check Redis memory
    const redisInfo = await this.redis.info('memory');
    const usedMemory = parseInt(redisInfo.match(/used_memory:(\d+)/)?.[1] || '0');
    
    if (usedMemory > 1024 * 1024 * 1024) { // 1GB
      this.emit('security:event', {
        type: 'system_health',
        severity: 'medium',
        description: 'Redis memory usage high',
        metadata: { usedMemory },
        timestamp: new Date()
      });
    }
  }

  private async checkPaymentAnomalies() {
    // Check for unusual payment patterns
    const anomalies = await this.pool.query(`
      SELECT 
        user_id,
        COUNT(*) as payment_count,
        SUM(amount) as total_amount
      FROM payments
      WHERE created_at > NOW() - INTERVAL '1 hour'
      GROUP BY user_id
      HAVING COUNT(*) > 10
      OR SUM(amount) > 10000
    `);

    for (const anomaly of anomalies.rows) {
      this.emit('security:event', {
        type: 'payment_anomaly',
        severity: 'high',
        description: 'Unusual payment pattern detected',
        metadata: anomaly,
        timestamp: new Date()
      });
    }

    // Check for card testing
    const cardTests = await this.pool.query(`
      SELECT 
        ip_address,
        COUNT(DISTINCT card_last_four) as unique_cards
      FROM payment_attempts
      WHERE created_at > NOW() - INTERVAL '10 minutes'
      AND success = false
      GROUP BY ip_address
      HAVING COUNT(DISTINCT card_last_four) > 3
    `);

    for (const test of cardTests.rows) {
      this.emit('security:event', {
        type: 'card_testing',
        severity: 'critical',
        description: 'Possible card testing attack',
        metadata: test,
        timestamp: new Date()
      });
      
      await this.blockIP(test.ip_address);
    }
  }

  private async blockIP(ip: string) {
    // Add to Redis blacklist
    await this.redis.sadd('blocked_ips', ip);
    await this.redis.expire('blocked_ips', 86400); // 24 hours
    
    // Log the block
    await this.pool.query(`
      INSERT INTO ip_blocks (ip_address, reason, expires_at)
      VALUES ($1, 'Automatic security block', NOW() + INTERVAL '24 hours')
    `, [ip]);
    
    // Update WAF if configured
    if (process.env.CLOUDFLARE_API_KEY) {
      await this.updateCloudflareWAF(ip);
    }
  }

  private async updateCloudflareWAF(ip: string) {
    try {
      await axios.post(
        `https://api.cloudflare.com/client/v4/zones/${process.env.CLOUDFLARE_ZONE_ID}/firewall/access_rules/rules`,
        {
          mode: 'block',
          configuration: {
            target: 'ip',
            value: ip
          },
          notes: 'Automated security block'
        },
        {
          headers: {
            'X-Auth-Key': process.env.CLOUDFLARE_API_KEY,
            'X-Auth-Email': process.env.CLOUDFLARE_EMAIL
          }
        }
      );
    } catch (error) {
      console.error('Failed to update Cloudflare WAF:', error);
    }
  }

  async handleSecurityEvent(event: SecurityEvent) {
    // Log to database
    await this.pool.query(`
      INSERT INTO security_alerts (alert_type, severity, description, metadata)
      VALUES ($1, $2, $3, $4)
    `, [event.type, event.severity, event.description, JSON.stringify(event.metadata)]);

    // Check thresholds
    const key = event.type;
    const count = (this.alertCounts.get(key) || 0) + 1;
    this.alertCounts.set(key, count);
    
    const threshold = this.alertThresholds.get(key) || 10;
    
    if (count >= threshold) {
      await this.sendAlert(event);
      this.alertCounts.set(key, 0); // Reset counter
    }

    // Critical events always alert
    if (event.severity === 'critical') {
      await this.sendAlert(event);
    }
  }

  private async sendAlert(event: SecurityEvent) {
    // Send email alert
    if (process.env.ALERT_EMAIL) {
      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT || '587'),
        secure: false,
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS
        }
      });

      await transporter.sendMail({
        from: '"Security Alert" <security@tickettoken.com>',
        to: process.env.ALERT_EMAIL,
        subject: `🚨 ${event.severity.toUpperCase()}: ${event.type}`,
        html: `
          <h2>Security Alert</h2>
          <p><strong>Type:</strong> ${event.type}</p>
          <p><strong>Severity:</strong> ${event.severity}</p>
          <p><strong>Description:</strong> ${event.description}</p>
          <p><strong>Time:</strong> ${event.timestamp}</p>
          <pre>${JSON.stringify(event.metadata, null, 2)}</pre>
        `
      });
    }

    // Send to Slack
    if (process.env.SLACK_WEBHOOK_URL) {
      await axios.post(process.env.SLACK_WEBHOOK_URL, {
        text: `🚨 Security Alert: ${event.type}`,
        attachments: [{
          color: event.severity === 'critical' ? 'danger' : 'warning',
          fields: [
            { title: 'Severity', value: event.severity, short: true },
            { title: 'Type', value: event.type, short: true },
            { title: 'Description', value: event.description },
            { title: 'Metadata', value: '```' + JSON.stringify(event.metadata, null, 2) + '```' }
          ],
          ts: Math.floor(event.timestamp.getTime() / 1000)
        }]
      });
    }

    // Send to PagerDuty for critical events
    if (event.severity === 'critical' && process.env.PAGERDUTY_KEY) {
      await axios.post('https://events.pagerduty.com/v2/enqueue', {
        routing_key: process.env.PAGERDUTY_KEY,
        event_action: 'trigger',
        payload: {
          summary: `${event.type}: ${event.description}`,
          severity: 'critical',
          source: 'security-monitor',
          custom_details: event.metadata
        }
      });
    }
  }
}

// Initialize and export
export const securityMonitor = SecurityMonitor.getInstance();

// Listen for security events
securityMonitor.on('security:event', async (event) => {
  await securityMonitor.handleSecurityEvent(event);
});
