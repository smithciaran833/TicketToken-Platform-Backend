/**
 * Search Validation Schemas
 * Defines comprehensive validation rules for all search endpoints
 */

import Joi from 'joi';

/**
 * Main search query validation schema
 */
export const searchQuerySchema = Joi.object({
  q: Joi.string()
    .max(200)
    .optional()
    .allow('')
    .description('Search query string'),
  
  type: Joi.string()
    .valid('venues', 'events')
    .optional()
    .description('Type of search: venues or events'),
  
  limit: Joi.number()
    .integer()
    .min(1)
    .max(100)
    .default(20)
    .optional()
    .description('Maximum number of results to return'),
  
  offset: Joi.number()
    .integer()
    .min(0)
    .max(10000)
    .default(0)
    .optional()
    .description('Offset for pagination')
}).options({ stripUnknown: true });

/**
 * Venue search validation schema
 */
export const venueSearchSchema = Joi.object({
  q: Joi.string()
    .max(200)
    .optional()
    .allow('')
    .description('Search query for venues'),
  
  limit: Joi.number()
    .integer()
    .min(1)
    .max(100)
    .default(20)
    .optional(),
  
  city: Joi.string()
    .max(100)
    .optional()
    .description('Filter by city'),
  
  capacity_min: Joi.number()
    .integer()
    .min(0)
    .optional()
    .description('Minimum venue capacity'),
  
  capacity_max: Joi.number()
    .integer()
    .min(0)
    .optional()
    .description('Maximum venue capacity')
}).options({ stripUnknown: true });

/**
 * Event search validation schema
 */
export const eventSearchSchema = Joi.object({
  q: Joi.string()
    .max(200)
    .optional()
    .allow('')
    .description('Search query for events'),
  
  date_from: Joi.date()
    .iso()
    .optional()
    .description('Start date for event search (ISO 8601)'),
  
  date_to: Joi.date()
    .iso()
    .min(Joi.ref('date_from'))
    .optional()
    .description('End date for event search (ISO 8601)'),
  
  limit: Joi.number()
    .integer()
    .min(1)
    .max(100)
    .default(20)
    .optional(),
  
  category: Joi.string()
    .max(50)
    .optional()
    .description('Event category filter'),
  
  venue_id: Joi.string()
    .max(100)
    .optional()
    .description('Filter by specific venue ID')
}).options({ stripUnknown: true });

/**
 * Autocomplete/suggest validation schema
 */
export const suggestSchema = Joi.object({
  q: Joi.string()
    .min(1)
    .max(100)
    .required()
    .description('Query string for autocomplete'),
  
  limit: Joi.number()
    .integer()
    .min(1)
    .max(20)
    .default(10)
    .optional()
    .description('Maximum number of suggestions')
}).options({ stripUnknown: true });

/**
 * Geolocation search validation schema
 */
export const geoSearchSchema = Joi.object({
  lat: Joi.number()
    .min(-90)
    .max(90)
    .required()
    .description('Latitude'),
  
  lon: Joi.number()
    .min(-180)
    .max(180)
    .required()
    .description('Longitude'),
  
  radius: Joi.number()
    .min(0.1)
    .max(100)
    .default(10)
    .optional()
    .description('Search radius in kilometers'),
  
  limit: Joi.number()
    .integer()
    .min(1)
    .max(100)
    .default(20)
    .optional()
}).options({ stripUnknown: true });

/**
 * Filter validation helper
 */
export const filterSchema = Joi.object({
  priceMin: Joi.number().min(0).optional(),
  priceMax: Joi.number().min(0).optional(),
  dateFrom: Joi.date().iso().optional(),
  dateTo: Joi.date().iso().optional(),
  categories: Joi.array().items(Joi.string().max(50)).max(10).optional(),
  venues: Joi.array().items(Joi.string().max(100)).max(10).optional(),
  capacityMin: Joi.number().integer().min(0).optional(),
  capacityMax: Joi.number().integer().min(0).optional(),
  status: Joi.string().valid('active', 'inactive', 'pending').optional(),
  type: Joi.string().max(50).optional()
}).options({ stripUnknown: true });

/**
 * Validates search query parameters
 */
export function validateSearchQuery(data: any): { error?: any; value?: any } {
  return searchQuerySchema.validate(data, { abortEarly: false });
}

/**
 * Validates venue search parameters
 */
export function validateVenueSearch(data: any): { error?: any; value?: any } {
  return venueSearchSchema.validate(data, { abortEarly: false });
}

/**
 * Validates event search parameters
 */
export function validateEventSearch(data: any): { error?: any; value?: any } {
  return eventSearchSchema.validate(data, { abortEarly: false });
}

/**
 * Validates suggest/autocomplete parameters
 */
export function validateSuggest(data: any): { error?: any; value?: any } {
  return suggestSchema.validate(data, { abortEarly: false });
}

/**
 * Validates geolocation search parameters
 */
export function validateGeoSearch(data: any): { error?: any; value?: any } {
  return geoSearchSchema.validate(data, { abortEarly: false });
}
