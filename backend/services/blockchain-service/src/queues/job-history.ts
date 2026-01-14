/**
 * Job History Tracking
 * 
 * AUDIT FIX #76: Don't remove completed jobs prematurely
 * 
 * Features:
 * - Keeps completed job data for configurable retention period (24 hours default)
 * - Stores job outcome (success/failure) with timestamp
 * - getJobHistory(ticketId) for debugging and customer support
 * - Periodic cleanup of old entries
 */

import { logger } from '../utils/logger';

// Node.js globals
declare const process: { env: Record<string, string | undefined> };
declare function setInterval(callback: () => void, ms: number): ReturnType<typeof globalThis.setInterval>;

// =============================================================================
// CONFIGURATION
// =============================================================================

// How long to keep completed job data (24 hours default)
const COMPLETED_JOB_RETENTION_MS = parseInt(
  process.env.COMPLETED_JOB_RETENTION_MS || String(24 * 60 * 60 * 1000),
  10
);

// How often to cleanup old entries (1 hour)
const CLEANUP_INTERVAL_MS = parseInt(
  process.env.JOB_HISTORY_CLEANUP_INTERVAL_MS || String(60 * 60 * 1000),
  10
);

// Maximum entries to keep in memory
const MAX_HISTORY_ENTRIES = parseInt(
  process.env.JOB_HISTORY_MAX_ENTRIES || '10000',
  10
);

// =============================================================================
// TYPES
// =============================================================================

export enum JobOutcome {
  SUCCESS = 'success',
  FAILURE = 'failure',
  CANCELLED = 'cancelled'
}

export interface JobHistoryEntry {
  jobId: string;
  ticketId: string;
  tenantId: string;
  outcome: JobOutcome;
  startedAt: number;
  completedAt: number;
  durationMs: number;
  mintAddress?: string;
  error?: string;
  errorCode?: string;
  retryCount: number;
  metadata?: Record<string, any>;
}

// =============================================================================
// STATE
// =============================================================================

// Job history stored by jobId
const jobHistoryById = new Map<string, JobHistoryEntry>();

// Index by ticketId for quick lookups
const jobHistoryByTicketId = new Map<string, string[]>(); // ticketId -> jobIds

// Metrics
interface JobHistoryMetrics {
  totalEntries: number;
  successCount: number;
  failureCount: number;
  averageDurationMs: number;
  oldestEntry: number | null;
}

// =============================================================================
// HISTORY OPERATIONS
// =============================================================================

/**
 * Record a completed job
 * AUDIT FIX #76: Store job outcome with retention period
 */
export function recordJobCompletion(
  jobId: string,
  ticketId: string,
  tenantId: string,
  outcome: JobOutcome,
  startedAt: number,
  options?: {
    mintAddress?: string;
    error?: string;
    errorCode?: string;
    retryCount?: number;
    metadata?: Record<string, any>;
  }
): JobHistoryEntry {
  const completedAt = Date.now();
  
  const entry: JobHistoryEntry = {
    jobId,
    ticketId,
    tenantId,
    outcome,
    startedAt,
    completedAt,
    durationMs: completedAt - startedAt,
    mintAddress: options?.mintAddress,
    error: options?.error,
    errorCode: options?.errorCode,
    retryCount: options?.retryCount || 0,
    metadata: options?.metadata
  };
  
  // Store by jobId
  jobHistoryById.set(jobId, entry);
  
  // Index by ticketId
  const ticketJobs = jobHistoryByTicketId.get(ticketId) || [];
  ticketJobs.push(jobId);
  jobHistoryByTicketId.set(ticketId, ticketJobs);
  
  logger.debug('Job completion recorded', {
    jobId,
    ticketId,
    outcome,
    durationMs: entry.durationMs
  });
  
  // Enforce max entries limit
  if (jobHistoryById.size > MAX_HISTORY_ENTRIES) {
    cleanupOldEntries(true); // Force cleanup
  }
  
  return entry;
}

/**
 * Record a successful job
 */
export function recordJobSuccess(
  jobId: string,
  ticketId: string,
  tenantId: string,
  startedAt: number,
  mintAddress: string,
  retryCount: number = 0
): JobHistoryEntry {
  return recordJobCompletion(jobId, ticketId, tenantId, JobOutcome.SUCCESS, startedAt, {
    mintAddress,
    retryCount
  });
}

/**
 * Record a failed job
 */
export function recordJobFailure(
  jobId: string,
  ticketId: string,
  tenantId: string,
  startedAt: number,
  error: string,
  errorCode?: string,
  retryCount: number = 0
): JobHistoryEntry {
  return recordJobCompletion(jobId, ticketId, tenantId, JobOutcome.FAILURE, startedAt, {
    error,
    errorCode,
    retryCount
  });
}

/**
 * Get job history for a ticket
 * AUDIT FIX #76: Useful for debugging and customer support
 */
export function getJobHistory(ticketId: string): JobHistoryEntry[] {
  const jobIds = jobHistoryByTicketId.get(ticketId);
  
  if (!jobIds || jobIds.length === 0) {
    return [];
  }
  
  const entries = jobIds
    .map(jobId => jobHistoryById.get(jobId))
    .filter((entry): entry is JobHistoryEntry => entry !== undefined)
    .sort((a, b) => b.completedAt - a.completedAt); // Newest first
  
  return entries;
}

/**
 * Get a specific job by ID
 */
export function getJob(jobId: string): JobHistoryEntry | undefined {
  return jobHistoryById.get(jobId);
}

/**
 * Get latest job for a ticket
 */
export function getLatestJob(ticketId: string): JobHistoryEntry | undefined {
  const history = getJobHistory(ticketId);
  return history[0]; // Already sorted newest first
}

/**
 * Check if ticket has successful mint
 */
export function hasSuccessfulMint(ticketId: string): boolean {
  const history = getJobHistory(ticketId);
  return history.some(entry => entry.outcome === JobOutcome.SUCCESS);
}

/**
 * Get mint address for ticket (if successfully minted)
 */
export function getMintAddress(ticketId: string): string | undefined {
  const history = getJobHistory(ticketId);
  const successfulJob = history.find(entry => 
    entry.outcome === JobOutcome.SUCCESS && entry.mintAddress
  );
  return successfulJob?.mintAddress;
}

// =============================================================================
// QUERY FUNCTIONS
// =============================================================================

/**
 * Get recent jobs with filters
 */
export function getRecentJobs(options?: {
  tenantId?: string;
  outcome?: JobOutcome;
  limit?: number;
  since?: number;
}): JobHistoryEntry[] {
  let entries = Array.from(jobHistoryById.values());
  
  // Apply filters
  if (options?.tenantId) {
    entries = entries.filter(e => e.tenantId === options.tenantId);
  }
  if (options?.outcome) {
    entries = entries.filter(e => e.outcome === options.outcome);
  }
  if (options?.since) {
    entries = entries.filter(e => e.completedAt >= options.since);
  }
  
  // Sort by completion time (newest first)
  entries.sort((a, b) => b.completedAt - a.completedAt);
  
  // Apply limit
  if (options?.limit) {
    entries = entries.slice(0, options.limit);
  }
  
  return entries;
}

/**
 * Get failed jobs for retry analysis
 */
export function getFailedJobs(options?: {
  tenantId?: string;
  limit?: number;
  errorPattern?: RegExp;
}): JobHistoryEntry[] {
  let entries = Array.from(jobHistoryById.values())
    .filter(e => e.outcome === JobOutcome.FAILURE);
  
  if (options?.tenantId) {
    entries = entries.filter(e => e.tenantId === options.tenantId);
  }
  if (options?.errorPattern) {
    entries = entries.filter(e => 
      e.error && options.errorPattern!.test(e.error)
    );
  }
  
  entries.sort((a, b) => b.completedAt - a.completedAt);
  
  if (options?.limit) {
    entries = entries.slice(0, options.limit);
  }
  
  return entries;
}

// =============================================================================
// METRICS
// =============================================================================

/**
 * Get job history metrics
 */
export function getJobHistoryMetrics(): JobHistoryMetrics {
  const entries = Array.from(jobHistoryById.values());
  
  if (entries.length === 0) {
    return {
      totalEntries: 0,
      successCount: 0,
      failureCount: 0,
      averageDurationMs: 0,
      oldestEntry: null
    };
  }
  
  const successCount = entries.filter(e => e.outcome === JobOutcome.SUCCESS).length;
  const failureCount = entries.filter(e => e.outcome === JobOutcome.FAILURE).length;
  const totalDuration = entries.reduce((sum, e) => sum + e.durationMs, 0);
  const oldestEntry = Math.min(...entries.map(e => e.completedAt));
  
  return {
    totalEntries: entries.length,
    successCount,
    failureCount,
    averageDurationMs: Math.round(totalDuration / entries.length),
    oldestEntry
  };
}

/**
 * Get success rate for a tenant
 */
export function getTenantSuccessRate(tenantId: string): {
  total: number;
  successful: number;
  failed: number;
  rate: string;
} {
  const entries = Array.from(jobHistoryById.values())
    .filter(e => e.tenantId === tenantId);
  
  const total = entries.length;
  const successful = entries.filter(e => e.outcome === JobOutcome.SUCCESS).length;
  const failed = entries.filter(e => e.outcome === JobOutcome.FAILURE).length;
  
  return {
    total,
    successful,
    failed,
    rate: total > 0 ? `${((successful / total) * 100).toFixed(1)}%` : 'N/A'
  };
}

// =============================================================================
// CLEANUP
// =============================================================================

/**
 * Clean up old entries beyond retention period
 * AUDIT FIX #76: Only remove jobs after retention period
 */
function cleanupOldEntries(force: boolean = false): void {
  const cutoffTime = Date.now() - COMPLETED_JOB_RETENTION_MS;
  let removedCount = 0;
  
  for (const [jobId, entry] of jobHistoryById.entries()) {
    // Remove entries older than retention period
    if (entry.completedAt < cutoffTime || (force && jobHistoryById.size > MAX_HISTORY_ENTRIES * 0.9)) {
      jobHistoryById.delete(jobId);
      
      // Update ticket index
      const ticketJobs = jobHistoryByTicketId.get(entry.ticketId);
      if (ticketJobs) {
        const index = ticketJobs.indexOf(jobId);
        if (index > -1) {
          ticketJobs.splice(index, 1);
        }
        if (ticketJobs.length === 0) {
          jobHistoryByTicketId.delete(entry.ticketId);
        }
      }
      
      removedCount++;
      
      // If forced cleanup, stop when we're under the limit
      if (force && jobHistoryById.size < MAX_HISTORY_ENTRIES * 0.8) {
        break;
      }
    }
  }
  
  if (removedCount > 0) {
    logger.info('Job history cleanup completed', {
      removedCount,
      remainingEntries: jobHistoryById.size,
      retentionMs: COMPLETED_JOB_RETENTION_MS
    });
  }
}

// Start periodic cleanup
setInterval(cleanupOldEntries, CLEANUP_INTERVAL_MS);

// =============================================================================
// ADMIN OPERATIONS
// =============================================================================

/**
 * Clear all history (for testing)
 */
export function clearHistory(): void {
  jobHistoryById.clear();
  jobHistoryByTicketId.clear();
  logger.info('Job history cleared');
}

/**
 * Export history for backup
 */
export function exportHistory(): JobHistoryEntry[] {
  return Array.from(jobHistoryById.values());
}

/**
 * Import history (for recovery)
 */
export function importHistory(entries: JobHistoryEntry[]): void {
  for (const entry of entries) {
    jobHistoryById.set(entry.jobId, entry);
    
    const ticketJobs = jobHistoryByTicketId.get(entry.ticketId) || [];
    if (!ticketJobs.includes(entry.jobId)) {
      ticketJobs.push(entry.jobId);
    }
    jobHistoryByTicketId.set(entry.ticketId, ticketJobs);
  }
  
  logger.info('Job history imported', { count: entries.length });
}

// =============================================================================
// EXPORTS
// =============================================================================

export {
  COMPLETED_JOB_RETENTION_MS,
  MAX_HISTORY_ENTRIES
};
