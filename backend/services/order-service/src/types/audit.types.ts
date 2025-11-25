/**
 * Audit Log Types
 * 
 * Type definitions for comprehensive audit and compliance logging
 */

export type AuditLogType =
  | 'ADMIN_ACTION'
  | 'DATA_ACCESS'
  | 'DATA_MODIFICATION'
  | 'DATA_DELETION'
  | 'EXPORT'
  | 'LOGIN'
  | 'LOGOUT'
  | 'PERMISSION_CHANGE'
  | 'CONFIG_CHANGE'
  | 'SECURITY_EVENT'
  | 'PAYMENT_ACCESS'
  | 'PII_ACCESS'
  | 'REFUND_ACTION'
  | 'OVERRIDE_ACTION'
  | 'BULK_OPERATION'
  | 'API_CALL'
  | 'COMPLIANCE_EVENT';

export type AuditLogSeverity = 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL';

export interface AuditLogEntry {
  id: string;
  tenant_id: string;
  log_type: AuditLogType;
  severity: AuditLogSeverity;
  
  // Actor
  user_id?: string;
  username?: string;
  user_role?: string;
  user_email?: string;
  
  // Action
  action: string;
  description?: string;
  before_state?: Record<string, any>;
  after_state?: Record<string, any>;
  metadata?: Record<string, any>;
  
  // Resource
  resource_type?: string;
  resource_id?: string;
  resource_name?: string;
  
  // Request context
  ip_address?: string;
  user_agent?: string;
  request_id?: string;
  session_id?: string;
  api_key_id?: string;
  
  // Location
  country_code?: string;
  region?: string;
  city?: string;
  
  // Compliance flags
  is_pii_access: boolean;
  is_payment_access: boolean;
  requires_review: boolean;
  is_suspicious: boolean;
  
  // Timestamps
  created_at: Date;
  expires_at?: Date;
}

export interface CreateAuditLogParams {
  tenant_id: string;
  log_type: AuditLogType;
  action: string;
  severity?: AuditLogSeverity;
  
  // Optional actor info
  user_id?: string;
  username?: string;
  user_role?: string;
  user_email?: string;
  
  // Optional action details
  description?: string;
  before_state?: Record<string, any>;
  after_state?: Record<string, any>;
  metadata?: Record<string, any>;
  
  // Optional resource info
  resource_type?: string;
  resource_id?: string;
  resource_name?: string;
  
  // Optional request context
  ip_address?: string;
  user_agent?: string;
  request_id?: string;
  session_id?: string;
  api_key_id?: string;
  
  // Optional location
  country_code?: string;
  region?: string;
  city?: string;
  
  // Compliance flags (defaults to false)
  is_pii_access?: boolean;
  is_payment_access?: boolean;
  requires_review?: boolean;
  is_suspicious?: boolean;
}

export interface AuditLogFilters {
  tenant_id?: string;
  user_id?: string;
  log_type?: AuditLogType;
  severity?: AuditLogSeverity;
  resource_type?: string;
  resource_id?: string;
  is_pii_access?: boolean;
  is_payment_access?: boolean;
  requires_review?: boolean;
  is_suspicious?: boolean;
  start_date?: Date;
  end_date?: Date;
  ip_address?: string;
  session_id?: string;
}

export interface AuditLogStats {
  total_logs: number;
  by_type: Record<AuditLogType, number>;
  by_severity: Record<AuditLogSeverity, number>;
  pii_access_count: number;
  payment_access_count: number;
  requires_review_count: number;
  suspicious_count: number;
}

export interface DataAccessLogEntry {
  id: string;
  tenant_id: string;
  user_id: string;
  user_role: string;
  access_type: 'READ' | 'WRITE' | 'DELETE' | 'EXPORT' | 'SEARCH';
  resource_type: string;
  resource_id?: string;
  
  query_params?: Record<string, any>;
  filters_applied?: Record<string, any>;
  records_accessed?: number;
  records_modified?: number;
  
  accessed_pii: boolean;
  accessed_payment_data: boolean;
  accessed_health_data: boolean;
  pii_fields?: string[];
  
  ip_address: string;
  user_agent?: string;
  request_id?: string;
  session_id?: string;
  endpoint?: string;
  method?: string;
  
  purpose?: string;
  ticket_reference?: string;
  is_automated: boolean;
  
  requires_review: boolean;
  is_suspicious: boolean;
  suspicious_reason?: string;
  
  accessed_at: Date;
  created_at: Date;
}

export interface FinancialTransactionLog {
  id: string;
  tenant_id: string;
  order_id?: string;
  transaction_id: string;
  external_transaction_id?: string;
  payment_processor: string;
  
  transaction_type: 'PAYMENT' | 'REFUND' | 'CHARGEBACK' | 'FEE' | 'ADJUSTMENT';
  payment_method: string;
  amount_cents: number;
  currency: string;
  status: string;
  
  platform_fee_cents?: number;
  processing_fee_cents?: number;
  tax_cents?: number;
  net_amount_cents?: number;
  
  original_currency?: string;
  original_amount_cents?: number;
  exchange_rate?: number;
  exchange_rate_date?: Date;
  
  initiated_by?: string;
  approved_by?: string;
  approved_at?: Date;
  approval_reason?: string;
  
  fraud_score?: number;
  risk_level?: string;
  requires_manual_review: boolean;
  is_flagged: boolean;
  
  payment_details?: Record<string, any>;
  processor_response?: Record<string, any>;
  notes?: string;
  
  transaction_date: Date;
  created_at: Date;
}

export interface ComplianceReport {
  id: string;
  tenant_id: string;
  report_type: 'SOC2' | 'GDPR' | 'PCI_DSS' | 'HIPAA' | 'CUSTOM';
  report_period: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'QUARTERLY' | 'ANNUAL';
  period_start: Date;
  period_end: Date;
  
  status: 'GENERATING' | 'COMPLETED' | 'FAILED';
  progress_percentage: number;
  
  summary?: Record<string, any>;
  metrics?: Record<string, any>;
  findings?: any[];
  recommendations?: any[];
  report_url?: string;
  file_format?: 'PDF' | 'CSV' | 'JSON';
  file_size_bytes?: number;
  
  audit_logs_included?: number;
  access_logs_included?: number;
  transaction_logs_included?: number;
  evidence_summary?: Record<string, any>;
  
  generated_by?: string;
  reviewed_by?: string;
  approved_by?: string;
  reviewed_at?: Date;
  approved_at?: Date;
  reviewer_notes?: string;
  
  recipients?: string[];
  is_distributed: boolean;
  distributed_at?: Date;
  
  generated_at?: Date;
  created_at: Date;
  updated_at: Date;
}
