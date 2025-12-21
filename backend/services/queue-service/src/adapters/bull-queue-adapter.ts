/**
 * Bull Queue Adapter
 * Provides Bull Queue-like interface for pg-boss
 * Minimal implementation to support existing code
 */

import PgBoss from 'pg-boss';
import { QueueFactory } from '../queues/factories/queue.factory';

export class BullQueueAdapter {
  public name: string;
  private boss: PgBoss;

  constructor(name: string) {
    this.name = name;
    this.boss = QueueFactory.getBoss();
  }

  async add(jobName: string, data: any, opts: any = {}) {
    return await this.boss.send(jobName, data, {
      retryLimit: opts.attempts || 3,
      retryDelay: opts.backoff?.delay || 1000,
      retryBackoff: opts.backoff?.type === 'exponential',
      priority: opts.priority || 0,
      ...opts
    });
  }

  async getJobs(states: string[], start = 0, end = -1): Promise<any[]> {
    // pg-boss doesn't have a direct equivalent
    // Return empty array for now - this is used for admin/monitoring
    return [];
  }

  async getJob(jobId: string | number): Promise<any | null> {
    // pg-boss doesn't expose individual job retrieval easily
    return null;
  }

  async getWaiting(start = 0, end = -1): Promise<any[]> {
    // pg-boss doesn't have direct equivalent
    // Used by monitoring service
    return [];
  }

  async getJobCounts(): Promise<{
    waiting: number;
    active: number;
    completed: number;
    failed: number;
    delayed: number;
  }> {
    // pg-boss doesn't have direct equivalents, return estimates
    return {
      waiting: 0,
      active: 0,
      completed: 0,
      failed: 0,
      delayed: 0
    };
  }

  async removeJobs(pattern: string): Promise<void> {
    // Not directly supported in pg-boss
  }

  async pause(): Promise<void> {
    // Would need to track paused state
  }

  async resume(): Promise<void> {
    // Would need to track paused state
  }

  async clean(grace: number, status?: string, limit?: number): Promise<any[]> {
    // pg-boss has automatic archival
    return [];
  }

  async obliterate(opts?: any): Promise<void> {
    // Dangerous operation - skip for now
  }

  on(event: string, callback: Function): void {
    // Event emitter not needed for basic functionality
  }

  async process(concurrency: number, processor: Function): Promise<void>;
  async process(processor: Function): Promise<void>;
  async process(nameOrConcurrency: any, processorOrUndefined?: Function): Promise<void> {
    // This is handled by the queue definitions directly
    // Not called from controllers/services
  }
}

/**
 * Helper to get queue adapter by name
 */
export function getQueueAdapter(name: string): BullQueueAdapter {
  return new BullQueueAdapter(name);
}
