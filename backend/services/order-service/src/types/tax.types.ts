// Enums
export enum JurisdictionType {
  COUNTRY = 'COUNTRY',
  STATE = 'STATE',
  COUNTY = 'COUNTY',
  CITY = 'CITY',
  SPECIAL_DISTRICT = 'SPECIAL_DISTRICT'
}

export enum TaxType {
  SALES_TAX = 'SALES_TAX',
  VAT = 'VAT',
  GST = 'GST',
  ENTERTAINMENT_TAX = 'ENTERTAINMENT_TAX',
  AMUSEMENT_TAX = 'AMUSEMENT_TAX',
  TOURISM_TAX = 'TOURISM_TAX',
  FACILITY_FEE = 'FACILITY_FEE'
}

export enum ExemptionType {
  NON_PROFIT = 'NON_PROFIT',
  GOVERNMENT = 'GOVERNMENT',
  RESELLER = 'RESELLER',
  DIPLOMATIC = 'DIPLOMATIC',
  EDUCATIONAL = 'EDUCATIONAL',
  RELIGIOUS = 'RELIGIOUS'
}

export enum VerificationStatus {
  PENDING = 'PENDING',
  VERIFIED = 'VERIFIED',
  REJECTED = 'REJECTED',
  EXPIRED = 'EXPIRED'
}

export enum CalculationMethod {
  MANUAL = 'MANUAL',
  AUTOMATED = 'AUTOMATED',
  API_CALCULATED = 'API_CALCULATED'
}

export enum TaxProvider {
  MANUAL = 'MANUAL',
  AVALARA = 'AVALARA',
  TAXJAR = 'TAXJAR',
  VERTEX = 'VERTEX'
}

export enum ReportStatus {
  DRAFT = 'DRAFT',
  FILED = 'FILED',
  AMENDED = 'AMENDED',
  ACCEPTED = 'ACCEPTED'
}

export enum ReportType {
  SALES_TAX = 'SALES_TAX',
  VAT_RETURN = 'VAT_RETURN',
  GST_RETURN = 'GST_RETURN'
}

// Address Interface
export interface TaxAddress {
  line1: string;
  line2?: string;
  city: string;
  state?: string;
  postal_code: string;
  country: string;
}

// Tax Jurisdiction
export interface TaxJurisdiction {
  id: string;
  tenant_id: string;
  jurisdiction_code: string;
  jurisdiction_name: string;
  jurisdiction_type: JurisdictionType;
  parent_jurisdiction_id?: string;
  country_code: string;
  state_code?: string;
  county_name?: string;
  city_name?: string;
  postal_codes?: string[];
  active: boolean;
  metadata?: Record<string, any>;
  created_at: Date;
  updated_at: Date;
}

export interface CreateTaxJurisdictionRequest {
  jurisdiction_code: string;
  jurisdiction_name: string;
  jurisdiction_type: JurisdictionType;
  parent_jurisdiction_id?: string;
  country_code: string;
  state_code?: string;
  county_name?: string;
  city_name?: string;
  postal_codes?: string[];
  metadata?: Record<string, any>;
}

// Tax Rate
export interface TaxRate {
  id: string;
  tenant_id: string;
  jurisdiction_id: string;
  tax_type: TaxType;
  rate_percentage: number;
  effective_from: Date;
  effective_to?: Date;
  applies_to_tickets: boolean;
  applies_to_fees: boolean;
  applies_to_shipping: boolean;
  minimum_amount_cents?: number;
  maximum_amount_cents?: number;
  compound_order: number;
  active: boolean;
  metadata?: Record<string, any>;
  created_at: Date;
  updated_at: Date;
}

export interface CreateTaxRateRequest {
  jurisdiction_id: string;
  tax_type: TaxType;
  rate_percentage: number;
  effective_from: Date;
  effective_to?: Date;
  applies_to_tickets?: boolean;
  applies_to_fees?: boolean;
  applies_to_shipping?: boolean;
  minimum_amount_cents?: number;
  maximum_amount_cents?: number;
  compound_order?: number;
  metadata?: Record<string, any>;
}

// Tax Category
export interface TaxCategory {
  id: string;
  tenant_id: string;
  category_code: string;
  category_name: string;
  description?: string;
  is_exempt: boolean;
  requires_exemption_certificate: boolean;
  active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface CreateTaxCategoryRequest {
  category_code: string;
  category_name: string;
  description?: string;
  is_exempt?: boolean;
  requires_exemption_certificate?: boolean;
}

// Tax Exemption
export interface TaxExemption {
  id: string;
  tenant_id: string;
  customer_id: string;
  exemption_type: ExemptionType;
  exemption_certificate_number?: string;
  issuing_authority?: string;
  jurisdiction_id?: string;
  valid_from: Date;
  valid_to?: Date;
  certificate_file_url?: string;
  verification_status: VerificationStatus;
  verified_at?: Date;
  verified_by?: string;
  notes?: string;
  active: boolean;
  metadata?: Record<string, any>;
  created_at: Date;
  updated_at: Date;
}

export interface CreateTaxExemptionRequest {
  customer_id: string;
  exemption_type: ExemptionType;
  exemption_certificate_number?: string;
  issuing_authority?: string;
  jurisdiction_id?: string;
  valid_from: Date;
  valid_to?: Date;
  certificate_file_url?: string;
  notes?: string;
  metadata?: Record<string, any>;
}

// Order Tax Calculation
export interface OrderTaxCalculation {
  id: string;
  tenant_id: string;
  order_id: string;
  calculation_method: CalculationMethod;
  external_provider?: TaxProvider;
  external_transaction_id?: string;
  billing_address: TaxAddress;
  shipping_address?: TaxAddress;
  taxable_amount_cents: number;
  total_tax_cents: number;
  is_estimate: boolean;
  calculation_timestamp: Date;
  created_at: Date;
  updated_at: Date;
}

export interface OrderTaxLineItem {
  id: string;
  tenant_id: string;
  order_tax_calculation_id: string;
  jurisdiction_id?: string;
  tax_rate_id?: string;
  tax_type: TaxType;
  jurisdiction_name: string;
  rate_percentage: number;
  taxable_amount_cents: number;
  tax_amount_cents: number;
  is_compound: boolean;
  calculation_order: number;
  metadata?: Record<string, any>;
  created_at: Date;
}

export interface TaxCalculationRequest {
  order_id: string;
  billing_address: TaxAddress;
  shipping_address?: TaxAddress;
  line_items: Array<{
    amount_cents: number;
    category_code?: string;
    description: string;
  }>;
  customer_exemption_id?: string;
}

export interface TaxCalculationResult {
  total_tax_cents: number;
  taxable_amount_cents: number;
  line_items: OrderTaxLineItem[];
  is_estimate: boolean;
  calculation_method: CalculationMethod;
  external_transaction_id?: string;
}

// Tax Reporting
export interface TaxReport {
  id: string;
  tenant_id: string;
  report_type: ReportType;
  jurisdiction_id?: string;
  period_start: Date;
  period_end: Date;
  total_sales_cents: number;
  taxable_sales_cents: number;
  exempt_sales_cents: number;
  total_tax_collected_cents: number;
  total_tax_refunded_cents: number;
  net_tax_due_cents: number;
  report_status: ReportStatus;
  filed_at?: Date;
  filed_by?: string;
  filing_reference?: string;
  report_data: Record<string, any>;
  notes?: string;
  created_at: Date;
  updated_at: Date;
}

export interface CreateTaxReportRequest {
  report_type: ReportType;
  jurisdiction_id?: string;
  period_start: Date;
  period_end: Date;
}

export interface TaxReportData {
  jurisdiction_breakdown: Array<{
    jurisdiction_id: string;
    jurisdiction_name: string;
    total_sales_cents: number;
    taxable_sales_cents: number;
    tax_collected_cents: number;
  }>;
  tax_type_breakdown: Array<{
    tax_type: TaxType;
    taxable_amount_cents: number;
    tax_amount_cents: number;
  }>;
  order_count: number;
  refund_count: number;
}

// Tax Provider Configuration
export interface TaxProviderConfig {
  id: string;
  tenant_id: string;
  provider_name: TaxProvider;
  api_key_encrypted?: string;
  account_id?: string;
  company_code?: string;
  environment: 'sandbox' | 'production';
  enabled: boolean;
  auto_commit: boolean;
  configuration?: Record<string, any>;
  created_at: Date;
  updated_at: Date;
}

export interface CreateTaxProviderConfigRequest {
  provider_name: TaxProvider;
  api_key?: string;
  account_id?: string;
  company_code?: string;
  environment?: 'sandbox' | 'production';
  enabled?: boolean;
  auto_commit?: boolean;
  configuration?: Record<string, any>;
}

// Tax lookup/validation
export interface TaxJurisdictionLookupRequest {
  address: TaxAddress;
}

export interface TaxJurisdictionLookupResult {
  jurisdictions: TaxJurisdiction[];
  applicable_rates: TaxRate[];
}

// Validation/Update requests
export interface UpdateTaxJurisdictionRequest extends Partial<CreateTaxJurisdictionRequest> {}
export interface UpdateTaxRateRequest extends Partial<CreateTaxRateRequest> {}
export interface UpdateTaxCategoryRequest extends Partial<CreateTaxCategoryRequest> {}
export interface UpdateTaxExemptionRequest extends Partial<CreateTaxExemptionRequest> {}
