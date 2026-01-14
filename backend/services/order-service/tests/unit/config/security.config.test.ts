/**
 * Unit Tests: Security Configuration
 * Tests all security settings including input sanitization, auth, CORS, CSP, and headers
 */

import { securityConfig } from '../../../src/config/security.config';

describe('Security Configuration', () => {
  // ============================================
  // Input Sanitization
  // ============================================
  describe('Input Sanitization', () => {
    it('should have maxStringLength of 10000', () => {
      expect(securityConfig.inputSanitization.maxStringLength).toBe(10000);
    });

    it('should have maxArrayLength of 1000', () => {
      expect(securityConfig.inputSanitization.maxArrayLength).toBe(1000);
    });

    it('should allow PDF file extension', () => {
      expect(securityConfig.inputSanitization.allowedFileExtensions).toContain('.pdf');
    });

    it('should allow common image extensions', () => {
      const extensions = securityConfig.inputSanitization.allowedFileExtensions;
      expect(extensions).toContain('.jpg');
      expect(extensions).toContain('.jpeg');
      expect(extensions).toContain('.png');
      expect(extensions).toContain('.gif');
    });

    it('should have allowed MIME types for images and PDFs', () => {
      const mimeTypes = securityConfig.inputSanitization.allowedMimeTypes;
      expect(mimeTypes).toContain('application/pdf');
      expect(mimeTypes).toContain('image/jpeg');
      expect(mimeTypes).toContain('image/png');
      expect(mimeTypes).toContain('image/gif');
    });

    it('should have maxFileSize of 10MB', () => {
      expect(securityConfig.inputSanitization.maxFileSize).toBe(10 * 1024 * 1024);
    });
  });

  // ============================================
  // XSS Protection
  // ============================================
  describe('XSS Protection', () => {
    it('should have XSS protection enabled', () => {
      expect(securityConfig.xss.enabled).toBe(true);
    });

    it('should have empty whitelist by default', () => {
      expect(securityConfig.xss.whiteList).toEqual({});
    });

    it('should strip ignored tags', () => {
      expect(securityConfig.xss.stripIgnoreTag).toBe(true);
    });

    it('should strip script and style tag bodies', () => {
      expect(securityConfig.xss.stripIgnoreTagBody).toContain('script');
      expect(securityConfig.xss.stripIgnoreTagBody).toContain('style');
    });
  });

  // ============================================
  // Command Execution
  // ============================================
  describe('Command Execution', () => {
    it('should have command execution disabled by default', () => {
      expect(securityConfig.commandExecution.enabled).toBe(false);
    });

    it('should have empty allowed commands list', () => {
      expect(securityConfig.commandExecution.allowedCommands).toEqual([]);
    });
  });

  // ============================================
  // Path Validation
  // ============================================
  describe('Path Validation', () => {
    it('should have allowed directories configured', () => {
      expect(securityConfig.pathValidation.allowedDirectories).toContain('/tmp/uploads');
      expect(securityConfig.pathValidation.allowedDirectories).toContain('/var/data/exports');
    });

    it('should have maxDepth of 5', () => {
      expect(securityConfig.pathValidation.maxDepth).toBe(5);
    });

    it('should prevent directory traversal', () => {
      expect(securityConfig.pathValidation.preventTraversal).toBe(true);
    });
  });

  // ============================================
  // Authentication - Lockout
  // ============================================
  describe('Authentication - Lockout', () => {
    it('should allow 5 failed attempts before lockout', () => {
      expect(securityConfig.authentication.lockout.maxFailedAttempts).toBe(5);
    });

    it('should have 15 minute lockout duration', () => {
      expect(securityConfig.authentication.lockout.lockoutDurationMinutes).toBe(15);
    });

    it('should enable exponential backoff', () => {
      expect(securityConfig.authentication.lockout.exponentialBackoff).toBe(true);
    });

    it('should have max lockout of 24 hours', () => {
      expect(securityConfig.authentication.lockout.maxLockoutDurationMinutes).toBe(1440);
    });
  });

  // ============================================
  // Authentication - Rate Limiting
  // ============================================
  describe('Authentication - Rate Limiting', () => {
    it('should limit login to 5 attempts per 15 minutes', () => {
      expect(securityConfig.authentication.rateLimit.login.windowMs).toBe(15 * 60 * 1000);
      expect(securityConfig.authentication.rateLimit.login.maxAttempts).toBe(5);
    });

    it('should limit registration to 3 attempts per hour', () => {
      expect(securityConfig.authentication.rateLimit.register.windowMs).toBe(60 * 60 * 1000);
      expect(securityConfig.authentication.rateLimit.register.maxAttempts).toBe(3);
    });

    it('should limit password reset to 3 attempts per hour', () => {
      expect(securityConfig.authentication.rateLimit.passwordReset.windowMs).toBe(60 * 60 * 1000);
      expect(securityConfig.authentication.rateLimit.passwordReset.maxAttempts).toBe(3);
    });
  });

  // ============================================
  // Authentication - Password Requirements
  // ============================================
  describe('Authentication - Password Requirements', () => {
    it('should require minimum 12 characters', () => {
      expect(securityConfig.authentication.password.minLength).toBe(12);
    });

    it('should allow maximum 128 characters', () => {
      expect(securityConfig.authentication.password.maxLength).toBe(128);
    });

    it('should require uppercase letters', () => {
      expect(securityConfig.authentication.password.requireUppercase).toBe(true);
    });

    it('should require lowercase letters', () => {
      expect(securityConfig.authentication.password.requireLowercase).toBe(true);
    });

    it('should require numbers', () => {
      expect(securityConfig.authentication.password.requireNumbers).toBe(true);
    });

    it('should require special characters', () => {
      expect(securityConfig.authentication.password.requireSpecialChars).toBe(true);
    });

    it('should define allowed special characters', () => {
      expect(securityConfig.authentication.password.specialChars).toBe('!@#$%^&*()_+-=[]{}|;:,.<>?');
    });

    it('should prevent common passwords', () => {
      expect(securityConfig.authentication.password.preventCommonPasswords).toBe(true);
    });

    it('should prevent reuse of last 5 passwords', () => {
      expect(securityConfig.authentication.password.preventPasswordReuse).toBe(5);
    });
  });

  // ============================================
  // Authentication - Session Management
  // ============================================
  describe('Authentication - Session Management', () => {
    it('should have 30 minute idle timeout', () => {
      expect(securityConfig.authentication.session.idleTimeoutMinutes).toBe(30);
    });

    it('should have 8 hour absolute timeout', () => {
      expect(securityConfig.authentication.session.absoluteTimeoutHours).toBe(8);
    });

    it('should refresh 5 minutes before expiry', () => {
      expect(securityConfig.authentication.session.refreshThresholdMinutes).toBe(5);
    });

    it('should use secure cookies', () => {
      expect(securityConfig.authentication.session.secureCookie).toBe(true);
    });

    it('should use httpOnly cookies', () => {
      expect(securityConfig.authentication.session.httpOnly).toBe(true);
    });

    it('should use strict sameSite', () => {
      expect(securityConfig.authentication.session.sameSite).toBe('strict');
    });
  });

  // ============================================
  // API Security - API Keys
  // ============================================
  describe('API Security - API Keys', () => {
    it('should rotate keys every 90 days', () => {
      expect(securityConfig.api.apiKeys.rotationDays).toBe(90);
    });

    it('should warn 30 days before deprecation', () => {
      expect(securityConfig.api.apiKeys.deprecationWarningDays).toBe(30);
    });

    it('should use sha256 algorithm', () => {
      expect(securityConfig.api.apiKeys.algorithm).toBe('sha256');
    });

    it('should have 32 byte key length', () => {
      expect(securityConfig.api.apiKeys.keyLength).toBe(32);
    });
  });

  // ============================================
  // API Security - Request Signing
  // ============================================
  describe('API Security - Request Signing', () => {
    it('should enable request signing', () => {
      expect(securityConfig.api.requestSigning.enabled).toBe(true);
    });

    it('should use sha256 algorithm', () => {
      expect(securityConfig.api.requestSigning.algorithm).toBe('sha256');
    });

    it('should allow 5 minute timestamp tolerance', () => {
      expect(securityConfig.api.requestSigning.timestampToleranceSeconds).toBe(300);
    });

    it('should require timestamp', () => {
      expect(securityConfig.api.requestSigning.requireTimestamp).toBe(true);
    });
  });

  // ============================================
  // API Security - Webhooks
  // ============================================
  describe('API Security - Webhooks', () => {
    it('should use sha256 algorithm', () => {
      expect(securityConfig.api.webhooks.algorithm).toBe('sha256');
    });

    it('should use X-Webhook-Signature header', () => {
      expect(securityConfig.api.webhooks.headerName).toBe('X-Webhook-Signature');
    });

    it('should use X-Webhook-Timestamp header', () => {
      expect(securityConfig.api.webhooks.timestampHeader).toBe('X-Webhook-Timestamp');
    });
  });

  // ============================================
  // CORS Configuration
  // ============================================
  describe('CORS Configuration', () => {
    it('should have allowed methods configured', () => {
      const methods = securityConfig.cors.allowedMethods;
      expect(methods).toContain('GET');
      expect(methods).toContain('POST');
      expect(methods).toContain('PUT');
      expect(methods).toContain('PATCH');
      expect(methods).toContain('DELETE');
    });

    it('should have allowed headers configured', () => {
      const headers = securityConfig.cors.allowedHeaders;
      expect(headers).toContain('Content-Type');
      expect(headers).toContain('Authorization');
      expect(headers).toContain('X-Request-ID');
      expect(headers).toContain('X-API-Key');
    });

    it('should expose rate limit headers', () => {
      expect(securityConfig.cors.exposedHeaders).toContain('X-RateLimit-Remaining');
    });

    it('should allow credentials', () => {
      expect(securityConfig.cors.credentials).toBe(true);
    });

    it('should cache preflight for 24 hours', () => {
      expect(securityConfig.cors.maxAge).toBe(86400);
    });
  });

  // ============================================
  // Content Security Policy
  // ============================================
  describe('Content Security Policy', () => {
    it('should have restrictive defaultSrc', () => {
      expect(securityConfig.csp.directives.defaultSrc).toContain("'self'");
    });

    it('should have restrictive scriptSrc', () => {
      expect(securityConfig.csp.directives.scriptSrc).toContain("'self'");
    });

    it('should block objects', () => {
      expect(securityConfig.csp.directives.objectSrc).toContain("'none'");
    });

    it('should block frames', () => {
      expect(securityConfig.csp.directives.frameSrc).toContain("'none'");
    });
  });

  // ============================================
  // Security Headers
  // ============================================
  describe('Security Headers', () => {
    it('should have HSTS max-age of 1 year', () => {
      expect(securityConfig.headers.hsts.maxAge).toBe(31536000);
    });

    it('should include subdomains in HSTS', () => {
      expect(securityConfig.headers.hsts.includeSubDomains).toBe(true);
    });

    it('should enable HSTS preload', () => {
      expect(securityConfig.headers.hsts.preload).toBe(true);
    });

    it('should deny framing', () => {
      expect(securityConfig.headers.frameguard.action).toBe('deny');
    });

    it('should enable nosniff', () => {
      expect(securityConfig.headers.contentTypeOptions.nosniff).toBe(true);
    });

    it('should enable XSS filter in block mode', () => {
      expect(securityConfig.headers.xssFilter.enabled).toBe(true);
      expect(securityConfig.headers.xssFilter.mode).toBe('block');
    });

    it('should have strict referrer policy', () => {
      expect(securityConfig.headers.referrerPolicy.policy).toBe('strict-origin-when-cross-origin');
    });
  });
});
