import { Pool } from 'pg';
import { getDatabase } from '../config/database';
import {
  TaxCalculationRequest,
  TaxCalculationResult,
  OrderTaxCalculation,
  OrderTaxLineItem,
  TaxAddress,
  CalculationMethod,
  TaxProvider,
  TaxType
} from '../types/tax.types';

export class TaxCalculationService {
  private db: Pool;

  constructor() {
    this.db = getDatabase();
  }

  async calculateTax(tenantId: string, request: TaxCalculationRequest): Promise<TaxCalculationResult> {
    // Check for exemption
    if (request.customer_exemption_id) {
      const exemption = await this.getValidExemption(tenantId, request.customer_exemption_id);
      if (exemption) {
        return this.createExemptCalculation(request);
      }
    }

    // Get provider config
    const providerConfig = await this.getEnabledProvider(tenantId);
    
    if (providerConfig && providerConfig.provider_name !== TaxProvider.MANUAL) {
      // Use external provider
      return await this.calculateWithProvider(tenantId, request, providerConfig);
    }

    // Fall back to manual calculation
    return await this.calculateManually(tenantId, request);
  }

  private async calculateManually(tenantId: string, request: TaxCalculationRequest): Promise<TaxCalculationResult> {
    const jurisdictions = await this.lookupJurisdictions(tenantId, request.billing_address);
    
    if (jurisdictions.length === 0) {
      return this.createZeroTaxCalculation(request);
    }

    const lineItems: OrderTaxLineItem[] = [];
    let totalTax = 0;
    const totalAmount = request.line_items.reduce((sum, item) => sum + item.amount_cents, 0);

    // Get applicable rates for each jurisdiction
    for (const jurisdiction of jurisdictions) {
      const rates = await this.getApplicableRates(tenantId, jurisdiction.id);
      
      for (const rate of rates) {
        const taxableAmount = this.calculateTaxableAmount(request.line_items, rate);
        
        if (taxableAmount > 0) {
          const taxAmount = Math.round((taxableAmount * rate.rate_percentage) / 100);
          totalTax += taxAmount;

          lineItems.push({
            id: '', // Will be generated on save
            tenant_id: tenantId,
            order_tax_calculation_id: '', // Will be set on save
            jurisdiction_id: jurisdiction.id,
            tax_rate_id: rate.id,
            tax_type: rate.tax_type,
            jurisdiction_name: jurisdiction.jurisdiction_name,
            rate_percentage: rate.rate_percentage,
            taxable_amount_cents: taxableAmount,
            tax_amount_cents: taxAmount,
            is_compound: false,
            calculation_order: rate.compound_order,
            created_at: new Date()
          });
        }
      }
    }

    return {
      total_tax_cents: totalTax,
      taxable_amount_cents: totalAmount,
      line_items: lineItems,
      is_estimate: false,
      calculation_method: CalculationMethod.AUTOMATED
    };
  }

  private async calculateWithProvider(
    tenantId: string,
    request: TaxCalculationRequest,
    providerConfig: any
  ): Promise<TaxCalculationResult> {
    // This would integrate with external providers like Avalara, TaxJar, etc.
    // For now, return a placeholder that falls back to manual calculation
    return await this.calculateManually(tenantId, request);
  }

  async saveTaxCalculation(
    tenantId: string,
    orderId: string,
    calculation: TaxCalculationResult,
    billingAddress: TaxAddress,
    shippingAddress?: TaxAddress
  ): Promise<OrderTaxCalculation> {
    const client = await this.db.connect();
    
    try {
      await client.query('BEGIN');

      // Insert main calculation
      const calcQuery = `
        INSERT INTO order_tax_calculations (
          tenant_id, order_id, calculation_method, external_provider,
          external_transaction_id, billing_address, shipping_address,
          taxable_amount_cents, total_tax_cents, is_estimate
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING *
      `;

      const calcResult = await client.query(calcQuery, [
        tenantId,
        orderId,
        calculation.calculation_method,
        null, // external_provider
        calculation.external_transaction_id || null,
        JSON.stringify(billingAddress),
        shippingAddress ? JSON.stringify(shippingAddress) : null,
        calculation.taxable_amount_cents,
        calculation.total_tax_cents,
        calculation.is_estimate
      ]);

      const savedCalculation = calcResult.rows[0];

      // Insert line items
      for (const lineItem of calculation.line_items) {
        const lineQuery = `
          INSERT INTO order_tax_line_items (
            tenant_id, order_tax_calculation_id, jurisdiction_id, tax_rate_id,
            tax_type, jurisdiction_name, rate_percentage, taxable_amount_cents,
            tax_amount_cents, is_compound, calculation_order, metadata
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        `;

        await client.query(lineQuery, [
          tenantId,
          savedCalculation.id,
          lineItem.jurisdiction_id || null,
          lineItem.tax_rate_id || null,
          lineItem.tax_type,
          lineItem.jurisdiction_name,
          lineItem.rate_percentage,
          lineItem.taxable_amount_cents,
          lineItem.tax_amount_cents,
          lineItem.is_compound,
          lineItem.calculation_order,
          lineItem.metadata ? JSON.stringify(lineItem.metadata) : null
        ]);
      }

      await client.query('COMMIT');
      return savedCalculation;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  private async lookupJurisdictions(tenantId: string, address: TaxAddress): Promise<any[]> {
    const query = `
      SELECT * FROM tax_jurisdictions
      WHERE tenant_id = $1
        AND active = true
        AND country_code = $2
        AND (state_code = $3 OR state_code IS NULL)
        AND (postal_codes IS NULL OR $4 = ANY(postal_codes))
      ORDER BY 
        CASE jurisdiction_type
          WHEN 'SPECIAL_DISTRICT' THEN 1
          WHEN 'CITY' THEN 2
          WHEN 'COUNTY' THEN 3
          WHEN 'STATE' THEN 4
          WHEN 'COUNTRY' THEN 5
        END
    `;

    const result = await this.db.query(query, [
      tenantId,
      address.country,
      address.state || null,
      address.postal_code
    ]);

    return result.rows;
  }

  private async getApplicableRates(tenantId: string, jurisdictionId: string): Promise<any[]> {
    const now = new Date();
    const query = `
      SELECT * FROM tax_rates
      WHERE tenant_id = $1
        AND jurisdiction_id = $2
        AND active = true
        AND effective_from <= $3
        AND (effective_to IS NULL OR effective_to > $3)
      ORDER BY compound_order
    `;

    const result = await this.db.query(query, [tenantId, jurisdictionId, now]);
    return result.rows;
  }

  private calculateTaxableAmount(lineItems: any[], rate: any): number {
    return lineItems.reduce((sum, item) => {
      // Check if this line item category is subject to this tax
      // For now, apply to all items
      return sum + item.amount_cents;
    }, 0);
  }

  private async getValidExemption(tenantId: string, exemptionId: string): Promise<any> {
    const query = `
      SELECT * FROM tax_exemptions
      WHERE tenant_id = $1
        AND id = $2
        AND active = true
        AND verification_status = 'VERIFIED'
        AND valid_from <= NOW()
        AND (valid_to IS NULL OR valid_to > NOW())
    `;

    const result = await this.db.query(query, [tenantId, exemptionId]);
    return result.rows[0] || null;
  }

  private async getEnabledProvider(tenantId: string): Promise<any> {
    const query = `
      SELECT * FROM tax_provider_configs
      WHERE tenant_id = $1
        AND enabled = true
      ORDER BY 
        CASE provider_name
          WHEN 'AVALARA' THEN 1
          WHEN 'TAXJAR' THEN 2
          WHEN 'VERTEX' THEN 3
          ELSE 4
        END
      LIMIT 1
    `;

    const result = await this.db.query(query, [tenantId]);
    return result.rows[0] || null;
  }

  private createZeroTaxCalculation(request: TaxCalculationRequest): TaxCalculationResult {
    return {
      total_tax_cents: 0,
      taxable_amount_cents: request.line_items.reduce((sum, item) => sum + item.amount_cents, 0),
      line_items: [],
      is_estimate: false,
      calculation_method: CalculationMethod.AUTOMATED
    };
  }

  private createExemptCalculation(request: TaxCalculationRequest): TaxCalculationResult {
    return {
      total_tax_cents: 0,
      taxable_amount_cents: 0,
      line_items: [{
        id: '',
        tenant_id: '',
        order_tax_calculation_id: '',
        tax_type: TaxType.SALES_TAX,
        jurisdiction_name: 'EXEMPT',
        rate_percentage: 0,
        taxable_amount_cents: 0,
        tax_amount_cents: 0,
        is_compound: false,
        calculation_order: 1,
        metadata: { exempt: true },
        created_at: new Date()
      }],
      is_estimate: false,
      calculation_method: CalculationMethod.MANUAL
    };
  }

  async getTaxCalculationForOrder(tenantId: string, orderId: string): Promise<OrderTaxCalculation | null> {
    const query = `
      SELECT * FROM order_tax_calculations
      WHERE tenant_id = $1 AND order_id = $2
      ORDER BY created_at DESC
      LIMIT 1
    `;

    const result = await this.db.query(query, [tenantId, orderId]);
    return result.rows[0] || null;
  }

  async getTaxLineItems(tenantId: string, calculationId: string): Promise<OrderTaxLineItem[]> {
    const query = `
      SELECT * FROM order_tax_line_items
      WHERE tenant_id = $1 AND order_tax_calculation_id = $2
      ORDER BY calculation_order
    `;

    const result = await this.db.query(query, [tenantId, calculationId]);
    return result.rows;
  }
}
