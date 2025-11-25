/**
 * Security Configuration
 * Centralized security settings for the Order Service
 */

export const securityConfig = {
  // Input Sanitization
  inputSanitization: {
    maxStringLength: 10000,
    maxArrayLength: 1000,
    allowedFileExtensions: ['.pdf', '.jpg', '.jpeg', '.png', '.gif'],
    allowedMimeTypes: [
      'application/pdf',
      'image/jpeg',
      'image/png',
      'image/gif'
    ],
    maxFileSize: 10 * 1024 * 1024, // 10MB
  },

  // XSS Protection
  xss: {
    enabled: true,
    whiteList: {}, // No HTML allowed by default
    stripIgnoreTag: true,
    stripIgnoreTagBody: ['script', 'style'],
  },

  // Command Execution
  commandExecution: {
    enabled: false, // Disable by default
    allowedCommands: [], // Whitelist of allowed commands
  },

  // Path Validation
  pathValidation: {
    allowedDirectories: [
      '/tmp/uploads',
      '/var/data/exports',
    ],
    maxDepth: 5,
    preventTraversal: true,
  },

  // Authentication
  authentication: {
    // Account Lockout
    lockout: {
      maxFailedAttempts: 5,
      lockoutDurationMinutes: 15,
      exponentialBackoff: true,
      maxLockoutDurationMinutes: 1440, // 24 hours
    },

    // Rate Limiting (per IP)
    rateLimit: {
      login: {
        windowMs: 15 * 60 * 1000, // 15 minutes
        maxAttempts: 5,
      },
      register: {
        windowMs: 60 * 60 * 1000, // 1 hour
        maxAttempts: 3,
      },
      passwordReset: {
        windowMs: 60 * 60 * 1000, // 1 hour
        maxAttempts: 3,
      },
    },

    // Password Requirements
    password: {
      minLength: 12,
      maxLength: 128,
      requireUppercase: true,
      requireLowercase: true,
      requireNumbers: true,
      requireSpecialChars: true,
      specialChars: '!@#$%^&*()_+-=[]{}|;:,.<>?',
      preventCommonPasswords: true,
      preventPasswordReuse: 5, // Last N passwords
    },

    // Session Management
    session: {
      idleTimeoutMinutes: 30,
      absoluteTimeoutHours: 8,
      refreshThresholdMinutes: 5,
      secureCookie: true,
      httpOnly: true,
      sameSite: 'strict' as const,
    },
  },

  // API Security
  api: {
    // API Keys
    apiKeys: {
      rotationDays: 90,
      deprecationWarningDays: 30,
      algorithm: 'sha256',
      keyLength: 32,
    },

    // Request Signing
    requestSigning: {
      enabled: true,
      algorithm: 'sha256',
      timestampToleranceSeconds: 300, // 5 minutes
      requireTimestamp: true,
    },

    // Webhook Signatures
    webhooks: {
      algorithm: 'sha256',
      headerName: 'X-Webhook-Signature',
      timestampHeader: 'X-Webhook-Timestamp',
    },
  },

  // CORS
  cors: {
    allowedOrigins: process.env.ALLOWED_ORIGINS?.split(',') || [],
    allowedMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID', 'X-API-Key'],
    exposedHeaders: ['X-Request-ID', 'X-RateLimit-Remaining'],
    credentials: true,
    maxAge: 86400, // 24 hours
  },

  // Content Security Policy
  csp: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
    },
  },

  // Security Headers
  headers: {
    hsts: {
      maxAge: 31536000, // 1 year
      includeSubDomains: true,
      preload: true,
    },
    frameguard: {
      action: 'deny' as const,
    },
    contentTypeOptions: {
      nosniff: true,
    },
    xssFilter: {
      enabled: true,
      mode: 'block' as const,
    },
    referrerPolicy: {
      policy: 'strict-origin-when-cross-origin' as const,
    },
  },
};

// Environment-specific overrides
if (process.env.NODE_ENV === 'development') {
  securityConfig.cors.allowedOrigins = ['http://localhost:3000', 'http://localhost:3001'];
}

