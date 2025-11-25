import { JobOptions } from 'bull';

/**
 * Job Priority Management
 * Define and manage priority levels for different job types
 */

export enum JobPriority {
  CRITICAL = 1,    // Highest priority - process immediately
  HIGH = 3,        // High priority - process soon
  NORMAL = 5,      // Normal priority - default
  LOW = 7,         // Low priority - process when idle
  BACKGROUND = 10, // Lowest priority - batch processing
}

export interface PriorityJobOptions extends JobOptions {
  priority: number;
}

/**
 * Get job options with priority
 */
export function getJobOptionsWithPriority(
  jobType: string,
  customPriority?: JobPriority
): PriorityJobOptions {
  const priority = customPriority || getPriorityForJobType(jobType);

  return {
    priority,
    attempts: getAttemptsForPriority(priority),
    backoff: getBackoffForPriority(priority),
    removeOnComplete: priority >= JobPriority.LOW, // Remove low priority jobs when complete
    removeOnFail: false, // Keep failed jobs for analysis
  };
}

/**
 * Determine priority based on job type
 */
function getPriorityForJobType(jobType: string): JobPriority {
  switch (jobType) {
    case 'payment':
    case 'refund':
      return JobPriority.CRITICAL;
    
    case 'mint':
    case 'transfer':
      return JobPriority.HIGH;
    
    case 'email':
    case 'webhook':
      return JobPriority.NORMAL;
    
    case 'analytics':
    case 'report':
      return JobPriority.LOW;
    
    case 'cleanup':
    case 'maintenance':
      return JobPriority.BACKGROUND;
    
    default:
      return JobPriority.NORMAL;
  }
}

/**
 * Get retry attempts based on priority
 */
function getAttemptsForPriority(priority: number): number {
  if (priority <= JobPriority.CRITICAL) {
    return 5; // Critical jobs get more retries
  } else if (priority <= JobPriority.HIGH) {
    return 3;
  } else {
    return 2;
  }
}

/**
 * Get backoff strategy based on priority
 */
function getBackoffForPriority(priority: number): JobOptions['backoff'] {
  if (priority <= JobPriority.CRITICAL) {
    return {
      type: 'exponential',
      delay: 1000, // 1 second base delay for critical
    };
  } else if (priority <= JobPriority.HIGH) {
    return {
      type: 'exponential',
      delay: 2000, // 2 seconds for high priority
    };
  } else {
    return {
      type: 'exponential',
      delay: 5000, // 5 seconds for normal/low
    };
  }
}

/**
 * Priority labels for display
 */
export const PriorityLabels: Record<JobPriority, string> = {
  [JobPriority.CRITICAL]: 'Critical',
  [JobPriority.HIGH]: 'High',
  [JobPriority.NORMAL]: 'Normal',
  [JobPriority.LOW]: 'Low',
  [JobPriority.BACKGROUND]: 'Background',
};

/**
 * Check if job should be prioritized over another
 */
export function shouldPrioritize(priority1: number, priority2: number): boolean {
  return priority1 < priority2; // Lower number = higher priority
}

/**
 * Get delay multiplier based on priority
 * Critical jobs have no delay, background jobs have significant delay
 */
export function getDelayMultiplier(priority: JobPriority): number {
  switch (priority) {
    case JobPriority.CRITICAL:
      return 1; // No delay multiplier
    case JobPriority.HIGH:
      return 1.5;
    case JobPriority.NORMAL:
      return 2;
    case JobPriority.LOW:
      return 3;
    case JobPriority.BACKGROUND:
      return 5;
    default:
      return 2;
  }
}
