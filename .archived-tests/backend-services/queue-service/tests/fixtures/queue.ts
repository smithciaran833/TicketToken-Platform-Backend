export const mockJob = {
  id: 'job-123',
  queue: 'money',
  type: 'payment-processing',
  data: {
    orderId: 'order-456',
    amount: 100,
    currency: 'USD'
  },
  status: 'pending',
  priority: 1,
  attempts: 0,
  createdAt: '2024-01-15T10:00:00Z'
};

export const mockQueueStatus = {
  name: 'money',
  waiting: 5,
  active: 2,
  completed: 100,
  failed: 3,
  delayed: 1,
  paused: false
};

export const mockMetrics = {
  queues: {
    money: { processed: 100, failed: 3, avgProcessTime: 1200 },
    communication: { processed: 250, failed: 5, avgProcessTime: 500 },
    background: { processed: 50, failed: 1, avgProcessTime: 3000 }
  },
  throughput: {
    last1h: 150,
    last24h: 3500,
    last7d: 25000
  }
};

export const mockAlert = {
  id: 'alert-123',
  type: 'queue-threshold',
  severity: 'warning',
  message: 'Money queue has 100+ pending jobs',
  timestamp: '2024-01-15T10:00:00Z',
  acknowledged: false
};
