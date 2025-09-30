import { Request, Response, NextFunction } from 'express';
import Joi from 'joi';
import { logger } from '../utils/logger';

export function validateBody(schema: Joi.Schema) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const validated = await schema.validateAsync(req.body, {
        abortEarly: false,
        stripUnknown: true
      });
      req.body = validated;
      next();
    } catch (error) {
      if (error instanceof Joi.ValidationError) {
        const errors = error.details.map(detail => ({
          field: detail.path.join('.'),
          message: detail.message
        }));
        
        logger.warn('Validation error:', errors);
        
        res.status(400).json({
          error: 'Validation failed',
          details: errors
        });
        return;
      }
      next(error);
    }
  };
}

export function validateQuery(schema: Joi.Schema) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const validated = await schema.validateAsync(req.query, {
        abortEarly: false
      });
      req.query = validated;
      next();
    } catch (error) {
      if (error instanceof Joi.ValidationError) {
        res.status(400).json({
          error: 'Invalid query parameters',
          details: error.details
        });
        return;
      }
      next(error);
    }
  };
}

export function validateParams(schema: Joi.Schema) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const validated = await schema.validateAsync(req.params);
      req.params = validated;
      next();
    } catch (error) {
      if (error instanceof Joi.ValidationError) {
        res.status(400).json({
          error: 'Invalid parameters',
          details: error.details
        });
        return;
      }
      next(error);
    }
  };
}
