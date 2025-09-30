export const MONITORING_CONFIG = {
  // Alert thresholds
  thresholds: {
    money: {
      queueDepth: parseInt(process.env.ALERT_THRESHOLD_MONEY_QUEUE || '50'),
      jobAgeMinutes: parseInt(process.env.ALERT_THRESHOLD_MONEY_AGE_MINUTES || '10'),
      failureCount: 10
    },
    communication: {
      queueDepth: parseInt(process.env.ALERT_THRESHOLD_COMM_QUEUE || '5000'),
      jobAgeMinutes: 30,
      failureCount: 100
    },
    background: {
      queueDepth: parseInt(process.env.ALERT_THRESHOLD_BACKGROUND_QUEUE || '50000'),
      jobAgeMinutes: 120,
      failureCount: 1000
    }
  },
  
  // Alert cooldowns (milliseconds)
  cooldowns: {
    critical: 5 * 60 * 1000, // 5 minutes
    warning: 60 * 60 * 1000, // 1 hour
    info: 24 * 60 * 60 * 1000 // 24 hours
  },
  
  // Check intervals
  intervals: {
    healthCheck: 30000, // 30 seconds
    metricCleanup: 3600000 // 1 hour
  },
  
  // Retention periods (days)
  retention: {
    metrics: 30,
    alerts: 7,
    jobHistory: 90
  }
};
