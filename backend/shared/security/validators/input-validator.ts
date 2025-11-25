import validator from 'validator';
import DOMPurify from 'isomorphic-dompurify';
import { FastifyRequest } from 'fastify';

/**
 * Input validator for Fastify using validator.js and custom validation
 * Note: This replaces express-validator with Fastify-compatible validation
 */
export class InputValidator {
  // Email validation
  static validateEmail(email: string): { valid: boolean; error?: string; sanitized?: string } {
    if (!validator.isEmail(email)) {
      return { valid: false, error: 'Invalid email format' };
    }

    // Normalize and sanitize
    let sanitized = validator.normalizeEmail(email) || email;
    sanitized = sanitized.toLowerCase().replace(/\+.*@/, '@');

    // Check disposable emails
    const disposableEmails = ['tempmail.com', 'guerrillamail.com'];
    const domain = sanitized.split('@')[1];
    if (disposableEmails.includes(domain)) {
      return { valid: false, error: 'Disposable email addresses not allowed' };
    }

    return { valid: true, sanitized };
  }

  // Password validation with strength requirements
  static validatePassword(password: string): { valid: boolean; error?: string } {
    // Check against common passwords FIRST
    const commonPasswords = [
      'password',
      'admin123',
      'Password123!',
      'Admin123!',
      'Welcome123!',
    ];
    if (commonPasswords.some((pwd) => password.toLowerCase() === pwd.toLowerCase())) {
      return { valid: false, error: 'Password is too common' };
    }

    // Length check
    if (password.length < 12) {
      return { valid: false, error: 'Password must be at least 12 characters' };
    }

    // Complexity check
    if (!/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/.test(password)) {
      return {
        valid: false,
        error: 'Password must contain uppercase, lowercase, number, and special character',
      };
    }

    // Check for repeating characters
    if (/(.)\1{2,}/.test(password)) {
      return { valid: false, error: 'Password contains repeating characters' };
    }

    return { valid: true };
  }

  // UUID validation
  static validateUUID(uuid: string): { valid: boolean; error?: string } {
    if (!validator.isUUID(uuid, 4)) {
      return { valid: false, error: 'Invalid UUID format' };
    }
    return { valid: true };
  }

  // Phone number validation
  static validatePhoneNumber(phoneNumber: string): { valid: boolean; error?: string } {
    if (!validator.isMobilePhone(phoneNumber, 'any', { strictMode: true })) {
      return { valid: false, error: 'Invalid phone number' };
    }
    return { valid: true };
  }

  // Credit card validation
  static validateCreditCard(creditCard: string): { valid: boolean; error?: string } {
    if (!validator.isCreditCard(creditCard)) {
      return { valid: false, error: 'Invalid credit card number' };
    }

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

    if (!luhnCheck(creditCard)) {
      return { valid: false, error: 'Invalid credit card number (Luhn check failed)' };
    }

    return { valid: true };
  }

  // URL validation
  static validateURL(url: string): { valid: boolean; error?: string } {
    if (
      !validator.isURL(url, {
        protocols: ['https'],
        require_tld: true,
        require_protocol: true,
        require_valid_protocol: true,
      })
    ) {
      return { valid: false, error: 'Invalid URL' };
    }

    // Check against malicious URLs
    const blacklistedDomains = ['malware.com', 'phishing.com'];
    try {
      const urlObj = new URL(url);
      if (blacklistedDomains.includes(urlObj.hostname)) {
        return { valid: false, error: 'URL is blacklisted' };
      }
    } catch {
      return { valid: false, error: 'Invalid URL format' };
    }

    return { valid: true };
  }

  // JSON validation
  static validateJSON(jsonString: string): { valid: boolean; error?: string; parsed?: any } {
    try {
      const parsed = JSON.parse(jsonString);

      // Check for prototype pollution
      if ('__proto__' in parsed || 'constructor' in parsed || 'prototype' in parsed) {
        return { valid: false, error: 'Potential prototype pollution detected' };
      }

      return { valid: true, parsed };
    } catch (error: any) {
      return { valid: false, error: 'Invalid JSON' };
    }
  }

  // Date validation
  static validateDate(
    dateString: string,
    options?: { min?: Date; max?: Date }
  ): { valid: boolean; error?: string; date?: Date } {
    if (!validator.isISO8601(dateString)) {
      return { valid: false, error: 'Invalid date format (use ISO8601)' };
    }

    const date = new Date(dateString);

    if (options?.min && date < options.min) {
      return { valid: false, error: `Date must be after ${options.min.toISOString()}` };
    }

    if (options?.max && date > options.max) {
      return { valid: false, error: `Date must be before ${options.max.toISOString()}` };
    }

    return { valid: true, date };
  }

  // Amount/money validation
  static validateAmount(amount: number): { valid: boolean; error?: string } {
    if (!validator.isFloat(String(amount), { min: 0.01, max: 999999.99 })) {
      return { valid: false, error: 'Invalid amount (must be between 0.01 and 999999.99)' };
    }

    // Check for precision issues
    const decimalPlaces = (amount.toString().split('.')[1] || '').length;
    if (decimalPlaces > 2) {
      return { valid: false, error: 'Amount can have maximum 2 decimal places' };
    }

    return { valid: true };
  }

  // Sanitize HTML content
  static sanitizeHTML(html: string): string {
    return DOMPurify.sanitize(html, {
      ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'a', 'p', 'br'],
      ALLOWED_ATTR: ['href'],
    });
  }

  // Search query validation
  static validateSearchQuery(query: string): { valid: boolean; error?: string; sanitized?: string } {
    const trimmed = query.trim();

    if (trimmed.length < 1 || trimmed.length > 100) {
      return { valid: false, error: 'Search query must be between 1 and 100 characters' };
    }

    // Remove SQL comment syntax and other dangerous patterns
    let sanitized = trimmed.replace(/--/g, ''); // Remove SQL comments
    sanitized = sanitized.replace(/\/\*/g, '').replace(/\*\//g, ''); // Remove block comments
    sanitized = sanitized.replace(/[';]/g, ''); // Remove quotes and semicolons
    sanitized = validator.escape(sanitized);

    if (sanitized.length < 1) {
      return { valid: false, error: 'Search query too short after cleaning' };
    }

    return { valid: true, sanitized };
  }

  // Pagination validation
  static validatePagination(params: {
    page?: string | number;
    limit?: string | number;
    sort?: string;
    sortBy?: string;
  }): {
    valid: boolean;
    error?: string;
    pagination?: { page: number; limit: number; sort?: 'asc' | 'desc'; sortBy?: string };
  } {
    const page = params.page ? parseInt(String(params.page)) : 1;
    const limit = params.limit ? parseInt(String(params.limit)) : 10;

    if (isNaN(page) || page < 1 || page > 1000) {
      return { valid: false, error: 'Invalid page number (must be 1-1000)' };
    }

    if (isNaN(limit) || limit < 1 || limit > 100) {
      return { valid: false, error: 'Invalid limit (must be 1-100)' };
    }

    if (params.sort && !['asc', 'desc'].includes(params.sort)) {
      return { valid: false, error: 'Invalid sort (must be asc or desc)' };
    }

    if (params.sortBy && !/^[a-zA-Z_]+$/.test(params.sortBy)) {
      return { valid: false, error: 'Invalid sortBy field' };
    }

    return {
      valid: true,
      pagination: {
        page,
        limit,
        sort: params.sort as 'asc' | 'desc' | undefined,
        sortBy: params.sortBy,
      },
    };
  }
}
