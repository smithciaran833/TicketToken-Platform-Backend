/**
 * Sync Monitor Utility
 * 
 * AUDIT FIX #75: Add sync monitoring for minting operations
 * 
 * Features:
 * - Tracks last successful mint timestamp
 * - Monitors pending mint count
 * - Alerts when thresholds are exceeded
 * - Prometheus metrics integration
 * - Health check integration
 */

import { logger } from './logger';

// Node.js globals
declare const process: { env: Record<string, string | undefined> };
declare function setInterval(callback: () => void, ms: number): ReturnType<typeof globalThis.setInterval>;

// =============================================================================
// CONFIGURATION
// =============================================================================

// Alert if no successful mints in this many milliseconds
const NO_MINT_ALERT_THRESHOLD_MS = parseInt(
  process.env.SYNC_MONITOR_NO_MINT_THRESHOLD_MS || String(10 * 60 * 1000), // 10 minutes
  10
);

// Alert if pending count exceeds this threshold
const PENDING_COUNT_ALERT_THRESHOLD = parseInt(
  process.env.SYNC_MONITOR_PENDING_THRESHOLD || '100',
  10
);

// How often to check sync status
const CHECK_INTERVAL_MS = parseInt(
  process.env.SYNC_MONITOR_CHECK_INTERVAL_MS || '60000', // 1 minute
  10
);

// =============================================================================
// SYNC STATE
// =============================================================================

interface SyncState {
  lastSuccessfulMint: number | null;
  lastFailedMint: number | null;
  pendingMintCount: number;
  totalSuccessful: number;
  totalFailed: number;
  isHealthy: boolean;
  lastAlert: number | null;
  alerts: SyncAlert[];
}

interface SyncAlert {
  type: 'no_recent_mints' | 'high_pending_count' | 'sync_recovered';
  message: string;
  timestamp: number;
  threshold?: number;
  currentValue?: number;
}

const syncState: SyncState = {
  lastSuccessfulMint: null,
  lastFailedMint: null,
  pendingMintCount: 0,
  totalSuccessful: 0,
  totalFailed: 0,
  isHealthy: true,
  lastAlert: null,
  alerts: []
};

// Maximum alerts to keep in memory
const MAX_ALERTS = 100;

// =============================================================================
// METRICS
// =============================================================================

export interface SyncMetrics {
  lastSuccessfulMintTimestamp: number | null;
  lastFailedMintTimestamp: number | null;
  pendingMintsCount: number;
  totalSuccessfulMints: number;
  totalFailedMints: number;
  timeSinceLastMintMs: number | null;
  isHealthy: boolean;
  alertCount: number;
}

/**
 * Get current sync metrics for Prometheus
 */
export function getSyncMetrics(): SyncMetrics {
  return {
    lastSuccessfulMintTimestamp: syncState.lastSuccessfulMint,
    lastFailedMintTimestamp: syncState.lastFailedMint,
    pendingMintsCount: syncState.pendingMintCount,
    totalSuccessfulMints: syncState.totalSuccessful,
    totalFailedMints: syncState.totalFailed,
    timeSinceLastMintMs: syncState.lastSuccessfulMint 
      ? Date.now() - syncState.lastSuccessfulMint 
      : null,
    isHealthy: syncState.isHealthy,
    alertCount: syncState.alerts.length
  };
}

// =============================================================================
// SYNC STATUS
// =============================================================================

export interface SyncStatus {
  healthy: boolean;
  lastSuccessfulMint: string | null;
  lastFailedMint: string | null;
  pendingCount: number;
  successRate: string;
  timeSinceLastSuccess: string | null;
  alerts: SyncAlert[];
  thresholds: {
    noMintAlertMs: number;
    pendingCountAlert: number;
  };
}

/**
 * Get current sync status for health checks
 */
export function getSyncStatus(): SyncStatus {
  const timeSinceLastSuccess = syncState.lastSuccessfulMint
    ? Date.now() - syncState.lastSuccessfulMint
    : null;

  const totalMints = syncState.totalSuccessful + syncState.totalFailed;
  const successRate = totalMints > 0 
    ? ((syncState.totalSuccessful / totalMints) * 100).toFixed(2) + '%'
    : 'N/A';

  return {
    healthy: syncState.isHealthy,
    lastSuccessfulMint: syncState.lastSuccessfulMint 
      ? new Date(syncState.lastSuccessfulMint).toISOString() 
      : null,
    lastFailedMint: syncState.lastFailedMint 
      ? new Date(syncState.lastFailedMint).toISOString() 
      : null,
    pendingCount: syncState.pendingMintCount,
    successRate,
    timeSinceLastSuccess: timeSinceLastSuccess 
      ? formatDuration(timeSinceLastSuccess) 
      : null,
    alerts: syncState.alerts.slice(-10), // Return last 10 alerts
    thresholds: {
      noMintAlertMs: NO_MINT_ALERT_THRESHOLD_MS,
      pendingCountAlert: PENDING_COUNT_ALERT_THRESHOLD
    }
  };
}

/**
 * Format duration in human-readable format
 */
function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  if (ms < 3600000) return `${(ms / 60000).toFixed(1)}m`;
  return `${(ms / 3600000).toFixed(1)}h`;
}

// =============================================================================
// TRACKING FUNCTIONS
// =============================================================================

/**
 * Record a successful mint
 */
export function recordSuccessfulMint(mintAddress: string): void {
  const now = Date.now();
  
  // Check if we were in unhealthy state
  const wasUnhealthy = !syncState.isHealthy;
  
  syncState.lastSuccessfulMint = now;
  syncState.totalSuccessful++;
  
  if (syncState.pendingMintCount > 0) {
    syncState.pendingMintCount--;
  }

  // Check if sync recovered
  if (wasUnhealthy) {
    syncState.isHealthy = true;
    addAlert({
      type: 'sync_recovered',
      message: 'Sync has recovered - minting operations resumed',
      timestamp: now
    });
    logger.info('Sync recovered', { mintAddress });
  }

  logger.debug('Successful mint recorded', {
    mintAddress,
    totalSuccessful: syncState.totalSuccessful,
    pendingCount: syncState.pendingMintCount
  });
}

/**
 * Record a failed mint
 */
export function recordFailedMint(ticketId: string, error: string): void {
  const now = Date.now();
  
  syncState.lastFailedMint = now;
  syncState.totalFailed++;
  
  if (syncState.pendingMintCount > 0) {
    syncState.pendingMintCount--;
  }

  logger.debug('Failed mint recorded', {
    ticketId,
    error,
    totalFailed: syncState.totalFailed,
    pendingCount: syncState.pendingMintCount
  });
}

/**
 * Record a pending mint (job added to queue)
 */
export function recordPendingMint(ticketId: string): void {
  syncState.pendingMintCount++;

  logger.debug('Pending mint recorded', {
    ticketId,
    pendingCount: syncState.pendingMintCount
  });

  // Check if pending count exceeds threshold
  if (syncState.pendingMintCount >= PENDING_COUNT_ALERT_THRESHOLD) {
    const shouldAlert = !syncState.lastAlert || 
      (Date.now() - syncState.lastAlert) > 5 * 60 * 1000; // Rate limit alerts to 5 minutes

    if (shouldAlert) {
      syncState.isHealthy = false;
      syncState.lastAlert = Date.now();
      
      addAlert({
        type: 'high_pending_count',
        message: `Pending mint count (${syncState.pendingMintCount}) exceeds threshold (${PENDING_COUNT_ALERT_THRESHOLD})`,
        timestamp: Date.now(),
        threshold: PENDING_COUNT_ALERT_THRESHOLD,
        currentValue: syncState.pendingMintCount
      });

      logger.warn('High pending mint count', {
        pendingCount: syncState.pendingMintCount,
        threshold: PENDING_COUNT_ALERT_THRESHOLD
      });
    }
  }
}

/**
 * Set pending count directly (for initialization from DB)
 */
export function setPendingCount(count: number): void {
  syncState.pendingMintCount = count;
  logger.info('Pending count initialized', { count });
}

/**
 * Add an alert to the list
 */
function addAlert(alert: SyncAlert): void {
  syncState.alerts.push(alert);
  
  // Keep only recent alerts
  if (syncState.alerts.length > MAX_ALERTS) {
    syncState.alerts = syncState.alerts.slice(-MAX_ALERTS);
  }
}

// =============================================================================
// PERIODIC CHECK
// =============================================================================

/**
 * Check sync health periodically
 */
function checkSyncHealth(): void {
  const now = Date.now();

  // Check if no successful mints recently
  if (syncState.lastSuccessfulMint) {
    const timeSinceLastMint = now - syncState.lastSuccessfulMint;
    
    if (timeSinceLastMint > NO_MINT_ALERT_THRESHOLD_MS) {
      // Only alert if we have pending mints (otherwise might just be no traffic)
      if (syncState.pendingMintCount > 0) {
        const shouldAlert = !syncState.lastAlert || 
          (now - syncState.lastAlert) > 5 * 60 * 1000;

        if (shouldAlert) {
          syncState.isHealthy = false;
          syncState.lastAlert = now;
          
          addAlert({
            type: 'no_recent_mints',
            message: `No successful mints in ${formatDuration(timeSinceLastMint)} with ${syncState.pendingMintCount} pending`,
            timestamp: now,
            threshold: NO_MINT_ALERT_THRESHOLD_MS,
            currentValue: timeSinceLastMint
          });

          logger.warn('No recent successful mints', {
            timeSinceLastMint: formatDuration(timeSinceLastMint),
            threshold: formatDuration(NO_MINT_ALERT_THRESHOLD_MS),
            pendingCount: syncState.pendingMintCount
          });
        }
      }
    }
  }

  // Check pending count
  if (syncState.pendingMintCount >= PENDING_COUNT_ALERT_THRESHOLD) {
    if (syncState.isHealthy) {
      syncState.isHealthy = false;
      logger.warn('Sync unhealthy due to high pending count', {
        pendingCount: syncState.pendingMintCount,
        threshold: PENDING_COUNT_ALERT_THRESHOLD
      });
    }
  }
}

// Start periodic check
setInterval(checkSyncHealth, CHECK_INTERVAL_MS);

// =============================================================================
// RESET & TESTING
// =============================================================================

/**
 * Reset sync state (for testing)
 */
export function resetSyncState(): void {
  syncState.lastSuccessfulMint = null;
  syncState.lastFailedMint = null;
  syncState.pendingMintCount = 0;
  syncState.totalSuccessful = 0;
  syncState.totalFailed = 0;
  syncState.isHealthy = true;
  syncState.lastAlert = null;
  syncState.alerts = [];
}

/**
 * Get alerts (for admin endpoint)
 */
export function getAlerts(limit: number = 50): SyncAlert[] {
  return syncState.alerts.slice(-limit);
}

/**
 * Clear alerts (for admin endpoint)
 */
export function clearAlerts(): void {
  syncState.alerts = [];
  logger.info('Sync alerts cleared');
}
