/**
 * Privacy & GDPR Types
 * 
 * Type definitions for GDPR compliance features including
 * data access requests, data deletion, and consent management
 */

// ============================================================================
// Data Access Request Types (GDPR Article 15)
// ============================================================================

export enum DataAccessRequestStatus {
  PENDING = 'PENDING',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  EXPIRED = 'EXPIRED',
}

export enum DataExportFormat {
  JSON = 'JSON',
  CSV = 'CSV',
  PDF = 'PDF',
}

export interface DataAccessRequest {
  id: string;
  tenant_id: string;
  user_id: string;
  email: string;
  status: DataAccessRequestStatus;
  format: DataExportFormat;
  requested_at: Date;
  started_at?: Date;
  completed_at?: Date;
  expires_at?: Date;
  file_path?: string;
  file_size_bytes?: string;
  download_token?: string;
  download_count: number;
  error_message?: string;
  error_details?: Record<string, any>;
  ip_address?: string;
  user_agent?: string;
  metadata?: Record<string, any>;
  created_at: Date;
  updated_at: Date;
}

export interface DataExportContent {
  id: string;
  request_id: string;
  data_category: string;
  record_count: number;
  table_name: string;
  fields_included?: string[];
  size_bytes?: string;
  created_at: Date;
  updated_at: Date;
}

export enum DataAccessAction {
  EXPORT_REQUESTED = 'EXPORT_REQUESTED',
  EXPORT_DOWNLOADED = 'EXPORT_DOWNLOADED',
  DATA_VIEWED = 'DATA_VIEWED',
  DATA_MODIFIED = 'DATA_MODIFIED',
  DATA_DELETED = 'DATA_DELETED',
}

export interface DataAccessAuditLog {
  id: string;
  tenant_id: string;
  user_id: string;
  action: DataAccessAction;
  request_id?: string;
  resource_type?: string;
  resource_id?: string;
  accessed_fields?: string[];
  accessed_by_user_id?: string;
  ip_address?: string;
  user_agent?: string;
  accessed_at: Date;
  metadata?: Record<string, any>;
}

// Request/Response DTOs
export interface CreateDataAccessRequestDto {
  format?: DataExportFormat;
  email?: string;
}

export interface DataAccessRequestResponse {
  id: string;
  status: DataAccessRequestStatus;
  format: DataExportFormat;
  requested_at: Date;
  estimated_completion?: Date;
  download_url?: string;
  expires_at?: Date;
}

// User data export structure
export interface UserDataExport {
  user_id: string;
  email: string;
  exported_at: Date;
  format: DataExportFormat;
  data: {
    profile?: any;
    orders?: any[];
    payments?: any[];
    refunds?: any[];
    notes?: any[];
    interactions?: any[];
    notifications?: any[];
    consent_records?: any[];
    [key: string]: any;
  };
  metadata: {
    total_records: number;
    data_categories: string[];
    export_size_bytes: number;
  };
}

// ============================================================================
// Data Deletion Types (GDPR Article 17)
// ============================================================================

export enum DataDeletionRequestStatus {
  PENDING = 'PENDING',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  REJECTED = 'REJECTED',
  FAILED = 'FAILED',
}

export enum DeletionStrategy {
  HARD_DELETE = 'HARD_DELETE',           // Permanent deletion
  SOFT_DELETE = 'SOFT_DELETE',           // Mark as deleted
  ANONYMIZE = 'ANONYMIZE',               // Replace PII with hashed values
}

export interface DataDeletionRequest {
  id: string;
  tenant_id: string;
  user_id: string;
  email: string;
  status: DataDeletionRequestStatus;
  strategy: DeletionStrategy;
  reason?: string;
  requested_at: Date;
  started_at?: Date;
  completed_at?: Date;
  rejected_reason?: string;
  tables_affected?: string[];
  records_deleted: number;
  records_anonymized: number;
  retention_exceptions?: string[]; // Tables exempt from deletion (e.g., financial records)
  ip_address?: string;
  user_agent?: string;
  metadata?: Record<string, any>;
  created_at: Date;
  updated_at: Date;
}

export interface DeletionAuditLog {
  id: string;
  request_id: string;
  table_name: string;
  record_id: string;
  action: 'DELETED' | 'ANONYMIZED';
  original_data?: Record<string, any>; // For audit purposes only
  performed_at: Date;
  performed_by_user_id?: string;
}

// Request/Response DTOs
export interface CreateDataDeletionRequestDto {
  reason?: string;
  strategy?: DeletionStrategy;
}

export interface DataDeletionRequestResponse {
  id: string;
  status: DataDeletionRequestStatus;
  estimated_completion?: Date;
  affected_data_categories: string[];
  retention_notices?: string[];
}

// ============================================================================
// Consent Management Types (GDPR Article 6)
// ============================================================================

export enum ConsentPurpose {
  MARKETING = 'MARKETING',
  ANALYTICS = 'ANALYTICS',
  THIRD_PARTY_SHARING = 'THIRD_PARTY_SHARING',
  PROFILING = 'PROFILING',
  PERSONALIZATION = 'PERSONALIZATION',
  RESEARCH = 'RESEARCH',
}

export enum ConsentStatus {
  GRANTED = 'GRANTED',
  DENIED = 'DENIED',
  WITHDRAWN = 'WITHDRAWN',
  EXPIRED = 'EXPIRED',
}

export interface ConsentRecord {
  id: string;
  tenant_id: string;
  user_id: string;
  purpose: ConsentPurpose;
  status: ConsentStatus;
  granted_at?: Date;
  denied_at?: Date;
  withdrawn_at?: Date;
  expires_at?: Date;
  version: number; // TOS version this consent is for
  ip_address?: string;
  user_agent?: string;
  metadata?: Record<string, any>;
  created_at: Date;
  updated_at: Date;
}

export interface ConsentAuditLog {
  id: string;
  consent_id: string;
  action: 'GRANTED' | 'DENIED' | 'WITHDRAWN' | 'EXPIRED';
  previous_status?: ConsentStatus;
  new_status: ConsentStatus;
  changed_at: Date;
  ip_address?: string;
  user_agent?: string;
  metadata?: Record<string, any>;
}

// Request/Response DTOs
export interface UpdateConsentDto {
  purpose: ConsentPurpose;
  granted: boolean; // true = grant, false = deny/withdraw
  version?: number;
}

export interface ConsentStatusResponse {
  user_id: string;
  consents: {
    [key in ConsentPurpose]?: {
      status: ConsentStatus;
      granted_at?: Date;
      expires_at?: Date;
    };
  };
}

// ============================================================================
// PII (Personally Identifiable Information) Types
// ============================================================================

export interface PIIField {
  field_name: string;
  data_type: 'email' | 'phone' | 'name' | 'address' | 'ip' | 'credit_card' | 'ssn' | 'other';
  needs_encryption: boolean;
  needs_redaction: boolean; // In logs
  retention_period_days?: number;
}

export interface PIIAnonymizationResult {
  original_value?: string; // For audit log only
  anonymized_value: string;
  anonymization_method: 'hash' | 'truncate' | 'mask' | 'random';
  anonymized_at: Date;
}

// ============================================================================
// Data Retention Types
// ============================================================================

export enum RetentionCategory {
  USER_PROFILE = 'USER_PROFILE',
  ORDERS = 'ORDERS',
  PAYMENTS = 'PAYMENTS',
  FINANCIAL_RECORDS = 'FINANCIAL_RECORDS', // 7 years for compliance
  LOGS = 'LOGS',
  TEMPORARY_DATA = 'TEMPORARY_DATA',
  ABANDONED_CARTS = 'ABANDONED_CARTS',
}

export interface RetentionPolicy {
  category: RetentionCategory;
  retention_period_days: number;
  deletion_strategy: DeletionStrategy;
  legal_hold: boolean; // If true, cannot be deleted
  description: string;
}

export interface RetentionSchedule {
  id: string;
  tenant_id: string;
  policy: RetentionPolicy;
  last_cleanup_at?: Date;
  next_cleanup_at: Date;
  records_cleaned: number;
  created_at: Date;
  updated_at: Date;
}

// ============================================================================
// Service Interfaces
// ============================================================================

export interface IDataAccessService {
  createAccessRequest(userId: string, tenantId: string, dto: CreateDataAccessRequestDto): Promise<DataAccessRequest>;
  getAccessRequest(requestId: string, userId: string): Promise<DataAccessRequest>;
  getUserAccessRequests(userId: string, tenantId: string): Promise<DataAccessRequest[]>;
  processAccessRequest(requestId: string): Promise<UserDataExport>;
  downloadExport(requestId: string, downloadToken: string): Promise<Buffer>;
  cleanupExpiredExports(): Promise<number>;
}

export interface IDataDeletionService {
  createDeletionRequest(userId: string, tenantId: string, dto: CreateDataDeletionRequestDto): Promise<DataDeletionRequest>;
  getDeletionRequest(requestId: string, userId: string): Promise<DataDeletionRequest>;
  processDeletionRequest(requestId: string): Promise<void>;
  anonymizeUserData(userId: string, tenantId: string): Promise<number>;
  hardDeleteUserData(userId: string, tenantId: string): Promise<number>;
}

export interface IConsentService {
  getConsent(userId: string, purpose: ConsentPurpose): Promise<ConsentRecord | null>;
  getAllConsents(userId: string, tenantId: string): Promise<ConsentRecord[]>;
  updateConsent(userId: string, tenantId: string, dto: UpdateConsentDto): Promise<ConsentRecord>;
  withdrawConsent(userId: string, purpose: ConsentPurpose): Promise<ConsentRecord>;
  checkConsent(userId: string, purpose: ConsentPurpose): Promise<boolean>;
}
