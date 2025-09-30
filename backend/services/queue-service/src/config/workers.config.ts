export interface WorkerConfig {
  name: string;
  concurrency: number;
  maxStalledCount: number;
  stalledInterval: number;
}

export const WORKER_CONFIGS: Record<string, WorkerConfig> = {
  'payment.process': {
    name: 'payment-processor',
    concurrency: 5,
    maxStalledCount: 3,
    stalledInterval: 30000
  },
  'payment.retry': {
    name: 'payment-retry',
    concurrency: 3,
    maxStalledCount: 2,
    stalledInterval: 60000
  },
  'order.fulfill': {
    name: 'order-fulfillment',
    concurrency: 10,
    maxStalledCount: 3,
    stalledInterval: 30000
  },
  'ticket.mint': {
    name: 'ticket-minting',
    concurrency: 3,
    maxStalledCount: 1,
    stalledInterval: 120000
  },
  'email.send': {
    name: 'email-sender',
    concurrency: 20,
    maxStalledCount: 5,
    stalledInterval: 15000
  },
  'webhook.process': {
    name: 'webhook-processor',
    concurrency: 10,
    maxStalledCount: 3,
    stalledInterval: 30000
  }
};

export function getWorkerConfig(queueName: string): WorkerConfig {
  return WORKER_CONFIGS[queueName] || {
    name: 'default-worker',
    concurrency: 5,
    maxStalledCount: 3,
    stalledInterval: 30000
  };
}
