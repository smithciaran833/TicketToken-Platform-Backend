import { Request, Response, NextFunction } from 'express';
import { validationResult, ValidationChain } from 'express-validator';
import { ValidationError } from '../utils/errors';

export const validateRequest = (validations: ValidationChain[]) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    // Run all validations
    await Promise.all(validations.map(validation => validation.run(req)));
    const errors = validationResult(req);
    
    if (!errors.isEmpty()) {
      const errorArray = errors.array();
      const errorMessage = errorArray.map(error => error.msg).join(", ");
      
      // Pass errorMessages to ValidationError
      return next(new ValidationError(errorMessage || 'Validation failed'));
    }
    
    next();
  };
};
