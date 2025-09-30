export const defaultAlertRules = [
  {
    name: 'high_cpu_usage',
    metric: 'system_cpu_usage_percent',
    condition: '>',
    threshold: 80,
    severity: 'warning',
    for_duration: 300, // 5 minutes
    annotations: {
      summary: 'High CPU usage detected',
      description: 'CPU usage is above 80% for more than 5 minutes',
    },
  },
  {
    name: 'high_memory_usage',
    metric: 'system_memory_usage_percent',
    condition: '>',
    threshold: 90,
    severity: 'warning',
    for_duration: 300,
    annotations: {
      summary: 'High memory usage detected',
      description: 'Memory usage is above 90% for more than 5 minutes',
    },
  },
  {
    name: 'service_down',
    metric: 'service_up',
    condition: '==',
    threshold: 0,
    severity: 'critical',
    for_duration: 60, // 1 minute
    annotations: {
      summary: 'Service is down',
      description: 'Service health check is failing',
    },
  },
  {
    name: 'high_response_time',
    metric: 'http_response_time_ms',
    condition: '>',
    threshold: 1000,
    severity: 'warning',
    for_duration: 180,
    annotations: {
      summary: 'High response time',
      description: 'Service response time is above 1000ms',
    },
  },
  {
    name: 'database_connection_pool_exhausted',
    metric: 'postgres_pool_waiting',
    condition: '>',
    threshold: 5,
    severity: 'critical',
    for_duration: 60,
    annotations: {
      summary: 'Database connection pool exhausted',
      description: 'Too many connections waiting for database',
    },
  },
];
