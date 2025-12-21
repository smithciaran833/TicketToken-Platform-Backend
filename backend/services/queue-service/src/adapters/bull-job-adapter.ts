/**
 * Bull Job Adapter
 * Wraps pg-boss jobs to provide Bull-compatible interface
 * This allows existing worker code to work without changes
 */

export interface BullJobData<T = any> {
  data: T;
  id?: string | number | null;
  name?: string;
  queue?: { name: string };
  opts?: any;
  progress?: (progress: number | object) => Promise<void>;
  log?: (message: string) => void;
  attemptsMade?: number;
}

/**
 * Creates a Bull-compatible job wrapper around pg-boss job data
 */
export function createBullJobAdapter<T = any>(pgBossJob: any): BullJobData<T> {
  return {
    data: pgBossJob.data || pgBossJob,
    id: pgBossJob.id || null,
    name: pgBossJob.name || 'unknown',
    queue: { name: pgBossJob.name || 'unknown' },
    opts: {},
    attemptsMade: 0,
    progress: async (progress: number | object) => {
      // pg-boss doesn't have built-in progress tracking
      // Could be extended to store in PostgreSQL if needed
    },
    log: (message: string) => {
      console.log(`[Job ${pgBossJob.id || 'unknown'}] ${message}`);
    }
  };
}
