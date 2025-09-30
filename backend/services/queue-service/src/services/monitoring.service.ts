import * as promClient from 'prom-client';
import twilio from 'twilio';
import { Queue } from 'bull';
import { logger } from '../utils/logger';
import { QueueFactory } from '../queues/factories/queue.factory';
import { getPool } from '../config/database.config';

interface AlertThresholds {
  moneyQueueDepth: number;
  moneyQueueAge: number; // minutes
  commQueueDepth: number;
  backgroundQueueDepth: number;
  failureRate: number; // percentage
}

interface Alert {
  type: string;
  severity: 'critical' | 'warning' | 'info';
  message: string;
  context: any;
  timestamp: Date;
}

export class MonitoringService {
  private static instance: MonitoringService;
  private twilioClient: any;
  private metrics: any = {};
  private alertCooldowns: Map<string, number> = new Map();
  private thresholds: AlertThresholds;
  private checkInterval: NodeJS.Timeout | null = null;
  
  constructor() {
    // Initialize thresholds first
    this.thresholds = {
      moneyQueueDepth: 50,
      moneyQueueAge: 10,
      commQueueDepth: 5000,
      backgroundQueueDepth: 50000,
      failureRate: 10
    };
    
    this.setupMetrics();
    this.setupTwilio();
    this.loadThresholds();
  }
  
  static getInstance(): MonitoringService {
    if (!this.instance) {
      this.instance = new MonitoringService();
    }
    return this.instance;
  }
  
  private setupMetrics() {
    // Create a Registry
    const register = new promClient.Registry();
    
    // Add default metrics (CPU, memory, etc.)
    promClient.collectDefaultMetrics({ register });
    
    // Queue depth gauge
    this.metrics.queueDepth = new promClient.Gauge({
      name: 'queue_depth',
      help: 'Number of jobs in queue',
      labelNames: ['queue_name', 'status'],
      registers: [register]
    });
    
    // Job processing duration histogram
    this.metrics.jobDuration = new promClient.Histogram({
      name: 'job_processing_duration_seconds',
      help: 'Time taken to process jobs',
      labelNames: ['queue_name', 'job_type'],
      buckets: [0.1, 0.5, 1, 2, 5, 10, 30, 60],
      registers: [register]
    });
    
    // Job completion counter
    this.metrics.jobResults = new promClient.Counter({
      name: 'job_results_total',
      help: 'Job completion results',
      labelNames: ['queue_name', 'job_type', 'result'],
      registers: [register]
    });
    
    // Alert counter
    this.metrics.alertsSent = new promClient.Counter({
      name: 'alerts_sent_total',
      help: 'Number of alerts sent',
      labelNames: ['severity', 'type', 'channel'],
      registers: [register]
    });
    
    // Queue age gauge (oldest job age)
    this.metrics.oldestJobAge = new promClient.Gauge({
      name: 'oldest_job_age_seconds',
      help: 'Age of oldest waiting job',
      labelNames: ['queue_name'],
      registers: [register]
    });
    
    // Failed job gauge
    this.metrics.failedJobs = new promClient.Gauge({
      name: 'failed_jobs_total',
      help: 'Number of failed jobs',
      labelNames: ['queue_name'],
      registers: [register]
    });
    
    this.metrics.register = register;
    
    logger.info('Prometheus metrics initialized');
  }
  
  private setupTwilio() {
    if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
      this.twilioClient = twilio(
        process.env.TWILIO_ACCOUNT_SID,
        process.env.TWILIO_AUTH_TOKEN
      );
      logger.info('Twilio client initialized');
    } else {
      logger.warn('Twilio credentials not configured - alerts will be logged only');
    }
  }
  
  private loadThresholds() {
    this.thresholds = {
      moneyQueueDepth: parseInt(process.env.ALERT_THRESHOLD_MONEY_QUEUE || '50'),
      moneyQueueAge: parseInt(process.env.ALERT_THRESHOLD_MONEY_AGE_MINUTES || '10'),
      commQueueDepth: parseInt(process.env.ALERT_THRESHOLD_COMM_QUEUE || '5000'),
      backgroundQueueDepth: parseInt(process.env.ALERT_THRESHOLD_BACKGROUND_QUEUE || '50000'),
      failureRate: parseFloat(process.env.ALERT_THRESHOLD_FAILURE_RATE || '10')
    };
    
    logger.info('Alert thresholds loaded:', this.thresholds);
  }
  
  async start() {
    logger.info('Starting monitoring service...');
    
    // Check queue health every 30 seconds
    this.checkInterval = setInterval(() => {
      this.checkAllQueues().catch(error => {
        logger.error('Error checking queues:', error);
      });
    }, 30000);
    
    // Initial check
    await this.checkAllQueues();
  }
  
  async stop() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    logger.info('Monitoring service stopped');
  }
  
  private async checkAllQueues() {
    const queues: Array<{ name: string; type: 'money' | 'communication' | 'background' }> = [
      { name: 'money-queue', type: 'money' },
      { name: 'communication-queue', type: 'communication' },
      { name: 'background-queue', type: 'background' }
    ];
    
    for (const queueInfo of queues) {
      try {
        await this.checkQueueHealth(queueInfo.type);
      } catch (error) {
        logger.error(`Error checking ${queueInfo.name}:`, error);
      }
    }
  }
  
  private async checkQueueHealth(queueType: 'money' | 'communication' | 'background') {
    const queue = QueueFactory.getQueue(queueType);
    const counts = await queue.getJobCounts();
    
    // Update Prometheus metrics
    this.metrics.queueDepth.set(
      { queue_name: queue.name, status: 'waiting' },
      counts.waiting
    );
    this.metrics.queueDepth.set(
      { queue_name: queue.name, status: 'active' },
      counts.active
    );
    this.metrics.queueDepth.set(
      { queue_name: queue.name, status: 'completed' },
      counts.completed
    );
    this.metrics.queueDepth.set(
      { queue_name: queue.name, status: 'failed' },
      counts.failed
    );
    
    this.metrics.failedJobs.set(
      { queue_name: queue.name },
      counts.failed
    );
    
    // Check oldest job age
    const oldestJob = await this.getOldestWaitingJob(queue);
    if (oldestJob) {
      const ageSeconds = (Date.now() - oldestJob.timestamp) / 1000;
      this.metrics.oldestJobAge.set({ queue_name: queue.name }, ageSeconds);
      
      // Check age threshold for money queue
      if (queueType === 'money' && ageSeconds > this.thresholds.moneyQueueAge * 60) {
        await this.sendAlert({
          type: 'job_age',
          severity: 'critical',
          message: `Money queue job waiting over ${this.thresholds.moneyQueueAge} minutes!`,
          context: {
            queue: queue.name,
            jobId: oldestJob.id,
            ageMinutes: Math.floor(ageSeconds / 60)
          },
          timestamp: new Date()
        });
      }
    }
    
    // Check queue-specific thresholds
    if (queueType === 'money') {
      // CRITICAL: Money queue depth
      if (counts.waiting > this.thresholds.moneyQueueDepth) {
        await this.sendAlert({
          type: 'queue_depth',
          severity: 'critical',
          message: `CRITICAL: Money queue has ${counts.waiting} jobs waiting!`,
          context: {
            queue: queue.name,
            depth: counts.waiting,
            threshold: this.thresholds.moneyQueueDepth
          },
          timestamp: new Date()
        });
      }
      
      // CRITICAL: Money queue failures
      if (counts.failed > 10) {
        await this.sendAlert({
          type: 'high_failures',
          severity: 'critical',
          message: `CRITICAL: ${counts.failed} payment jobs failed!`,
          context: {
            queue: queue.name,
            failed: counts.failed
          },
          timestamp: new Date()
        });
      }
    } else if (queueType === 'communication') {
      // WARNING: Communication queue depth
      if (counts.waiting > this.thresholds.commQueueDepth) {
        await this.sendAlert({
          type: 'queue_depth',
          severity: 'warning',
          message: `Warning: ${counts.waiting} emails/SMS queued`,
          context: {
            queue: queue.name,
            depth: counts.waiting,
            threshold: this.thresholds.commQueueDepth
          },
          timestamp: new Date()
        });
      }
    }
    
    // Store metrics in database
    await this.storeMetrics(queue.name, counts);
  }
  
  private async getOldestWaitingJob(queue: Queue): Promise<any> {
    const jobs = await queue.getWaiting(0, 1);
    return jobs[0];
  }
  
  private async sendAlert(alert: Alert) {
    // Check cooldown to prevent spam
    const cooldownKey = `${alert.type}:${alert.severity}:${alert.context.queue}`;
    const lastAlert = this.alertCooldowns.get(cooldownKey) || 0;
    const cooldownMs = alert.severity === 'critical' ? 300000 : 3600000; // 5 min for critical, 1 hour for others
    
    if (Date.now() - lastAlert < cooldownMs) {
      return; // Skip due to cooldown
    }
    
    logger.error(`🚨 ALERT [${alert.severity.toUpperCase()}]: ${alert.message}`, alert.context);
    
    // Store alert in database
    try {
      const pool = getPool();
      await pool.query(
        `INSERT INTO alert_history (severity, alert_type, message, queue_name, metric_value, threshold_value, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
        [
          alert.severity,
          alert.type,
          alert.message,
          alert.context.queue,
          alert.context.depth || alert.context.ageMinutes,
          alert.context.threshold
        ]
      );
    } catch (error) {
      logger.error('Failed to store alert in database:', error);
    }
    
    // Update metrics
    this.metrics.alertsSent.inc({
      severity: alert.severity,
      type: alert.type,
      channel: 'log'
    });
    
    // Send actual alert based on severity
    if (alert.severity === 'critical') {
      await this.sendCriticalAlert(alert);
    } else if (alert.severity === 'warning') {
      await this.sendWarningAlert(alert);
    }
    
    // Update cooldown
    this.alertCooldowns.set(cooldownKey, Date.now());
  }
  
  private async sendCriticalAlert(alert: Alert) {
    // Try to call on-call engineer
    if (this.twilioClient && process.env.ONCALL_PHONE) {
      try {
        // Send SMS first (more reliable)
        await this.twilioClient.messages.create({
          to: process.env.ONCALL_PHONE,
          from: process.env.TWILIO_PHONE,
          body: `🚨 CRITICAL Queue Alert:\n${alert.message}\n\nCheck immediately!`
        });
        
        this.metrics.alertsSent.inc({
          severity: 'critical',
          type: alert.type,
          channel: 'sms'
        });
        
        logger.info('Critical alert SMS sent');
        
        // Also try to call for money queue issues
        if (alert.context.queue === 'money-queue') {
          await this.twilioClient.calls.create({
            to: process.env.ONCALL_PHONE,
            from: process.env.TWILIO_PHONE,
            url: 'http://demo.twilio.com/docs/voice.xml' // You can customize this
          });
          
          this.metrics.alertsSent.inc({
            severity: 'critical',
            type: alert.type,
            channel: 'phone'
          });
          
          logger.info('Critical alert phone call initiated');
        }
      } catch (error) {
        logger.error('Failed to send Twilio alert:', error);
      }
    }
  }
  
  private async sendWarningAlert(alert: Alert) {
    // Send SMS for warnings
    if (this.twilioClient && process.env.ONCALL_PHONE) {
      try {
        await this.twilioClient.messages.create({
          to: process.env.ONCALL_PHONE,
          from: process.env.TWILIO_PHONE,
          body: `⚠️ Queue Warning:\n${alert.message}`
        });
        
        this.metrics.alertsSent.inc({
          severity: 'warning',
          type: alert.type,
          channel: 'sms'
        });
        
        logger.info('Warning alert SMS sent');
      } catch (error) {
        logger.error('Failed to send warning alert:', error);
      }
    }
  }
  
  private async storeMetrics(queueName: string, counts: any) {
    try {
      const pool = getPool();
      await pool.query(
        `INSERT INTO queue_metrics 
         (queue_name, waiting_count, active_count, completed_count, failed_count, captured_at)
         VALUES ($1, $2, $3, $4, $5, NOW())`,
        [queueName, counts.waiting, counts.active, counts.completed, counts.failed]
      );
    } catch (error) {
      logger.error('Failed to store metrics:', error);
    }
  }
  
  getPrometheusMetrics(): string {
    return this.metrics.register.metrics();
  }
  
  async getMetricsSummary() {
    const pool = getPool();
    
    // Get recent metrics
    const result = await pool.query(
      `SELECT 
         queue_name,
         AVG(waiting_count) as avg_waiting,
         MAX(waiting_count) as max_waiting,
         AVG(active_count) as avg_active,
         AVG(failed_count) as avg_failed
       FROM queue_metrics
       WHERE captured_at > NOW() - INTERVAL '1 hour'
       GROUP BY queue_name`
    );
    
    // Get recent alerts
    const alerts = await pool.query(
      `SELECT severity, COUNT(*) as count
       FROM alert_history
       WHERE created_at > NOW() - INTERVAL '24 hours'
       GROUP BY severity`
    );
    
    return {
      queues: result.rows,
      alerts: alerts.rows,
      timestamp: new Date()
    };
  }
  
  // Record job completion for metrics
  recordJobSuccess(queueName: string, jobType: string, duration: number) {
    this.metrics.jobDuration.observe(
      { queue_name: queueName, job_type: jobType },
      duration
    );
    this.metrics.jobResults.inc({
      queue_name: queueName,
      job_type: jobType,
      result: 'success'
    });
  }
  
  recordJobFailure(queueName: string, jobType: string, error: any) {
    this.metrics.jobResults.inc({
      queue_name: queueName,
      job_type: jobType,
      result: 'failure'
    });
  }
}
