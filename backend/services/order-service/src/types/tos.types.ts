export enum AcceptanceMethod {
  CHECKBOX = 'CHECKBOX',
  BUTTON_CLICK = 'BUTTON_CLICK',
  IMPLICIT = 'IMPLICIT',
  API = 'API'
}

export enum VerificationMethod {
  SELF_DECLARATION = 'SELF_DECLARATION',
  ID_VERIFICATION = 'ID_VERIFICATION',
  THIRD_PARTY = 'THIRD_PARTY'
}

export enum VerificationStatus {
  PENDING = 'PENDING',
  VERIFIED = 'VERIFIED',
  REJECTED = 'REJECTED',
  EXPIRED = 'EXPIRED'
}

export enum RestrictionType {
  COUNTRY_BLOCK = 'COUNTRY_BLOCK',
  COUNTRY_ALLOW = 'COUNTRY_ALLOW',
  REGION_BLOCK = 'REGION_BLOCK',
  REGION_ALLOW = 'REGION_ALLOW'
}

export enum ViolationType {
  TOS_NOT_ACCEPTED = 'TOS_NOT_ACCEPTED',
  AGE_RESTRICTION = 'AGE_RESTRICTION',
  GEO_RESTRICTION = 'GEO_RESTRICTION',
  EXPIRED_TOS = 'EXPIRED_TOS'
}

export enum ConsentType {
  MARKETING = 'MARKETING',
  DATA_SHARING = 'DATA_SHARING',
  COOKIES = 'COOKIES',
  ANALYTICS = 'ANALYTICS',
  THIRD_PARTY = 'THIRD_PARTY'
}

export interface TOSVersion {
  id: string;
  tenant_id: string;
  version_number: string;
  title: string;
  content_url: string;
  content_hash: string;
  effective_date: Date;
  expiry_date?: Date;
  requires_acceptance: boolean;
  minimum_age: number;
  geographic_restrictions?: Record<string, any>;
  change_summary?: string;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface TOSAcceptance {
  id: string;
  tenant_id: string;
  user_id: string;
  tos_version_id: string;
  accepted_at: Date;
  ip_address?: string;
  user_agent?: string;
  acceptance_method?: AcceptanceMethod;
  age_verified: boolean;
  age_declared?: number;
  location_country?: string;
  location_region?: string;
  metadata?: Record<string, any>;
  created_at: Date;
}

export interface AgeVerification {
  id: string;
  tenant_id: string;
  user_id: string;
  verification_method: VerificationMethod;
  declared_birth_date?: Date;
  verified_age?: number;
  verification_status: VerificationStatus;
  verification_provider?: string;
  verification_reference?: string;
  verified_at?: Date;
  expires_at?: Date;
  metadata?: Record<string, any>;
  created_at: Date;
  updated_at: Date;
}

export interface GeographicRestriction {
  id: string;
  tenant_id: string;
  restriction_type: RestrictionType;
  country_code?: string;
  region_code?: string;
  effective_from: Date;
  effective_to?: Date;
  reason?: string;
  active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface AccessViolation {
  id: string;
  tenant_id: string;
  user_id?: string;
  violation_type: ViolationType;
  tos_version_id?: string;
  attempted_action?: string;
  ip_address?: string;
  user_agent?: string;
  location_country?: string;
  location_region?: string;
  blocked: boolean;
  metadata?: Record<string, any>;
  created_at: Date;
}

export interface ConsentRecord {
  id: string;
  tenant_id: string;
  user_id: string;
  consent_type: ConsentType;
  consent_given: boolean;
  consent_timestamp: Date;
  expiry_timestamp?: Date;
  withdrawal_timestamp?: Date;
  ip_address?: string;
  user_agent?: string;
  metadata?: Record<string, any>;
  created_at: Date;
  updated_at: Date;
}

export interface CreateTOSVersionRequest {
  version_number: string;
  title: string;
  content_url: string;
  content_hash: string;
  effective_date: Date;
  expiry_date?: Date;
  requires_acceptance?: boolean;
  minimum_age?: number;
  geographic_restrictions?: Record<string, any>;
  change_summary?: string;
}

export interface AcceptTOSRequest {
  tos_version_id: string;
  ip_address?: string;
  user_agent?: string;
  acceptance_method?: AcceptanceMethod;
  age_declared?: number;
  location_country?: string;
  location_region?: string;
}

export interface CheckComplianceRequest {
  user_id: string;
  ip_address?: string;
  location_country?: string;
  location_region?: string;
}

export interface ComplianceResult {
  compliant: boolean;
  tos_accepted: boolean;
  tos_current: boolean;
  age_verified: boolean;
  geo_allowed: boolean;
  violations: string[];
  required_tos_version?: string;
}
