import Joi from 'joi';

// Jurisdiction schemas
export const createJurisdictionSchema = Joi.object({
  jurisdiction_code: Joi.string().max(50).required(),
  jurisdiction_name: Joi.string().max(255).required(),
  jurisdiction_type: Joi.string().valid('COUNTRY', 'STATE', 'COUNTY', 'CITY', 'SPECIAL_DISTRICT').required(),
  parent_jurisdiction_id: Joi.string().uuid().optional(),
  country_code: Joi.string().length(2).required(),
  state_code: Joi.string().max(10).optional(),
  county_name: Joi.string().max(100).optional(),
  city_name: Joi.string().max(100).optional(),
  postal_codes: Joi.array().items(Joi.string()).optional(),
  metadata: Joi.object().optional()
});

export const updateJurisdictionSchema = Joi.object({
  jurisdiction_name: Joi.string().max(255).optional(),
  jurisdiction_type: Joi.string().valid('COUNTRY', 'STATE', 'COUNTY', 'CITY', 'SPECIAL_DISTRICT').optional(),
  state_code: Joi.string().max(10).optional(),
  county_name: Joi.string().max(100).optional(),
  city_name: Joi.string().max(100).optional(),
  postal_codes: Joi.array().items(Joi.string()).optional(),
  metadata: Joi.object().optional(),
  active: Joi.boolean().optional()
}).min(1);

// Tax rate schemas
export const createTaxRateSchema = Joi.object({
  jurisdiction_id: Joi.string().uuid().required(),
  tax_type: Joi.string().valid('SALES_TAX', 'VAT', 'GST', 'ENTERTAINMENT_TAX', 'AMUSEMENT_TAX', 'TOURISM_TAX', 'FACILITY_FEE').required(),
  rate_percentage: Joi.number().min(0).max(100).precision(6).required(),
  effective_from: Joi.date().required(),
  effective_to: Joi.date().greater(Joi.ref('effective_from')).optional(),
  applies_to_tickets: Joi.boolean().optional(),
  applies_to_fees: Joi.boolean().optional(),
  applies_to_shipping: Joi.boolean().optional(),
  minimum_amount_cents: Joi.number().integer().min(0).optional(),
  maximum_amount_cents: Joi.number().integer().min(0).optional(),
  compound_order: Joi.number().integer().min(1).optional(),
  metadata: Joi.object().optional()
});

// Tax category schemas
export const createCategorySchema = Joi.object({
  category_code: Joi.string().max(50).required(),
  category_name: Joi.string().max(255).required(),
  description: Joi.string().optional(),
  is_exempt: Joi.boolean().optional(),
  requires_exemption_certificate: Joi.boolean().optional()
});

// Tax exemption schemas
export const createExemptionSchema = Joi.object({
  customer_id: Joi.string().uuid().required(),
  exemption_type: Joi.string().valid('NON_PROFIT', 'GOVERNMENT', 'RESELLER', 'DIPLOMATIC', 'EDUCATIONAL', 'RELIGIOUS').required(),
  exemption_certificate_number: Joi.string().max(255).optional(),
  issuing_authority: Joi.string().max(255).optional(),
  jurisdiction_id: Joi.string().uuid().optional(),
  valid_from: Joi.date().required(),
  valid_to: Joi.date().greater(Joi.ref('valid_from')).optional(),
  certificate_file_url: Joi.string().uri().optional(),
  notes: Joi.string().optional(),
  metadata: Joi.object().optional()
});

// Tax calculation schemas
export const calculateTaxSchema = Joi.object({
  order_id: Joi.string().uuid().required(),
  billing_address: Joi.object({
    line1: Joi.string().required(),
    line2: Joi.string().optional(),
    city: Joi.string().required(),
    state: Joi.string().optional(),
    postal_code: Joi.string().required(),
    country: Joi.string().required()
  }).required(),
  shipping_address: Joi.object({
    line1: Joi.string().required(),
    line2: Joi.string().optional(),
    city: Joi.string().required(),
    state: Joi.string().optional(),
    postal_code: Joi.string().required(),
    country: Joi.string().required()
  }).optional(),
  line_items: Joi.array().items(
    Joi.object({
      amount_cents: Joi.number().integer().min(0).required(),
      category_code: Joi.string().optional(),
      description: Joi.string().required()
    })
  ).min(1).required(),
  customer_exemption_id: Joi.string().uuid().optional()
});

// Tax provider config schemas
export const configureProviderSchema = Joi.object({
  provider_name: Joi.string().valid('MANUAL', 'AVALARA', 'TAXJAR', 'VERTEX').required(),
  api_key: Joi.string().optional(),
  account_id: Joi.string().max(255).optional(),
  company_code: Joi.string().max(100).optional(),
  environment: Joi.string().valid('sandbox', 'production').optional(),
  enabled: Joi.boolean().optional(),
  auto_commit: Joi.boolean().optional(),
  configuration: Joi.object().optional()
});

// Tax report schemas
export const generateReportSchema = Joi.object({
  report_type: Joi.string().valid('SALES_TAX', 'VAT_RETURN', 'GST_RETURN').required(),
  jurisdiction_id: Joi.string().uuid().optional(),
  period_start: Joi.date().required(),
  period_end: Joi.date().greater(Joi.ref('period_start')).required()
});

export const fileReportSchema = Joi.object({
  filing_reference: Joi.string().max(255).required()
});
