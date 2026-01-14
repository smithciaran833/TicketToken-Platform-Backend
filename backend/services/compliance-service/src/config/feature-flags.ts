/**
 * Feature Flags Configuration for Compliance Service
 * 
 * AUDIT FIX: CFG-M3 - Add feature flags for gradual rollout
 * 
 * Supports:
 * - Static configuration from environment
 * - Runtime toggle via Redis
 * - Per-tenant feature flags
 */
import { logger } from '../utils/logger';
import { getRedisClient } from './redis';

// =============================================================================
// TYPES
// =============================================================================

export interface FeatureFlag {
  name: string;
  description: string;
  enabled: boolean;
  rolloutPercentage: number;
  tenantOverrides: Record<string, boolean>;
  metadata: {
    createdAt: string;
    updatedAt: string;
    owner: string;
  };
}

export interface FeatureFlagConfig {
  [key: string]: FeatureFlag;
}

// =============================================================================
// DEFAULT FLAGS
// =============================================================================

const DEFAULT_FLAGS: FeatureFlagConfig = {
  // GDPR Features
  GDPR_EXPORT_V2: {
    name: 'GDPR_EXPORT_V2',
    description: 'New GDPR export format with enhanced data categories',
    enabled: process.env.FEATURE_GDPR_EXPORT_V2 === 'true',
    rolloutPercentage: 100,
    tenantOverrides: {},
    metadata: {
      createdAt: '2026-01-01',
      updatedAt: '2026-01-03',
      owner: 'compliance-team'
    }
  },
  
  GDPR_IDENTITY_VERIFICATION: {
    name: 'GDPR_IDENTITY_VERIFICATION',
    description: 'Require identity verification for GDPR requests',
    enabled: true,
    rolloutPercentage: 100,
    tenantOverrides: {},
    metadata: {
      createdAt: '2026-01-01',
      updatedAt: '2026-01-03',
      owner: 'security-team'
    }
  },
  
  // Risk Assessment Features
  RISK_ML_SCORING: {
    name: 'RISK_ML_SCORING',
    description: 'Use ML model for risk scoring instead of rules-based',
    enabled: process.env.FEATURE_RISK_ML_SCORING === 'true',
    rolloutPercentage: 0,
    tenantOverrides: {},
    metadata: {
      createdAt: '2026-01-01',
      updatedAt: '2026-01-03',
      owner: 'data-science-team'
    }
  },
  
  RISK_AUTO_FLAG: {
    name: 'RISK_AUTO_FLAG',
    description: 'Automatically flag high-risk venues',
    enabled: process.env.FEATURE_RISK_AUTO_FLAG === 'true',
    rolloutPercentage: 50,
    tenantOverrides: {},
    metadata: {
      createdAt: '2026-01-01',
      updatedAt: '2026-01-03',
      owner: 'compliance-team'
    }
  },
  
  // OFAC Features
  OFAC_ENHANCED_SCREENING: {
    name: 'OFAC_ENHANCED_SCREENING',
    description: 'Enhanced OFAC screening with fuzzy matching',
    enabled: process.env.FEATURE_OFAC_ENHANCED === 'true',
    rolloutPercentage: 100,
    tenantOverrides: {},
    metadata: {
      createdAt: '2026-01-01',
      updatedAt: '2026-01-03',
      owner: 'compliance-team'
    }
  },
  
  // Tax Features
  TAX_1099_AUTO_GENERATE: {
    name: 'TAX_1099_AUTO_GENERATE',
    description: 'Automatically generate 1099 forms for qualifying venues',
    enabled: process.env.FEATURE_TAX_AUTO_GENERATE === 'true',
    rolloutPercentage: 100,
    tenantOverrides: {},
    metadata: {
      createdAt: '2026-01-01',
      updatedAt: '2026-01-03',
      owner: 'tax-team'
    }
  },
  
  // Observability Features
  DETAILED_HEALTH_CHECKS: {
    name: 'DETAILED_HEALTH_CHECKS',
    description: 'Include detailed component health in /health/ready',
    enabled: process.env.FEATURE_DETAILED_HEALTH !== 'false',
    rolloutPercentage: 100,
    tenantOverrides: {},
    metadata: {
      createdAt: '2026-01-01',
      updatedAt: '2026-01-03',
      owner: 'platform-team'
    }
  },
  
  METRICS_ENDPOINT: {
    name: 'METRICS_ENDPOINT',
    description: 'Enable /metrics endpoint for Prometheus scraping',
    enabled: process.env.FEATURE_METRICS_ENABLED !== 'false',
    rolloutPercentage: 100,
    tenantOverrides: {},
    metadata: {
      createdAt: '2026-01-01',
      updatedAt: '2026-01-03',
      owner: 'platform-team'
    }
  },
  
  REQUEST_TRACING: {
    name: 'REQUEST_TRACING',
    description: 'Enable OpenTelemetry request tracing',
    enabled: process.env.FEATURE_TRACING_ENABLED === 'true',
    rolloutPercentage: 100,
    tenantOverrides: {},
    metadata: {
      createdAt: '2026-01-01',
      updatedAt: '2026-01-03',
      owner: 'platform-team'
    }
  },
  
  // Resilience Features
  BULKHEAD_PATTERN: {
    name: 'BULKHEAD_PATTERN',
    description: 'Enable bulkhead pattern for resource isolation',
    enabled: process.env.FEATURE_BULKHEAD !== 'false',
    rolloutPercentage: 100,
    tenantOverrides: {},
    metadata: {
      createdAt: '2026-01-01',
      updatedAt: '2026-01-03',
      owner: 'platform-team'
    }
  },
  
  LOAD_SHEDDING: {
    name: 'LOAD_SHEDDING',
    description: 'Enable load shedding when system is overloaded',
    enabled: process.env.FEATURE_LOAD_SHEDDING !== 'false',
    rolloutPercentage: 100,
    tenantOverrides: {},
    metadata: {
      createdAt: '2026-01-01',
      updatedAt: '2026-01-03',
      owner: 'platform-team'
    }
  }
};

// In-memory cache of flags
let flagCache: FeatureFlagConfig = { ...DEFAULT_FLAGS };

// =============================================================================
// FEATURE FLAG FUNCTIONS
// =============================================================================

/**
 * Check if a feature is enabled
 */
export function isFeatureEnabled(
  flagName: string,
  context?: { tenantId?: string; userId?: string }
): boolean {
  const flag = flagCache[flagName];
  
  if (!flag) {
    logger.warn({ flagName }, 'Unknown feature flag requested');
    return false;
  }
  
  // Check tenant override first
  if (context?.tenantId && flag.tenantOverrides[context.tenantId] !== undefined) {
    return flag.tenantOverrides[context.tenantId];
  }
  
  // Check if flag is enabled globally
  if (!flag.enabled) {
    return false;
  }
  
  // Check rollout percentage
  if (flag.rolloutPercentage < 100) {
    // Use userId or tenantId for consistent rollout
    const identifier = context?.userId || context?.tenantId || '';
    const hash = simpleHash(identifier + flagName);
    return (hash % 100) < flag.rolloutPercentage;
  }
  
  return true;
}

/**
 * Get all feature flags
 */
export function getAllFeatureFlags(): FeatureFlagConfig {
  return { ...flagCache };
}

/**
 * Get a specific feature flag
 */
export function getFeatureFlag(flagName: string): FeatureFlag | undefined {
  return flagCache[flagName];
}

/**
 * Update a feature flag in Redis (for runtime changes)
 */
export async function updateFeatureFlag(
  flagName: string,
  updates: Partial<FeatureFlag>
): Promise<void> {
  const flag = flagCache[flagName];
  
  if (!flag) {
    throw new Error(`Feature flag ${flagName} not found`);
  }
  
  const updatedFlag: FeatureFlag = {
    ...flag,
    ...updates,
    metadata: {
      ...flag.metadata,
      updatedAt: new Date().toISOString()
    }
  };
  
  // Update in-memory cache
  flagCache[flagName] = updatedFlag;
  
  // Persist to Redis
  try {
    const redis = getRedisClient();
    await redis.set(
      `feature:flag:${flagName}`,
      JSON.stringify(updatedFlag),
      'EX',
      3600 // 1 hour TTL
    );
    
    logger.info({ flagName, updates }, 'Feature flag updated');
  } catch (error) {
    logger.error({ flagName, error }, 'Failed to persist feature flag to Redis');
  }
}

/**
 * Set tenant override for a feature flag
 */
export async function setTenantOverride(
  flagName: string,
  tenantId: string,
  enabled: boolean
): Promise<void> {
  const flag = flagCache[flagName];
  
  if (!flag) {
    throw new Error(`Feature flag ${flagName} not found`);
  }
  
  flag.tenantOverrides[tenantId] = enabled;
  flag.metadata.updatedAt = new Date().toISOString();
  
  await updateFeatureFlag(flagName, flag);
  
  logger.info({ flagName, tenantId, enabled }, 'Tenant override set');
}

/**
 * Load feature flags from Redis (for runtime sync)
 */
export async function loadFeatureFlagsFromRedis(): Promise<void> {
  try {
    const redis = getRedisClient();
    const keys = await redis.keys('feature:flag:*');
    
    for (const key of keys) {
      const flagName = key.replace('feature:flag:', '');
      const value = await redis.get(key);
      
      if (value) {
        const flag = JSON.parse(value) as FeatureFlag;
        flagCache[flagName] = flag;
      }
    }
    
    logger.info({ count: keys.length }, 'Feature flags loaded from Redis');
  } catch (error) {
    logger.warn({ error }, 'Failed to load feature flags from Redis, using defaults');
  }
}

/**
 * Simple hash function for consistent rollout
 */
function simpleHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash);
}

// =============================================================================
// FEATURE FLAG MIDDLEWARE
// =============================================================================

/**
 * Check feature flag and return 404 if disabled
 */
export function requireFeature(flagName: string) {
  return async (request: any, reply: any) => {
    const tenantId = request.tenantId || request.headers['x-tenant-id'];
    const userId = request.user?.id;
    
    if (!isFeatureEnabled(flagName, { tenantId, userId })) {
      reply.code(404).send({
        type: 'urn:error:compliance-service:not-found',
        title: 'Not Found',
        status: 404,
        detail: 'This feature is not available',
        instance: request.id
      });
      return;
    }
  };
}

// =============================================================================
// EXPORTS
// =============================================================================

export default {
  isFeatureEnabled,
  getAllFeatureFlags,
  getFeatureFlag,
  updateFeatureFlag,
  setTenantOverride,
  loadFeatureFlagsFromRedis,
  requireFeature
};
