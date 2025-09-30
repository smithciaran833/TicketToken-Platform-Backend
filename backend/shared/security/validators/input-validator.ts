import { body, query, param, ValidationChain } from 'express-validator';
import validator from 'validator';
import DOMPurify from 'isomorphic-dompurify';

export class InputValidator {
  // Email validation
  static email(): ValidationChain {
    return body('email')
      .isEmail()
      .normalizeEmail()
      .custom(value => {
        // Additional email validation
        const disposableEmails = ['tempmail.com', 'guerrillamail.com'];
        const domain = value.split('@')[1];
        if (disposableEmails.includes(domain)) {
          throw new Error('Disposable email addresses not allowed');
        }
        return true;
      });
  }

  // Password validation with strength requirements
  static password(): ValidationChain {
    return body('password')
      .isLength({ min: 12 })
      .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
      .withMessage('Password must contain uppercase, lowercase, number, and special character')
      .custom(value => {
        // Check against common passwords
        const commonPasswords = ['Password123!', 'Admin123!', 'Welcome123!'];
        if (commonPasswords.includes(value)) {
          throw new Error('Password is too common');
        }
        // Check for patterns
        if (/(.)\1{2,}/.test(value)) {
          throw new Error('Password contains repeating characters');
        }
        return true;
      });
  }

  // UUID validation
  static uuid(field: string): ValidationChain {
    return param(field)
      .isUUID(4)
      .withMessage('Invalid UUID format');
  }

  // Phone number validation
  static phoneNumber(): ValidationChain {
    return body('phoneNumber')
      .isMobilePhone('any')
      .custom(value => {
        // Additional validation for specific formats
        return validator.isMobilePhone(value, 'any', { strictMode: true });
      });
  }

  // Credit card validation
  static creditCard(): ValidationChain {
    return body('creditCard')
      .isCreditCard()
      .custom(value => {
        // Luhn algorithm check
        const luhnCheck = (cardNumber: string): boolean => {
          const digits = cardNumber.replace(/\D/g, '');
          let sum = 0;
          let isEven = false;
          
          for (let i = digits.length - 1; i >= 0; i--) {
            let digit = parseInt(digits[i], 10);
            
            if (isEven) {
              digit *= 2;
              if (digit > 9) {
                digit -= 9;
              }
            }
            
            sum += digit;
            isEven = !isEven;
          }
          
          return sum % 10 === 0;
        };
        
        if (!luhnCheck(value)) {
          throw new Error('Invalid credit card number');
        }
        return true;
      });
  }

  // URL validation
  static url(): ValidationChain {
    return body('url')
      .isURL({
        protocols: ['https'],
        require_tld: true,
        require_protocol: true,
        require_valid_protocol: true,
      })
      .custom(value => {
        // Check against malicious URLs
        const blacklistedDomains = ['malware.com', 'phishing.com'];
        const url = new URL(value);
        if (blacklistedDomains.includes(url.hostname)) {
          throw new Error('URL is blacklisted');
        }
        return true;
      });
  }

  // File upload validation
  static fileUpload(field: string, allowedTypes: string[], maxSize: number): ValidationChain {
    return body(field)
      .custom((value, { req }) => {
        const file = req.files?.[field];
        
        if (!file) {
          throw new Error('File is required');
        }
        
        // Check file type
        if (!allowedTypes.includes(file.mimetype)) {
          throw new Error(`Invalid file type. Allowed: ${allowedTypes.join(', ')}`);
        }
        
        // Check file size
        if (file.size > maxSize) {
          throw new Error(`File too large. Max size: ${maxSize / 1024 / 1024}MB`);
        }
        
        // Check for malicious content in filename
        if (/[<>:"\/\\|?*]/.test(file.name)) {
          throw new Error('Invalid characters in filename');
        }
        
        return true;
      });
  }

  // JSON validation
  static json(field: string): ValidationChain {
    return body(field)
      .isJSON()
      .custom(value => {
        try {
          const parsed = JSON.parse(value);
          // Check for prototype pollution
          if ('__proto__' in parsed || 'constructor' in parsed || 'prototype' in parsed) {
            throw new Error('Potential prototype pollution detected');
          }
          return true;
        } catch {
          throw new Error('Invalid JSON');
        }
      });
  }

  // Date validation
  static date(field: string, options?: { min?: Date; max?: Date }): ValidationChain {
    return body(field)
      .isISO8601()
      .toDate()
      .custom(value => {
        const date = new Date(value);
        
        if (options?.min && date < options.min) {
          throw new Error(`Date must be after ${options.min.toISOString()}`);
        }
        
        if (options?.max && date > options.max) {
          throw new Error(`Date must be before ${options.max.toISOString()}`);
        }
        
        return true;
      });
  }

  // Amount/money validation
  static amount(): ValidationChain {
    return body('amount')
      .isFloat({ min: 0.01, max: 999999.99 })
      .toFloat()
      .custom(value => {
        // Check for precision issues
        const decimalPlaces = (value.toString().split('.')[1] || '').length;
        if (decimalPlaces > 2) {
          throw new Error('Amount can have maximum 2 decimal places');
        }
        return true;
      });
  }

  // Sanitize HTML content
  static sanitizeHTML(field: string): ValidationChain {
    return body(field)
      .customSanitizer(value => {
        return DOMPurify.sanitize(value, {
          ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'a', 'p', 'br'],
          ALLOWED_ATTR: ['href'],
        });
      });
  }

  // Pagination validation
  static pagination(): ValidationChain[] {
    return [
      query('page')
        .optional()
        .isInt({ min: 1, max: 1000 })
        .toInt(),
      query('limit')
        .optional()
        .isInt({ min: 1, max: 100 })
        .toInt(),
      query('sort')
        .optional()
        .isIn(['asc', 'desc']),
      query('sortBy')
        .optional()
        .matches(/^[a-zA-Z_]+$/)
    ];
  }

  // Search query validation
  static searchQuery(): ValidationChain {
    return query('q')
      .trim()
      .isLength({ min: 1, max: 100 })
      .escape()
      .custom(value => {
        // Remove special characters that might be used for injection
        const cleaned = value.replace(/[^\w\s-]/g, '');
        if (cleaned.length < 1) {
          throw new Error('Search query too short after cleaning');
        }
        return true;
      });
  }
}
