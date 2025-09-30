console.log("[VALIDATION] Module loaded");
import { Request, Response, NextFunction } from 'express';
import Joi from 'joi';

const schemas = {
  processPayment: Joi.object({
    venueId: Joi.string().uuid().required(),
    eventId: Joi.string().uuid().required(),
    tickets: Joi.array().items(
      Joi.object({
        ticketTypeId: Joi.string().uuid().required(),
        quantity: Joi.number().integer().min(1).max(10).required(),
        price: Joi.number().positive().required(),
        seatNumbers: Joi.array().items(Joi.string()).optional()
      })
    ).min(1).required(),
    paymentMethod: Joi.object({
      type: Joi.string().valid('card', 'ach', 'paypal', 'crypto').required(),
      token: Joi.string().optional(),
      paymentMethodId: Joi.string().optional()
    }).required(),
    metadata: Joi.object().optional(),
    deviceFingerprint: Joi.string().required(),
    sessionData: Joi.object({
      actions: Joi.array().items(
        Joi.object({
          type: Joi.string().required(),
          timestamp: Joi.number().required(),
          x: Joi.number().optional(),
          y: Joi.number().optional()
        })
      ).optional(),
      browserFeatures: Joi.object().optional()
    }).optional()
  }),
  
  calculateFees: Joi.object({
    venueId: Joi.string().uuid().required(),
    amount: Joi.number().positive().required(),
    ticketCount: Joi.number().integer().min(1).required()
  }),
  
  refundTransaction: Joi.object({
    amount: Joi.number().positive().optional(),
    reason: Joi.string().max(500).required()
  }),
  
  createListing: Joi.object({
    ticketId: Joi.string().uuid().required(),
    price: Joi.number().positive().required(),
    venueId: Joi.string().uuid().required()
  }),
  
  purchaseResale: Joi.object({
    listingId: Joi.string().required(),
    paymentMethodId: Joi.string().required()
  }),
  
  createGroup: Joi.object({
    eventId: Joi.string().uuid().required(),
    ticketSelections: Joi.array().items(
      Joi.object({
        ticketTypeId: Joi.string().uuid().required(),
        quantity: Joi.number().integer().min(1).required(),
        price: Joi.number().positive().required()
      })
    ).min(1).required(),
    members: Joi.array().items(
      Joi.object({
        email: Joi.string().email().required(),
        name: Joi.string().required(),
        ticketCount: Joi.number().integer().min(1).required()
      })
    ).min(1).max(20).required()
  })
};

export const validateRequest = (schemaName: keyof typeof schemas) => {
  return (req: Request, res: Response, next: NextFunction) => {
    console.log(`[VALIDATION] Validating schema: ${schemaName}`, req.body);
    const schema = schemas[schemaName];
    
    if (!schema) {
      return next(new Error(`Validation schema '${schemaName}' not found`));
    }
    
    const { error, value } = schema.validate(req.body, {
      abortEarly: false,
      stripUnknown: true
    });
    
    if (error) {
      const errors = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message
      }));
      
      return res.status(400).json({
        error: 'Validation failed',
        code: 'VALIDATION_ERROR',
        errors
      });
    }
    
    // Replace request body with validated and sanitized data
    req.body = value;
    next();
  };
};

export const validateQueryParams = (schema: Joi.Schema) => {
  return (req: Request, res: Response, next: NextFunction) => {
    console.log(`[VALIDATION] Validating query params:`, req.query);
    const { error, value } = schema.validate(req.query, {
      abortEarly: false,
      stripUnknown: true
    });
    
    if (error) {
      const errors = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message
      }));
      
      return res.status(400).json({
        error: 'Invalid query parameters',
        code: 'QUERY_VALIDATION_ERROR',
        errors
      });
    }
    
    req.query = value;
    return next();
  };
};
