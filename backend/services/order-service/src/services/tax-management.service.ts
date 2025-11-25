import { Pool } from 'pg';
import { getDatabase } from '../config/database';
import {
  TaxJurisdiction,
  CreateTaxJurisdictionRequest,
  UpdateTaxJurisdictionRequest,
  TaxRate,
  CreateTaxRateRequest,
  UpdateTaxRateRequest,
  TaxCategory,
  CreateTaxCategoryRequest,
  UpdateTaxCategoryRequest,
  TaxExemption,
  CreateTaxExemptionRequest,
  UpdateTaxExemptionRequest,
  TaxProviderConfig,
  CreateTaxProviderConfigRequest,
  TaxReport,
  CreateTaxReportRequest,
  TaxReportData,
  ReportStatus
} from '../types/tax.types';

export class TaxManagementService {
  private db: Pool;

  constructor() {
    this.db = getDatabase();
  }

  // Jurisdiction Management
  async createJurisdiction(tenantId: string, request: CreateTaxJurisdictionRequest): Promise<TaxJurisdiction> {
    const query = `
      INSERT INTO tax_jurisdictions (
        tenant_id, jurisdiction_code, jurisdiction_name, jurisdiction_type,
        parent_jurisdiction_id, country_code, state_code, county_name,
        city_name, postal_codes, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *
    `;

    const values = [
      tenantId,
      request.jurisdiction_code,
      request.jurisdiction_name,
      request.jurisdiction_type,
      request.parent_jurisdiction_id || null,
      request.country_code,
      request.state_code || null,
      request.county_name || null,
      request.city_name || null,
      request.postal_codes || null,
      request.metadata ? JSON.stringify(request.metadata) : null
    ];

    const result = await this.db.query(query, values);
    return result.rows[0];
  }

  async getJurisdictions(tenantId: string, activeOnly: boolean = true): Promise<TaxJurisdiction[]> {
    let query = 'SELECT * FROM tax_jurisdictions WHERE tenant_id = $1';
    if (activeOnly) query += ' AND active = true';
    query += ' ORDER BY jurisdiction_name';

    const result = await this.db.query(query, [tenantId]);
    return result.rows;
  }

  async updateJurisdiction(jurisdictionId: string, tenantId: string, updates: UpdateTaxJurisdictionRequest): Promise<TaxJurisdiction | null> {
    const fields: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    Object.entries(updates).forEach(([key, value]) => {
      if (value !== undefined) {
        fields.push(`${key} = $${paramIndex++}`);
        values.push(key === 'metadata' && value ? JSON.stringify(value) : value);
      }
    });

    if (fields.length === 0) return null;

    fields.push('updated_at = NOW()');
    values.push(jurisdictionId, tenantId);

    const query = `
      UPDATE tax_jurisdictions SET ${fields.join(', ')}
      WHERE id = $${paramIndex++} AND tenant_id = $${paramIndex++}
      RETURNING *
    `;

    const result = await this.db.query(query, values);
    return result.rows[0] || null;
  }

  // Tax Rate Management
  async createTaxRate(tenantId: string, request: CreateTaxRateRequest): Promise<TaxRate> {
    const query = `
      INSERT INTO tax_rates (
        tenant_id, jurisdiction_id, tax_type, rate_percentage, effective_from,
        effective_to, applies_to_tickets, applies_to_fees, applies_to_shipping,
        minimum_amount_cents, maximum_amount_cents, compound_order, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING *
    `;

    const values = [
      tenantId,
      request.jurisdiction_id,
      request.tax_type,
      request.rate_percentage,
      request.effective_from,
      request.effective_to || null,
      request.applies_to_tickets ?? true,
      request.applies_to_fees ?? false,
      request.applies_to_shipping ?? false,
      request.minimum_amount_cents || null,
      request.maximum_amount_cents || null,
      request.compound_order ?? 1,
      request.metadata ? JSON.stringify(request.metadata) : null
    ];

    const result = await this.db.query(query, values);
    return result.rows[0];
  }

  async getTaxRates(tenantId: string, jurisdictionId?: string): Promise<TaxRate[]> {
    let query = 'SELECT * FROM tax_rates WHERE tenant_id = $1 AND active = true';
    const values: any[] = [tenantId];

    if (jurisdictionId) {
      query += ' AND jurisdiction_id = $2';
      values.push(jurisdictionId);
    }

    query += ' ORDER BY effective_from DESC';
    const result = await this.db.query(query, values);
    return result.rows;
  }

  // Tax Category Management
  async createTaxCategory(tenantId: string, request: CreateTaxCategoryRequest): Promise<TaxCategory> {
    const query = `
      INSERT INTO tax_categories (
        tenant_id, category_code, category_name, description,
        is_exempt, requires_exemption_certificate
      ) VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `;

    const values = [
      tenantId,
      request.category_code,
      request.category_name,
      request.description || null,
      request.is_exempt ?? false,
      request.requires_exemption_certificate ?? false
    ];

    const result = await this.db.query(query, values);
    return result.rows[0];
  }

  async getTaxCategories(tenantId: string): Promise<TaxCategory[]> {
    const query = 'SELECT * FROM tax_categories WHERE tenant_id = $1 AND active = true ORDER BY category_name';
    const result = await this.db.query(query, [tenantId]);
    return result.rows;
  }

  // Tax Exemption Management
  async createTaxExemption(tenantId: string, request: CreateTaxExemptionRequest): Promise<TaxExemption> {
    const query = `
      INSERT INTO tax_exemptions (
        tenant_id, customer_id, exemption_type, exemption_certificate_number,
        issuing_authority, jurisdiction_id, valid_from, valid_to,
        certificate_file_url, notes, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *
    `;

    const values = [
      tenantId,
      request.customer_id,
      request.exemption_type,
      request.exemption_certificate_number || null,
      request.issuing_authority || null,
      request.jurisdiction_id || null,
      request.valid_from,
      request.valid_to || null,
      request.certificate_file_url || null,
      request.notes || null,
      request.metadata ? JSON.stringify(request.metadata) : null
    ];

    const result = await this.db.query(query, values);
    return result.rows[0];
  }

  async getCustomerExemptions(tenantId: string, customerId: string): Promise<TaxExemption[]> {
    const query = `
      SELECT * FROM tax_exemptions
      WHERE tenant_id = $1 AND customer_id = $2 AND active = true
      ORDER BY created_at DESC
    `;

    const result = await this.db.query(query, [tenantId, customerId]);
    return result.rows;
  }

  async verifyExemption(exemptionId: string, tenantId: string, verifiedBy: string): Promise<TaxExemption | null> {
    const query = `
      UPDATE tax_exemptions
      SET verification_status = 'VERIFIED',
          verified_at = NOW(),
          verified_by = $3,
          updated_at = NOW()
      WHERE id = $1 AND tenant_id = $2
      RETURNING *
    `;

    const result = await this.db.query(query, [exemptionId, tenantId, verifiedBy]);
    return result.rows[0] || null;
  }

  // Tax Provider Configuration
  async configureTaxProvider(tenantId: string, request: CreateTaxProviderConfigRequest): Promise<TaxProviderConfig> {
    const query = `
      INSERT INTO tax_provider_configs (
        tenant_id, provider_name, api_key_encrypted, account_id,
        company_code, environment, enabled, auto_commit, configuration
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      ON CONFLICT (tenant_id, provider_name)
      DO UPDATE SET
        api_key_encrypted = EXCLUDED.api_key_encrypted,
        account_id = EXCLUDED.account_id,
        company_code = EXCLUDED.company_code,
        environment = EXCLUDED.environment,
        enabled = EXCLUDED.enabled,
        auto_commit = EXCLUDED.auto_commit,
        configuration = EXCLUDED.configuration,
        updated_at = NOW()
      RETURNING *
    `;

    const values = [
      tenantId,
      request.provider_name,
      request.api_key || null, // In production, encrypt this
      request.account_id || null,
      request.company_code || null,
      request.environment || 'production',
      request.enabled ?? true,
      request.auto_commit ?? false,
      request.configuration ? JSON.stringify(request.configuration) : null
    ];

    const result = await this.db.query(query, values);
    return result.rows[0];
  }

  async getTaxProviderConfig(tenantId: string): Promise<TaxProviderConfig | null> {
    const query = 'SELECT * FROM tax_provider_configs WHERE tenant_id = $1 AND enabled = true LIMIT 1';
    const result = await this.db.query(query, [tenantId]);
    return result.rows[0] || null;
  }

  // Tax Reporting
  async generateTaxReport(tenantId: string, request: CreateTaxReportRequest): Promise<TaxReport> {
    const reportData = await this.calculateReportData(tenantId, request);

    const query = `
      INSERT INTO tax_reports (
        tenant_id, report_type, jurisdiction_id, period_start, period_end,
        total_sales_cents, taxable_sales_cents, exempt_sales_cents,
        total_tax_collected_cents, total_tax_refunded_cents, net_tax_due_cents,
        report_data
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING *
    `;

    const values = [
      tenantId,
      request.report_type,
      request.jurisdiction_id || null,
      request.period_start,
      request.period_end,
      reportData.total_sales_cents,
      reportData.taxable_sales_cents,
      reportData.exempt_sales_cents,
      reportData.total_tax_collected_cents,
      reportData.total_tax_refunded_cents,
      reportData.net_tax_due_cents,
      JSON.stringify(reportData.data)
    ];

    const result = await this.db.query(query, values);
    return result.rows[0];
  }

  private async calculateReportData(tenantId: string, request: CreateTaxReportRequest): Promise<{
    total_sales_cents: number;
    taxable_sales_cents: number;
    exempt_sales_cents: number;
    total_tax_collected_cents: number;
    total_tax_refunded_cents: number;
    net_tax_due_cents: number;
    data: TaxReportData;
  }> {
    // Calculate aggregated tax data for the period
    const query = `
      SELECT 
        COALESCE(SUM(otc.taxable_amount_cents), 0) as total_taxable,
        COALESCE(SUM(otc.total_tax_cents), 0) as total_tax,
        COUNT(DISTINCT otc.order_id) as order_count
      FROM order_tax_calculations otc
      WHERE otc.tenant_id = $1
        AND otc.calculation_timestamp >= $2
        AND otc.calculation_timestamp < $3
        ${request.jurisdiction_id ? 'AND EXISTS (SELECT 1 FROM order_tax_line_items otli WHERE otli.order_tax_calculation_id = otc.id AND otli.jurisdiction_id = $4)' : ''}
    `;

    const values: any[] = [tenantId, request.period_start, request.period_end];
    if (request.jurisdiction_id) values.push(request.jurisdiction_id);

    const result = await this.db.query(query, values);
    const data = result.rows[0];

    const reportData: TaxReportData = {
      jurisdiction_breakdown: [],
      tax_type_breakdown: [],
      order_count: parseInt(data.order_count) || 0,
      refund_count: 0
    };

    return {
      total_sales_cents: parseInt(data.total_taxable) || 0,
      taxable_sales_cents: parseInt(data.total_taxable) || 0,
      exempt_sales_cents: 0,
      total_tax_collected_cents: parseInt(data.total_tax) || 0,
      total_tax_refunded_cents: 0,
      net_tax_due_cents: parseInt(data.total_tax) || 0,
      data: reportData
    };
  }

  async getTaxReports(tenantId: string, status?: ReportStatus): Promise<TaxReport[]> {
    let query = 'SELECT * FROM tax_reports WHERE tenant_id = $1';
    const values: any[] = [tenantId];

    if (status) {
      query += ' AND report_status = $2';
      values.push(status);
    }

    query += ' ORDER BY period_end DESC';
    const result = await this.db.query(query, values);
    return result.rows;
  }

  async fileTaxReport(reportId: string, tenantId: string, filedBy: string, filingReference: string): Promise<TaxReport | null> {
    const query = `
      UPDATE tax_reports
      SET report_status = 'FILED',
          filed_at = NOW(),
          filed_by = $3,
          filing_reference = $4,
          updated_at = NOW()
      WHERE id = $1 AND tenant_id = $2
      RETURNING *
    `;

    const result = await this.db.query(query, [reportId, tenantId, filedBy, filingReference]);
    return result.rows[0] || null;
  }
}
