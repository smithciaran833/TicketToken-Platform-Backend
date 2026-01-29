/**
 * FRAUD SERIALIZER - Single Source of Truth for Safe Fraud Data
 *
 * SECURITY: This file defines the ONLY fields that are safe to return.
 * Fraud detection data is EXTREMELY SENSITIVE and should be heavily filtered.
 *
 * WARNING: Exposing fraud detection algorithms, scores, or signals to users
 * allows attackers to reverse-engineer and evade fraud detection.
 *
 * PUBLIC APIs: Should ONLY return pass/fail decisions, NOT scores or signals.
 * ADMIN APIs: Can return more detail but still filter sensitive detection logic.
 *
 * NEVER EXPOSE TO PUBLIC:
 * - score, risk_score (reveals detection thresholds)
 * - signals, reasons (reveals detection algorithms)
 * - device_fingerprint (tracking data)
 * - ip_address (PII)
 * - feature_values, feature_importance (ML model internals)
 *
 * Pattern for controllers:
 * 1. Import { serializeFraudCheckPublic } from '../serializers/fraud.serializer'
 * 2. Use serializeFraudCheckPublic() for user-facing APIs
 * 3. Use serializeFraudCheckAdmin() ONLY for admin dashboards
 */

/**
 * SAFE_FRAUD_CHECK_FIELDS_PUBLIC - Minimal fields for public/user-facing APIs.
 * Only shows the decision, NOT the reasoning.
 */
export const SAFE_FRAUD_CHECK_FIELDS_PUBLIC = [
  'id',
  'tenant_id',
  'user_id',
  'decision', // approve, review, challenge, decline - but NOT the scores
  'created_at',
] as const;

/**
 * ADMIN_FRAUD_CHECK_FIELDS - Extended fields for admin views.
 * Includes scores for human review, but NOT raw signals/fingerprints.
 */
export const ADMIN_FRAUD_CHECK_FIELDS = [
  'id',
  'tenant_id',
  'user_id',
  'payment_id',
  'score',
  'risk_score',
  'decision',
  'check_type',
  'timestamp',
  'created_at',
] as const;

/**
 * Fields that should NEVER be returned, even to admins.
 */
export const FORBIDDEN_FRAUD_FIELDS = [
  // CRITICAL - Detection Algorithm Exposure
  'signals',        // Reveals detection rules
  'reasons',        // Reveals why flagged
  'feature_values', // ML feature inputs
  'feature_importance', // ML model internals

  // CRITICAL - Tracking/PII Data
  'device_fingerprint',
  'ip_address',

  // HIGH RISK - Model Details
  'model_id',
  'predicted_class',
  'fraud_probability',
] as const;

/**
 * IP Reputation - SAFE fields for admin views only
 * Public APIs should NEVER return IP reputation data.
 */
export const ADMIN_IP_REPUTATION_FIELDS = [
  'ip_address',
  'risk_score',
  'reputation_status',
  'is_vpn',
  'is_proxy',
  'is_datacenter',
  'country_code',
  'last_seen',
  'blocked_at',
] as const;

/**
 * IP Reputation fields that are too sensitive even for most admins
 */
export const FORBIDDEN_IP_FIELDS = [
  'is_tor',      // Reveals Tor detection capability
  'asn',         // Too specific
  'geo_data',    // Raw geo data
  'first_seen',  // Tracking history
  'fraud_count', // Detection specifics
  'total_transactions', // Volume tracking
] as const;

// =============================================================================
// FRAUD CHECK TYPES
// =============================================================================

/**
 * Type for public fraud check response - minimal info
 */
export type PublicFraudCheck = {
  id: string;
  userId: string;
  decision: 'approve' | 'review' | 'challenge' | 'decline';
  createdAt: Date | string;
};

/**
 * Type for admin fraud check response - includes scores
 */
export type AdminFraudCheck = PublicFraudCheck & {
  tenantId: string;
  paymentId?: string | null;
  score?: number | null;
  riskScore?: number | null;
  checkType?: string | null;
  timestamp: Date | string;
};

/**
 * Type for admin IP reputation response
 */
export type AdminIPReputation = {
  ipAddress: string;
  riskScore: number;
  reputationStatus: string;
  isVpn: boolean;
  isProxy: boolean;
  isDatacenter: boolean;
  countryCode?: string | null;
  lastSeen: Date | string;
  blockedAt?: Date | string | null;
  riskLevel: 'low' | 'medium' | 'high' | 'blocked';
};

/**
 * Type for fraud rule (admin only)
 */
export type AdminFraudRule = {
  id: string;
  tenantId: string;
  ruleName: string;
  description?: string | null;
  ruleType: string;
  action: string;
  priority: number;
  isActive: boolean;
  triggerCount: number;
  createdAt: Date | string;
  updatedAt: Date | string;
  // Note: 'conditions' is intentionally excluded - internal logic
};

// =============================================================================
// FRAUD CHECK SERIALIZERS
// =============================================================================

/**
 * Serializes a fraud check for PUBLIC/user-facing APIs.
 * Only returns the decision, NOT the reasoning or scores.
 */
export function serializeFraudCheckPublic(check: Record<string, any>): PublicFraudCheck {
  if (!check) {
    throw new Error('Cannot serialize null or undefined fraud check');
  }

  return {
    id: check.id,
    userId: check.user_id,
    decision: check.decision,
    createdAt: check.created_at || check.timestamp,
  };
}

/**
 * Serializes multiple fraud checks for public APIs.
 */
export function serializeFraudChecksPublic(checks: Record<string, any>[]): PublicFraudCheck[] {
  if (!checks) {
    return [];
  }
  return checks.map(serializeFraudCheckPublic);
}

/**
 * Serializes a fraud check for ADMIN views.
 * Includes scores for human review.
 */
export function serializeFraudCheckAdmin(check: Record<string, any>): AdminFraudCheck {
  if (!check) {
    throw new Error('Cannot serialize null or undefined fraud check');
  }

  return {
    id: check.id,
    tenantId: check.tenant_id,
    userId: check.user_id,
    paymentId: check.payment_id ?? null,
    score: check.score ?? null,
    riskScore: check.risk_score ?? null,
    decision: check.decision,
    checkType: check.check_type ?? null,
    timestamp: check.timestamp,
    createdAt: check.created_at || check.timestamp,
  };
}

/**
 * Serializes multiple fraud checks for admin views.
 */
export function serializeFraudChecksAdmin(checks: Record<string, any>[]): AdminFraudCheck[] {
  if (!checks) {
    return [];
  }
  return checks.map(serializeFraudCheckAdmin);
}

// =============================================================================
// IP REPUTATION SERIALIZERS
// =============================================================================

/**
 * Serializes IP reputation for admin views.
 * Public APIs should NEVER return IP data.
 */
export function serializeIPReputationAdmin(reputation: Record<string, any>): AdminIPReputation {
  if (!reputation) {
    throw new Error('Cannot serialize null or undefined IP reputation');
  }

  // Calculate risk level from score
  const score = reputation.risk_score || 0;
  let riskLevel: 'low' | 'medium' | 'high' | 'blocked' = 'low';
  if (reputation.reputation_status === 'blocked') {
    riskLevel = 'blocked';
  } else if (score >= 70) {
    riskLevel = 'high';
  } else if (score >= 40) {
    riskLevel = 'medium';
  }

  return {
    ipAddress: reputation.ip_address,
    riskScore: score,
    reputationStatus: reputation.reputation_status || 'unknown',
    isVpn: reputation.is_vpn ?? false,
    isProxy: reputation.is_proxy ?? false,
    isDatacenter: reputation.is_datacenter ?? false,
    countryCode: reputation.country_code ?? null,
    lastSeen: reputation.last_seen,
    blockedAt: reputation.blocked_at ?? null,
    riskLevel,
  };
}

// =============================================================================
// FRAUD RULE SERIALIZERS
// =============================================================================

/**
 * Serializes a fraud rule for admin views.
 * Intentionally excludes 'conditions' which contains detection logic.
 */
export function serializeFraudRuleAdmin(rule: Record<string, any>): AdminFraudRule {
  if (!rule) {
    throw new Error('Cannot serialize null or undefined fraud rule');
  }

  return {
    id: rule.id,
    tenantId: rule.tenant_id,
    ruleName: rule.rule_name,
    description: rule.description ?? null,
    ruleType: rule.rule_type,
    action: rule.action,
    priority: rule.priority,
    isActive: rule.is_active ?? true,
    triggerCount: rule.trigger_count || 0,
    createdAt: rule.created_at,
    updatedAt: rule.updated_at,
    // Note: conditions intentionally excluded
  };
}

/**
 * Serializes multiple fraud rules for admin views.
 */
export function serializeFraudRulesAdmin(rules: Record<string, any>[]): AdminFraudRule[] {
  if (!rules) {
    return [];
  }
  return rules.map(serializeFraudRuleAdmin);
}

// =============================================================================
// VALIDATION HELPERS
// =============================================================================

/**
 * Validates that a response object contains no forbidden fields.
 */
export function findForbiddenFraudFields(obj: Record<string, any>): string[] {
  const found: string[] = [];

  for (const field of FORBIDDEN_FRAUD_FIELDS) {
    if (field in obj && obj[field] !== undefined) {
      found.push(field);
    }
  }

  const camelCaseForbidden = [
    'signals',
    'reasons',
    'featureValues',
    'featureImportance',
    'deviceFingerprint',
    'ipAddress',
    'modelId',
    'predictedClass',
    'fraudProbability',
  ];

  for (const field of camelCaseForbidden) {
    if (field in obj && obj[field] !== undefined) {
      found.push(field);
    }
  }

  return found;
}

/**
 * Validates IP reputation response for forbidden fields.
 */
export function findForbiddenIPFields(obj: Record<string, any>): string[] {
  const found: string[] = [];

  for (const field of FORBIDDEN_IP_FIELDS) {
    if (field in obj && obj[field] !== undefined) {
      found.push(field);
    }
  }

  const camelCaseForbidden = [
    'isTor',
    'asn',
    'geoData',
    'firstSeen',
    'fraudCount',
    'totalTransactions',
  ];

  for (const field of camelCaseForbidden) {
    if (field in obj && obj[field] !== undefined) {
      found.push(field);
    }
  }

  return found;
}
