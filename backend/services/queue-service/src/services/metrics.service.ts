import { Registry, Counter, Gauge, Histogram } from 'prom-client';
import { logger } from '../utils/logger';

/**
 * Prometheus Metrics Service
 * Collects and exposes metrics for monitoring
 */

export class MetricsService {
  private registry: Registry;

  // Job metrics
  private jobsProcessedTotal: Counter;
  private jobsFailedTotal: Counter;
  private jobProcessingDuration: Histogram;
  private activeJobs: Gauge;
  private queueSize: Gauge;

  // Payment metrics
  private paymentsProcessedTotal: Counter;
  private paymentAmountTotal: Counter;
  private refundsProcessedTotal: Counter;
  private refundAmountTotal: Counter;

  // NFT metrics
  private nftsMinttedTotal: Counter;
  private nftTransfersTotal: Counter;
  private solanaBalanceGauge: Gauge;

  // Communication metrics
  private emailsSentTotal: Counter;
  private emailsFailedTotal: Counter;
  private webhooksSentTotal: Counter;
  private webhooksFailedTotal: Counter;

  // System metrics
  private uptimeGauge: Gauge;
  private memoryUsageGauge: Gauge;
  private cpuUsageGauge: Gauge;

  constructor() {
    this.registry = new Registry();

    // Job metrics
    this.jobsProcessedTotal = new Counter({
      name: 'queue_jobs_processed_total',
      help: 'Total number of jobs processed',
      labelNames: ['queue', 'status'],
      registers: [this.registry],
    });

    this.jobsFailedTotal = new Counter({
      name: 'queue_jobs_failed_total',
      help: 'Total number of jobs that failed',
      labelNames: ['queue', 'reason'],
      registers: [this.registry],
    });

    this.jobProcessingDuration = new Histogram({
      name: 'queue_job_processing_duration_seconds',
      help: 'Job processing duration in seconds',
      labelNames: ['queue'],
      buckets: [0.1, 0.5, 1, 2, 5, 10, 30, 60],
      registers: [this.registry],
    });

    this.activeJobs = new Gauge({
      name: 'queue_active_jobs',
      help: 'Number of currently active jobs',
      labelNames: ['queue'],
      registers: [this.registry],
    });

    this.queueSize = new Gauge({
      name: 'queue_size',
      help: 'Number of jobs waiting in queue',
      labelNames: ['queue'],
      registers: [this.registry],
    });

    // Payment metrics
    this.paymentsProcessedTotal = new Counter({
      name: 'payments_processed_total',
      help: 'Total number of payments processed',
      labelNames: ['currency', 'status'],
      registers: [this.registry],
    });

    this.paymentAmountTotal = new Counter({
      name: 'payment_amount_total_cents',
      help: 'Total payment amount in cents',
      labelNames: ['currency'],
      registers: [this.registry],
    });

    this.refundsProcessedTotal = new Counter({
      name: 'refunds_processed_total',
      help: 'Total number of refunds processed',
      labelNames: ['currency', 'status'],
      registers: [this.registry],
    });

    this.refundAmountTotal = new Counter({
      name: 'refund_amount_total_cents',
      help: 'Total refund amount in cents',
      labelNames: ['currency'],
      registers: [this.registry],
    });

    // NFT metrics
    this.nftsMinttedTotal = new Counter({
      name: 'nfts_minted_total',
      help: 'Total number of NFTs minted',
      labelNames: ['status'],
      registers: [this.registry],
    });

    this.nftTransfersTotal = new Counter({
      name: 'nft_transfers_total',
      help: 'Total number of NFT transfers',
      labelNames: ['status'],
      registers: [this.registry],
    });

    this.solanaBalanceGauge = new Gauge({
      name: 'solana_wallet_balance_sol',
      help: 'Solana wallet balance in SOL',
      registers: [this.registry],
    });

    // Communication metrics
    this.emailsSentTotal = new Counter({
      name: 'emails_sent_total',
      help: 'Total number of emails sent',
      labelNames: ['type'],
      registers: [this.registry],
    });

    this.emailsFailedTotal = new Counter({
      name: 'emails_failed_total',
      help: 'Total number of emails that failed',
      labelNames: ['type'],
      registers: [this.registry],
    });

    this.webhooksSentTotal = new Counter({
      name: 'webhooks_sent_total',
      help: 'Total number of webhooks sent',
      labelNames: ['event'],
      registers: [this.registry],
    });

    this.webhooksFailedTotal = new Counter({
      name: 'webhooks_failed_total',
      help: 'Total number of webhooks that failed',
      labelNames: ['event'],
      registers: [this.registry],
    });

    // System metrics
    this.uptimeGauge = new Gauge({
      name: 'service_uptime_seconds',
      help: 'Service uptime in seconds',
      registers: [this.registry],
    });

    this.memoryUsageGauge = new Gauge({
      name: 'service_memory_usage_bytes',
      help: 'Service memory usage in bytes',
      labelNames: ['type'],
      registers: [this.registry],
    });

    this.cpuUsageGauge = new Gauge({
      name: 'service_cpu_usage_percent',
      help: 'Service CPU usage percentage',
      registers: [this.registry],
    });

    // Start collecting system metrics
    this.startSystemMetricsCollection();

    logger.info('Metrics service initialized');
  }

  // Job metrics
  recordJobProcessed(queue: string, status: 'success' | 'failed'): void {
    this.jobsProcessedTotal.inc({ queue, status });
  }

  recordJobFailed(queue: string, reason: string): void {
    this.jobsFailedTotal.inc({ queue, reason });
  }

  recordJobDuration(queue: string, durationSeconds: number): void {
    this.jobProcessingDuration.observe({ queue }, durationSeconds);
  }

  setActiveJobs(queue: string, count: number): void {
    this.activeJobs.set({ queue }, count);
  }

  setQueueSize(queue: string, size: number): void {
    this.queueSize.set({ queue }, size);
  }

  // Payment metrics
  recordPayment(currency: string, amount: number, status: 'success' | 'failed'): void {
    this.paymentsProcessedTotal.inc({ currency, status });
    if (status === 'success') {
      this.paymentAmountTotal.inc({ currency }, amount);
    }
  }

  recordRefund(currency: string, amount: number, status: 'success' | 'failed'): void {
    this.refundsProcessedTotal.inc({ currency, status });
    if (status === 'success') {
      this.refundAmountTotal.inc({ currency }, amount);
    }
  }

  // NFT metrics
  recordNFTMint(status: 'success' | 'failed'): void {
    this.nftsMinttedTotal.inc({ status });
  }

  recordNFTTransfer(status: 'success' | 'failed'): void {
    this.nftTransfersTotal.inc({ status });
  }

  setSolanaBalance(balance: number): void {
    this.solanaBalanceGauge.set(balance);
  }

  // Communication metrics
  recordEmail(type: string, success: boolean): void {
    if (success) {
      this.emailsSentTotal.inc({ type });
    } else {
      this.emailsFailedTotal.inc({ type });
    }
  }

  recordWebhook(event: string, success: boolean): void {
    if (success) {
      this.webhooksSentTotal.inc({ event });
    } else {
      this.webhooksFailedTotal.inc({ event });
    }
  }

  // Get metrics in Prometheus format
  async getMetrics(): Promise<string> {
    return this.registry.metrics();
  }

  // Get metrics as JSON
  async getMetricsJSON(): Promise<any[]> {
    return this.registry.getMetricsAsJSON();
  }

  // System metrics collection
  private startSystemMetricsCollection(): void {
    // Update system metrics every 10 seconds
    setInterval(() => {
      try {
        // Uptime
        this.uptimeGauge.set(process.uptime());

        // Memory usage
        const memUsage = process.memoryUsage();
        this.memoryUsageGauge.set({ type: 'rss' }, memUsage.rss);
        this.memoryUsageGauge.set({ type: 'heapTotal' }, memUsage.heapTotal);
        this.memoryUsageGauge.set({ type: 'heapUsed' }, memUsage.heapUsed);
        this.memoryUsageGauge.set({ type: 'external' }, memUsage.external);

        // CPU usage
        const cpuUsage = process.cpuUsage();
        const totalUsage = (cpuUsage.user + cpuUsage.system) / 1000000; // Convert to seconds
        const uptime = process.uptime();
        const cpuPercent = (totalUsage / uptime) * 100;
        this.cpuUsageGauge.set(cpuPercent);
      } catch (error: any) {
        logger.error('Failed to collect system metrics', { error: error.message });
      }
    }, 10000);
  }

  // Reset all metrics (useful for testing)
  reset(): void {
    this.registry.resetMetrics();
  }
}

// Export singleton instance
export const metricsService = new MetricsService();
