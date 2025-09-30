import Joi from 'joi';
import { 
  MIN_LISTING_PRICE, 
  MAX_LISTING_PRICE,
  MAX_PRICE_MARKUP_PERCENTAGE 
} from './constants';

export interface ValidationResult {
  isValid: boolean;
  error?: string;
  details?: any;
}

// Price validation
export const validatePrice = (price: number, faceValue?: number): ValidationResult => {
  if (price < MIN_LISTING_PRICE) {
    return { isValid: false, error: `Price must be at least $${MIN_LISTING_PRICE}` };
  }
  
  if (price > MAX_LISTING_PRICE) {
    return { isValid: false, error: `Price cannot exceed $${MAX_LISTING_PRICE}` };
  }
  
  if (faceValue) {
    const maxAllowedPrice = faceValue * (1 + MAX_PRICE_MARKUP_PERCENTAGE / 100);
    if (price > maxAllowedPrice) {
      return { 
        isValid: false, 
        error: `Price cannot exceed ${MAX_PRICE_MARKUP_PERCENTAGE}% markup from face value` 
      };
    }
  }
  
  return { isValid: true };
};

// UUID validation
export const validateUUID = (uuid: string): boolean => {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
};

// Listing creation schema
export const listingCreationSchema = Joi.object({
  ticket_id: Joi.string().uuid().required(),
  price: Joi.number().min(MIN_LISTING_PRICE).max(MAX_LISTING_PRICE).required(),
  expires_at: Joi.date().optional(),
  notes: Joi.string().max(500).optional()
});

// Transfer request schema
export const transferRequestSchema = Joi.object({
  listing_id: Joi.string().uuid().required(),
  buyer_wallet: Joi.string().required(),
  payment_method: Joi.string().valid('USDC', 'SOL').required()
});

// Pagination schema
export const paginationSchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  sortBy: Joi.string().optional(),
  sortOrder: Joi.string().valid('asc', 'desc').default('desc')
});

// Validate listing creation
export const validateListingCreation = (data: any): ValidationResult => {
  const { error, value } = listingCreationSchema.validate(data);
  if (error) {
    return { isValid: false, error: error.details[0].message, details: error.details };
  }
  return { isValid: true, details: value };
};

// Validate transfer request
export const validateTransferRequest = (data: any): ValidationResult => {
  const { error, value } = transferRequestSchema.validate(data);
  if (error) {
    return { isValid: false, error: error.details[0].message, details: error.details };
  }
  return { isValid: true, details: value };
};
