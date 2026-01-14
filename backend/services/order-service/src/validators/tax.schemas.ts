import Joi from 'joi';

/**
 * RD1: Input validation schemas for tax routes
 * All schemas use .unknown(false) to reject extra fields (SEC1, SEC2)
 */

// Common field patterns
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const countryCodePattern = /^[A-Z]{2}$/;
const currencyCodePattern = /^[A-Z]{3}$/;

// UUID parameter validation
export const uuidParamSchema = Joi.object({
  jurisdictionId: Joi.string().pattern(uuidPattern).optional(),
  exemptionId: Joi.string().pattern(uuidPattern).optional(),
  customerId: Joi.string().pattern(uuidPattern).optional(),
  orderId: Joi.string().pattern(uuidPattern).optional(),
  reportId: Joi.string().pattern(uuidPattern).optional(),
}).unknown(false);

// Create Tax Jurisdiction
export const createJurisdictionSchema = Joi.object({
  name: Joi.string().min(1).max(100).required(),
  code: Joi.string().min(1).max(20).required(),
  country: Joi.string().pattern(countryCodePattern).required(),
  state: Joi.string().max(50).optional().allow(null),
  city: Joi.string().max(100).optional().allow(null),
  postalCodePattern: Joi.string().max(100).optional().allow(null),
  isActive: Joi.boolean().default(true),
  priority: Joi.number().integer().min(0).max(1000).default(0),
}).unknown(false);

// Update Tax Jurisdiction
export const updateJurisdictionSchema = Joi.object({
  name: Joi.string().min(1).max(100).optional(),
  code: Joi.string().min(1).max(20).optional(),
  state: Joi.string().max(50).optional().allow(null),
  city: Joi.string().max(100).optional().allow(null),
  postalCodePattern: Joi.string().max(100).optional().allow(null),
  isActive: Joi.boolean().optional(),
  priority: Joi.number().integer().min(0).max(1000).optional(),
}).unknown(false);

// Create Tax Rate
export const createTaxRateSchema = Joi.object({
  jurisdictionId: Joi.string().pattern(uuidPattern).required(),
  categoryId: Joi.string().pattern(uuidPattern).optional().allow(null),
  name: Joi.string().min(1).max(100).required(),
  rate: Joi.number().min(0).max(100).precision(4).required(), // percentage (0-100)
  effectiveFrom: Joi.date().iso().optional(),
  effectiveUntil: Joi.date().iso().optional().allow(null),
  isCompound: Joi.boolean().default(false),
  isInclusive: Joi.boolean().default(false),
  description: Joi.string().max(500).optional().allow(null),
}).unknown(false);

// Create Tax Category
export const createCategorySchema = Joi.object({
  name: Joi.string().min(1).max(100).required(),
  code: Joi.string().min(1).max(20).required(),
  description: Joi.string().max(500).optional().allow(null),
  isDefault: Joi.boolean().default(false),
}).unknown(false);

// Create Tax Exemption
export const createExemptionSchema = Joi.object({
  customerId: Joi.string().pattern(uuidPattern).required(),
  jurisdictionId: Joi.string().pattern(uuidPattern).optional().allow(null),
  exemptionType: Joi.string().valid(
    'NONPROFIT',
    'GOVERNMENT',
    'RESELLER',
    'EDUCATIONAL',
    'DIPLOMATIC',
    'OTHER'
  ).required(),
  certificateNumber: Joi.string().max(100).optional().allow(null),
  expirationDate: Joi.date().iso().optional().allow(null),
  documentUrl: Joi.string().uri().max(500).optional().allow(null),
  notes: Joi.string().max(1000).optional().allow(null),
}).unknown(false);

// Calculate Tax Request
export const calculateTaxSchema = Joi.object({
  orderId: Joi.string().pattern(uuidPattern).optional(),
  customerId: Joi.string().pattern(uuidPattern).optional(),
  items: Joi.array().items(
    Joi.object({
      ticketTypeId: Joi.string().pattern(uuidPattern).required(),
      quantity: Joi.number().integer().min(1).max(100).required(),
      unitPriceCents: Joi.number().integer().min(0).required(),
      categoryId: Joi.string().pattern(uuidPattern).optional().allow(null),
    }).unknown(false)
  ).min(1).required(),
  billingAddress: Joi.object({
    country: Joi.string().pattern(countryCodePattern).required(),
    state: Joi.string().max(50).optional().allow(null),
    city: Joi.string().max(100).optional().allow(null),
    postalCode: Joi.string().max(20).optional().allow(null),
    address1: Joi.string().max(200).optional().allow(null),
    address2: Joi.string().max(200).optional().allow(null),
  }).unknown(false).required(),
  shippingAddress: Joi.object({
    country: Joi.string().pattern(countryCodePattern).required(),
    state: Joi.string().max(50).optional().allow(null),
    city: Joi.string().max(100).optional().allow(null),
    postalCode: Joi.string().max(20).optional().allow(null),
    address1: Joi.string().max(200).optional().allow(null),
    address2: Joi.string().max(200).optional().allow(null),
  }).unknown(false).optional(),
  currency: Joi.string().pattern(currencyCodePattern).default('USD'),
}).unknown(false);

// Configure Tax Provider
export const configureProviderSchema = Joi.object({
  provider: Joi.string().valid('manual', 'avalara', 'taxjar', 'vertex').required(),
  apiKey: Joi.string().max(200).when('provider', {
    is: 'manual',
    then: Joi.optional().allow(null),
    otherwise: Joi.required(),
  }),
  apiSecret: Joi.string().max(200).optional().allow(null),
  companyCode: Joi.string().max(100).optional().allow(null),
  environment: Joi.string().valid('sandbox', 'production').default('sandbox'),
  isEnabled: Joi.boolean().default(true),
}).unknown(false);

// Generate Tax Report
export const generateReportSchema = Joi.object({
  reportType: Joi.string().valid(
    'SALES_TAX_SUMMARY',
    'SALES_TAX_DETAIL',
    'EXEMPTION_REPORT',
    'JURISDICTION_BREAKDOWN',
    'MONTHLY_FILING'
  ).required(),
  startDate: Joi.date().iso().required(),
  endDate: Joi.date().iso().required(),
  jurisdictionId: Joi.string().pattern(uuidPattern).optional().allow(null),
  format: Joi.string().valid('json', 'csv', 'pdf').default('json'),
}).unknown(false);

// File Tax Report
export const fileReportSchema = Joi.object({
  filingDate: Joi.date().iso().optional(),
  confirmationNumber: Joi.string().max(100).optional().allow(null),
  notes: Joi.string().max(1000).optional().allow(null),
}).unknown(false);

// Query parameters for list endpoints
export const listQuerySchema = Joi.object({
  limit: Joi.number().integer().min(1).max(100).default(20),
  offset: Joi.number().integer().min(0).default(0),
  isActive: Joi.boolean().optional(),
  jurisdictionId: Joi.string().pattern(uuidPattern).optional(),
}).unknown(false);

export default {
  createJurisdictionSchema,
  updateJurisdictionSchema,
  createTaxRateSchema,
  createCategorySchema,
  createExemptionSchema,
  calculateTaxSchema,
  configureProviderSchema,
  generateReportSchema,
  fileReportSchema,
  listQuerySchema,
  uuidParamSchema,
};
