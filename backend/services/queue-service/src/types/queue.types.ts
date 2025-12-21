import { PERSISTENCE_TIERS } from '../config/constants';

export interface QueueConfig {
  name: string;
  persistenceTier: keyof typeof PERSISTENCE_TIERS;
  defaultJobOptions: {
    attempts: number;
    backoff: {
      type: 'fixed' | 'exponential';
      delay: number;
    };
    removeOnComplete: boolean | number;
    removeOnFail: boolean;
  };
}

export interface QueueMetrics {
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
}

export type QueueType = 'money' | 'communication' | 'background';
