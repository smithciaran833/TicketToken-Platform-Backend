/**
 * Alert Configuration
 * Defines thresholds and rules for alerting
 */

export const alertsConfig = {
  // Order expiration rate threshold (%)
  expirationRate: {
    warning: 20, // Alert if > 20% of orders expire
    critical: 40, // Critical alert if > 40%
  },

  // Order conversion rate threshold (%)
  conversionRate: {
    warning: 50, // Alert if < 50% conversion
    critical: 30, // Critical if < 30%
  },

  // Refund rate threshold (%)
  refundRate: {
    warning: 5, // Alert if > 5% refund rate
    critical: 10, // Critical if > 10%
  },

  // Average order fulfillment time (minutes)
  fulfillmentTime: {
    warning: 30, // Alert if > 30 minutes
    critical: 60, // Critical if > 60 minutes
  },

  // Database connection pool usage (%)
  dbPoolUsage: {
    warning: 70, // Alert if > 70% pool usage
    critical: 90, // Critical if > 90%
  },

  // Redis memory usage (%)
  redisMemoryUsage: {
    warning: 75,
    critical: 90,
  },

  // API response time (ms)
  apiResponseTime: {
    warning: 1000, // Alert if p95 > 1s
    critical: 3000, // Critical if p95 > 3s
  },

  // Error rate (%)
  errorRate: {
    warning: 1, // Alert if > 1% error rate
    critical: 5, // Critical if > 5%
  },
};

export type AlertLevel = 'info' | 'warning' | 'critical';

export interface Alert {
  level: AlertLevel;
  metric: string;
  message: string;
  value: number;
  threshold: number;
  timestamp: Date;
}

export function evaluateMetric(
  metricName: string,
  value: number,
  config: { warning: number; critical: number },
  higherIsBetter: boolean = false
): Alert | null {
  const exceedsCritical = higherIsBetter
    ? value < config.critical
    : value > config.critical;
  
  const exceedsWarning = higherIsBetter
    ? value < config.warning
    : value > config.warning;

  if (exceedsCritical) {
    return {
      level: 'critical',
      metric: metricName,
      message: `${metricName} is at critical level: ${value}`,
      value,
      threshold: config.critical,
      timestamp: new Date(),
    };
  }

  if (exceedsWarning) {
    return {
      level: 'warning',
      metric: metricName,
      message: `${metricName} exceeds warning threshold: ${value}`,
      value,
      threshold: config.warning,
      timestamp: new Date(),
    };
  }

  return null;
}
