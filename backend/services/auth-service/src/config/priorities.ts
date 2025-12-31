/**
 * Route Priority Configuration
 * 
 * Defines priority levels for load shedding.
 * Under heavy load, lower priority routes are shed first.
 * 
 * CRITICAL: Never shed - core auth flows
 * HIGH: Shed only under extreme pressure
 * NORMAL: Shed under moderate pressure
 * LOW: Shed first under any pressure
 */

export enum Priority {
  CRITICAL = 4,  // Never shed
  HIGH = 3,      // Login, token refresh
  NORMAL = 2,    // Profile updates
  LOW = 1,       // Data exports, audit logs
}

// Route pattern to priority mapping
const routePriorities: Record<string, Priority> = {
  // CRITICAL - Authentication core (never shed)
  'POST /auth/login': Priority.CRITICAL,
  'POST /auth/refresh': Priority.CRITICAL,
  'POST /auth/verify-mfa': Priority.CRITICAL,
  'GET /auth/verify': Priority.CRITICAL,
  'GET /health/live': Priority.CRITICAL,
  'GET /health/ready': Priority.CRITICAL,

  // HIGH - Important auth operations
  'POST /auth/register': Priority.HIGH,
  'POST /auth/forgot-password': Priority.HIGH,
  'POST /auth/reset-password': Priority.HIGH,
  'POST /auth/logout': Priority.HIGH,
  'POST /auth/mfa/verify': Priority.HIGH,
  'GET /auth/internal/*': Priority.HIGH,
  'POST /auth/internal/*': Priority.HIGH,

  // NORMAL - Standard operations
  'GET /auth/me': Priority.NORMAL,
  'PUT /auth/profile': Priority.NORMAL,
  'POST /auth/change-password': Priority.NORMAL,
  'GET /auth/sessions': Priority.NORMAL,
  'DELETE /auth/sessions/*': Priority.NORMAL,
  'GET /auth/consent': Priority.NORMAL,
  'PUT /auth/consent': Priority.NORMAL,

  // LOW - Non-essential operations (shed first)
  'GET /auth/export': Priority.LOW,
  'GET /auth/audit-logs': Priority.LOW,
  'POST /auth/mfa/setup': Priority.LOW,
  'POST /auth/mfa/regenerate-backup-codes': Priority.LOW,
  'GET /metrics': Priority.LOW,
  'GET /docs': Priority.LOW,
  'GET /docs/*': Priority.LOW,
};

/**
 * Get priority for a route
 */
export function getRoutePriority(method: string, path: string): Priority {
  // Exact match first
  const exactKey = `${method} ${path}`;
  if (routePriorities[exactKey] !== undefined) {
    return routePriorities[exactKey];
  }

  // Wildcard match
  for (const [pattern, priority] of Object.entries(routePriorities)) {
    if (pattern.endsWith('/*')) {
      const prefix = pattern.slice(0, -1); // Remove *
      const [patternMethod, patternPath] = prefix.split(' ');
      if (method === patternMethod && path.startsWith(patternPath)) {
        return priority;
      }
    }
  }

  // Default to NORMAL
  return Priority.NORMAL;
}

/**
 * Check if a route should be shed based on current load level
 */
export function shouldShedRoute(routePriority: Priority, loadLevel: number): boolean {
  // loadLevel: 0-100 representing system pressure
  // 0-50: No shedding
  // 50-70: Shed LOW priority
  // 70-85: Shed NORMAL priority
  // 85-95: Shed HIGH priority
  // 95+: Only CRITICAL routes allowed

  if (routePriority === Priority.CRITICAL) {
    return false; // Never shed critical routes
  }

  if (loadLevel >= 95 && routePriority < Priority.CRITICAL) {
    return true;
  }

  if (loadLevel >= 85 && routePriority <= Priority.HIGH) {
    return true;
  }

  if (loadLevel >= 70 && routePriority <= Priority.NORMAL) {
    return true;
  }

  if (loadLevel >= 50 && routePriority <= Priority.LOW) {
    return true;
  }

  return false;
}

/**
 * Get priority name for logging
 */
export function getPriorityName(priority: Priority): string {
  switch (priority) {
    case Priority.CRITICAL: return 'CRITICAL';
    case Priority.HIGH: return 'HIGH';
    case Priority.NORMAL: return 'NORMAL';
    case Priority.LOW: return 'LOW';
    default: return 'UNKNOWN';
  }
}
