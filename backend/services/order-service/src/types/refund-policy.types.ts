// Refund Policy Types

export enum RefundRuleType {
  TIME_BASED = 'TIME_BASED',
  PERCENTAGE = 'PERCENTAGE',
  TIERED = 'TIERED',
  FLAT_FEE = 'FLAT_FEE',
  NO_REFUND = 'NO_REFUND'
}

export enum RegulationType {
  FTC_16_CFR_424 = 'FTC_16_CFR_424',
  STATE_LAW_NY = 'STATE_LAW_NY',
  STATE_LAW_CA = 'STATE_LAW_CA',
  EU_CONSUMER_RIGHTS = 'EU_CONSUMER_RIGHTS',
  CCPA = 'CCPA',
  INTERNAL_POLICY = 'INTERNAL_POLICY'
}

export interface RefundPolicy {
  id: string;
  tenant_id: string;
  policy_name: string;
  description?: string;
  refund_window_hours: number;
  pro_rated: boolean;
  conditions?: Record<string, any>;
  event_type?: string;
  ticket_type?: string;
  active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface RefundPolicyRule {
  id: string;
  policy_id: string;
  rule_type: RefundRuleType;
  rule_config: TimeBasedRuleConfig | PercentageRuleConfig | TieredRuleConfig | FlatFeeRuleConfig;
  priority: number;
  active: boolean;
  created_at: Date;
}

// Rule Configuration Types

export interface TimeBasedRuleConfig {
  tiers: Array<{
    hours_before_event: number;
    refund_percentage: number; // 0-100
  }>;
}

export interface PercentageRuleConfig {
  percentage: number; // 0-100
  apply_to: 'ORDER_TOTAL' | 'TICKET_PRICE_ONLY' | 'EXCLUDING_FEES';
}

export interface TieredRuleConfig {
  tiers: Array<{
    min_amount_cents?: number;
    max_amount_cents?: number;
    refund_percentage: number;
  }>;
}

export interface FlatFeeRuleConfig {
  fee_cents: number;
  deduct_from_refund: boolean;
}

export interface RefundReason {
  id: string;
  tenant_id: string;
  reason_code: string;
  reason_text: string;
  description?: string;
  requires_documentation: boolean;
  internal_only: boolean;
  auto_approve: boolean;
  priority: number;
  active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface RefundEligibility {
  eligible: boolean;
  policy_id?: string;
  policy_name?: string;
  refund_amount_cents: number;
  original_amount_cents: number;
  refund_percentage: number;
  deductions: Array<{
    description: string;
    amount_cents: number;
  }>;
  reasons?: string[];
  calculation_details: Record<string, any>;
}

export interface RefundComplianceLog {
  id: string;
  refund_id: string;
  tenant_id: string;
  regulation_type: RegulationType;
  compliance_check: string;
  passed: boolean;
  details?: string;
  metadata?: Record<string, any>;
  checked_at: Date;
}

export interface RefundEligibilityRequest {
  order_id: string;
  tenant_id: string;
  reason_id?: string;
  requested_amount_cents?: number; // For partial refunds
  event_date?: Date;
}

export interface CreateRefundPolicyRequest {
  policy_name: string;
  description?: string;
  refund_window_hours: number;
  pro_rated: boolean;
  conditions?: Record<string, any>;
  event_type?: string;
  ticket_type?: string;
}

export interface CreateRefundPolicyRuleRequest {
  policy_id: string;
  rule_type: RefundRuleType;
  rule_config: TimeBasedRuleConfig | PercentageRuleConfig | TieredRuleConfig | FlatFeeRuleConfig;
  priority?: number;
}

export interface CreateRefundReasonRequest {
  reason_code: string;
  reason_text: string;
  description?: string;
  requires_documentation?: boolean;
  internal_only?: boolean;
  auto_approve?: boolean;
  priority?: number;
}

// Compliance check results
export interface ComplianceCheckResult {
  regulation_type: RegulationType;
  check_name: string;
  passed: boolean;
  details: string;
  metadata?: Record<string, any>;
}

// Pro-rated refund calculation
export interface ProRatedCalculation {
  total_period_hours: number;
  elapsed_hours: number;
  remaining_hours: number;
  usage_percentage: number;
  refund_percentage: number;
  refund_amount_cents: number;
}
