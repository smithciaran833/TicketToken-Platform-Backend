# COMPLETE DATABASE ANALYSIS: auth-service
Generated: Thu Oct  2 15:07:48 EDT 2025

================================================================================
## SECTION 1: ALL TYPESCRIPT/JAVASCRIPT FILES WITH DATABASE OPERATIONS
================================================================================

### FILE: src/routes/auth.routes.ts
```typescript
import { FastifyInstance } from 'fastify';
import { Container } from '../config/dependencies';
import { AuthController } from '../controllers/auth.controller';
import { AuthExtendedController } from '../controllers/auth-extended.controller';
import { SessionController } from '../controllers/session.controller';
import { ProfileController } from '../controllers/profile.controller';
import { createAuthMiddleware } from '../middleware/auth.middleware';
import { validate } from '../middleware/validation.middleware';
import * as schemas from '../validators/auth.validators';
import { loginRateLimiter, registrationRateLimiter } from '../utils/rateLimiter';

export async function authRoutes(fastify: FastifyInstance, options: { container: Container }) {
  const { container } = options;
  
  // Get services from container
  const authService = container.resolve('authService');
  const authExtendedService = container.resolve('authExtendedService');
  const mfaService = container.resolve('mfaService');
  const jwtService = container.resolve('jwtService');
  const walletService = container.resolve('walletService');
  const oauthService = container.resolve('oauthService');
  const rateLimitService = container.resolve('rateLimitService');
  const deviceTrustService = container.resolve('deviceTrustService');
  const biometricService = container.resolve('biometricService');
  const rbacService = container.resolve('rbacService');
  
  // Create controllers and middleware
  const controller = new AuthController(authService, mfaService);
  const extendedController = new AuthExtendedController(authExtendedService);
  const sessionController = new SessionController();
  const profileController = new ProfileController();
  const authMiddleware = createAuthMiddleware(jwtService, rbacService);

  // Helper to add tenant context
  const addTenantContext = async (request: any) => {
    const user = request.user;
    const tenantId = user?.tenant_id || '00000000-0000-0000-0000-000000000001';
    request.tenantId = tenantId;
  };

  // ============================================
  // PUBLIC ROUTES (Still need rate limiting)
  // ============================================
  
  // These routes are legitimately public but rate-limited
  fastify.post('/register', {
    preHandler: async (request: any, reply: any) => {
      await registrationRateLimiter.consume(request.ip);
      await validate(schemas.registerSchema)(request, reply);
    }
  }, async (request: any, reply: any) => {
    return controller.register(request, reply);
  });

  fastify.post('/login', {
    preHandler: async (request: any, reply: any) => {
      try {
        await rateLimitService.consume('login', null, request.ip);
      } catch (error) {
        return reply.status(429).send({
          error: 'Too many login attempts. Please try again later.'
        });
      }
      await loginRateLimiter.consume(request.ip);
      await validate(schemas.loginSchema)(request, reply);
    }
  }, async (request: any, reply: any) => {
    return controller.login(request, reply);
  });

  // Password reset routes (public but rate-limited)
  fastify.post('/forgot-password', {
    preHandler: async (request: any, reply: any) => {
      await rateLimitService.consume('forgot-password', null, request.ip);
      await validate(schemas.forgotPasswordSchema)(request, reply);
    }
  }, async (request: any, reply: any) => {
    return extendedController.forgotPassword(request, reply);
  });

  fastify.post('/reset-password', {
    preHandler: async (request: any, reply: any) => {
      await validate(schemas.resetPasswordSchema)(request, reply);
    }
  }, async (request: any, reply: any) => {
    return extendedController.resetPassword(request, reply);
  });

  // Email verification (public with token validation)
  fastify.get('/verify-email', {
    preHandler: async (request: any, reply: any) => {
      await validate(schemas.verifyEmailSchema)(request, reply);
    }
  }, async (request: any, reply: any) => {
    return extendedController.verifyEmail(request, reply);
  });

  // Token refresh (requires refresh token)
  fastify.post('/refresh', {
    preHandler: async (request: any, reply: any) => {
      await validate(schemas.refreshTokenSchema)(request, reply);
    }
  }, async (request: any, reply: any) => {
    return controller.refreshTokens(request, reply);
  });

  // ============================================
  // WALLET ROUTES (Special auth flow)
  // ============================================
  
  fastify.get('/wallet/nonce/:address', {
    preHandler: async (request: any, reply: any) => {
      await rateLimitService.consume('wallet-nonce', null, request.ip);
    }
  }, async (request: any, reply: any) => {
    const { address } = request.params;
    const nonce = await walletService.generateNonce(address);
    return { nonce };
  });

  fastify.post('/wallet/login', {
    preHandler: async (request: any, reply: any) => {
      await rateLimitService.consume('wallet-login', null, request.ip);
      await validate(schemas.walletLoginSchema)(request, reply);
    }
  }, async (request: any, reply: any) => {
    const { address, signature } = request.body;
    return walletService.verifyAndLogin(address, signature);
  });

  // ============================================
  // AUTHENTICATED ROUTES (Require valid JWT)
  // ============================================
  
  // Register authenticated routes group
  fastify.register(async function authenticatedRoutes(fastify) {
    // Add authentication to ALL routes in this group
    fastify.addHook('preHandler', async (request: any, reply: any) => {
      await authMiddleware.authenticate(request, reply);
      await addTenantContext(request);
    });

    // User verification status
    fastify.get('/verify', async (request: any, reply: any) => {
      return controller.verifyToken(request, reply);
    });

    // Current user info
    fastify.get('/me', async (request: any, reply: any) => {
      return controller.getCurrentUser(request, reply);
    });

    // Logout
    fastify.post('/logout', async (request: any, reply: any) => {
      return controller.logout(request, reply);
    });

    // Resend verification email
    fastify.post('/resend-verification', async (request: any, reply: any) => {
      return extendedController.resendVerification(request, reply);
    });

    // Change password (requires current password)
    fastify.put('/change-password', {
      preHandler: async (request: any, reply: any) => {
        await validate(schemas.changePasswordSchema)(request, reply);
      }
    }, async (request: any, reply: any) => {
      return extendedController.changePassword(request, reply);
    });

    // ============================================
    // MFA ROUTES (Authenticated)
    // ============================================
    
    fastify.post('/mfa/setup', {
      preHandler: async (request: any, reply: any) => {
        await validate(schemas.setupMFASchema)(request, reply);
      }
    }, async (request: any, reply: any) => {
      return controller.setupMFA(request, reply);
    });

    fastify.post('/mfa/verify', {
      preHandler: async (request: any, reply: any) => {
        await validate(schemas.verifyMFASchema)(request, reply);
      }
    }, async (request: any, reply: any) => {
      return controller.verifyMFA(request, reply);
    });

    fastify.delete('/mfa/disable', {
      preHandler: async (request: any, reply: any) => {
        await validate(schemas.disableMFASchema)(request, reply);
      }
    }, async (request: any, reply: any) => {
      return controller.disableMFA(request, reply);
    });

    // ============================================
    // WALLET MANAGEMENT (Authenticated)
    // ============================================
    
    fastify.post('/wallet/connect', {
      preHandler: async (request: any, reply: any) => {
        await validate(schemas.connectWalletSchema)(request, reply);
      }
    }, async (request: any, reply: any) => {
      const { address } = request.body;
      return walletService.connectWallet(request.user.id, address);
    });

    // ============================================
    // BIOMETRIC ROUTES (Authenticated)
    // ============================================
    
    fastify.post('/biometric/register', {
      preHandler: async (request: any, reply: any) => {
        await validate(schemas.biometricRegisterSchema)(request, reply);
      }
    }, async (request: any, reply: any) => {
      const result = await biometricService.registerBiometric(
        request.user.id, 
        request.body.publicKey
      );
      return result;
    });

    fastify.get('/biometric/challenge', async (request: any, reply: any) => {
      const challenge = await biometricService.generateChallenge(request.user.id);
      return { challenge };
    });

    // ============================================
    // OAUTH LINKING (Authenticated)
    // ============================================
    
    fastify.post('/oauth/:provider/link', {
      preHandler: async (request: any, reply: any) => {
        await validate(schemas.oauthLinkSchema)(request, reply);
      }
    }, async (request: any, reply: any) => {
      const { provider } = request.params;
      const { code } = request.body;
      return oauthService.linkProvider(request.user.id, provider, code);
    });

    // ============================================
    // SESSION MANAGEMENT (Authenticated)
    // ============================================
    
    fastify.get('/sessions', async (request: any, reply: any) => {
      return sessionController.listSessions(request, reply);
    });

    fastify.delete('/sessions/all', async (request: any, reply: any) => {
      return sessionController.invalidateAllSessions(request, reply);
    });

    fastify.delete('/sessions/:sessionId', async (request: any, reply: any) => {
      return sessionController.revokeSession(request, reply);
    });

    // ============================================
    // PROFILE MANAGEMENT (Authenticated)
    // ============================================
    
    fastify.get('/profile', async (request: any, reply: any) => {
      return profileController.getProfile(request, reply);
    });

    fastify.put('/profile', {
      preHandler: async (request: any, reply: any) => {
        await validate(schemas.updateProfileSchema)(request, reply);
      }
    }, async (request: any, reply: any) => {
      return profileController.updateProfile(request, reply);
    });

    // ============================================
    // VENUE ROLE MANAGEMENT (Authenticated + Permissions)
    // ============================================
    
    fastify.post('/venues/:venueId/roles', {
      preHandler: async (request: any, reply: any) => {
        await authMiddleware.requirePermission('roles:manage')(request, reply);
        await validate(schemas.grantRoleSchema)(request, reply);
      }
    }, async (request: any, reply: any) => {
      const { venueId } = request.params;
      const { userId, role } = request.body;
      
      await rbacService.grantVenueRole(userId, venueId, role);
      
      return {
        success: true,
        message: `Role ${role} granted to user ${userId} for venue ${venueId}`
      };
    });

    fastify.delete('/venues/:venueId/roles/:userId', {
      preHandler: async (request: any, reply: any) => {
        await authMiddleware.requirePermission('roles:manage')(request, reply);
      }
    }, async (request: any, reply: any) => {
      const { venueId, userId } = request.params;
      
      await rbacService.revokeVenueRoles(userId, venueId);
      
      return {
        success: true,
        message: `All roles revoked for user ${userId} at venue ${venueId}`
      };
    });

    fastify.get('/venues/:venueId/roles', {
      preHandler: async (request: any, reply: any) => {
        await authMiddleware.requireVenueAccess(request, reply);
      }
    }, async (request: any, reply: any) => {
      const { venueId } = request.params;
      const roles = await rbacService.getVenueRoles(venueId);
      return { roles };
    });
  });

  // OAuth routes (separate group with different auth flow)
  fastify.post('/oauth/:provider/login', {
    preHandler: async (request: any, reply: any) => {
      await rateLimitService.consume('oauth-login', null, request.ip);
      await validate(schemas.oauthLoginSchema)(request, reply);
    }
  }, async (request: any, reply: any) => {
    const { provider } = request.params;
    const { code } = request.body;
    
    try {
      const result = await oauthService.authenticate(provider, code);
      return {
        user: {
          id: result.user.id,
          email: result.user.email,
        },
        tokens: {
          accessToken: result.accessToken,
          refreshToken: result.refreshToken,
        }
      };
    } catch (error: any) {
      return reply.status(401).send({ error: error.message });
    }
  });
}

  // Cache statistics endpoint
```

### FILE: src/routes/health.routes.ts
```typescript
import { Router } from 'express';
import { pool } from '../config/database';

const router = Router();

// Basic health check
router.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'auth-service' });
});

// Database health check
router.get('/health/db', async (req, res) => {
  try {
    const result = await pool.query('SELECT 1');
    res.json({ 
      status: 'ok', 
      database: 'connected',
      service: 'auth-service' 
    });
  } catch (error: any) {
    res.status(503).json({ 
      status: 'error', 
      database: 'disconnected',
      error: error.message,
      service: 'auth-service'
    });
  }
});

export default router;
```

### FILE: src/config/env.ts
```typescript
import { config } from 'dotenv';

// Load environment variables
config();

export interface EnvConfig {
  // Server
  NODE_ENV: 'development' | 'test' | 'staging' | 'production';
  PORT: number;
  LOG_LEVEL: string;
  
  // Database
  DB_HOST: string;
  DB_PORT: number;
  DB_NAME: string;
  DB_USER: string;
  DB_PASSWORD: string;
  
  // Redis
  REDIS_HOST: string;
  REDIS_PORT: number;
  REDIS_PASSWORD?: string;
  
  // JWT
  JWT_ACCESS_SECRET: string;
  JWT_REFRESH_SECRET: string;
  JWT_ISSUER: string;
  JWT_ACCESS_EXPIRES_IN: string;
  JWT_REFRESH_EXPIRES_IN: string;
  
  // OAuth
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  GOOGLE_REDIRECT_URI?: string;
  APPLE_CLIENT_ID?: string;
  APPLE_TEAM_ID?: string;
  APPLE_KEY_ID?: string;
  
  // Security
  BCRYPT_ROUNDS: number;
  LOCKOUT_MAX_ATTEMPTS: number;
  LOCKOUT_DURATION_MINUTES: number;
  
  // MFA
  MFA_ISSUER: string;
  MFA_WINDOW: number;
  
  // Swagger
  ENABLE_SWAGGER?: boolean;
  
  // Service URLs
  API_GATEWAY_URL: string;
  VENUE_SERVICE_URL: string;
  NOTIFICATION_SERVICE_URL: string;
}

function validateEnv(): EnvConfig {
  const required = [
    'DB_HOST', 'DB_NAME', 'DB_USER', 'DB_PASSWORD',
    'JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET'
  ];
  
  for (const key of required) {
    if (!process.env[key]) {
      throw new Error(`Missing required environment variable: ${key}`);
    }
  }
  
  // Validate JWT secrets are different
  if (process.env.JWT_ACCESS_SECRET === process.env.JWT_REFRESH_SECRET) {
    throw new Error('JWT access and refresh secrets must be different');
  }
  
  // Validate JWT secrets length (256-bit minimum)
  if (process.env.JWT_ACCESS_SECRET!.length < 32 || process.env.JWT_REFRESH_SECRET!.length < 32) {
    throw new Error('JWT secrets must be at least 32 characters (256 bits)');
  }
  
  return {
    NODE_ENV: (process.env.NODE_ENV as any) || 'development',
    PORT: parseInt(process.env.PORT || '3001', 10),
    LOG_LEVEL: process.env.LOG_LEVEL || 'info',
    
    DB_HOST: process.env.DB_HOST!,
    DB_PORT: parseInt(process.env.DB_PORT || '5432', 10),
    DB_NAME: process.env.DB_NAME!,
    DB_USER: process.env.DB_USER!,
    DB_PASSWORD: process.env.DB_PASSWORD!,
    
    REDIS_HOST: process.env.REDIS_HOST || 'redis',
    REDIS_PORT: parseInt(process.env.REDIS_PORT || '6379', 10),
    REDIS_PASSWORD: process.env.REDIS_PASSWORD,
    
    JWT_ACCESS_SECRET: process.env.JWT_ACCESS_SECRET!,
    JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET!,
    JWT_ISSUER: process.env.JWT_ISSUER || 'api.tickettoken.com',
    JWT_ACCESS_EXPIRES_IN: process.env.JWT_ACCESS_EXPIRES_IN || '2h',
    JWT_REFRESH_EXPIRES_IN: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
    
    BCRYPT_ROUNDS: parseInt(process.env.BCRYPT_ROUNDS || '12', 10),
    LOCKOUT_MAX_ATTEMPTS: parseInt(process.env.LOCKOUT_MAX_ATTEMPTS || '5', 10),
    LOCKOUT_DURATION_MINUTES: parseInt(process.env.LOCKOUT_DURATION_MINUTES || '15', 10),
    
    MFA_ISSUER: process.env.MFA_ISSUER || 'TicketToken',
    MFA_WINDOW: parseInt(process.env.MFA_WINDOW || '2', 10),
    
    ENABLE_SWAGGER: process.env.ENABLE_SWAGGER === 'true',
    
    API_GATEWAY_URL: process.env.API_GATEWAY_URL || 'http://api-gateway:3000',
    VENUE_SERVICE_URL: process.env.VENUE_SERVICE_URL || 'http://venue-service:3002',
    NOTIFICATION_SERVICE_URL: process.env.NOTIFICATION_SERVICE_URL || 'http://notification-service:3008'
  };
}

export const env = validateEnv();
```

### FILE: src/config/database.ts
```typescript
import { Pool } from 'pg';
import knex from 'knex';

// Simple, working configuration
const dbConfig = {
  host: process.env.DB_HOST || 'tickettoken-postgres',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'tickettoken_db',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
};

export const pool = new Pool({
  ...dbConfig,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

export const db = knex({
  client: 'pg',
  connection: dbConfig,
  pool: { min: 2, max: 10 }
});

pool.on('connect', (client) => {
  console.log('New client connected to database');
});

pool.on('error', (err) => {
  console.error('Unexpected database error:', err);
});

export async function checkDatabaseHealth(): Promise<boolean> {
  try {
    const result = await pool.query('SELECT NOW()');
    return !!result.rows[0];
  } catch (error) {
    console.error('Database health check failed:', error);
    return false;
  }
}

export async function closeDatabaseConnections() {
  await db.destroy();
  await pool.end();
}
```

### FILE: src/migrations/003_add_tenant_to_users.ts
```typescript
import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // First check if tenants table exists, if not create it
  const hasTenantsTable = await knex.schema.hasTable('tenants');
  if (!hasTenantsTable) {
    await knex.schema.createTable('tenants', (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      table.string('name').notNullable();
      table.string('slug').unique().notNullable();
      table.string('status').defaultTo('active');
      table.jsonb('settings').defaultTo('{}');
      table.timestamps(true, true);
    });
    
    // Insert default tenant
    await knex('tenants').insert({
      id: '00000000-0000-0000-0000-000000000001',
      name: 'Default Tenant',
      slug: 'default'
    });
  }

  // Add tenant_id to users table
  await knex.schema.alterTable('users', (table) => {
    table.uuid('tenant_id')
      .defaultTo('00000000-0000-0000-0000-000000000001')
      .notNullable();
    table.index('tenant_id');
    table.index(['tenant_id', 'email']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('users', (table) => {
    table.dropIndex(['tenant_id', 'email']);
    table.dropIndex(['tenant_id']);
    table.dropColumn('tenant_id');
  });
}
```

### FILE: src/migrations/001_initial_auth_tables.ts
```typescript
import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Users table
  await knex.schema.createTable('users', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('email').notNullable().unique();
    table.string('password_hash').notNullable();
    table.string('first_name');
    table.string('last_name');
    table.boolean('email_verified').defaultTo(false);
    table.string('email_verification_token');
    table.timestamp('email_verified_at');
    table.boolean('is_active').defaultTo(true);
    table.timestamp('last_login_at');
    table.jsonb('metadata').defaultTo('{}');
    table.timestamps(true, true);
  });

  // Sessions table
  await knex.schema.createTable('sessions', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    table.string('token').notNullable().unique();
    table.string('ip_address');
    table.string('user_agent');
    table.timestamp('expires_at').notNullable();
    table.boolean('is_active').defaultTo(true);
    table.timestamps(true, true);
  });

  // MFA settings table
  await knex.schema.createTable('mfa_settings', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    table.boolean('enabled').defaultTo(false);
    table.string('secret');
    table.string('backup_codes', 1000);
    table.timestamps(true, true);
  });

  // Password reset tokens
  await knex.schema.createTable('password_reset_tokens', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    table.string('token').notNullable().unique();
    table.timestamp('expires_at').notNullable();
    table.boolean('used').defaultTo(false);
    table.timestamps(true, true);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('password_reset_tokens');
  await knex.schema.dropTableIfExists('mfa_settings');
  await knex.schema.dropTableIfExists('sessions');
  await knex.schema.dropTableIfExists('users');
}
```

### FILE: src/index.ts
```typescript
import express, { Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { RateLimiterMemory } from 'rate-limiter-flexible';
import Joi from 'joi';
import { pool, checkDatabaseHealth } from './config/database';
import { AuthService } from './services/auth.service';
import { JWTService } from './services/jwt.service';
import { MFAService } from './services/mfa.service';
import { WalletService } from './services/wallet.service';
import { OAuthService } from './services/oauth.service';
import { AuthExtendedService } from './services/auth-extended.service';
import { EmailService } from './services/email.service';

const app = express();
const PORT = process.env.PORT || 3001;

// Initialize services
const jwtService = new JWTService();
const authService = new AuthService(jwtService);
const emailService = new EmailService();
const authExtendedService = new AuthExtendedService(emailService);
const mfaService = new MFAService();
const walletService = new WalletService();
const oauthService = new OAuthService();

// Rate limiter configuration
const loginRateLimiter = new RateLimiterMemory({
  points: 5,
  duration: 900,
  blockDuration: 900,
});

app.use(helmet());
app.use(cors());
app.use(express.json());

// Request logging
app.use((req, res, next) => {
  console.log(`${req.method} ${req.url}`);
  next();
});

// Auth middleware - fix return type issue
const requireAuth = async (req: any, res: Response, next: any): Promise<void> => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) {
      res.status(401).json({ error: 'No token provided' });
      return;
    }
    const payload = await jwtService.verifyAccessToken(token);
    req.user = payload;
    next();
  } catch (error) {
    res.status(401).json({ error: 'Invalid token' });
    return;
  }
};

// Define validation schemas
const registerSchema = Joi.object({
  email: Joi.string().email().max(255).required(),
  password: Joi.string()
    .min(8)
    .max(128)
    .pattern(/^(?=.*[A-Za-z])(?=.*\d)(?=.*[@$!%*#?&])[A-Za-z\d@$!%*#?&]/)
    .required()
    .messages({
      'string.pattern.base': 'Password must contain at least one letter, one number, and one special character'
    }),
  firstName: Joi.string().min(1).max(100).required(),
  lastName: Joi.string().min(1).max(100).required(),
  phone: Joi.string().pattern(/^\+?[1-9]\d{1,14}$/).optional().allow('')
});

const loginSchema = Joi.object({
  email: Joi.string().email().max(255).required(),
  password: Joi.string().required()
});

// Health check endpoint
app.get('/health', async (req: Request, res: Response) => {

// ISSUE #29 FIX: Metrics endpoint for Prometheus monitoring
app.get('/metrics', async (req: Request, res: Response) => {
  const { register } = await import('./utils/metrics');
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});
  const dbHealthy = await checkDatabaseHealth();
  res.json({
    status: dbHealthy ? 'healthy' : 'degraded',
    service: 'auth-service',
    timestamp: new Date().toISOString()
  });
});

// ISSUE #28 FIX: All auth routes now consistently under /auth prefix

// Registration endpoint
app.post('/auth/register', async (req: Request, res: Response): Promise<void> => {
  try {
    const { error, value } = registerSchema.validate(req.body, {
      abortEarly: false,
      stripUnknown: true
    });

    if (error) {
      const errors = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message
      }));
      res.status(400).json({ success: false, errors });
      return;
    }

    const { email, password, firstName, lastName, phone } = value;

    const result = await authService.register({
      email: email.toLowerCase().trim(),
      password,
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      phone: phone ? phone.trim() : null
    });

    res.status(201).json({
      success: true,
      data: result
    });
  } catch (error: any) {
    console.error('Registration error:', error);
    if (error.message.includes('already registered')) {
      res.status(409).json({
        success: false,
        error: 'Email already registered'
      });
      return;
    }
    res.status(500).json({
      success: false,
      error: error.message || 'Registration failed'
    });
  }
});

// Login endpoint
app.post('/auth/login', async (req: Request, res: Response): Promise<void> => {
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  const userAgent = req.headers['user-agent'] || 'unknown';

  try {
    // Rate limiting check
    try {
      await loginRateLimiter.consume(ip);
    } catch (rateLimitError) {
      res.status(429).json({
        success: false,
        error: 'Too many login attempts. Please try again later.'
      });
      return;
    }

    const { error, value } = loginSchema.validate(req.body, {
      abortEarly: false,
      stripUnknown: true
    });

    if (error) {
      res.status(400).json({
        success: false,
        error: 'Invalid email or password format'
      });
      return;
    }

    const { email, password } = value;

    const result = await authService.login({
      email: email.toLowerCase().trim(),
      password,
      ipAddress: ip,
      userAgent: userAgent
    });

    // Track successful login
    try {
      await pool.query(
        `UPDATE users
         SET last_login_at = NOW(),
             last_login_ip = $1,
             login_count = COALESCE(login_count, 0) + 1,
             failed_login_attempts = 0
         WHERE id = $2`,
        [ip, result.user.id]
      );
    } catch (trackingError) {
      console.error('Failed to track login:', trackingError);
    }

    res.json({
      success: true,
      data: result
    });
  } catch (error: any) {
    console.error('Login error:', error);
    
    if (error.message.includes('Invalid credentials')) {
      res.status(401).json({
        success: false,
        error: 'Invalid email or password'
      });
      return;
    }

    res.status(500).json({
      success: false,
      error: 'Login failed'
    });
  }
});

// Logout endpoint
app.post('/auth/logout', requireAuth, async (req: any, res: Response): Promise<void> => {
  try {
    await authService.logout(req.user.userId);
    await pool.query(
      `INSERT INTO auth_audit_log (user_id, event_type, ip_address)
       VALUES ($1, $2, $3)`,
      [req.user.userId, 'LOGOUT', req.ip]
    );
    res.json({ success: true, message: 'Logged out successfully' });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ error: 'Logout failed' });
  }
});

// Refresh token endpoint
app.post('/auth/refresh', async (req: Request, res: Response): Promise<void> => {
  try {
    const { refreshToken } = req.body;
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const userAgent = req.headers['user-agent'] || 'unknown';
    
    if (!refreshToken) {
      res.status(400).json({ error: 'Refresh token required' });
      return;
    }

    const result = await authService.refreshTokens(refreshToken, ip, userAgent);
    res.json({ success: true, data: result });
  } catch (error: any) {
    console.error('Token refresh error:', error);
    res.status(401).json({ error: 'Invalid refresh token' });
  }
});

// Email verification endpoint
app.get('/auth/verify-email', async (req: Request, res: Response): Promise<void> => {
  try {
    const { token } = req.query;
    if (!token || typeof token !== 'string') {
      res.status(400).json({ error: 'Verification token required' });
      return;
    }

    await authExtendedService.verifyEmail(token);
    res.json({ success: true, message: 'Email verified successfully' });
  } catch (error: any) {
    console.error('Email verification error:', error);
    res.status(400).json({ error: 'Invalid or expired verification token' });
  }
});

// MFA endpoints
app.post('/auth/mfa/setup', requireAuth, async (req: any, res: Response) => {
  try {
    const result = await mfaService.setupTOTP(req.user.userId);
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('MFA setup error:', error);
    res.status(500).json({ error: 'Failed to setup MFA' });
  }
});

app.post('/auth/mfa/verify', requireAuth, async (req: any, res: Response) => {
  try {
    const { token } = req.body;
    const isValid = await mfaService.verifyTOTP(req.user.userId, token);
    res.json({ success: true, valid: isValid });
  } catch (error) {
    console.error('MFA verify error:', error);
    res.status(500).json({ error: 'Failed to verify MFA token' });
  }
});

// Wallet authentication
app.post('/auth/wallet/login', async (req: Request, res: Response) => {
  try {
    const { address, signature, message } = req.body;
    const result = await walletService.loginWithWallet(address, signature, message);
    res.json({ success: true, data: result });
  } catch (error: any) {
    console.error('Wallet auth error:', error);
    res.status(401).json({ error: 'Wallet authentication failed' });
  }
});

// OAuth endpoints
app.post('/auth/oauth/:provider/login', async (req: Request, res: Response): Promise<void> => {
  try {
    const { provider } = req.params;
    const { token } = req.body;
    
    if (provider !== 'google' && provider !== 'apple') {
      res.status(400).json({ error: 'Invalid OAuth provider' });
      return;
    }
    
    const result = await oauthService.handleOAuthLogin(provider, token);
    res.json({ success: true, data: result });
  } catch (error: any) {
    console.error('OAuth error:', error);
    res.status(401).json({ error: 'OAuth authentication failed' });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`Auth service running on port ${PORT}`);
  console.log('\nEndpoints (all under /auth prefix):');
  console.log('  POST /auth/register - Register new user');
  console.log('  POST /auth/login - User login');
  console.log('  POST /auth/logout - User logout');
  console.log('  POST /auth/refresh - Refresh access token');
  console.log('  GET  /auth/verify-email - Verify email');
  console.log('  POST /auth/mfa/setup - Setup MFA');
  console.log('  POST /auth/mfa/verify - Verify MFA token');
  console.log('  POST /auth/wallet/login - Wallet authentication');
  console.log('  POST /auth/oauth/:provider/login - OAuth login');
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, closing connections...');
  await pool.end();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, closing connections...');
  await pool.end();
  process.exit(0);
});
```

### FILE: src/db/migrations/001_create_users_table.ts
```typescript
import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Create users table
  await knex.schema.createTable('users', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('email', 255).notNullable().unique();
    table.string('password_hash', 255).notNullable();
    table.string('first_name', 100).notNullable();
    table.string('last_name', 100).notNullable();
    table.string('phone', 20);
    table.boolean('email_verified').defaultTo(false);
    table.boolean('phone_verified').defaultTo(false);
    table.enum('kyc_status', ['pending', 'verified', 'rejected']).defaultTo('pending');
    table.integer('kyc_level').defaultTo(0);
    table.boolean('mfa_enabled').defaultTo(false);
    table.string('mfa_secret', 255);
    table.jsonb('backup_codes').defaultTo('[]');
    table.timestamps(true, true);
    table.timestamp('last_login_at');
    table.string('last_login_ip', 45);
    table.integer('failed_login_attempts').defaultTo(0);
    table.timestamp('locked_until');
    table.string('password_reset_token', 255);
    table.timestamp('password_reset_expires');
    table.string('email_verification_token', 255);
    table.timestamp('email_verification_expires');
    
    // Soft delete columns
    table.timestamp('deleted_at');
    table.uuid('deleted_by');
    table.string('deletion_reason', 255);
    
    // Optimistic locking
    table.integer('version').defaultTo(0);
    
    // Indexes
    table.index('email');
    table.index('deleted_at');
    table.index(['email', 'deleted_at']);
    table.index('last_login_at');
    table.index('password_reset_token');
    table.index('email_verification_token');
  });

  // Create user_venue_roles table
  await knex.schema.createTable('user_venue_roles', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('user_id').notNullable().references('users.id').onDelete('CASCADE');
    table.uuid('venue_id').notNullable();
    table.enum('role', ['venue-owner', 'venue-manager', 'box-office', 'door-staff']).notNullable();
    table.uuid('granted_by').notNullable().references('users.id');
    table.timestamp('granted_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('expires_at');
    table.boolean('is_active').defaultTo(true);
    table.timestamps(true, true);
    
    // Indexes
    table.unique(['user_id', 'venue_id', 'role']);
    table.index('user_id');
    table.index('venue_id');
    table.index(['venue_id', 'role']);
    table.index('expires_at');
  });

  // Create user_sessions table
  await knex.schema.createTable('user_sessions', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('user_id').notNullable().references('users.id').onDelete('CASCADE');
    table.string('session_token', 255).notNullable().unique();
    table.string('ip_address', 45).notNullable();
    table.text('user_agent');
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('expires_at').notNullable();
    table.timestamp('revoked_at');
    
    // Indexes
    table.index('session_token');
    table.index('user_id');
    table.index('expires_at');
  });

  // Create login_attempts table
  await knex.schema.createTable('login_attempts', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('email', 255).notNullable();
    table.string('ip_address', 45).notNullable();
    table.boolean('success').notNullable();
    table.timestamp('attempted_at').notNullable().defaultTo(knex.fn.now());
    table.string('failure_reason', 100);
    
    // Indexes
    table.index(['email', 'attempted_at']);
    table.index(['ip_address', 'attempted_at']);
    table.index(['email', 'ip_address', 'attempted_at']);
  });

  // Create updated_at trigger function
  await knex.raw(`
    CREATE OR REPLACE FUNCTION update_updated_at_column()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.updated_at = NOW();
      RETURN NEW;
    END;
    $$ language 'plpgsql';
  `);

  // Apply trigger to tables
  const tables = ['users', 'user_venue_roles'];
  for (const tableName of tables) {
    await knex.raw(`
      CREATE TRIGGER update_${tableName}_updated_at 
      BEFORE UPDATE ON ${tableName} 
      FOR EACH ROW 
      EXECUTE FUNCTION update_updated_at_column();
    `);
  }
}

export async function down(knex: Knex): Promise<void> {
  // Drop triggers
  await knex.raw('DROP TRIGGER IF EXISTS update_users_updated_at ON users');
  await knex.raw('DROP TRIGGER IF EXISTS update_user_venue_roles_updated_at ON user_venue_roles');
  
  // Drop function
  await knex.raw('DROP FUNCTION IF EXISTS update_updated_at_column()');
  
  // Drop tables
  await knex.schema.dropTableIfExists('login_attempts');
  await knex.schema.dropTableIfExists('user_sessions');
  await knex.schema.dropTableIfExists('user_venue_roles');
  await knex.schema.dropTableIfExists('users');
}
```

### FILE: src/db/migrations/002_create_audit_logs_table.ts
```typescript
import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('audit_logs', (table) => {
    table.uuid('id').primary().defaultTo(knex.fn.uuid());
    table.uuid('user_id').nullable();
    table.string('action', 100).notNullable();
    table.string('resource_type', 50).nullable();
    table.string('resource_id').nullable();
    table.string('ip_address', 45).nullable();
    table.text('user_agent').nullable();
    table.jsonb('metadata').nullable();
    table.enum('status', ['success', 'failure']).notNullable().defaultTo('success');
    table.text('error_message').nullable();
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    
    // Indexes
    table.index('user_id');
    table.index('action');
    table.index('created_at');
    table.index(['resource_type', 'resource_id']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('audit_logs');
}
```

### FILE: src/utils/rateLimiter.ts
```typescript
import { redis } from '../config/redis';
import { RateLimitError } from '../errors';

interface RateLimitOptions {
  points: number;      // Number of requests
  duration: number;    // Per duration in seconds
  blockDuration?: number; // Block duration in seconds after limit exceeded
}

export class RateLimiter {
  private keyPrefix: string;
  private options: RateLimitOptions;

  constructor(keyPrefix: string, options: RateLimitOptions) {
    this.keyPrefix = keyPrefix;
    this.options = {
      blockDuration: options.duration * 2,
      ...options
    };
  }

  async consume(key: string, _points = 1): Promise<void> {
    const fullKey = `${this.keyPrefix}:${key}`;
    const blockKey = `${fullKey}:block`;

    // Check if blocked
    const blocked = await redis.get(blockKey);
    if (blocked) {
      const ttl = await redis.ttl(blockKey);
      throw new RateLimitError('Too many requests', ttl);
    }

    // Get current points
    const currentPoints = await redis.incr(fullKey);
    
    // Set expiry on first request
    if (currentPoints === 1) {
      await redis.expire(fullKey, this.options.duration);
    }

    // Check if limit exceeded
    if (currentPoints > this.options.points) {
      // Block the key
      await redis.setex(blockKey, this.options.blockDuration!, '1');
      
      throw new RateLimitError(
        'Rate limit exceeded',
        this.options.blockDuration!
      );
    }
  }

  async reset(key: string): Promise<void> {
    const fullKey = `${this.keyPrefix}:${key}`;
    const blockKey = `${fullKey}:block`;
    
    await redis.del(fullKey);
    await redis.del(blockKey);
  }
}

// Pre-configured rate limiters
export const loginRateLimiter = new RateLimiter('login', {
  points: 5,        // 5 attempts
  duration: 900,    // per 15 minutes
  blockDuration: 900 // block for 15 minutes
});

export const registrationRateLimiter = new RateLimiter('register', {
  points: 3,        // 3 registrations
  duration: 3600,   // per hour
  blockDuration: 3600
});

export const passwordResetRateLimiter = new RateLimiter('password-reset', {
  points: 3,        // 3 attempts
  duration: 3600,   // per hour
  blockDuration: 3600
});
```

### FILE: src/models/user.model.ts
```typescript
export interface User {
  id: string;
  email: string;
  password_hash: string;
  first_name: string;
  last_name: string;
  phone?: string;
  email_verified: boolean;
  phone_verified: boolean;
  kyc_status: 'pending' | 'verified' | 'rejected';
  kyc_level: number;
  mfa_enabled: boolean;
  mfa_secret?: string;
  backup_codes?: string[];
  created_at: Date;
  updated_at: Date;
  last_login_at?: Date;
  last_login_ip?: string;
  failed_login_attempts: number;
  locked_until?: Date;
  password_reset_token?: string;
  password_reset_expires?: Date;
  email_verification_token?: string;
  email_verification_expires?: Date;
  deleted_at?: Date;
  deleted_by?: string;
  deletion_reason?: string;
  version: number; // For optimistic locking
}

export interface UserVenueRole {
  id: string;
  user_id: string;
  venue_id: string;
  role: 'venue-owner' | 'venue-manager' | 'box-office' | 'door-staff';
  granted_by: string;
  granted_at: Date;
  expires_at?: Date;
  is_active: boolean;
}

export interface UserSession {
  id: string;
  user_id: string;
  session_token: string;
  ip_address: string;
  user_agent: string;
  created_at: Date;
  expires_at: Date;
  revoked_at?: Date;
}

export interface LoginAttempt {
  id: string;
  email: string;
  ip_address: string;
  success: boolean;
  attempted_at: Date;
  failure_reason?: string;
}
```

### FILE: src/middleware/security.middleware.ts
```typescript
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import mongoSanitize from 'express-mongo-sanitize';
import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

// Extend Express Request type to include session
declare module 'express' {
  interface Request {
    session?: any;
    rateLimit?: any;
  }
}

// Security headers with helmet
export const securityHeaders = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true,
  },
});

// Rate limiting configurations
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 requests per window
  message: 'Too many authentication attempts, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req: Request, res: Response) => {
    res.status(429).json({
      error: 'Too many requests',
      retryAfter: req.rateLimit?.resetTime,
    });
  },
});

export const generalRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 requests per window
  message: 'Too many requests from this IP',
});

// Prevent MongoDB injection attacks
export const sanitizeInput = mongoSanitize({
  replaceWith: '_',
  onSanitize: ({ req, key }) => {
    console.warn(`Sanitized ${key} in request from ${req.ip}`);
  },
});

// CSRF token generation and validation
export const generateCSRFToken = (): string => {
  return crypto.randomBytes(32).toString('hex');
};

export const validateCSRFToken = (req: Request, res: Response, next: NextFunction): void => {
  const token = req.headers['x-csrf-token'] || req.body._csrf;
  const sessionToken = req.session?.csrfToken;
  
  if (!token || token !== sessionToken) {
    res.status(403).json({ error: 'Invalid CSRF token' });
    return;
  }
  
  next();
};

// XSS protection
export const xssProtection = (req: Request, _res: Response, next: NextFunction): void => {
  // Clean all string inputs
  const cleanInput = (obj: any): any => {
    if (typeof obj === 'string') {
      return obj.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
    } else if (typeof obj === 'object' && obj !== null) {
      for (const key in obj) {
        obj[key] = cleanInput(obj[key]);
      }
    }
    return obj;
  };
  
  req.body = cleanInput(req.body);
  req.query = cleanInput(req.query);
  req.params = cleanInput(req.params);
  
  next();
};
```

### FILE: src/middleware/validation.middleware.ts
```typescript
import { FastifyRequest, FastifyReply } from 'fastify';
import Joi from 'joi';
import { ValidationError } from '../errors';

export function validate(schema: Joi.Schema) {
  return async (request: FastifyRequest, _reply: FastifyReply) => {
    try {
      const validated = await schema.validateAsync(request.body, {
        abortEarly: false,
        stripUnknown: true,
      });
      
      request.body = validated;
    } catch (error) {
      if (error instanceof Joi.ValidationError) {
        const errors = error.details.map(detail => ({
          field: detail.path.join('.'),
          message: detail.message,
        }));
        
        throw new ValidationError(errors);
      }
      throw error;
    }
  };
}
```

### FILE: src/middleware/token-validator.ts
```typescript
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { pool } from '../config/database';
import Redis from 'ioredis';
import { v4 as uuidv4 } from 'uuid';

const redis = new Redis({
  host: process.env.REDIS_HOST || 'redis',
  port: 6379
});

export class TokenValidator {
  private readonly CACHE_TTL = 60; // Cache validation results for 60 seconds

  async validateToken(req: Request, res: Response, next: NextFunction) {
    try {
      const token = req.headers.authorization?.replace('Bearer ', '');

      if (!token) {
        return res.status(401).json({ error: 'No token provided' });
      }

      // Decode token to get JTI
      const decoded: any = jwt.decode(token);
      if (!decoded || !decoded.jti) {
        return res.status(401).json({ error: 'Invalid token format' });
      }

      const jti = decoded.jti;
      const userId = decoded.sub;

      // 1. Check Redis cache first (fastest)
      const cachedStatus = await redis.get(`token:${jti}`);
      if (cachedStatus === 'revoked') {
        return res.status(401).json({ error: 'Token has been revoked' });
      }
      if (cachedStatus === 'valid') {
        req.user = decoded;
        return next();
      }

      // 2. Check database (if not in cache)
      const result = await pool.query(
        `SELECT t.revoked, t.expires_at, f.revoked as family_revoked
         FROM active_tokens t
         LEFT JOIN token_families f ON t.family_id = f.family_id
         WHERE t.jti = $1`,
        [jti]
      );

      if (result.rows.length === 0) {
        // Token not tracked - could be old format, verify signature only
        try {
          jwt.verify(token, process.env.JWT_SECRET!);
          req.user = decoded;
          return next();
        } catch {
          return res.status(401).json({ error: 'Invalid token' });
        }
      }

      const tokenData = result.rows[0];

      // Check if revoked
      if (tokenData.revoked || tokenData.family_revoked) {
        await redis.setex(`token:${jti}`, this.CACHE_TTL, 'revoked');

        // Log suspicious activity if token used after revocation
        await pool.query(
          `INSERT INTO auth_audit_log (user_id, event_type, ip_address, details)
           VALUES ($1, 'REVOKED_TOKEN_USE', $2, $3)`,
          [userId, req.ip, JSON.stringify({ jti })]
        );

        return res.status(401).json({ error: 'Token has been revoked' });
      }

      // Check expiration
      if (new Date(tokenData.expires_at) < new Date()) {
        return res.status(401).json({ error: 'Token expired' });
      }

      // Token is valid - cache it
      await redis.setex(`token:${jti}`, this.CACHE_TTL, 'valid');

      // Update last used timestamp (async, don't wait)
      pool.query(
        'UPDATE active_tokens SET used_at = CURRENT_TIMESTAMP WHERE jti = $1',
        [jti]
      ).catch(err => console.error('Failed to update token usage:', err));

      // Verify JWT signature
      try {
        jwt.verify(token, process.env.JWT_SECRET!);
        req.user = decoded;
        next();
      } catch (error) {
        return res.status(401).json({ error: 'Invalid token signature' });
      }
    } catch (error) {
      console.error('Token validation error:', error);
      return res.status(500).json({ error: 'Token validation failed' });
    }
  }

  // Revoke a specific token
  async revokeToken(jti: string, reason: string = 'User action') {
    await pool.query(
      'UPDATE active_tokens SET revoked = TRUE WHERE jti = $1',
      [jti]
    );
    await redis.setex(`token:${jti}`, 86400, 'revoked'); // Cache for 24 hours
  }

  // Revoke all tokens for a user
  async revokeUserTokens(userId: string, reason: string = 'Security') {
    await pool.query('SELECT revoke_all_user_tokens($1, $2)', [userId, reason]);

    // Clear Redis cache for user's tokens
    const tokens = await pool.query(
      'SELECT jti FROM active_tokens WHERE user_id = $1',
      [userId]
    );

    for (const token of tokens.rows) {
      await redis.del(`token:${token.jti}`);
    }
  }

  // Implement refresh token rotation
  async rotateRefreshToken(oldRefreshToken: string): Promise<{ accessToken: string; refreshToken: string }> {
    const decoded: any = jwt.decode(oldRefreshToken);

    // Check if refresh token family is valid
    const familyCheck = await pool.query(
      'SELECT * FROM token_families WHERE family_id = $1 AND revoked = FALSE',
      [decoded.familyId]
    );

    if (familyCheck.rows.length === 0) {
      // Possible token theft - revoke entire family
      await this.revokeTokenFamily(decoded.familyId, 'Possible token theft detected');
      throw new Error('Invalid refresh token family');
    }

    // Generate new token pair
    const newTokens = await this.generateTokenPair(decoded.sub, decoded.familyId);

    // Mark old refresh token as used
    await pool.query(
      'UPDATE active_tokens SET used_at = CURRENT_TIMESTAMP WHERE jti = $1',
      [decoded.jti]
    );

    // Update family rotation info
    await pool.query(
      `UPDATE token_families
       SET last_rotated_at = CURRENT_TIMESTAMP,
           rotation_count = rotation_count + 1
       WHERE family_id = $1`,
      [decoded.familyId]
    );

    return newTokens;
  }

  private async revokeTokenFamily(familyId: string, reason: string) {
    await pool.query(
      `UPDATE token_families
       SET revoked = TRUE, revoked_at = CURRENT_TIMESTAMP, revoke_reason = $1
       WHERE family_id = $2`,
      [reason, familyId]
    );

    await pool.query(
      'UPDATE active_tokens SET revoked = TRUE WHERE family_id = $1',
      [familyId]
    );
  }

  private async generateTokenPair(userId: string, familyId: string): Promise<{ accessToken: string; refreshToken: string }> {
    const accessTokenJti = uuidv4();
    const refreshTokenJti = uuidv4();
    
    // Generate access token (15 minutes)
    const accessToken = jwt.sign(
      { 
        sub: userId, 
        jti: accessTokenJti,
        familyId: familyId,
        type: 'access'
      },
      process.env.JWT_SECRET!,
      { expiresIn: '15m' }
    );
    
    // Generate refresh token (7 days)
    const refreshToken = jwt.sign(
      { 
        sub: userId, 
        jti: refreshTokenJti,
        familyId: familyId,
        type: 'refresh'
      },
      process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET!,
      { expiresIn: '7d' }
    );

    // Track tokens in database
    const accessExpires = new Date(Date.now() + 15 * 60 * 1000);
    const refreshExpires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    
    await pool.query(
      `INSERT INTO active_tokens (jti, user_id, family_id, token_type, expires_at, created_at)
       VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)`,
      [accessTokenJti, userId, familyId, 'access', accessExpires]
    );
    
    await pool.query(
      `INSERT INTO active_tokens (jti, user_id, family_id, token_type, expires_at, created_at)
       VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)`,
      [refreshTokenJti, userId, familyId, 'refresh', refreshExpires]
    );
    
    return { accessToken, refreshToken };
  }
}
```

### FILE: src/middleware/enhanced-security.ts
```typescript
import { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

// Extend Request interface to include custom properties
interface ExtendedRequest extends Request {
  clientIp?: string;
  db?: any;
}

// Stub for audit logger if shared module isn't available
const auditLogger = {
  log: async (data: any) => {
    console.log('Audit:', data);
  }
};

const AUDIT_ACTIONS = {
  LOGIN_FAILED: 'LOGIN_FAILED'
};

export async function secureLogin(req: ExtendedRequest, res: Response, next: NextFunction): Promise<void> {
  const { email, password } = req.body;
  const ipAddress = req.clientIp || req.ip;
  const userAgent = req.headers['user-agent'] || '';
  
  try {
    // Check if account is locked
    if (req.db) {
      const lockCheck = await req.db.query(
        `SELECT locked_until FROM failed_login_attempts
         WHERE email = $1 AND ip_address = $2 AND locked_until > NOW()`,
        [email, ipAddress]
      );
      
      if (lockCheck.rows.length > 0) {
        await auditLogger.log({
          action: AUDIT_ACTIONS.LOGIN_FAILED,
          resource: 'auth',
          ipAddress,
          userAgent,
          metadata: { email, reason: 'account_locked' },
          severity: 'medium',
          success: false
        });
        
        res.status(429).json({
          error: 'Account temporarily locked due to multiple failed attempts'
        });
        return;
      }
    }
    
    next();
  } catch (error) {
    next(error);
  }
}

export function generateSecureTokens(userId: string) {
  const accessToken = jwt.sign(
    { userId, type: 'access' },
    process.env.JWT_SECRET!,
    {
      expiresIn: (process.env.JWT_EXPIRES_IN || '2h') as any,
      issuer: 'tickettoken',
      audience: 'tickettoken-platform'
    }
  );
  
  const refreshToken = jwt.sign(
    { userId, type: 'refresh' },
    process.env.JWT_REFRESH_SECRET!,
    {
      expiresIn: (process.env.JWT_REFRESH_EXPIRES_IN || '7d') as any,
      issuer: 'tickettoken',
      audience: 'tickettoken-platform'
    }
  );
  
  return { accessToken, refreshToken };
}
```

### FILE: src/types.ts
```typescript
import { FastifyRequest } from 'fastify';

export interface AuthenticatedRequest extends FastifyRequest {
  user: {
    id: string;
    email: string;
    role: string;
    permissions?: string[];
  };
}

export interface User {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  phone?: string;
  role: string;
  email_verified: boolean;
  mfa_enabled: boolean;
  password_hash: string;
  created_at: Date;
  updated_at: Date;
  deleted_at?: Date;
  last_login_at?: Date;
  password_changed_at?: Date;
}
```

### FILE: src/services/audit.service.ts
```typescript
import { db } from '../config/database';
import { auditLogger } from '../config/logger';

export interface AuditEvent {
  userId?: string;
  action: string;
  resourceType?: string;
  resourceId?: string;
  ipAddress?: string;
  userAgent?: string;
  metadata?: any;
  status: 'success' | 'failure';
  errorMessage?: string;
}

export class AuditService {
  async log(event: AuditEvent): Promise<void> {
    try {
      // Log to database
      await db('audit_logs').insert({
        user_id: event.userId,
        action: event.action,
        resource_type: event.resourceType,
        resource_id: event.resourceId,
        ip_address: event.ipAddress,
        user_agent: event.userAgent,
        metadata: event.metadata ? JSON.stringify(event.metadata) : null,
        status: event.status,
        error_message: event.errorMessage,
        created_at: new Date()
      });

      // Also log to file/stdout for centralized logging
      auditLogger.info({
        ...event,
        timestamp: new Date().toISOString()
      }, `Audit: ${event.action}`);
    } catch (error) {
      // Don't fail the request if audit logging fails
      auditLogger.error({ error, event }, 'Failed to log audit event');
    }
  }

  // Convenience methods for common events
  async logLogin(userId: string, ipAddress: string, userAgent: string, success: boolean, errorMessage?: string) {
    await this.log({
      userId,
      action: 'user.login',
      ipAddress,
      userAgent,
      status: success ? 'success' : 'failure',
      errorMessage
    });
  }

  async logRegistration(userId: string, email: string, ipAddress: string) {
    await this.log({
      userId,
      action: 'user.registration',
      ipAddress,
      metadata: { email },
      status: 'success'
    });
  }

  async logPasswordChange(userId: string, ipAddress: string) {
    await this.log({
      userId,
      action: 'user.password_changed',
      ipAddress,
      status: 'success'
    });
  }

  async logMFAEnabled(userId: string) {
    await this.log({
      userId,
      action: 'user.mfa_enabled',
      status: 'success'
    });
  }

  async logTokenRefresh(userId: string, ipAddress: string) {
    await this.log({
      userId,
      action: 'token.refreshed',
      ipAddress,
      status: 'success'
    });
  }

  async logRoleGrant(grantedBy: string, userId: string, venueId: string, role: string) {
    await this.log({
      userId: grantedBy,
      action: 'role.granted',
      resourceType: 'venue',
      resourceId: venueId,
      metadata: { targetUserId: userId, role },
      status: 'success'
    });
  }
}
```

### FILE: src/services/monitoring.service.ts
```typescript
import { FastifyInstance } from 'fastify';
import { db } from '../config/database';
import { redis } from '../config/redis';
import { pool } from '../config/database';

interface HealthCheckResult {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  service: string;
  version: string;
  uptime: number;
  checks: {
    database: CheckResult;
    redis: CheckResult;
    memory: CheckResult;
  };
}

interface CheckResult {
  status: 'ok' | 'error';
  latency?: number;
  error?: string;
  details?: any;
}

export class MonitoringService {
  async performHealthCheck(): Promise<HealthCheckResult> {
    const checks = await Promise.all([
      this.checkDatabase(),
      this.checkRedis(),
      this.checkMemory()
    ]);

    const [database, redisCheck, memory] = checks;
    
    const allHealthy = checks.every(check => check.status === 'ok');
    const anyUnhealthy = checks.some(check => check.status === 'error');

    return {
      status: anyUnhealthy ? 'unhealthy' : allHealthy ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      service: 'auth-service',
      version: process.env.npm_package_version || '1.0.0',
      uptime: process.uptime(),
      checks: {
        database,
        redis: redisCheck,
        memory
      }
    };
  }

  private async checkDatabase(): Promise<CheckResult> {
    const start = Date.now();
    try {
      await db.raw('SELECT 1');
      const latency = Date.now() - start;
      
      return {
        status: 'ok',
        latency,
        details: {
          totalConnections: pool.totalCount,
          idleConnections: pool.idleCount,
          waitingConnections: pool.waitingCount
        }
      };
    } catch (error) {
      return {
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  private async checkRedis(): Promise<CheckResult> {
    const start = Date.now();
    try {
      await redis.ping();
      const latency = Date.now() - start;
      
      const info = await redis.info('stats');
      const connectedClients = info.match(/connected_clients:(\d+)/)?.[1];
      
      return {
        status: 'ok',
        latency,
        details: {
          connectedClients: connectedClients ? parseInt(connectedClients) : undefined
        }
      };
    } catch (error) {
      return {
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  private checkMemory(): CheckResult {
    const usage = process.memoryUsage();
    const heapUsedMB = Math.round(usage.heapUsed / 1024 / 1024);
    const heapTotalMB = Math.round(usage.heapTotal / 1024 / 1024);
    const rssMB = Math.round(usage.rss / 1024 / 1024);
    
    return {
      status: heapUsedMB > 500 ? 'error' : 'ok',
      details: {
        heapUsedMB,
        heapTotalMB,
        rssMB,
        heapUsagePercent: Math.round((heapUsedMB / heapTotalMB) * 100)
      }
    };
  }

  getMetrics() {
    // Return Prometheus-formatted metrics
    return `
# HELP auth_service_uptime_seconds Service uptime in seconds
# TYPE auth_service_uptime_seconds gauge
auth_service_uptime_seconds ${process.uptime()}

# HELP auth_service_memory_heap_used_bytes Memory heap used in bytes
# TYPE auth_service_memory_heap_used_bytes gauge
auth_service_memory_heap_used_bytes ${process.memoryUsage().heapUsed}

# HELP auth_service_db_pool_total Total database connections
# TYPE auth_service_db_pool_total gauge
auth_service_db_pool_total ${pool.totalCount}

# HELP auth_service_db_pool_idle Idle database connections
# TYPE auth_service_db_pool_idle gauge
auth_service_db_pool_idle ${pool.idleCount}

# HELP auth_service_db_pool_waiting Waiting database connections
# TYPE auth_service_db_pool_waiting gauge
auth_service_db_pool_waiting ${pool.waitingCount}
`.trim();
  }
}

export function setupMonitoring(fastify: FastifyInstance, monitoringService: MonitoringService) {
  // Enhanced health check
  fastify.get('/health', async (_request, reply) => {
    const health = await monitoringService.performHealthCheck();
    const statusCode = health.status === 'healthy' ? 200 : 
                      health.status === 'degraded' ? 200 : 503;
    
    reply.status(statusCode).send(health);
  });

  // Prometheus metrics endpoint
  fastify.get('/metrics', async (_request, reply) => {
    const metrics = monitoringService.getMetrics();
    reply
      .type('text/plain; version=0.0.4')
      .send(metrics);
  });

  // Kubernetes liveness probe
  fastify.get('/live', async (_request, reply) => {
    reply.send({ status: 'alive' });
  });

  // Kubernetes readiness probe
  fastify.get('/ready', async (_request, reply) => {
    try {
      await Promise.all([
        db.raw('SELECT 1'),
        redis.ping()
      ]);
      reply.send({ ready: true });
    } catch (error) {
      reply.status(503).send({ ready: false });
    }
  });
}
```

### FILE: src/services/wallet.service.ts
```typescript
import { PublicKey } from '@solana/web3.js';
import { ethers } from 'ethers';
import nacl from 'tweetnacl';
import { db } from '../config/database';
import { redis } from '../config/redis';
import { AuthenticationError } from '../errors';
import crypto from 'crypto';
import { JWTService } from './jwt.service';

export class WalletService {
  private jwtService: JWTService;

  constructor() {
    this.jwtService = new JWTService();
  }

  async generateNonce(walletAddress: string): Promise<string> {
    const nonce = crypto.randomBytes(32).toString('hex');
    await redis.setex(`wallet_nonce:${walletAddress}`, 300, nonce);
    return nonce;
  }

  async verifySolanaSignature(
    publicKey: string,
    signature: string,
    message: string
  ): Promise<boolean> {
    try {
      const publicKeyObj = new PublicKey(publicKey);
      const signatureBuffer = Buffer.from(signature, 'base64');
      const messageBuffer = Buffer.from(message);
      
      return nacl.sign.detached.verify(
        messageBuffer,
        signatureBuffer,
        publicKeyObj.toBytes()
      );
    } catch (error) {
      console.error('Solana signature verification failed:', error);
      return false;
    }
  }

  async verifyEthereumSignature(
    address: string,
    signature: string,
    message: string
  ): Promise<boolean> {
    try {
      const recoveredAddress = ethers.verifyMessage(message, signature);
      return recoveredAddress.toLowerCase() === address.toLowerCase();
    } catch (error) {
      console.error('Ethereum signature verification failed:', error);
      return false;
    }
  }

  async connectWallet(
    userId: string,
    walletAddress: string,
    network: 'solana' | 'ethereum',
    signature: string
  ): Promise<any> {
    const nonce = await redis.get(`wallet_nonce:${walletAddress}`);
    if (!nonce) {
      throw new AuthenticationError('Nonce expired or not found');
    }

    const message = `Connect wallet to TicketToken\nNonce: ${nonce}`;
    
    let isValid = false;
    if (network === 'solana') {
      isValid = await this.verifySolanaSignature(walletAddress, signature, message);
    } else {
      isValid = await this.verifyEthereumSignature(walletAddress, signature, message);
    }

    if (!isValid) {
      throw new AuthenticationError('Invalid wallet signature');
    }

    const existingConnection = await db('wallet_connections')
      .where({ wallet_address: walletAddress, network })
      .first();

    if (existingConnection && existingConnection.user_id !== userId) {
      throw new AuthenticationError('Wallet already connected to another account');
    }

    if (!existingConnection) {
      await db('wallet_connections').insert({
        user_id: userId,
        wallet_address: walletAddress,
        network: network,
        verified: true
      });
    }

    await redis.del(`wallet_nonce:${walletAddress}`);

    return {
      success: true,
      wallet: { address: walletAddress, network, connected: true }
    };
  }

  async loginWithWallet(
    walletAddress: string,
    network: 'solana' | 'ethereum',
    signature: string
  ): Promise<any> {
    const nonce = await redis.get(`wallet_nonce:${walletAddress}`);
    if (!nonce) {
      throw new AuthenticationError('Nonce expired or not found');
    }

    const message = `Login to TicketToken\nNonce: ${nonce}`;
    
    let isValid = false;
    if (network === 'solana') {
      isValid = await this.verifySolanaSignature(walletAddress, signature, message);
    } else {
      isValid = await this.verifyEthereumSignature(walletAddress, signature, message);
    }

    if (!isValid) {
      throw new AuthenticationError('Invalid wallet signature');
    }

    const connection = await db('wallet_connections')
      .where({ wallet_address: walletAddress, network, verified: true })
      .first();

    if (!connection) {
      throw new AuthenticationError('Wallet not connected to any account');
    }

    const user = await db('users').where({ id: connection.user_id }).first();
    if (!user) {
      throw new AuthenticationError('User not found');
    }

    await redis.del(`wallet_nonce:${walletAddress}`);
    await db('users').where({ id: user.id }).update({ last_login_at: new Date() });

    const tokens = await this.jwtService.generateTokenPair(user);
    
    return {
      success: true,
      user: { id: user.id, email: user.email },
      tokens,
      wallet: { address: walletAddress, network }
    };
  }
}
```

### FILE: src/services/mfa.service.ts
```typescript
import speakeasy from 'speakeasy';
import QRCode from 'qrcode';
import crypto from 'crypto';
import { db } from '../config/database';
import { redis } from '../config/redis';
import { env } from '../config/env';
import { AuthenticationError } from '../errors';

export class MFAService {
  async setupTOTP(userId: string): Promise<{
    secret: string;
    qrCode: string;
    backupCodes: string[];
  }> {
    // Get user
    const user = await db('users').where('id', userId).first();
    if (!user) {
      throw new Error('User not found');
    }

    // Generate secret
    const secret = speakeasy.generateSecret({
      name: `TicketToken (${user.email})`,
      issuer: env.MFA_ISSUER || 'TicketToken',
      length: 32,
    });

    // Generate QR code
    const qrCode = await QRCode.toDataURL(secret.otpauth_url || "");

    // Generate backup codes
    const backupCodes = this.generateBackupCodes();

    // Store temporarily until verified
    await redis.setex(
      `mfa:setup:${userId}`,
      600, // 10 minutes
      JSON.stringify({
        secret: this.encrypt(secret.base32),
        backupCodes: backupCodes.map(code => this.hashBackupCode(code)),
      })
    );

    return {
      secret: secret.base32,
      qrCode,
      backupCodes,
    };
  }

  async verifyAndEnableTOTP(userId: string, token: string): Promise<boolean> {
    // Get temporary setup data
    const setupData = await redis.get(`mfa:setup:${userId}`);
    if (!setupData) {
      throw new Error('MFA setup expired or not found');
    }

    const { secret, backupCodes } = JSON.parse(setupData);
    const decryptedSecret = this.decrypt(secret);

    // Verify token
    const verified = speakeasy.totp.verify({
      secret: decryptedSecret,
      encoding: 'base32',
      token,
      window: 2,
    });

    if (!verified) {
      throw new AuthenticationError('Invalid MFA token');
    }

    // Enable MFA for user
    await db('users').where('id', userId).update({
      mfa_enabled: true,
      mfa_secret: secret,
      backup_codes: JSON.stringify(backupCodes),
    });

    // Clean up temporary data
    await redis.del(`mfa:setup:${userId}`);

    return true;
  }

  async verifyTOTP(userId: string, token: string): Promise<boolean> {
    const user = await db('users').where('id', userId).first();
    
    if (!user || !user.mfa_enabled || !user.mfa_secret) {
      return false;
    }

    const secret = this.decrypt(user.mfa_secret);

    // Check recent use to prevent replay attacks
    const recentKey = `mfa:recent:${userId}:${token}`;
    const recentlyUsed = await redis.get(recentKey);
    
    if (recentlyUsed) {
      throw new AuthenticationError('MFA token recently used');
    }

    const verified = speakeasy.totp.verify({
      secret,
      encoding: 'base32',
      token,
      window: 2,
    });

    if (verified) {
      // Mark token as used
      await redis.setex(recentKey, 90, '1'); // 90 seconds
    }

    return verified;
  }

  async verifyBackupCode(userId: string, code: string): Promise<boolean> {
    const user = await db('users').where('id', userId).first();
    
    if (!user || !user.backup_codes) {
      return false;
    }

    const backupCodes = JSON.parse(user.backup_codes);
    const hashedCode = this.hashBackupCode(code);
    const codeIndex = backupCodes.indexOf(hashedCode);

    if (codeIndex === -1) {
      return false;
    }

    // Remove used code
    backupCodes.splice(codeIndex, 1);
    
    await db('users').where('id', userId).update({
      backup_codes: JSON.stringify(backupCodes),
    });

    return true;
  }

  async requireMFAForOperation(userId: string, operation: string): Promise<void> {
    const sensitiveOperations = [
      'withdraw:funds',
      'update:bank-details',
      'delete:venue',
      'export:customer-data',
      'disable:mfa',
    ];

    if (!sensitiveOperations.includes(operation)) {
      return;
    }

    // Check if MFA was recently verified
    const recentMFA = await redis.get(`mfa:verified:${userId}`);
    if (!recentMFA) {
      throw new AuthenticationError('MFA required for this operation');
    }
  }

  async markMFAVerified(userId: string): Promise<void> {
    // Mark MFA as recently verified for sensitive operations
    await redis.setex(`mfa:verified:${userId}`, 300, '1'); // 5 minutes
  }

  private generateBackupCodes(): string[] {
    const codes = [];
    for (let i = 0; i < 10; i++) {
      const code = crypto.randomBytes(4).toString('hex').toUpperCase();
      codes.push(`${code.slice(0, 4)}-${code.slice(4)}`);
    }
    return codes;
  }

  private hashBackupCode(code: string): string {
    return crypto.createHash('sha256').update(code).digest('hex');
  }

  private encrypt(text: string): string {
    const algorithm = 'aes-256-gcm';
    const key = Buffer.from(env.JWT_ACCESS_SECRET, 'utf8').slice(0, 32);
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(algorithm, key, iv);
    
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const authTag = cipher.getAuthTag();
    
    return iv.toString('hex') + ':' + authTag.toString('hex') + ':' + encrypted;
  }

  private decrypt(text: string): string {
    const algorithm = 'aes-256-gcm';
    const key = Buffer.from(env.JWT_ACCESS_SECRET, 'utf8').slice(0, 32);
    const parts = text.split(':');
    const iv = Buffer.from(parts[0], 'hex');
    const authTag = Buffer.from(parts[1], 'hex');
    const encrypted = parts[2];
    
    const decipher = crypto.createDecipheriv(algorithm, key, iv);
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  }

  async disableTOTP(userId: string): Promise<void> {
    // Clear MFA settings from user record
    await db('users')
      .where({ id: userId })
      .update({
        mfa_enabled: false,
        mfa_secret: null,
        backup_codes: null,
        updated_at: new Date()
      });
    
    // Clear any MFA-related data from Redis
    await redis.del(`mfa:secret:${userId}`);
    
    console.log('MFA disabled for user:', userId);
  }


  async generateSecret(userId: string): Promise<string> {
    const secret = speakeasy.generateSecret({ length: 32 });
    await db('user_mfa').insert({
      user_id: userId,
      secret: secret.base32,
      created_at: new Date()
    }).onConflict('user_id').merge().catch(() => {});
    return secret.base32;
  }

  async disable(userId: string): Promise<void> {
    await db('user_mfa').where('user_id', userId).delete().catch(() => {});
  }
}
```

### FILE: src/services/auth.service.ts
```typescript
import bcrypt from 'bcrypt';
import { pool } from '../config/database';
import { JWTService } from './jwt.service';
import { logger } from '../utils/logger';
import * as crypto from 'crypto';

export class AuthService {
  private log = logger.child({ component: 'AuthService' });
  
  // Dummy hash for timing attack prevention (not readonly so it can be updated)
  private DUMMY_HASH = '$2b$10$abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ12';
  
  constructor(private jwtService: JWTService) {
    // Pre-generate a dummy hash to use for timing consistency
    bcrypt.hash('dummy_password_for_timing_consistency', 10).then(hash => {
      this.DUMMY_HASH = hash;
    });
  }
  
  async register(data: any) {
    // Don't log the actual email or password
    this.log.info('Registration attempt', {
      hasEmail: !!data.email,
      hasPassword: !!data.password
    });
    
    try {
      // Use direct pool query instead of Knex
      this.log.debug('Checking for existing user');
      const existingResult = await pool.query(
        'SELECT id FROM users WHERE email = $1 AND deleted_at IS NULL',
        [data.email.toLowerCase()]
      );
      
      if (existingResult.rows.length > 0) {
        throw new Error('Email already registered');
      }
      
      this.log.debug('Hashing password');
      const passwordHash = await bcrypt.hash(data.password, 10);
      
      // Determine tenant_id
      const tenantId = data.tenant_id || process.env.DEFAULT_TENANT_ID || '00000000-0000-0000-0000-000000000001';
      
      this.log.info('Creating new user', { tenantId });
      const insertResult = await pool.query(
        `INSERT INTO users (email, password_hash, first_name, last_name, phone, email_verified, tenant_id, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id, email, first_name, last_name, email_verified, mfa_enabled, permissions, role, tenant_id`,
        [data.email.toLowerCase(), passwordHash, data.firstName, data.lastName, data.phone || null, false, tenantId, new Date()]
      );
      
      const user = insertResult.rows[0];
      this.log.info('User created successfully', {
        userId: user.id,
        tenantId: user.tenant_id
      });
      
      const tokens = await this.jwtService.generateTokenPair(user);
      
      return {
        user: {
          id: user.id,
          email: user.email,
          first_name: user.first_name,
          last_name: user.last_name,
          email_verified: user.email_verified,
          mfa_enabled: user.mfa_enabled || false,
          tenant_id: user.tenant_id,
        },
        tokens,
      };
    } catch (error) {
      // Log error without exposing sensitive details
      this.log.error('Registration failed', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }
  
  async login(data: any) {
    this.log.info('Login attempt');
    
    // Store start time for consistent timing
    const startTime = Date.now();
    const MIN_RESPONSE_TIME = 500; // Minimum response time in ms
    
    try {
      // Always perform database lookup
      const result = await pool.query(
        'SELECT id, email, password_hash, first_name, last_name, email_verified, mfa_enabled, permissions, role, tenant_id FROM users WHERE email = $1 AND deleted_at IS NULL',
        [data.email.toLowerCase()]
      );
      
      let user = result.rows[0];
      let passwordHash = user?.password_hash || this.DUMMY_HASH;
      
      // Always perform bcrypt comparison to maintain consistent timing
      const valid = await bcrypt.compare(data.password, passwordHash);
      
      // Add random jitter (0-50ms) to prevent statistical timing analysis
      const jitter = crypto.randomInt(0, 50);
      await this.delay(jitter);
      
      // Check if login should succeed
      if (!user || !valid) {
        // Ensure minimum response time to prevent timing analysis
        const elapsed = Date.now() - startTime;
        if (elapsed < MIN_RESPONSE_TIME) {
          await this.delay(MIN_RESPONSE_TIME - elapsed);
        }
        
        this.log.warn('Login failed', { 
          reason: !user ? 'user_not_found' : 'invalid_password'
        });
        throw new Error('Invalid credentials');
      }
      
      // Login successful
      const tokens = await this.jwtService.generateTokenPair(user);
      
      // Ensure minimum response time even for successful logins
      const elapsed = Date.now() - startTime;
      if (elapsed < MIN_RESPONSE_TIME) {
        await this.delay(MIN_RESPONSE_TIME - elapsed);
      }
      
      this.log.info('Login successful', {
        userId: user.id,
        tenantId: user.tenant_id
      });
      
      return {
        user: {
          id: user.id,
          email: user.email,
          first_name: user.first_name,
          last_name: user.last_name,
          email_verified: user.email_verified,
          mfa_enabled: user.mfa_enabled || false,
          permissions: user.permissions,
          role: user.role,
          tenant_id: user.tenant_id,
        },
        tokens,
      };
    } catch (error) {
      // Ensure minimum response time even for errors
      const elapsed = Date.now() - startTime;
      if (elapsed < MIN_RESPONSE_TIME) {
        await this.delay(MIN_RESPONSE_TIME - elapsed);
      }
      
      // Re-throw the error
      throw error;
    }
  }

  async refreshTokens(refreshToken: string, ipAddress?: string, userAgent?: string) {
    this.log.info('Token refresh attempt', { ipAddress, userAgent });
    
    try {
      // Verify the refresh token
      const decoded = await this.jwtService.verifyRefreshToken(refreshToken);
      
      // Get fresh user data
      const result = await pool.query(
        'SELECT id, email, first_name, last_name, email_verified, mfa_enabled, permissions, role, tenant_id FROM users WHERE id = $1 AND deleted_at IS NULL',
        [decoded.userId || decoded.sub]
      );
      
      if (result.rows.length === 0) {
        throw new Error('User not found');
      }
      
      const user = result.rows[0];
      
      // Generate new token pair
      const tokens = await this.jwtService.generateTokenPair(user);
      
      // Log the refresh for security auditing if needed
      if (ipAddress || userAgent) {
        await pool.query(
          `INSERT INTO token_refresh_log (user_id, ip_address, user_agent, refreshed_at)
           VALUES ($1, $2, $3, NOW())
           ON CONFLICT DO NOTHING`,
          [user.id, ipAddress || null, userAgent || null]
        ).catch(err => {
          // Don't fail the refresh if logging fails
          this.log.warn('Failed to log token refresh', err);
        });
      }
      
      this.log.info('Token refresh successful', { userId: user.id });
      
      return {
        user: {
          id: user.id,
          email: user.email,
          first_name: user.first_name,
          last_name: user.last_name,
          email_verified: user.email_verified,
          mfa_enabled: user.mfa_enabled || false,
          permissions: user.permissions,
          role: user.role,
          tenant_id: user.tenant_id,
        },
        tokens,
      };
    } catch (error) {
      this.log.warn('Token refresh failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        ipAddress,
        userAgent
      });
      throw new Error('Invalid refresh token');
    }
  }

  async logout(userId: string, refreshToken?: string) {
    this.log.info('Logout attempt', { userId });
    
    try {
      // If refresh token provided, invalidate it
      if (refreshToken) {
        // Store invalidated token to prevent reuse (with expiry)
        const expiryTime = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
        
        await pool.query(
          `INSERT INTO invalidated_tokens (token, user_id, invalidated_at, expires_at)
           VALUES ($1, $2, NOW(), $3)
           ON CONFLICT (token) DO NOTHING`,
          [refreshToken, userId, expiryTime]
        );
      }
      
      // Could also clear any active sessions if you have a sessions table
      await pool.query(
        'UPDATE user_sessions SET ended_at = NOW() WHERE user_id = $1 AND ended_at IS NULL',
        [userId]
      );
      
      this.log.info('Logout successful', { userId });
      
      return { success: true };
    } catch (error) {
      this.log.error('Logout error', {
        userId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      
      // Don't throw - logout should always succeed from user perspective
      return { success: true };
    }
  }
  
  async verifyEmail(token: string) {
    this.log.info('Email verification attempt');
    
    const result = await pool.query(
      'UPDATE users SET email_verified = true WHERE email_verification_token = $1 RETURNING id',
      [token]
    );
    
    if (result.rows.length === 0) {
      throw new Error('Invalid verification token');
    }
    
    return { success: true };
  }
  
  async forgotPassword(email: string) {
    this.log.info('Password reset request');
    
    // Use constant-time operation regardless of user existence
    const startTime = Date.now();
    const MIN_RESPONSE_TIME = 300;
    
    try {
      const result = await pool.query(
        'SELECT id, email FROM users WHERE email = $1 AND deleted_at IS NULL',
        [email.toLowerCase()]
      );
      
      if (result.rows.length > 0) {
        const user = result.rows[0];
        const resetToken = crypto.randomBytes(32).toString('hex');
        const resetExpiry = new Date(Date.now() + 3600000); // 1 hour
        
        await pool.query(
          'UPDATE users SET password_reset_token = $1, password_reset_expires = $2 WHERE id = $3',
          [resetToken, resetExpiry, user.id]
        );
        
        // Queue email sending (async, don't wait)
        this.sendPasswordResetEmail(user.email, resetToken).catch(err => 
          this.log.error('Failed to send password reset email', err)
        );
      }
      
      // Always wait the same amount of time
      const elapsed = Date.now() - startTime;
      if (elapsed < MIN_RESPONSE_TIME) {
        await this.delay(MIN_RESPONSE_TIME - elapsed);
      }
      
      // Always return the same response
      return { 
        message: 'If an account exists with this email, a password reset link has been sent.' 
      };
    } catch (error) {
      // Ensure consistent timing even on error
      const elapsed = Date.now() - startTime;
      if (elapsed < MIN_RESPONSE_TIME) {
        await this.delay(MIN_RESPONSE_TIME - elapsed);
      }
      
      // Return same response to prevent enumeration
      return { 
        message: 'If an account exists with this email, a password reset link has been sent.' 
      };
    }
  }
  
  async resetPassword(token: string, newPassword: string) {
    this.log.info('Password reset attempt');
    
    const result = await pool.query(
      'SELECT id FROM users WHERE password_reset_token = $1 AND password_reset_expires > NOW() AND deleted_at IS NULL',
      [token]
    );
    
    if (result.rows.length === 0) {
      throw new Error('Invalid or expired reset token');
    }
    
    const user = result.rows[0];
    const passwordHash = await bcrypt.hash(newPassword, 10);
    
    await pool.query(
      'UPDATE users SET password_hash = $1, password_reset_token = NULL, password_reset_expires = NULL WHERE id = $2',
      [passwordHash, user.id]
    );
    
    return { success: true };
  }
  
  async changePassword(userId: string, oldPassword: string, newPassword: string) {
    this.log.info('Password change attempt', { userId });
    
    const result = await pool.query(
      'SELECT password_hash FROM users WHERE id = $1 AND deleted_at IS NULL',
      [userId]
    );
    
    if (result.rows.length === 0) {
      throw new Error('User not found');
    }
    
    const user = result.rows[0];
    const valid = await bcrypt.compare(oldPassword, user.password_hash);
    
    if (!valid) {
      throw new Error('Invalid current password');
    }
    
    const newPasswordHash = await bcrypt.hash(newPassword, 10);
    
    await pool.query(
      'UPDATE users SET password_hash = $1 WHERE id = $2',
      [newPasswordHash, userId]
    );
    
    return { success: true };
  }
  
  async getUserById(userId: string) {
    const result = await pool.query(
      'SELECT id, email, first_name, last_name, email_verified, mfa_enabled, permissions, role, tenant_id FROM users WHERE id = $1 AND deleted_at IS NULL',
      [userId]
    );
    
    if (result.rows.length === 0) {
      throw new Error('User not found');
    }
    
    return result.rows[0];
  }
  
  // Helper method for consistent timing delays
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  // Async email sender (doesn't block response)
  private async sendPasswordResetEmail(email: string, token: string): Promise<void> {
    // This would integrate with your email service
    // Implementation depends on your email provider
    this.log.info('Queuing password reset email', { email: email.substring(0, 3) + '***' });
  }
}
```

### FILE: src/services/email.service.ts
```typescript
import crypto from 'crypto';
// import { db } from '../config/database';
import { redis } from '../config/redis';
import { env } from '../config/env';

interface EmailTemplate {
  subject: string;
  html: string;
  text: string;
}

export class EmailService {
  async sendVerificationEmail(userId: string, email: string, firstName: string): Promise<void> {
    const token = crypto.randomBytes(32).toString('hex');
    // const expires = Date.now() + 24 * 60 * 60 * 1000; // 24 hours

    // Store token in Redis
    await redis.setex(
      `email-verify:${token}`,
      24 * 60 * 60,
      JSON.stringify({ userId, email })
    );

    const verifyUrl = `${env.API_GATEWAY_URL}/auth/verify-email?token=${token}`;
    
    const template: EmailTemplate = {
      subject: 'Verify your TicketToken account',
      html: `
        <h2>Welcome to TicketToken, ${firstName}!</h2>
        <p>Please verify your email address by clicking the link below:</p>
        <a href="${verifyUrl}" style="display: inline-block; padding: 12px 24px; background-color: #4CAF50; color: white; text-decoration: none; border-radius: 4px;">Verify Email</a>
        <p>Or copy this link: ${verifyUrl}</p>
        <p>This link expires in 24 hours.</p>
        <p>If you didn't create this account, please ignore this email.</p>
      `,
      text: `Welcome to TicketToken, ${firstName}!
      
Please verify your email address by visiting:
${verifyUrl}

This link expires in 24 hours.

If you didn't create this account, please ignore this email.`
    };

    await this.sendEmail(email, template);
  }

  async sendPasswordResetEmail(userId: string, email: string, firstName: string): Promise<void> {
    const token = crypto.randomBytes(32).toString('hex');
    
    // Store token in Redis with 1 hour expiry
    await redis.setex(
      `password-reset:${token}`,
      60 * 60,
      JSON.stringify({ userId, email })
    );

    const resetUrl = `${env.API_GATEWAY_URL}/auth/reset-password?token=${token}`;
    
    const template: EmailTemplate = {
      subject: 'Reset your TicketToken password',
      html: `
        <h2>Password Reset Request</h2>
        <p>Hi ${firstName},</p>
        <p>We received a request to reset your password. Click the link below to create a new password:</p>
        <a href="${resetUrl}" style="display: inline-block; padding: 12px 24px; background-color: #2196F3; color: white; text-decoration: none; border-radius: 4px;">Reset Password</a>
        <p>Or copy this link: ${resetUrl}</p>
        <p>This link expires in 1 hour.</p>
        <p>If you didn't request this, please ignore this email and your password will remain unchanged.</p>
      `,
      text: `Password Reset Request

Hi ${firstName},

We received a request to reset your password. Visit the link below to create a new password:
${resetUrl}

This link expires in 1 hour.

If you didn't request this, please ignore this email and your password will remain unchanged.`
    };

    await this.sendEmail(email, template);
  }

  async sendMFABackupCodesEmail(email: string, firstName: string, backupCodes: string[]): Promise<void> {
    const template: EmailTemplate = {
      subject: 'Your TicketToken MFA backup codes',
      html: `
        <h2>MFA Backup Codes</h2>
        <p>Hi ${firstName},</p>
        <p>Here are your MFA backup codes. Store them safely:</p>
        <ul>
          ${backupCodes.map(code => `<li><code>${code}</code></li>`).join('')}
        </ul>
        <p>Each code can only be used once. Keep them secure!</p>
      `,
      text: `MFA Backup Codes

Hi ${firstName},

Here are your MFA backup codes. Store them safely:

${backupCodes.join('\n')}

Each code can only be used once. Keep them secure!`
    };

    await this.sendEmail(email, template);
  }

  private async sendEmail(to: string, template: EmailTemplate): Promise<void> {
    // In production, integrate with SendGrid, AWS SES, etc.
    // For now, log to console in development
    if (env.NODE_ENV === 'development') {
      console.log('📧 Email would be sent:', {
        to,
        subject: template.subject,
        preview: template.text.substring(0, 100) + '...'
      });
      return;
    }

    // TODO: Implement actual email sending
    // Example with SendGrid:
    // await sendgrid.send({
    //   to,
    //   from: 'noreply@tickettoken.com',
    //   subject: template.subject,
    //   html: template.html,
    //   text: template.text
    // });
  }
}
```

### FILE: src/services/oauth.service.ts
```typescript
import { OAuth2Client } from 'google-auth-library';
import * as AppleAuth from 'apple-signin-auth';
import { db } from '../config/database';
import { JWTService } from './jwt.service';
import { AuthenticationError } from '../errors';
import crypto from 'crypto';
import { env } from '../config/env';

interface OAuthProfile {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  picture?: string;
  provider: 'google' | 'apple' | 'facebook';
  verified: boolean;
}

export class OAuthService {
  private googleClient: OAuth2Client;
  private jwtService: JWTService;

  constructor() {
    this.googleClient = new OAuth2Client(
      env.GOOGLE_CLIENT_ID || 'your-google-client-id',
      env.GOOGLE_CLIENT_SECRET,
      env.GOOGLE_REDIRECT_URI || 'http://auth-service:3001/api/v1/auth/oauth/google/callback'
    );
    this.jwtService = new JWTService();
  }

  /**
   * Verify Google ID token and extract profile
   */
  async verifyGoogleToken(idToken: string): Promise<OAuthProfile> {
    try {
      const ticket = await this.googleClient.verifyIdToken({
        idToken,
        audience: env.GOOGLE_CLIENT_ID || 'your-google-client-id'
      });
      
      const payload = ticket.getPayload();
      if (!payload) {
        throw new AuthenticationError('Invalid Google token');
      }

      return {
        id: payload.sub,
        email: payload.email!,
        firstName: payload.given_name,
        lastName: payload.family_name,
        picture: payload.picture,
        provider: 'google',
        verified: payload.email_verified || false
      };
    } catch (error) {
      throw new AuthenticationError('Google token verification failed');
    }
  }

  /**
   * Verify Apple ID token and extract profile
   */
  async verifyAppleToken(idToken: string): Promise<OAuthProfile> {
    try {
      const decodedToken = await AppleAuth.verifyIdToken(idToken, {
        audience: env.APPLE_CLIENT_ID || 'com.tickettoken.app',
        ignoreExpiration: false
      });

      return {
        id: decodedToken.sub,
        email: decodedToken.email || '',
        provider: 'apple',
        verified: decodedToken.email_verified === 'true'
      };
    } catch (error) {
      throw new AuthenticationError('Apple token verification failed');
    }
  }

  /**
   * Find or create user from OAuth profile
   */
  async findOrCreateUser(profile: OAuthProfile): Promise<any> {
    // Check if user exists with this email
    let user = await db('users')
      .where({ email: profile.email })
      .first();

    if (!user) {
      // Create new user
      const userId = crypto.randomUUID();
      
      await db('users').insert({
        id: userId,
        email: profile.email,
        first_name: profile.firstName || profile.email.split('@')[0],
        last_name: profile.lastName || '',
        email_verified: profile.verified,
        role: 'user',
        is_active: true,
        created_at: new Date(),
        // OAuth users don't have passwords
        password_hash: null
      });

      user = await db('users').where({ id: userId }).first();
    }

    // Store OAuth provider connection
    const existingConnection = await db('oauth_connections')
      .where({
        user_id: user.id,
        provider: profile.provider
      })
      .first();

    if (!existingConnection) {
      await db('oauth_connections').insert({
        id: crypto.randomUUID(),
        user_id: user.id,
        provider: profile.provider,
        provider_user_id: profile.id,
        profile_data: JSON.stringify(profile),
        created_at: new Date()
      });
    } else {
      // Update profile data
      await db('oauth_connections')
        .where({ id: existingConnection.id })
        .update({
          profile_data: JSON.stringify(profile),
          updated_at: new Date()
        });
    }

    // Update last login
    await db('users')
      .where({ id: user.id })
      .update({ last_login_at: new Date() });

    return user;
  }

  /**
   * Handle OAuth login/signup
   */
  async handleOAuthLogin(provider: 'google' | 'apple', token: string): Promise<any> {
    let profile: OAuthProfile;

    // Verify token based on provider
    if (provider === 'google') {
      profile = await this.verifyGoogleToken(token);
    } else if (provider === 'apple') {
      profile = await this.verifyAppleToken(token);
    } else {
      throw new AuthenticationError('Unsupported OAuth provider');
    }

    // Find or create user
    const user = await this.findOrCreateUser(profile);

    // Generate JWT tokens
    const tokens = await this.jwtService.generateTokenPair(user);

    return {
      success: true,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        emailVerified: user.email_verified
      },
      tokens,
      provider
    };
  }

  /**
   * Link OAuth provider to existing account
   */
  async linkOAuthProvider(
    userId: string,
    provider: 'google' | 'apple',
    token: string
  ): Promise<any> {
    let profile: OAuthProfile;

    // Verify token
    if (provider === 'google') {
      profile = await this.verifyGoogleToken(token);
    } else if (provider === 'apple') {
      profile = await this.verifyAppleToken(token);
    } else {
      throw new AuthenticationError('Unsupported OAuth provider');
    }

    // Check if already linked
    const existingConnection = await db('oauth_connections')
      .where({
        user_id: userId,
        provider: provider
      })
      .first();

    if (existingConnection) {
      throw new AuthenticationError(`${provider} account already linked`);
    }

    // Check if this OAuth account is linked to another user
    const otherUserConnection = await db('oauth_connections')
      .where({
        provider: provider,
        provider_user_id: profile.id
      })
      .first();

    if (otherUserConnection) {
      throw new AuthenticationError('This OAuth account is already linked to another user');
    }

    // Link the account
    await db('oauth_connections').insert({
      id: crypto.randomUUID(),
      user_id: userId,
      provider: provider,
      provider_user_id: profile.id,
      profile_data: JSON.stringify(profile),
      created_at: new Date()
    });

    return {
      success: true,
      message: `${provider} account linked successfully`,
      provider
    };
  }
}
```

### FILE: src/services/jwt.service.ts
```typescript
import jwt, { SignOptions } from 'jsonwebtoken';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { env } from '../config/env';
import { redis } from '../config/redis';
import { TokenError } from '../errors';
import { pool } from '../config/database';

interface TokenPayload {
  sub: string;
  type: 'access' | 'refresh';
  jti: string;
  tenant_id: string;
  permissions?: string[];
  role?: string;
  family?: string;
  iat?: number;
  exp?: number;
  iss?: string;
  aud?: string | string[];
}

interface RefreshTokenData {
  userId: string;
  tenantId: string;
  family: string;
  createdAt: number;
  ipAddress: string;
  userAgent: string;
}

// Load RSA keys on module initialization
const privateKeyPath = process.env.JWT_PRIVATE_KEY_PATH || 
  path.join(process.env.HOME!, 'tickettoken-secrets', 'jwt-private.pem');
const publicKeyPath = process.env.JWT_PUBLIC_KEY_PATH || 
  path.join(process.env.HOME!, 'tickettoken-secrets', 'jwt-public.pem');

let privateKey: string;
let publicKey: string;

try {
  privateKey = fs.readFileSync(privateKeyPath, 'utf8');
  publicKey = fs.readFileSync(publicKeyPath, 'utf8');
  console.log('✓ JWT RS256 keys loaded successfully');
} catch (error) {
  console.error('✗ Failed to load JWT keys:', error);
  throw new Error('JWT keys not found. Run: openssl genrsa -out ~/tickettoken-secrets/jwt-private.pem 4096');
}

export class JWTService {
  private readonly issuer: string;

  constructor() {
    this.issuer = env.JWT_ISSUER;
  }

  async generateTokenPair(user: any): Promise<{ accessToken: string; refreshToken: string }> {
    // Ensure we have tenant_id - fetch if not provided
    let tenantId = user.tenant_id;
    if (!tenantId && user.id) {
      const result = await pool.query(
        'SELECT tenant_id FROM users WHERE id = $1',
        [user.id]
      );
      tenantId = result.rows[0]?.tenant_id || '00000000-0000-0000-0000-000000000001';
    }

    // Access token - now includes tenant_id
    const accessTokenPayload = {
      sub: user.id,
      type: 'access' as const,
      jti: crypto.randomUUID(),
      tenant_id: tenantId,
      permissions: user.permissions || ['buy:tickets', 'view:events', 'transfer:tickets'],
      role: user.role || 'customer',
    };

    const accessTokenOptions: SignOptions = {
      expiresIn: env.JWT_ACCESS_EXPIRES_IN as any,
      issuer: this.issuer,
      audience: this.issuer,
      algorithm: 'RS256',  // Changed from HS256
      keyid: '1',          // Added for key rotation support
    };

    const accessToken = jwt.sign(accessTokenPayload, privateKey, accessTokenOptions);

    // Refresh token - also includes tenant_id for consistency
    const refreshTokenId = crypto.randomUUID();
    const family = crypto.randomUUID();

    const refreshTokenPayload = {
      sub: user.id,
      type: 'refresh' as const,
      jti: refreshTokenId,
      tenant_id: tenantId,
      family,
    };

    const refreshTokenOptions: SignOptions = {
      expiresIn: env.JWT_REFRESH_EXPIRES_IN as any,
      algorithm: 'RS256',  // Changed from HS256
      keyid: '1',
    };

    const refreshToken = jwt.sign(refreshTokenPayload, privateKey, refreshTokenOptions);

    // Store refresh token metadata with tenant_id
    const refreshData: RefreshTokenData = {
      userId: user.id,
      tenantId: tenantId,
      family,
      createdAt: Date.now(),
      ipAddress: user.ipAddress || 'unknown',
      userAgent: user.userAgent || 'unknown',
    };

    await redis.setex(
      `refresh_token:${refreshTokenId}`,
      7 * 24 * 60 * 60, // 7 days
      JSON.stringify(refreshData)
    );

    return { accessToken, refreshToken };
  }

  async verifyAccessToken(token: string): Promise<TokenPayload> {
    try {
      const decoded = jwt.verify(token, publicKey, {
        issuer: this.issuer,
        audience: this.issuer,
        algorithms: ['RS256'],  // Changed from HS256
      }) as TokenPayload;

      if (decoded.type !== 'access') {
        throw new TokenError('Invalid token type');
      }

      // Validate tenant_id is present
      if (!decoded.tenant_id) {
        throw new TokenError('Invalid token - missing tenant context');
      }

      return decoded;
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        throw new TokenError('Access token expired');
      }
      throw new TokenError('Invalid access token');
    }
  }

  async refreshTokens(refreshToken: string, ipAddress: string, userAgent: string): Promise<{ accessToken: string; refreshToken: string }> {
    try {
      // Verify refresh token
      const decoded = jwt.verify(refreshToken, publicKey, {
        algorithms: ['RS256'],  // Changed from HS256
      }) as TokenPayload;

      if (decoded.type !== 'refresh') {
        throw new TokenError('Invalid token type');
      }

      // Check if token exists and hasn't been revoked
      const storedData = await redis.get(`refresh_token:${decoded.jti}`);

      if (!storedData) {
        // Token reuse detected - invalidate entire family
        await this.invalidateTokenFamily(decoded.family!);
        throw new TokenError('Token reuse detected - possible theft');
      }

      // Parse stored data
      const tokenData: RefreshTokenData = JSON.parse(storedData);

      // Fetch fresh user data to ensure correct tenant_id
      const userResult = await pool.query(
        'SELECT id, tenant_id, permissions, role FROM users WHERE id = $1',
        [decoded.sub]
      );

      if (userResult.rows.length === 0) {
        throw new TokenError('User not found');
      }

      const user = userResult.rows[0];

      // Generate new token pair with current tenant_id
      const newTokens = await this.generateTokenPair({
        id: user.id,
        tenant_id: user.tenant_id,
        permissions: user.permissions,
        role: user.role,
        ipAddress,
        userAgent,
      });

      // Invalidate old refresh token
      await redis.del(`refresh_token:${decoded.jti}`);

      return newTokens;
    } catch (error) {
      if (error instanceof TokenError) {
        throw error;
      }
      throw new TokenError('Invalid refresh token');
    }
  }

  async invalidateTokenFamily(family: string): Promise<void> {
    // Find all tokens in the family
    const keys = await redis.keys('refresh_token:*');

    for (const key of keys) {
      const data = await redis.get(key);
      if (data) {
        const tokenData: RefreshTokenData = JSON.parse(data);
        if (tokenData.family === family) {
          await redis.del(key);
        }
      }
    }
  }

  async revokeAllUserTokens(userId: string): Promise<void> {
    const keys = await redis.keys('refresh_token:*');

    for (const key of keys) {
      const data = await redis.get(key);
      if (data) {
        const tokenData: RefreshTokenData = JSON.parse(data);
        if (tokenData.userId === userId) {
          await redis.del(key);
        }
      }
    }
  }

  decode(token: string): any {
    return jwt.decode(token);
  }

  async verifyRefreshToken(token: string): Promise<any> {
    try {
      return jwt.verify(token, publicKey, {
        algorithms: ['RS256'],  // Changed from HS256
      });
    } catch {
      throw new Error('Invalid refresh token');
    }
  }

  // Export public key for JWKS endpoint (future use)
  getPublicKey(): string {
    return publicKey;
  }
}
```

### FILE: src/services/rbac.service.ts
```typescript
import { db } from '../config/database';
import { AuthorizationError } from '../errors';

interface Role {
  name: string;
  permissions: string[];
  venueScoped: boolean;
}

export class RBACService {
  private roles: Map<string, Role>;

  constructor() {
    this.roles = new Map([
      ['venue-owner', {
        name: 'venue-owner',
        permissions: ['*'], // All permissions for their venue
        venueScoped: true,
      }],
      ['venue-manager', {
        name: 'venue-manager',
        permissions: [
          'events:create', 'events:update', 'events:delete',
          'tickets:view', 'tickets:validate',
          'reports:view', 'reports:export',
        ],
        venueScoped: true,
      }],
      ['box-office', {
        name: 'box-office',
        permissions: [
          'tickets:sell', 'tickets:view', 'tickets:validate',
          'payments:process', 'reports:daily',
        ],
        venueScoped: true,
      }],
      ['door-staff', {
        name: 'door-staff',
        permissions: ['tickets:validate', 'tickets:view'],
        venueScoped: true,
      }],
      ['customer', {
        name: 'customer',
        permissions: [
          'tickets:purchase', 'tickets:view-own', 'tickets:transfer-own',
          'profile:update-own',
        ],
        venueScoped: false,
      }],
    ]);
  }

  async getUserPermissions(userId: string, venueId?: string): Promise<string[]> {
    const permissions = new Set<string>();

    // Get user's venue roles if venueId provided
    if (venueId) {
      const venueRoles = await db('user_venue_roles')
        .where({
          user_id: userId,
          venue_id: venueId,
          is_active: true,
        })
        .where('expires_at', '>', new Date())
        .orWhereNull('expires_at');

      for (const venueRole of venueRoles) {
        const role = this.roles.get(venueRole.role);
        if (role) {
          role.permissions.forEach(p => permissions.add(p));
        }
      }
    }

    // Add customer permissions by default
    const customerRole = this.roles.get('customer');
    if (customerRole) {
      customerRole.permissions.forEach(p => permissions.add(p));
    }

    return Array.from(permissions);
  }

  async checkPermission(userId: string, permission: string, venueId?: string): Promise<boolean> {
    const userPermissions = await this.getUserPermissions(userId, venueId);

    // Check for wildcard permission
    if (userPermissions.includes('*')) {
      return true;
    }

    // Check specific permission
    return userPermissions.includes(permission);
  }

  async requirePermission(userId: string, permission: string, venueId?: string): Promise<void> {
    const hasPermission = await this.checkPermission(userId, permission, venueId);
    
    if (!hasPermission) {
      throw new AuthorizationError(`Missing required permission: ${permission}`);
    }
  }

  async grantVenueRole(
    userId: string,
    venueId: string,
    role: string,
    grantedBy: string,
    expiresAt?: Date
  ): Promise<void> {
    // Validate role
    if (!this.roles.has(role)) {
      throw new Error(`Invalid role: ${role}`);
    }

    // Check if granter has permission to grant roles
    await this.requirePermission(grantedBy, 'roles:manage', venueId);

    // Check for existing role
    const existing = await db('user_venue_roles')
      .where({
        user_id: userId,
        venue_id: venueId,
        role: role,
        is_active: true,
      })
      .first();

    if (existing) {
      // Update expiration if needed
      if (expiresAt) {
        await db('user_venue_roles')
          .where('id', existing.id)
          .update({ expires_at: expiresAt });
      }
      return;
    }

    // Grant new role
    await db('user_venue_roles').insert({
      user_id: userId,
      venue_id: venueId,
      role: role,
      granted_by: grantedBy,
      expires_at: expiresAt,
    });
  }

  async revokeVenueRole(userId: string, venueId: string, role: string, revokedBy: string): Promise<void> {
    // Check if revoker has permission
    await this.requirePermission(revokedBy, 'roles:manage', venueId);

    await db('user_venue_roles')
      .where({
        user_id: userId,
        venue_id: venueId,
        role: role,
        is_active: true,
      })
      .update({ is_active: false });
  }

  async getUserVenueRoles(userId: string): Promise<any[]> {
    return db('user_venue_roles')
      .where({
        user_id: userId,
        is_active: true,
      })
      .where('expires_at', '>', new Date())
      .orWhereNull('expires_at')
      .select('venue_id', 'role', 'granted_at', 'expires_at');
  }
}
```

### FILE: src/validators/auth.validators.ts
```typescript
import Joi from 'joi';

export const registerSchema = Joi.object({
  email: Joi.string().email().required().messages({
    'string.email': 'Please provide a valid email address',
    'any.required': 'Email is required',
  }),
  password: Joi.string().min(8).max(128).required().messages({
    'string.min': 'Password must be at least 8 characters long',
    'any.required': 'Password is required',
  }),
  firstName: Joi.string().min(1).max(100).required().messages({
    'any.required': 'First name is required',
  }),
  lastName: Joi.string().min(1).max(100).required().messages({
    'any.required': 'Last name is required',
  }),
  phone: Joi.string().pattern(/^\+?[1-9]\d{1,14}$/).optional().messages({
    'string.pattern.base': 'Please provide a valid phone number',
  }),
});

export const loginSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().required(),
});

export const refreshTokenSchema = Joi.object({
  refreshToken: Joi.string().required(),
});

export const verifyEmailSchema = Joi.object({
  token: Joi.string().required(),
});

export const forgotPasswordSchema = Joi.object({
  email: Joi.string().email().required(),
});

export const resetPasswordSchema = Joi.object({
  token: Joi.string().required(),
  newPassword: Joi.string().min(8).max(128).required(),
});

export const changePasswordSchema = Joi.object({
  currentPassword: Joi.string().required(),
  newPassword: Joi.string().min(8).max(128).required(),
});

export const setupMFASchema = Joi.object({
  password: Joi.string().required(),
});

export const verifyMFASchema = Joi.object({
  token: Joi.string().length(6).pattern(/^\d+$/).required(),
});

export const grantRoleSchema = Joi.object({
  userId: Joi.string().uuid().required(),
  venueId: Joi.string().uuid().required(),
  role: Joi.string().valid('venue-owner', 'venue-manager', 'box-office', 'door-staff').required(),
  expiresAt: Joi.date().optional(),
});


export const disableMFASchema = Joi.object({
  password: Joi.string().required().messages({
    'any.required': 'Password is required to disable MFA',
    'string.empty': 'Password cannot be empty'
  })
});

export const updateProfileSchema = Joi.object({
  first_name: Joi.string().min(1).max(100).optional(),
  last_name: Joi.string().min(1).max(100).optional(),
  phone: Joi.string().pattern(/^\+?[1-9]\d{1,14}$/).optional().messages({
    'string.pattern.base': 'Please provide a valid phone number',
  }),
  preferences: Joi.object().unknown(true).optional()
});

export const walletLoginSchema = Joi.object({
  walletAddress: Joi.string().required(),
  signature: Joi.string().required(),
  message: Joi.string().required(),
});

export const connectWalletSchema = Joi.object({
  walletAddress: Joi.string().required(),
  walletType: Joi.string().valid('phantom', 'solflare', 'metamask').required(),
});

export const biometricRegisterSchema = Joi.object({
  publicKey: Joi.string().required(),
  deviceId: Joi.string().required(),
});

export const oauthLinkSchema = Joi.object({
  provider: Joi.string().valid('google', 'facebook', 'twitter').required(),
  accessToken: Joi.string().required(),
});

export const oauthLoginSchema = Joi.object({
  provider: Joi.string().valid('google', 'facebook', 'twitter').required(),
  accessToken: Joi.string().required(),
});
```

### FILE: src/types/express.d.ts
```typescript
import { User } from '../models/user.model';

declare global {
  namespace Express {
    interface Request {
      user?: any;
    }
  }
}
```


================================================================================
## SECTION 2: ALL MODEL/ENTITY/INTERFACE DEFINITIONS
================================================================================

### FILE: src/config/env.ts
```typescript
import { config } from 'dotenv';

// Load environment variables
config();

export interface EnvConfig {
  // Server
  NODE_ENV: 'development' | 'test' | 'staging' | 'production';
  PORT: number;
  LOG_LEVEL: string;
  
  // Database
  DB_HOST: string;
  DB_PORT: number;
  DB_NAME: string;
  DB_USER: string;
  DB_PASSWORD: string;
  
  // Redis
  REDIS_HOST: string;
  REDIS_PORT: number;
  REDIS_PASSWORD?: string;
  
  // JWT
  JWT_ACCESS_SECRET: string;
  JWT_REFRESH_SECRET: string;
  JWT_ISSUER: string;
  JWT_ACCESS_EXPIRES_IN: string;
  JWT_REFRESH_EXPIRES_IN: string;
  
  // OAuth
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  GOOGLE_REDIRECT_URI?: string;
  APPLE_CLIENT_ID?: string;
  APPLE_TEAM_ID?: string;
  APPLE_KEY_ID?: string;
  
  // Security
  BCRYPT_ROUNDS: number;
  LOCKOUT_MAX_ATTEMPTS: number;
  LOCKOUT_DURATION_MINUTES: number;
  
  // MFA
  MFA_ISSUER: string;
  MFA_WINDOW: number;
  
  // Swagger
  ENABLE_SWAGGER?: boolean;
  
  // Service URLs
  API_GATEWAY_URL: string;
  VENUE_SERVICE_URL: string;
  NOTIFICATION_SERVICE_URL: string;
}

function validateEnv(): EnvConfig {
  const required = [
    'DB_HOST', 'DB_NAME', 'DB_USER', 'DB_PASSWORD',
    'JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET'
  ];
  
  for (const key of required) {
    if (!process.env[key]) {
      throw new Error(`Missing required environment variable: ${key}`);
    }
  }
  
  // Validate JWT secrets are different
  if (process.env.JWT_ACCESS_SECRET === process.env.JWT_REFRESH_SECRET) {
    throw new Error('JWT access and refresh secrets must be different');
  }
  
  // Validate JWT secrets length (256-bit minimum)
  if (process.env.JWT_ACCESS_SECRET!.length < 32 || process.env.JWT_REFRESH_SECRET!.length < 32) {
    throw new Error('JWT secrets must be at least 32 characters (256 bits)');
  }
  
  return {
    NODE_ENV: (process.env.NODE_ENV as any) || 'development',
    PORT: parseInt(process.env.PORT || '3001', 10),
    LOG_LEVEL: process.env.LOG_LEVEL || 'info',
    
    DB_HOST: process.env.DB_HOST!,
    DB_PORT: parseInt(process.env.DB_PORT || '5432', 10),
    DB_NAME: process.env.DB_NAME!,
    DB_USER: process.env.DB_USER!,
    DB_PASSWORD: process.env.DB_PASSWORD!,
    
    REDIS_HOST: process.env.REDIS_HOST || 'redis',
    REDIS_PORT: parseInt(process.env.REDIS_PORT || '6379', 10),
    REDIS_PASSWORD: process.env.REDIS_PASSWORD,
    
    JWT_ACCESS_SECRET: process.env.JWT_ACCESS_SECRET!,
    JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET!,
    JWT_ISSUER: process.env.JWT_ISSUER || 'api.tickettoken.com',
    JWT_ACCESS_EXPIRES_IN: process.env.JWT_ACCESS_EXPIRES_IN || '2h',
    JWT_REFRESH_EXPIRES_IN: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
    
    BCRYPT_ROUNDS: parseInt(process.env.BCRYPT_ROUNDS || '12', 10),
    LOCKOUT_MAX_ATTEMPTS: parseInt(process.env.LOCKOUT_MAX_ATTEMPTS || '5', 10),
    LOCKOUT_DURATION_MINUTES: parseInt(process.env.LOCKOUT_DURATION_MINUTES || '15', 10),
    
    MFA_ISSUER: process.env.MFA_ISSUER || 'TicketToken',
    MFA_WINDOW: parseInt(process.env.MFA_WINDOW || '2', 10),
    
    ENABLE_SWAGGER: process.env.ENABLE_SWAGGER === 'true',
    
    API_GATEWAY_URL: process.env.API_GATEWAY_URL || 'http://api-gateway:3000',
    VENUE_SERVICE_URL: process.env.VENUE_SERVICE_URL || 'http://venue-service:3002',
    NOTIFICATION_SERVICE_URL: process.env.NOTIFICATION_SERVICE_URL || 'http://notification-service:3008'
  };
}

export const env = validateEnv();
```

### FILE: src/config/dependencies.ts
```typescript
import { createContainer, asClass, asValue, InjectionMode } from 'awilix';
import { RateLimitService } from '../services/rate-limit.service';
import { DeviceTrustService } from '../services/device-trust.service';
import { BiometricService } from '../services/biometric.service';
import { JWTService } from '../services/jwt.service';
import { AuthService } from '../services/auth.service';
import { AuthExtendedService } from '../services/auth-extended.service';
import { RBACService } from '../services/rbac.service';
import { MFAService } from '../services/mfa.service';
import { EmailService } from '../services/email.service';
import { LockoutService } from '../services/lockout.service';
import { AuditService } from '../services/audit.service';
import { MonitoringService } from '../services/monitoring.service';
import { WalletService } from '../services/wallet.service';
import { OAuthService } from '../services/oauth.service';
import { db } from './database';
import { redis } from './redis';
import { env } from './env';

export function createDependencyContainer() {
  const container = createContainer({
    injectionMode: InjectionMode.CLASSIC,
  });

  container.register({
    // Config
    env: asValue(env),
    
    // Database
    db: asValue(db),
    redis: asValue(redis),
    
    // Core Services
    jwtService: asClass(JWTService).singleton(),
    authService: asClass(AuthService).singleton().inject(() => ({ 
      jwtService: container.resolve('jwtService') 
    })),
    authExtendedService: asClass(AuthExtendedService).singleton().inject(() => ({
      emailService: container.resolve('emailService')
    })),
    rbacService: asClass(RBACService).singleton(),
    mfaService: asClass(MFAService).singleton(),
    walletService: asClass(WalletService).singleton(),
    rateLimitService: asClass(RateLimitService).singleton(),
    deviceTrustService: asClass(DeviceTrustService).singleton(),
    biometricService: asClass(BiometricService).singleton(),
    oauthService: asClass(OAuthService).singleton(),
    
    // Supporting Services
    emailService: asClass(EmailService).singleton(),
    lockoutService: asClass(LockoutService).singleton(),
    auditService: asClass(AuditService).singleton(),
    monitoringService: asClass(MonitoringService).singleton(),
  });

  return container;
}

export type Container = ReturnType<typeof createDependencyContainer>;
export type Cradle = Container extends { cradle: infer C } ? C : never;
```

### FILE: src/utils/rateLimiter.ts
```typescript
import { redis } from '../config/redis';
import { RateLimitError } from '../errors';

interface RateLimitOptions {
  points: number;      // Number of requests
  duration: number;    // Per duration in seconds
  blockDuration?: number; // Block duration in seconds after limit exceeded
}

export class RateLimiter {
  private keyPrefix: string;
  private options: RateLimitOptions;

  constructor(keyPrefix: string, options: RateLimitOptions) {
    this.keyPrefix = keyPrefix;
    this.options = {
      blockDuration: options.duration * 2,
      ...options
    };
  }

  async consume(key: string, _points = 1): Promise<void> {
    const fullKey = `${this.keyPrefix}:${key}`;
    const blockKey = `${fullKey}:block`;

    // Check if blocked
    const blocked = await redis.get(blockKey);
    if (blocked) {
      const ttl = await redis.ttl(blockKey);
      throw new RateLimitError('Too many requests', ttl);
    }

    // Get current points
    const currentPoints = await redis.incr(fullKey);
    
    // Set expiry on first request
    if (currentPoints === 1) {
      await redis.expire(fullKey, this.options.duration);
    }

    // Check if limit exceeded
    if (currentPoints > this.options.points) {
      // Block the key
      await redis.setex(blockKey, this.options.blockDuration!, '1');
      
      throw new RateLimitError(
        'Rate limit exceeded',
        this.options.blockDuration!
      );
    }
  }

  async reset(key: string): Promise<void> {
    const fullKey = `${this.keyPrefix}:${key}`;
    const blockKey = `${fullKey}:block`;
    
    await redis.del(fullKey);
    await redis.del(blockKey);
  }
}

// Pre-configured rate limiters
export const loginRateLimiter = new RateLimiter('login', {
  points: 5,        // 5 attempts
  duration: 900,    // per 15 minutes
  blockDuration: 900 // block for 15 minutes
});

export const registrationRateLimiter = new RateLimiter('register', {
  points: 3,        // 3 registrations
  duration: 3600,   // per hour
  blockDuration: 3600
});

export const passwordResetRateLimiter = new RateLimiter('password-reset', {
  points: 3,        // 3 attempts
  duration: 3600,   // per hour
  blockDuration: 3600
});
```

### FILE: src/models/user.model.ts
```typescript
export interface User {
  id: string;
  email: string;
  password_hash: string;
  first_name: string;
  last_name: string;
  phone?: string;
  email_verified: boolean;
  phone_verified: boolean;
  kyc_status: 'pending' | 'verified' | 'rejected';
  kyc_level: number;
  mfa_enabled: boolean;
  mfa_secret?: string;
  backup_codes?: string[];
  created_at: Date;
  updated_at: Date;
  last_login_at?: Date;
  last_login_ip?: string;
  failed_login_attempts: number;
  locked_until?: Date;
  password_reset_token?: string;
  password_reset_expires?: Date;
  email_verification_token?: string;
  email_verification_expires?: Date;
  deleted_at?: Date;
  deleted_by?: string;
  deletion_reason?: string;
  version: number; // For optimistic locking
}

export interface UserVenueRole {
  id: string;
  user_id: string;
  venue_id: string;
  role: 'venue-owner' | 'venue-manager' | 'box-office' | 'door-staff';
  granted_by: string;
  granted_at: Date;
  expires_at?: Date;
  is_active: boolean;
}

export interface UserSession {
  id: string;
  user_id: string;
  session_token: string;
  ip_address: string;
  user_agent: string;
  created_at: Date;
  expires_at: Date;
  revoked_at?: Date;
}

export interface LoginAttempt {
  id: string;
  email: string;
  ip_address: string;
  success: boolean;
  attempted_at: Date;
  failure_reason?: string;
}
```

### FILE: src/middleware/security.middleware.ts
```typescript
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import mongoSanitize from 'express-mongo-sanitize';
import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

// Extend Express Request type to include session
declare module 'express' {
  interface Request {
    session?: any;
    rateLimit?: any;
  }
}

// Security headers with helmet
export const securityHeaders = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true,
  },
});

// Rate limiting configurations
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 requests per window
  message: 'Too many authentication attempts, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req: Request, res: Response) => {
    res.status(429).json({
      error: 'Too many requests',
      retryAfter: req.rateLimit?.resetTime,
    });
  },
});

export const generalRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 requests per window
  message: 'Too many requests from this IP',
});

// Prevent MongoDB injection attacks
export const sanitizeInput = mongoSanitize({
  replaceWith: '_',
  onSanitize: ({ req, key }) => {
    console.warn(`Sanitized ${key} in request from ${req.ip}`);
  },
});

// CSRF token generation and validation
export const generateCSRFToken = (): string => {
  return crypto.randomBytes(32).toString('hex');
};

export const validateCSRFToken = (req: Request, res: Response, next: NextFunction): void => {
  const token = req.headers['x-csrf-token'] || req.body._csrf;
  const sessionToken = req.session?.csrfToken;
  
  if (!token || token !== sessionToken) {
    res.status(403).json({ error: 'Invalid CSRF token' });
    return;
  }
  
  next();
};

// XSS protection
export const xssProtection = (req: Request, _res: Response, next: NextFunction): void => {
  // Clean all string inputs
  const cleanInput = (obj: any): any => {
    if (typeof obj === 'string') {
      return obj.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
    } else if (typeof obj === 'object' && obj !== null) {
      for (const key in obj) {
        obj[key] = cleanInput(obj[key]);
      }
    }
    return obj;
  };
  
  req.body = cleanInput(req.body);
  req.query = cleanInput(req.query);
  req.params = cleanInput(req.params);
  
  next();
};
```

### FILE: src/middleware/enhanced-security.ts
```typescript
import { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

// Extend Request interface to include custom properties
interface ExtendedRequest extends Request {
  clientIp?: string;
  db?: any;
}

// Stub for audit logger if shared module isn't available
const auditLogger = {
  log: async (data: any) => {
    console.log('Audit:', data);
  }
};

const AUDIT_ACTIONS = {
  LOGIN_FAILED: 'LOGIN_FAILED'
};

export async function secureLogin(req: ExtendedRequest, res: Response, next: NextFunction): Promise<void> {
  const { email, password } = req.body;
  const ipAddress = req.clientIp || req.ip;
  const userAgent = req.headers['user-agent'] || '';
  
  try {
    // Check if account is locked
    if (req.db) {
      const lockCheck = await req.db.query(
        `SELECT locked_until FROM failed_login_attempts
         WHERE email = $1 AND ip_address = $2 AND locked_until > NOW()`,
        [email, ipAddress]
      );
      
      if (lockCheck.rows.length > 0) {
        await auditLogger.log({
          action: AUDIT_ACTIONS.LOGIN_FAILED,
          resource: 'auth',
          ipAddress,
          userAgent,
          metadata: { email, reason: 'account_locked' },
          severity: 'medium',
          success: false
        });
        
        res.status(429).json({
          error: 'Account temporarily locked due to multiple failed attempts'
        });
        return;
      }
    }
    
    next();
  } catch (error) {
    next(error);
  }
}

export function generateSecureTokens(userId: string) {
  const accessToken = jwt.sign(
    { userId, type: 'access' },
    process.env.JWT_SECRET!,
    {
      expiresIn: (process.env.JWT_EXPIRES_IN || '2h') as any,
      issuer: 'tickettoken',
      audience: 'tickettoken-platform'
    }
  );
  
  const refreshToken = jwt.sign(
    { userId, type: 'refresh' },
    process.env.JWT_REFRESH_SECRET!,
    {
      expiresIn: (process.env.JWT_REFRESH_EXPIRES_IN || '7d') as any,
      issuer: 'tickettoken',
      audience: 'tickettoken-platform'
    }
  );
  
  return { accessToken, refreshToken };
}
```

### FILE: src/types.ts
```typescript
import { FastifyRequest } from 'fastify';

export interface AuthenticatedRequest extends FastifyRequest {
  user: {
    id: string;
    email: string;
    role: string;
    permissions?: string[];
  };
}

export interface User {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  phone?: string;
  role: string;
  email_verified: boolean;
  mfa_enabled: boolean;
  password_hash: string;
  created_at: Date;
  updated_at: Date;
  deleted_at?: Date;
  last_login_at?: Date;
  password_changed_at?: Date;
}
```

### FILE: src/services/audit.service.ts
```typescript
import { db } from '../config/database';
import { auditLogger } from '../config/logger';

export interface AuditEvent {
  userId?: string;
  action: string;
  resourceType?: string;
  resourceId?: string;
  ipAddress?: string;
  userAgent?: string;
  metadata?: any;
  status: 'success' | 'failure';
  errorMessage?: string;
}

export class AuditService {
  async log(event: AuditEvent): Promise<void> {
    try {
      // Log to database
      await db('audit_logs').insert({
        user_id: event.userId,
        action: event.action,
        resource_type: event.resourceType,
        resource_id: event.resourceId,
        ip_address: event.ipAddress,
        user_agent: event.userAgent,
        metadata: event.metadata ? JSON.stringify(event.metadata) : null,
        status: event.status,
        error_message: event.errorMessage,
        created_at: new Date()
      });

      // Also log to file/stdout for centralized logging
      auditLogger.info({
        ...event,
        timestamp: new Date().toISOString()
      }, `Audit: ${event.action}`);
    } catch (error) {
      // Don't fail the request if audit logging fails
      auditLogger.error({ error, event }, 'Failed to log audit event');
    }
  }

  // Convenience methods for common events
  async logLogin(userId: string, ipAddress: string, userAgent: string, success: boolean, errorMessage?: string) {
    await this.log({
      userId,
      action: 'user.login',
      ipAddress,
      userAgent,
      status: success ? 'success' : 'failure',
      errorMessage
    });
  }

  async logRegistration(userId: string, email: string, ipAddress: string) {
    await this.log({
      userId,
      action: 'user.registration',
      ipAddress,
      metadata: { email },
      status: 'success'
    });
  }

  async logPasswordChange(userId: string, ipAddress: string) {
    await this.log({
      userId,
      action: 'user.password_changed',
      ipAddress,
      status: 'success'
    });
  }

  async logMFAEnabled(userId: string) {
    await this.log({
      userId,
      action: 'user.mfa_enabled',
      status: 'success'
    });
  }

  async logTokenRefresh(userId: string, ipAddress: string) {
    await this.log({
      userId,
      action: 'token.refreshed',
      ipAddress,
      status: 'success'
    });
  }

  async logRoleGrant(grantedBy: string, userId: string, venueId: string, role: string) {
    await this.log({
      userId: grantedBy,
      action: 'role.granted',
      resourceType: 'venue',
      resourceId: venueId,
      metadata: { targetUserId: userId, role },
      status: 'success'
    });
  }
}
```

### FILE: src/services/monitoring.service.ts
```typescript
import { FastifyInstance } from 'fastify';
import { db } from '../config/database';
import { redis } from '../config/redis';
import { pool } from '../config/database';

interface HealthCheckResult {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  service: string;
  version: string;
  uptime: number;
  checks: {
    database: CheckResult;
    redis: CheckResult;
    memory: CheckResult;
  };
}

interface CheckResult {
  status: 'ok' | 'error';
  latency?: number;
  error?: string;
  details?: any;
}

export class MonitoringService {
  async performHealthCheck(): Promise<HealthCheckResult> {
    const checks = await Promise.all([
      this.checkDatabase(),
      this.checkRedis(),
      this.checkMemory()
    ]);

    const [database, redisCheck, memory] = checks;
    
    const allHealthy = checks.every(check => check.status === 'ok');
    const anyUnhealthy = checks.some(check => check.status === 'error');

    return {
      status: anyUnhealthy ? 'unhealthy' : allHealthy ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      service: 'auth-service',
      version: process.env.npm_package_version || '1.0.0',
      uptime: process.uptime(),
      checks: {
        database,
        redis: redisCheck,
        memory
      }
    };
  }

  private async checkDatabase(): Promise<CheckResult> {
    const start = Date.now();
    try {
      await db.raw('SELECT 1');
      const latency = Date.now() - start;
      
      return {
        status: 'ok',
        latency,
        details: {
          totalConnections: pool.totalCount,
          idleConnections: pool.idleCount,
          waitingConnections: pool.waitingCount
        }
      };
    } catch (error) {
      return {
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  private async checkRedis(): Promise<CheckResult> {
    const start = Date.now();
    try {
      await redis.ping();
      const latency = Date.now() - start;
      
      const info = await redis.info('stats');
      const connectedClients = info.match(/connected_clients:(\d+)/)?.[1];
      
      return {
        status: 'ok',
        latency,
        details: {
          connectedClients: connectedClients ? parseInt(connectedClients) : undefined
        }
      };
    } catch (error) {
      return {
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  private checkMemory(): CheckResult {
    const usage = process.memoryUsage();
    const heapUsedMB = Math.round(usage.heapUsed / 1024 / 1024);
    const heapTotalMB = Math.round(usage.heapTotal / 1024 / 1024);
    const rssMB = Math.round(usage.rss / 1024 / 1024);
    
    return {
      status: heapUsedMB > 500 ? 'error' : 'ok',
      details: {
        heapUsedMB,
        heapTotalMB,
        rssMB,
        heapUsagePercent: Math.round((heapUsedMB / heapTotalMB) * 100)
      }
    };
  }

  getMetrics() {
    // Return Prometheus-formatted metrics
    return `
# HELP auth_service_uptime_seconds Service uptime in seconds
# TYPE auth_service_uptime_seconds gauge
auth_service_uptime_seconds ${process.uptime()}

# HELP auth_service_memory_heap_used_bytes Memory heap used in bytes
# TYPE auth_service_memory_heap_used_bytes gauge
auth_service_memory_heap_used_bytes ${process.memoryUsage().heapUsed}

# HELP auth_service_db_pool_total Total database connections
# TYPE auth_service_db_pool_total gauge
auth_service_db_pool_total ${pool.totalCount}

# HELP auth_service_db_pool_idle Idle database connections
# TYPE auth_service_db_pool_idle gauge
auth_service_db_pool_idle ${pool.idleCount}

# HELP auth_service_db_pool_waiting Waiting database connections
# TYPE auth_service_db_pool_waiting gauge
auth_service_db_pool_waiting ${pool.waitingCount}
`.trim();
  }
}

export function setupMonitoring(fastify: FastifyInstance, monitoringService: MonitoringService) {
  // Enhanced health check
  fastify.get('/health', async (_request, reply) => {
    const health = await monitoringService.performHealthCheck();
    const statusCode = health.status === 'healthy' ? 200 : 
                      health.status === 'degraded' ? 200 : 503;
    
    reply.status(statusCode).send(health);
  });

  // Prometheus metrics endpoint
  fastify.get('/metrics', async (_request, reply) => {
    const metrics = monitoringService.getMetrics();
    reply
      .type('text/plain; version=0.0.4')
      .send(metrics);
  });

  // Kubernetes liveness probe
  fastify.get('/live', async (_request, reply) => {
    reply.send({ status: 'alive' });
  });

  // Kubernetes readiness probe
  fastify.get('/ready', async (_request, reply) => {
    try {
      await Promise.all([
        db.raw('SELECT 1'),
        redis.ping()
      ]);
      reply.send({ ready: true });
    } catch (error) {
      reply.status(503).send({ ready: false });
    }
  });
}
```

### FILE: src/services/email.service.ts
```typescript
import crypto from 'crypto';
// import { db } from '../config/database';
import { redis } from '../config/redis';
import { env } from '../config/env';

interface EmailTemplate {
  subject: string;
  html: string;
  text: string;
}

export class EmailService {
  async sendVerificationEmail(userId: string, email: string, firstName: string): Promise<void> {
    const token = crypto.randomBytes(32).toString('hex');
    // const expires = Date.now() + 24 * 60 * 60 * 1000; // 24 hours

    // Store token in Redis
    await redis.setex(
      `email-verify:${token}`,
      24 * 60 * 60,
      JSON.stringify({ userId, email })
    );

    const verifyUrl = `${env.API_GATEWAY_URL}/auth/verify-email?token=${token}`;
    
    const template: EmailTemplate = {
      subject: 'Verify your TicketToken account',
      html: `
        <h2>Welcome to TicketToken, ${firstName}!</h2>
        <p>Please verify your email address by clicking the link below:</p>
        <a href="${verifyUrl}" style="display: inline-block; padding: 12px 24px; background-color: #4CAF50; color: white; text-decoration: none; border-radius: 4px;">Verify Email</a>
        <p>Or copy this link: ${verifyUrl}</p>
        <p>This link expires in 24 hours.</p>
        <p>If you didn't create this account, please ignore this email.</p>
      `,
      text: `Welcome to TicketToken, ${firstName}!
      
Please verify your email address by visiting:
${verifyUrl}

This link expires in 24 hours.

If you didn't create this account, please ignore this email.`
    };

    await this.sendEmail(email, template);
  }

  async sendPasswordResetEmail(userId: string, email: string, firstName: string): Promise<void> {
    const token = crypto.randomBytes(32).toString('hex');
    
    // Store token in Redis with 1 hour expiry
    await redis.setex(
      `password-reset:${token}`,
      60 * 60,
      JSON.stringify({ userId, email })
    );

    const resetUrl = `${env.API_GATEWAY_URL}/auth/reset-password?token=${token}`;
    
    const template: EmailTemplate = {
      subject: 'Reset your TicketToken password',
      html: `
        <h2>Password Reset Request</h2>
        <p>Hi ${firstName},</p>
        <p>We received a request to reset your password. Click the link below to create a new password:</p>
        <a href="${resetUrl}" style="display: inline-block; padding: 12px 24px; background-color: #2196F3; color: white; text-decoration: none; border-radius: 4px;">Reset Password</a>
        <p>Or copy this link: ${resetUrl}</p>
        <p>This link expires in 1 hour.</p>
        <p>If you didn't request this, please ignore this email and your password will remain unchanged.</p>
      `,
      text: `Password Reset Request

Hi ${firstName},

We received a request to reset your password. Visit the link below to create a new password:
${resetUrl}

This link expires in 1 hour.

If you didn't request this, please ignore this email and your password will remain unchanged.`
    };

    await this.sendEmail(email, template);
  }

  async sendMFABackupCodesEmail(email: string, firstName: string, backupCodes: string[]): Promise<void> {
    const template: EmailTemplate = {
      subject: 'Your TicketToken MFA backup codes',
      html: `
        <h2>MFA Backup Codes</h2>
        <p>Hi ${firstName},</p>
        <p>Here are your MFA backup codes. Store them safely:</p>
        <ul>
          ${backupCodes.map(code => `<li><code>${code}</code></li>`).join('')}
        </ul>
        <p>Each code can only be used once. Keep them secure!</p>
      `,
      text: `MFA Backup Codes

Hi ${firstName},

Here are your MFA backup codes. Store them safely:

${backupCodes.join('\n')}

Each code can only be used once. Keep them secure!`
    };

    await this.sendEmail(email, template);
  }

  private async sendEmail(to: string, template: EmailTemplate): Promise<void> {
    // In production, integrate with SendGrid, AWS SES, etc.
    // For now, log to console in development
    if (env.NODE_ENV === 'development') {
      console.log('📧 Email would be sent:', {
        to,
        subject: template.subject,
        preview: template.text.substring(0, 100) + '...'
      });
      return;
    }

    // TODO: Implement actual email sending
    // Example with SendGrid:
    // await sendgrid.send({
    //   to,
    //   from: 'noreply@tickettoken.com',
    //   subject: template.subject,
    //   html: template.html,
    //   text: template.text
    // });
  }
}
```

### FILE: src/services/oauth.service.ts
```typescript
import { OAuth2Client } from 'google-auth-library';
import * as AppleAuth from 'apple-signin-auth';
import { db } from '../config/database';
import { JWTService } from './jwt.service';
import { AuthenticationError } from '../errors';
import crypto from 'crypto';
import { env } from '../config/env';

interface OAuthProfile {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  picture?: string;
  provider: 'google' | 'apple' | 'facebook';
  verified: boolean;
}

export class OAuthService {
  private googleClient: OAuth2Client;
  private jwtService: JWTService;

  constructor() {
    this.googleClient = new OAuth2Client(
      env.GOOGLE_CLIENT_ID || 'your-google-client-id',
      env.GOOGLE_CLIENT_SECRET,
      env.GOOGLE_REDIRECT_URI || 'http://auth-service:3001/api/v1/auth/oauth/google/callback'
    );
    this.jwtService = new JWTService();
  }

  /**
   * Verify Google ID token and extract profile
   */
  async verifyGoogleToken(idToken: string): Promise<OAuthProfile> {
    try {
      const ticket = await this.googleClient.verifyIdToken({
        idToken,
        audience: env.GOOGLE_CLIENT_ID || 'your-google-client-id'
      });
      
      const payload = ticket.getPayload();
      if (!payload) {
        throw new AuthenticationError('Invalid Google token');
      }

      return {
        id: payload.sub,
        email: payload.email!,
        firstName: payload.given_name,
        lastName: payload.family_name,
        picture: payload.picture,
        provider: 'google',
        verified: payload.email_verified || false
      };
    } catch (error) {
      throw new AuthenticationError('Google token verification failed');
    }
  }

  /**
   * Verify Apple ID token and extract profile
   */
  async verifyAppleToken(idToken: string): Promise<OAuthProfile> {
    try {
      const decodedToken = await AppleAuth.verifyIdToken(idToken, {
        audience: env.APPLE_CLIENT_ID || 'com.tickettoken.app',
        ignoreExpiration: false
      });

      return {
        id: decodedToken.sub,
        email: decodedToken.email || '',
        provider: 'apple',
        verified: decodedToken.email_verified === 'true'
      };
    } catch (error) {
      throw new AuthenticationError('Apple token verification failed');
    }
  }

  /**
   * Find or create user from OAuth profile
   */
  async findOrCreateUser(profile: OAuthProfile): Promise<any> {
    // Check if user exists with this email
    let user = await db('users')
      .where({ email: profile.email })
      .first();

    if (!user) {
      // Create new user
      const userId = crypto.randomUUID();
      
      await db('users').insert({
        id: userId,
        email: profile.email,
        first_name: profile.firstName || profile.email.split('@')[0],
        last_name: profile.lastName || '',
        email_verified: profile.verified,
        role: 'user',
        is_active: true,
        created_at: new Date(),
        // OAuth users don't have passwords
        password_hash: null
      });

      user = await db('users').where({ id: userId }).first();
    }

    // Store OAuth provider connection
    const existingConnection = await db('oauth_connections')
      .where({
        user_id: user.id,
        provider: profile.provider
      })
      .first();

    if (!existingConnection) {
      await db('oauth_connections').insert({
        id: crypto.randomUUID(),
        user_id: user.id,
        provider: profile.provider,
        provider_user_id: profile.id,
        profile_data: JSON.stringify(profile),
        created_at: new Date()
      });
    } else {
      // Update profile data
      await db('oauth_connections')
        .where({ id: existingConnection.id })
        .update({
          profile_data: JSON.stringify(profile),
          updated_at: new Date()
        });
    }

    // Update last login
    await db('users')
      .where({ id: user.id })
      .update({ last_login_at: new Date() });

    return user;
  }

  /**
   * Handle OAuth login/signup
   */
  async handleOAuthLogin(provider: 'google' | 'apple', token: string): Promise<any> {
    let profile: OAuthProfile;

    // Verify token based on provider
    if (provider === 'google') {
      profile = await this.verifyGoogleToken(token);
    } else if (provider === 'apple') {
      profile = await this.verifyAppleToken(token);
    } else {
      throw new AuthenticationError('Unsupported OAuth provider');
    }

    // Find or create user
    const user = await this.findOrCreateUser(profile);

    // Generate JWT tokens
    const tokens = await this.jwtService.generateTokenPair(user);

    return {
      success: true,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        emailVerified: user.email_verified
      },
      tokens,
      provider
    };
  }

  /**
   * Link OAuth provider to existing account
   */
  async linkOAuthProvider(
    userId: string,
    provider: 'google' | 'apple',
    token: string
  ): Promise<any> {
    let profile: OAuthProfile;

    // Verify token
    if (provider === 'google') {
      profile = await this.verifyGoogleToken(token);
    } else if (provider === 'apple') {
      profile = await this.verifyAppleToken(token);
    } else {
      throw new AuthenticationError('Unsupported OAuth provider');
    }

    // Check if already linked
    const existingConnection = await db('oauth_connections')
      .where({
        user_id: userId,
        provider: provider
      })
      .first();

    if (existingConnection) {
      throw new AuthenticationError(`${provider} account already linked`);
    }

    // Check if this OAuth account is linked to another user
    const otherUserConnection = await db('oauth_connections')
      .where({
        provider: provider,
        provider_user_id: profile.id
      })
      .first();

    if (otherUserConnection) {
      throw new AuthenticationError('This OAuth account is already linked to another user');
    }

    // Link the account
    await db('oauth_connections').insert({
      id: crypto.randomUUID(),
      user_id: userId,
      provider: provider,
      provider_user_id: profile.id,
      profile_data: JSON.stringify(profile),
      created_at: new Date()
    });

    return {
      success: true,
      message: `${provider} account linked successfully`,
      provider
    };
  }
}
```

### FILE: src/services/jwt.service.ts
```typescript
import jwt, { SignOptions } from 'jsonwebtoken';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { env } from '../config/env';
import { redis } from '../config/redis';
import { TokenError } from '../errors';
import { pool } from '../config/database';

interface TokenPayload {
  sub: string;
  type: 'access' | 'refresh';
  jti: string;
  tenant_id: string;
  permissions?: string[];
  role?: string;
  family?: string;
  iat?: number;
  exp?: number;
  iss?: string;
  aud?: string | string[];
}

interface RefreshTokenData {
  userId: string;
  tenantId: string;
  family: string;
  createdAt: number;
  ipAddress: string;
  userAgent: string;
}

// Load RSA keys on module initialization
const privateKeyPath = process.env.JWT_PRIVATE_KEY_PATH || 
  path.join(process.env.HOME!, 'tickettoken-secrets', 'jwt-private.pem');
const publicKeyPath = process.env.JWT_PUBLIC_KEY_PATH || 
  path.join(process.env.HOME!, 'tickettoken-secrets', 'jwt-public.pem');

let privateKey: string;
let publicKey: string;

try {
  privateKey = fs.readFileSync(privateKeyPath, 'utf8');
  publicKey = fs.readFileSync(publicKeyPath, 'utf8');
  console.log('✓ JWT RS256 keys loaded successfully');
} catch (error) {
  console.error('✗ Failed to load JWT keys:', error);
  throw new Error('JWT keys not found. Run: openssl genrsa -out ~/tickettoken-secrets/jwt-private.pem 4096');
}

export class JWTService {
  private readonly issuer: string;

  constructor() {
    this.issuer = env.JWT_ISSUER;
  }

  async generateTokenPair(user: any): Promise<{ accessToken: string; refreshToken: string }> {
    // Ensure we have tenant_id - fetch if not provided
    let tenantId = user.tenant_id;
    if (!tenantId && user.id) {
      const result = await pool.query(
        'SELECT tenant_id FROM users WHERE id = $1',
        [user.id]
      );
      tenantId = result.rows[0]?.tenant_id || '00000000-0000-0000-0000-000000000001';
    }

    // Access token - now includes tenant_id
    const accessTokenPayload = {
      sub: user.id,
      type: 'access' as const,
      jti: crypto.randomUUID(),
      tenant_id: tenantId,
      permissions: user.permissions || ['buy:tickets', 'view:events', 'transfer:tickets'],
      role: user.role || 'customer',
    };

    const accessTokenOptions: SignOptions = {
      expiresIn: env.JWT_ACCESS_EXPIRES_IN as any,
      issuer: this.issuer,
      audience: this.issuer,
      algorithm: 'RS256',  // Changed from HS256
      keyid: '1',          // Added for key rotation support
    };

    const accessToken = jwt.sign(accessTokenPayload, privateKey, accessTokenOptions);

    // Refresh token - also includes tenant_id for consistency
    const refreshTokenId = crypto.randomUUID();
    const family = crypto.randomUUID();

    const refreshTokenPayload = {
      sub: user.id,
      type: 'refresh' as const,
      jti: refreshTokenId,
      tenant_id: tenantId,
      family,
    };

    const refreshTokenOptions: SignOptions = {
      expiresIn: env.JWT_REFRESH_EXPIRES_IN as any,
      algorithm: 'RS256',  // Changed from HS256
      keyid: '1',
    };

    const refreshToken = jwt.sign(refreshTokenPayload, privateKey, refreshTokenOptions);

    // Store refresh token metadata with tenant_id
    const refreshData: RefreshTokenData = {
      userId: user.id,
      tenantId: tenantId,
      family,
      createdAt: Date.now(),
      ipAddress: user.ipAddress || 'unknown',
      userAgent: user.userAgent || 'unknown',
    };

    await redis.setex(
      `refresh_token:${refreshTokenId}`,
      7 * 24 * 60 * 60, // 7 days
      JSON.stringify(refreshData)
    );

    return { accessToken, refreshToken };
  }

  async verifyAccessToken(token: string): Promise<TokenPayload> {
    try {
      const decoded = jwt.verify(token, publicKey, {
        issuer: this.issuer,
        audience: this.issuer,
        algorithms: ['RS256'],  // Changed from HS256
      }) as TokenPayload;

      if (decoded.type !== 'access') {
        throw new TokenError('Invalid token type');
      }

      // Validate tenant_id is present
      if (!decoded.tenant_id) {
        throw new TokenError('Invalid token - missing tenant context');
      }

      return decoded;
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        throw new TokenError('Access token expired');
      }
      throw new TokenError('Invalid access token');
    }
  }

  async refreshTokens(refreshToken: string, ipAddress: string, userAgent: string): Promise<{ accessToken: string; refreshToken: string }> {
    try {
      // Verify refresh token
      const decoded = jwt.verify(refreshToken, publicKey, {
        algorithms: ['RS256'],  // Changed from HS256
      }) as TokenPayload;

      if (decoded.type !== 'refresh') {
        throw new TokenError('Invalid token type');
      }

      // Check if token exists and hasn't been revoked
      const storedData = await redis.get(`refresh_token:${decoded.jti}`);

      if (!storedData) {
        // Token reuse detected - invalidate entire family
        await this.invalidateTokenFamily(decoded.family!);
        throw new TokenError('Token reuse detected - possible theft');
      }

      // Parse stored data
      const tokenData: RefreshTokenData = JSON.parse(storedData);

      // Fetch fresh user data to ensure correct tenant_id
      const userResult = await pool.query(
        'SELECT id, tenant_id, permissions, role FROM users WHERE id = $1',
        [decoded.sub]
      );

      if (userResult.rows.length === 0) {
        throw new TokenError('User not found');
      }

      const user = userResult.rows[0];

      // Generate new token pair with current tenant_id
      const newTokens = await this.generateTokenPair({
        id: user.id,
        tenant_id: user.tenant_id,
        permissions: user.permissions,
        role: user.role,
        ipAddress,
        userAgent,
      });

      // Invalidate old refresh token
      await redis.del(`refresh_token:${decoded.jti}`);

      return newTokens;
    } catch (error) {
      if (error instanceof TokenError) {
        throw error;
      }
      throw new TokenError('Invalid refresh token');
    }
  }

  async invalidateTokenFamily(family: string): Promise<void> {
    // Find all tokens in the family
    const keys = await redis.keys('refresh_token:*');

    for (const key of keys) {
      const data = await redis.get(key);
      if (data) {
        const tokenData: RefreshTokenData = JSON.parse(data);
        if (tokenData.family === family) {
          await redis.del(key);
        }
      }
    }
  }

  async revokeAllUserTokens(userId: string): Promise<void> {
    const keys = await redis.keys('refresh_token:*');

    for (const key of keys) {
      const data = await redis.get(key);
      if (data) {
        const tokenData: RefreshTokenData = JSON.parse(data);
        if (tokenData.userId === userId) {
          await redis.del(key);
        }
      }
    }
  }

  decode(token: string): any {
    return jwt.decode(token);
  }

  async verifyRefreshToken(token: string): Promise<any> {
    try {
      return jwt.verify(token, publicKey, {
        algorithms: ['RS256'],  // Changed from HS256
      });
    } catch {
      throw new Error('Invalid refresh token');
    }
  }

  // Export public key for JWKS endpoint (future use)
  getPublicKey(): string {
    return publicKey;
  }
}
```

### FILE: src/services/rbac.service.ts
```typescript
import { db } from '../config/database';
import { AuthorizationError } from '../errors';

interface Role {
  name: string;
  permissions: string[];
  venueScoped: boolean;
}

export class RBACService {
  private roles: Map<string, Role>;

  constructor() {
    this.roles = new Map([
      ['venue-owner', {
        name: 'venue-owner',
        permissions: ['*'], // All permissions for their venue
        venueScoped: true,
      }],
      ['venue-manager', {
        name: 'venue-manager',
        permissions: [
          'events:create', 'events:update', 'events:delete',
          'tickets:view', 'tickets:validate',
          'reports:view', 'reports:export',
        ],
        venueScoped: true,
      }],
      ['box-office', {
        name: 'box-office',
        permissions: [
          'tickets:sell', 'tickets:view', 'tickets:validate',
          'payments:process', 'reports:daily',
        ],
        venueScoped: true,
      }],
      ['door-staff', {
        name: 'door-staff',
        permissions: ['tickets:validate', 'tickets:view'],
        venueScoped: true,
      }],
      ['customer', {
        name: 'customer',
        permissions: [
          'tickets:purchase', 'tickets:view-own', 'tickets:transfer-own',
          'profile:update-own',
        ],
        venueScoped: false,
      }],
    ]);
  }

  async getUserPermissions(userId: string, venueId?: string): Promise<string[]> {
    const permissions = new Set<string>();

    // Get user's venue roles if venueId provided
    if (venueId) {
      const venueRoles = await db('user_venue_roles')
        .where({
          user_id: userId,
          venue_id: venueId,
          is_active: true,
        })
        .where('expires_at', '>', new Date())
        .orWhereNull('expires_at');

      for (const venueRole of venueRoles) {
        const role = this.roles.get(venueRole.role);
        if (role) {
          role.permissions.forEach(p => permissions.add(p));
        }
      }
    }

    // Add customer permissions by default
    const customerRole = this.roles.get('customer');
    if (customerRole) {
      customerRole.permissions.forEach(p => permissions.add(p));
    }

    return Array.from(permissions);
  }

  async checkPermission(userId: string, permission: string, venueId?: string): Promise<boolean> {
    const userPermissions = await this.getUserPermissions(userId, venueId);

    // Check for wildcard permission
    if (userPermissions.includes('*')) {
      return true;
    }

    // Check specific permission
    return userPermissions.includes(permission);
  }

  async requirePermission(userId: string, permission: string, venueId?: string): Promise<void> {
    const hasPermission = await this.checkPermission(userId, permission, venueId);
    
    if (!hasPermission) {
      throw new AuthorizationError(`Missing required permission: ${permission}`);
    }
  }

  async grantVenueRole(
    userId: string,
    venueId: string,
    role: string,
    grantedBy: string,
    expiresAt?: Date
  ): Promise<void> {
    // Validate role
    if (!this.roles.has(role)) {
      throw new Error(`Invalid role: ${role}`);
    }

    // Check if granter has permission to grant roles
    await this.requirePermission(grantedBy, 'roles:manage', venueId);

    // Check for existing role
    const existing = await db('user_venue_roles')
      .where({
        user_id: userId,
        venue_id: venueId,
        role: role,
        is_active: true,
      })
      .first();

    if (existing) {
      // Update expiration if needed
      if (expiresAt) {
        await db('user_venue_roles')
          .where('id', existing.id)
          .update({ expires_at: expiresAt });
      }
      return;
    }

    // Grant new role
    await db('user_venue_roles').insert({
      user_id: userId,
      venue_id: venueId,
      role: role,
      granted_by: grantedBy,
      expires_at: expiresAt,
    });
  }

  async revokeVenueRole(userId: string, venueId: string, role: string, revokedBy: string): Promise<void> {
    // Check if revoker has permission
    await this.requirePermission(revokedBy, 'roles:manage', venueId);

    await db('user_venue_roles')
      .where({
        user_id: userId,
        venue_id: venueId,
        role: role,
        is_active: true,
      })
      .update({ is_active: false });
  }

  async getUserVenueRoles(userId: string): Promise<any[]> {
    return db('user_venue_roles')
      .where({
        user_id: userId,
        is_active: true,
      })
      .where('expires_at', '>', new Date())
      .orWhereNull('expires_at')
      .select('venue_id', 'role', 'granted_at', 'expires_at');
  }
}
```

### FILE: src/types/express.d.ts
```typescript
import { User } from '../models/user.model';

declare global {
  namespace Express {
    interface Request {
      user?: any;
    }
  }
}
```


================================================================================
## SECTION 3: RAW PATTERN EXTRACTION
================================================================================

### All .table() and .from() calls:

### All SQL keywords (SELECT, INSERT, UPDATE, DELETE):
backend/services/auth-service//src/routes/auth.routes.ts:274:        await validate(schemas.updateProfileSchema)(request, reply);
backend/services/auth-service//src/routes/auth.routes.ts:277:      return profileController.updateProfile(request, reply);
backend/services/auth-service//src/routes/health.routes.ts:14:    const result = await pool.query('SELECT 1');
backend/services/auth-service//src/config/database.ts:36:    const result = await pool.query('SELECT NOW()');
backend/services/auth-service//src/index.ts:190:        `UPDATE users
backend/services/auth-service//src/index.ts:229:      `INSERT INTO auth_audit_log (user_id, event_type, ip_address)
backend/services/auth-service//src/controllers/profile.controller.ts:15:        .select(
backend/services/auth-service//src/controllers/profile.controller.ts:25:          'updated_at',
backend/services/auth-service//src/controllers/profile.controller.ts:53:  async updateProfile(request: AuthenticatedRequest, reply: FastifyReply) {
backend/services/auth-service//src/controllers/profile.controller.ts:55:    const updates = request.body as {
backend/services/auth-service//src/controllers/profile.controller.ts:63:      const profileUpdates: Record<string, any> = {};
backend/services/auth-service//src/controllers/profile.controller.ts:66:        if (updates[field as keyof typeof updates] !== undefined) {
backend/services/auth-service//src/controllers/profile.controller.ts:67:          profileUpdates[field] = updates[field as keyof typeof updates];
backend/services/auth-service//src/controllers/profile.controller.ts:71:      if (Object.keys(profileUpdates).length === 0) {
backend/services/auth-service//src/controllers/profile.controller.ts:72:        throw new ValidationError([{ message: 'No valid fields to update' }]);
backend/services/auth-service//src/controllers/profile.controller.ts:75:      profileUpdates.updated_at = new Date();
backend/services/auth-service//src/controllers/profile.controller.ts:79:        .update(profileUpdates);
backend/services/auth-service//src/controllers/profile.controller.ts:84:        action: 'profile_updated',
backend/services/auth-service//src/controllers/profile.controller.ts:90:          updated_fields: Object.keys(profileUpdates)
backend/services/auth-service//src/controllers/profile.controller.ts:97:      request.log.error({ error, userId }, 'Failed to update profile');
backend/services/auth-service//src/controllers/profile.controller.ts:109:        error: 'Failed to update profile',
backend/services/auth-service//src/controllers/session.controller.ts:15:        .select(
backend/services/auth-service//src/controllers/session.controller.ts:60:        .update({ revoked_at: new Date() });
backend/services/auth-service//src/controllers/session.controller.ts:101:        .update({ revoked_at: new Date() });
backend/services/auth-service//src/db/migrations/001_create_users_table.ts:98:  // Create updated_at trigger function
backend/services/auth-service//src/db/migrations/001_create_users_table.ts:100:    CREATE OR REPLACE FUNCTION update_updated_at_column()
backend/services/auth-service//src/db/migrations/001_create_users_table.ts:103:      NEW.updated_at = NOW();
backend/services/auth-service//src/db/migrations/001_create_users_table.ts:113:      CREATE TRIGGER update_${tableName}_updated_at 
backend/services/auth-service//src/db/migrations/001_create_users_table.ts:114:      BEFORE UPDATE ON ${tableName} 
backend/services/auth-service//src/db/migrations/001_create_users_table.ts:116:      EXECUTE FUNCTION update_updated_at_column();
backend/services/auth-service//src/db/migrations/001_create_users_table.ts:123:  await knex.raw('DROP TRIGGER IF EXISTS update_users_updated_at ON users');
backend/services/auth-service//src/db/migrations/001_create_users_table.ts:124:  await knex.raw('DROP TRIGGER IF EXISTS update_user_venue_roles_updated_at ON user_venue_roles');
backend/services/auth-service//src/db/migrations/001_create_users_table.ts:127:  await knex.raw('DROP FUNCTION IF EXISTS update_updated_at_column()');
backend/services/auth-service//src/models/user.model.ts:16:  updated_at: Date;
backend/services/auth-service//src/middleware/token-validator.ts:44:        `SELECT t.revoked, t.expires_at, f.revoked as family_revoked
backend/services/auth-service//src/middleware/token-validator.ts:70:          `INSERT INTO auth_audit_log (user_id, event_type, ip_address, details)
backend/services/auth-service//src/middleware/token-validator.ts:86:      // Update last used timestamp (async, don't wait)
backend/services/auth-service//src/middleware/token-validator.ts:88:        'UPDATE active_tokens SET used_at = CURRENT_TIMESTAMP WHERE jti = $1',
backend/services/auth-service//src/middleware/token-validator.ts:90:      ).catch(err => console.error('Failed to update token usage:', err));
backend/services/auth-service//src/middleware/token-validator.ts:109:      'UPDATE active_tokens SET revoked = TRUE WHERE jti = $1',
backend/services/auth-service//src/middleware/token-validator.ts:117:    await pool.query('SELECT revoke_all_user_tokens($1, $2)', [userId, reason]);
backend/services/auth-service//src/middleware/token-validator.ts:121:      'SELECT jti FROM active_tokens WHERE user_id = $1',
backend/services/auth-service//src/middleware/token-validator.ts:136:      'SELECT * FROM token_families WHERE family_id = $1 AND revoked = FALSE',
backend/services/auth-service//src/middleware/token-validator.ts:151:      'UPDATE active_tokens SET used_at = CURRENT_TIMESTAMP WHERE jti = $1',
backend/services/auth-service//src/middleware/token-validator.ts:155:    // Update family rotation info
backend/services/auth-service//src/middleware/token-validator.ts:157:      `UPDATE token_families
backend/services/auth-service//src/middleware/token-validator.ts:169:      `UPDATE token_families
backend/services/auth-service//src/middleware/token-validator.ts:176:      'UPDATE active_tokens SET revoked = TRUE WHERE family_id = $1',
backend/services/auth-service//src/middleware/token-validator.ts:214:      `INSERT INTO active_tokens (jti, user_id, family_id, token_type, expires_at, created_at)
backend/services/auth-service//src/middleware/token-validator.ts:220:      `INSERT INTO active_tokens (jti, user_id, family_id, token_type, expires_at, created_at)
backend/services/auth-service//src/middleware/enhanced-security.ts:31:        `SELECT locked_until FROM failed_login_attempts
backend/services/auth-service//src/types.ts:23:  updated_at: Date;
backend/services/auth-service//src/services/biometric.service.ts:64:      .update(challenge + credential.public_key)
backend/services/auth-service//src/services/biometric.service.ts:92:      .select('id', 'device_id', 'credential_type', 'created_at');
backend/services/auth-service//src/services/monitoring.service.ts:56:      await db.raw('SELECT 1');
backend/services/auth-service//src/services/monitoring.service.ts:170:        db.raw('SELECT 1'),
backend/services/auth-service//src/services/auth-extended.service.ts:63:    // Update password
backend/services/auth-service//src/services/auth-extended.service.ts:66:      .update({
backend/services/auth-service//src/services/auth-extended.service.ts:69:        updated_at: new Date()
backend/services/auth-service//src/services/auth-extended.service.ts:106:    // Update user as verified
backend/services/auth-service//src/services/auth-extended.service.ts:107:    const updated = await db('users')
backend/services/auth-service//src/services/auth-extended.service.ts:110:      .update({
backend/services/auth-service//src/services/auth-extended.service.ts:113:        updated_at: new Date()
backend/services/auth-service//src/services/auth-extended.service.ts:116:    if (updated === 0) {
backend/services/auth-service//src/services/auth-extended.service.ts:196:    // Hash and update password
backend/services/auth-service//src/services/auth-extended.service.ts:201:      .update({
backend/services/auth-service//src/services/auth-extended.service.ts:204:        updated_at: new Date()
backend/services/auth-service//src/services/auth-extended.service.ts:218:      .update({ 
backend/services/auth-service//src/services/wallet.service.ts:144:    await db('users').where({ id: user.id }).update({ last_login_at: new Date() });
backend/services/auth-service//src/services/mfa.service.ts:74:    await db('users').where('id', userId).update({
backend/services/auth-service//src/services/mfa.service.ts:136:    await db('users').where('id', userId).update({
backend/services/auth-service//src/services/mfa.service.ts:146:      'update:bank-details',
backend/services/auth-service//src/services/mfa.service.ts:178:    return crypto.createHash('sha256').update(code).digest('hex');
backend/services/auth-service//src/services/mfa.service.ts:187:    let encrypted = cipher.update(text, 'utf8', 'hex');
backend/services/auth-service//src/services/mfa.service.ts:206:    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
backend/services/auth-service//src/services/mfa.service.ts:216:      .update({
backend/services/auth-service//src/services/mfa.service.ts:220:        updated_at: new Date()
backend/services/auth-service//src/services/auth.service.ts:10:  // Dummy hash for timing attack prevention (not readonly so it can be updated)
backend/services/auth-service//src/services/auth.service.ts:31:        'SELECT id FROM users WHERE email = $1 AND deleted_at IS NULL',
backend/services/auth-service//src/services/auth.service.ts:47:        `INSERT INTO users (email, password_hash, first_name, last_name, phone, email_verified, tenant_id, created_at)
backend/services/auth-service//src/services/auth.service.ts:92:        'SELECT id, email, password_hash, first_name, last_name, email_verified, mfa_enabled, permissions, role, tenant_id FROM users WHERE email = $1 AND deleted_at IS NULL',
backend/services/auth-service//src/services/auth.service.ts:169:        'SELECT id, email, first_name, last_name, email_verified, mfa_enabled, permissions, role, tenant_id FROM users WHERE id = $1 AND deleted_at IS NULL',
backend/services/auth-service//src/services/auth.service.ts:185:          `INSERT INTO token_refresh_log (user_id, ip_address, user_agent, refreshed_at)
backend/services/auth-service//src/services/auth.service.ts:231:          `INSERT INTO invalidated_tokens (token, user_id, invalidated_at, expires_at)
backend/services/auth-service//src/services/auth.service.ts:240:        'UPDATE user_sessions SET ended_at = NOW() WHERE user_id = $1 AND ended_at IS NULL',
backend/services/auth-service//src/services/auth.service.ts:262:      'UPDATE users SET email_verified = true WHERE email_verification_token = $1 RETURNING id',
backend/services/auth-service//src/services/auth.service.ts:282:        'SELECT id, email FROM users WHERE email = $1 AND deleted_at IS NULL',
backend/services/auth-service//src/services/auth.service.ts:292:          'UPDATE users SET password_reset_token = $1, password_reset_expires = $2 WHERE id = $3',
backend/services/auth-service//src/services/auth.service.ts:330:      'SELECT id FROM users WHERE password_reset_token = $1 AND password_reset_expires > NOW() AND deleted_at IS NULL',
backend/services/auth-service//src/services/auth.service.ts:342:      'UPDATE users SET password_hash = $1, password_reset_token = NULL, password_reset_expires = NULL WHERE id = $2',
backend/services/auth-service//src/services/auth.service.ts:353:      'SELECT password_hash FROM users WHERE id = $1 AND deleted_at IS NULL',
backend/services/auth-service//src/services/auth.service.ts:371:      'UPDATE users SET password_hash = $1 WHERE id = $2',
backend/services/auth-service//src/services/auth.service.ts:380:      'SELECT id, email, first_name, last_name, email_verified, mfa_enabled, permissions, role, tenant_id FROM users WHERE id = $1 AND deleted_at IS NULL',
backend/services/auth-service//src/services/security-enhanced.service.ts:153:    // Update last activity
backend/services/auth-service//src/services/device-trust.service.ts:18:      .update(components.join('|'))
backend/services/auth-service//src/services/device-trust.service.ts:64:      // Update existing
backend/services/auth-service//src/services/device-trust.service.ts:71:        .update({
backend/services/auth-service//src/services/oauth.service.ts:129:      // Update profile data
backend/services/auth-service//src/services/oauth.service.ts:132:        .update({
backend/services/auth-service//src/services/oauth.service.ts:134:          updated_at: new Date()
backend/services/auth-service//src/services/oauth.service.ts:138:    // Update last login
backend/services/auth-service//src/services/oauth.service.ts:141:      .update({ last_login_at: new Date() });
backend/services/auth-service//src/services/jwt.service.ts:63:        'SELECT tenant_id FROM users WHERE id = $1',
backend/services/auth-service//src/services/jwt.service.ts:179:        'SELECT id, tenant_id, permissions, role FROM users WHERE id = $1',
backend/services/auth-service//src/services/rbac.service.ts:23:          'events:create', 'events:update', 'events:delete',
backend/services/auth-service//src/services/rbac.service.ts:46:          'profile:update-own',
backend/services/auth-service//src/services/rbac.service.ts:130:      // Update expiration if needed
backend/services/auth-service//src/services/rbac.service.ts:134:          .update({ expires_at: expiresAt });
backend/services/auth-service//src/services/rbac.service.ts:160:      .update({ is_active: false });
backend/services/auth-service//src/services/rbac.service.ts:171:      .select('venue_id', 'role', 'granted_at', 'expires_at');
backend/services/auth-service//src/services/auth-secure.service.ts:145:      .select('roles.name')
backend/services/auth-service//src/services/auth-secure.service.ts:158:    // Update last login
backend/services/auth-service//src/services/auth-secure.service.ts:161:      .update({
backend/services/auth-service//src/validators/auth.validators.ts:73:export const updateProfileSchema = Joi.object({

### All JOIN operations:
backend/services/auth-service//src/index.ts:111:        field: detail.path.join('.'),
backend/services/auth-service//src/middleware/validation.middleware.ts:17:          field: detail.path.join('.'),
backend/services/auth-service//src/middleware/token-validator.ts:46:         LEFT JOIN token_families f ON t.family_id = f.family_id
backend/services/auth-service//src/services/security-enhanced.service.ts:18:      throw new Error(`Password validation failed: ${validation.errors.join(', ')}`);
backend/services/auth-service//src/services/email.service.ts:95:          ${backupCodes.map(code => `<li><code>${code}</code></li>`).join('')}
backend/services/auth-service//src/services/email.service.ts:105:${backupCodes.join('\n')}
backend/services/auth-service//src/services/device-trust.service.ts:18:      .update(components.join('|'))
backend/services/auth-service//src/services/password-security.service.ts:16:      throw new Error(`Password validation failed: ${validation.errors.join(', ')}`);
backend/services/auth-service//src/services/password-security.service.ts:96:    return password.split('').sort(() => Math.random() - 0.5).join('');
backend/services/auth-service//src/services/jwt.service.ts:35:  path.join(process.env.HOME!, 'tickettoken-secrets', 'jwt-private.pem');
backend/services/auth-service//src/services/jwt.service.ts:37:  path.join(process.env.HOME!, 'tickettoken-secrets', 'jwt-public.pem');
backend/services/auth-service//src/services/auth-secure.service.ts:143:      .join('roles', 'user_roles.role_id', 'roles.id')

### All WHERE clauses:
backend/services/auth-service//src/index.ts:195:         WHERE id = $2`,
backend/services/auth-service//src/middleware/token-validator.ts:47:         WHERE t.jti = $1`,
backend/services/auth-service//src/middleware/token-validator.ts:88:        'UPDATE active_tokens SET used_at = CURRENT_TIMESTAMP WHERE jti = $1',
backend/services/auth-service//src/middleware/token-validator.ts:109:      'UPDATE active_tokens SET revoked = TRUE WHERE jti = $1',
backend/services/auth-service//src/middleware/token-validator.ts:121:      'SELECT jti FROM active_tokens WHERE user_id = $1',
backend/services/auth-service//src/middleware/token-validator.ts:136:      'SELECT * FROM token_families WHERE family_id = $1 AND revoked = FALSE',
backend/services/auth-service//src/middleware/token-validator.ts:151:      'UPDATE active_tokens SET used_at = CURRENT_TIMESTAMP WHERE jti = $1',
backend/services/auth-service//src/middleware/token-validator.ts:160:       WHERE family_id = $1`,
backend/services/auth-service//src/middleware/token-validator.ts:171:       WHERE family_id = $2`,
backend/services/auth-service//src/middleware/token-validator.ts:176:      'UPDATE active_tokens SET revoked = TRUE WHERE family_id = $1',
backend/services/auth-service//src/middleware/enhanced-security.ts:32:         WHERE email = $1 AND ip_address = $2 AND locked_until > NOW()`,
backend/services/auth-service//src/services/auth.service.ts:31:        'SELECT id FROM users WHERE email = $1 AND deleted_at IS NULL',
backend/services/auth-service//src/services/auth.service.ts:92:        'SELECT id, email, password_hash, first_name, last_name, email_verified, mfa_enabled, permissions, role, tenant_id FROM users WHERE email = $1 AND deleted_at IS NULL',
backend/services/auth-service//src/services/auth.service.ts:169:        'SELECT id, email, first_name, last_name, email_verified, mfa_enabled, permissions, role, tenant_id FROM users WHERE id = $1 AND deleted_at IS NULL',
backend/services/auth-service//src/services/auth.service.ts:240:        'UPDATE user_sessions SET ended_at = NOW() WHERE user_id = $1 AND ended_at IS NULL',
backend/services/auth-service//src/services/auth.service.ts:262:      'UPDATE users SET email_verified = true WHERE email_verification_token = $1 RETURNING id',
backend/services/auth-service//src/services/auth.service.ts:282:        'SELECT id, email FROM users WHERE email = $1 AND deleted_at IS NULL',
backend/services/auth-service//src/services/auth.service.ts:292:          'UPDATE users SET password_reset_token = $1, password_reset_expires = $2 WHERE id = $3',
backend/services/auth-service//src/services/auth.service.ts:330:      'SELECT id FROM users WHERE password_reset_token = $1 AND password_reset_expires > NOW() AND deleted_at IS NULL',
backend/services/auth-service//src/services/auth.service.ts:342:      'UPDATE users SET password_hash = $1, password_reset_token = NULL, password_reset_expires = NULL WHERE id = $2',
backend/services/auth-service//src/services/auth.service.ts:353:      'SELECT password_hash FROM users WHERE id = $1 AND deleted_at IS NULL',
backend/services/auth-service//src/services/auth.service.ts:371:      'UPDATE users SET password_hash = $1 WHERE id = $2',
backend/services/auth-service//src/services/auth.service.ts:380:      'SELECT id, email, first_name, last_name, email_verified, mfa_enabled, permissions, role, tenant_id FROM users WHERE id = $1 AND deleted_at IS NULL',
backend/services/auth-service//src/services/jwt.service.ts:63:        'SELECT tenant_id FROM users WHERE id = $1',
backend/services/auth-service//src/services/jwt.service.ts:179:        'SELECT id, tenant_id, permissions, role FROM users WHERE id = $1',

================================================================================
## SECTION 4: CONFIGURATION AND SETUP FILES
================================================================================

### database.ts
```typescript
import { Pool } from 'pg';
import knex from 'knex';

// Simple, working configuration
const dbConfig = {
  host: process.env.DB_HOST || 'tickettoken-postgres',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'tickettoken_db',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
};

export const pool = new Pool({
  ...dbConfig,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

export const db = knex({
  client: 'pg',
  connection: dbConfig,
  pool: { min: 2, max: 10 }
});

pool.on('connect', (client) => {
  console.log('New client connected to database');
});

pool.on('error', (err) => {
  console.error('Unexpected database error:', err);
});

export async function checkDatabaseHealth(): Promise<boolean> {
  try {
    const result = await pool.query('SELECT NOW()');
    return !!result.rows[0];
  } catch (error) {
    console.error('Database health check failed:', error);
    return false;
  }
}

export async function closeDatabaseConnections() {
  await db.destroy();
  await pool.end();
}
```
### .env.example
```
# ================================================
# AUTH-SERVICE ENVIRONMENT CONFIGURATION
# ================================================
# Generated: Tue Aug 12 13:18:17 EDT 2025
# Service: auth-service
# Port: 3001
# ================================================

# ==== REQUIRED: Core Service Configuration ====
NODE_ENV=development                    # development | staging | production
PORT=<PORT_NUMBER>         # Service port
SERVICE_NAME=auth-service           # Service identifier

# ==== REQUIRED: Database Configuration ====
DB_HOST=localhost                       # Database host
DB_PORT=5432                           # PostgreSQL port (5432) or pgBouncer (6432)
DB_USER=postgres                       # Database user
DB_PASSWORD=<CHANGE_ME>                # Database password
DB_NAME=tickettoken_db                 # Database name
DATABASE_URL=postgresql://${DB_USER}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_NAME}

# ==== Database Connection Pool ====
DB_POOL_MIN=2                          # Minimum pool connections
DB_POOL_MAX=10                         # Maximum pool connections

# ==== REQUIRED: Redis Configuration ====
REDIS_HOST=localhost                   # Redis host
REDIS_PORT=6379                       # Redis port
REDIS_PASSWORD=<REDIS_PASSWORD>       # Redis password (if auth enabled)
REDIS_DB=0                            # Redis database number
REDIS_URL=redis://:${REDIS_PASSWORD}@${REDIS_HOST}:${REDIS_PORT}/${REDIS_DB}

# ==== REQUIRED: Security Configuration ====
JWT_SECRET=<CHANGE_TO_256_BIT_SECRET> # JWT signing secret (min 32 chars)
JWT_EXPIRES_IN=15m                    # Access token expiration
JWT_REFRESH_EXPIRES_IN=7d             # Refresh token expiration
JWT_ALGORITHM=HS256                   # JWT algorithm
JWT_ISSUER=tickettoken                # JWT issuer
JWT_AUDIENCE=tickettoken-platform     # JWT audience

# ==== REQUIRED: Service Discovery ====
# Internal service URLs for service-to-service communication
AUTH_SERVICE_URL=http://localhost:3001
VENUE_SERVICE_URL=http://localhost:3002
EVENT_SERVICE_URL=http://localhost:3003
TICKET_SERVICE_URL=http://localhost:3004
PAYMENT_SERVICE_URL=http://localhost:3005
MARKETPLACE_SERVICE_URL=http://localhost:3008
ANALYTICS_SERVICE_URL=http://localhost:3007
NOTIFICATION_SERVICE_URL=http://localhost:3008
INTEGRATION_SERVICE_URL=http://localhost:3009
COMPLIANCE_SERVICE_URL=http://localhost:3010
QUEUE_SERVICE_URL=http://localhost:3011
SEARCH_SERVICE_URL=http://localhost:3012
FILE_SERVICE_URL=http://localhost:3013
MONITORING_SERVICE_URL=http://localhost:3014
BLOCKCHAIN_SERVICE_URL=http://localhost:3015
ORDER_SERVICE_URL=http://localhost:3016

# ==== Optional: Monitoring & Logging ====
LOG_LEVEL=info                                # debug | info | warn | error
LOG_FORMAT=json                               # json | pretty
ENABLE_METRICS=true                          # Enable Prometheus metrics
METRICS_PORT=9090                            # Metrics endpoint port

# ==== Optional: Feature Flags ====
ENABLE_RATE_LIMITING=true                    # Enable rate limiting
RATE_LIMIT_WINDOW_MS=60000                  # Rate limit window (1 minute)
RATE_LIMIT_MAX_REQUESTS=100                 # Max requests per window

# ==== Environment-Specific Overrides ====
# Add any environment-specific configurations below
# These will override the defaults above based on NODE_ENV

```

================================================================================
## SECTION 5: REPOSITORY AND SERVICE LAYERS
================================================================================

### FILE: src/services/biometric.service.ts
```typescript
import { db } from '../config/database';
import { redis } from '../config/redis';
import { AuthenticationError } from '../errors';
import crypto from 'crypto';

export class BiometricService {
  /**
   * Register biometric public key for a device
   */
  async registerBiometric(
    userId: string,
    deviceId: string,
    publicKey: string,
    type: 'faceId' | 'touchId' | 'fingerprint'
  ): Promise<any> {
    // Generate a unique credential ID
    const credentialId = crypto.randomUUID();
    
    // Store biometric credential
    await db('biometric_credentials').insert({
      id: credentialId,
      user_id: userId,
      device_id: deviceId,
      public_key: publicKey,
      credential_type: type,
      created_at: new Date()
    });
    
    return {
      success: true,
      credentialId,
      type
    };
  }

  /**
   * Verify biometric authentication
   */
  async verifyBiometric(
    userId: string,
    deviceId: string,
    credentialId: string,
    signature: string,
    challenge: string
  ): Promise<boolean> {
    // Get stored credential
    const credential = await db('biometric_credentials')
      .where({
        id: credentialId,
        user_id: userId,
        device_id: deviceId,
        is_active: true
      })
      .first();
    
    if (!credential) {
      throw new AuthenticationError('Biometric credential not found');
    }
    
    // In production, verify signature with public key
    // For now, we'll do a simple check
    const expectedSignature = crypto
      .createHash('sha256')
      .update(challenge + credential.public_key)
      .digest('hex');
    
    return signature === expectedSignature;
  }

  /**
   * Generate biometric challenge
   */
  async generateChallenge(userId: string): Promise<string> {
    const challenge = crypto.randomBytes(32).toString('hex');
    
    // Store challenge in Redis with 5 minute expiry
    await redis.setex(
      `biometric_challenge:${userId}`,
      300,
      challenge
    );
    
    return challenge;
  }

  /**
   * List registered biometric devices
   */
  async listBiometricDevices(userId: string): Promise<any[]> {
    return db('biometric_credentials')
      .where({ user_id: userId, is_active: true })
      .select('id', 'device_id', 'credential_type', 'created_at');
  }
}
```

### FILE: src/services/audit.service.ts
```typescript
import { db } from '../config/database';
import { auditLogger } from '../config/logger';

export interface AuditEvent {
  userId?: string;
  action: string;
  resourceType?: string;
  resourceId?: string;
  ipAddress?: string;
  userAgent?: string;
  metadata?: any;
  status: 'success' | 'failure';
  errorMessage?: string;
}

export class AuditService {
  async log(event: AuditEvent): Promise<void> {
    try {
      // Log to database
      await db('audit_logs').insert({
        user_id: event.userId,
        action: event.action,
        resource_type: event.resourceType,
        resource_id: event.resourceId,
        ip_address: event.ipAddress,
        user_agent: event.userAgent,
        metadata: event.metadata ? JSON.stringify(event.metadata) : null,
        status: event.status,
        error_message: event.errorMessage,
        created_at: new Date()
      });

      // Also log to file/stdout for centralized logging
      auditLogger.info({
        ...event,
        timestamp: new Date().toISOString()
      }, `Audit: ${event.action}`);
    } catch (error) {
      // Don't fail the request if audit logging fails
      auditLogger.error({ error, event }, 'Failed to log audit event');
    }
  }

  // Convenience methods for common events
  async logLogin(userId: string, ipAddress: string, userAgent: string, success: boolean, errorMessage?: string) {
    await this.log({
      userId,
      action: 'user.login',
      ipAddress,
      userAgent,
      status: success ? 'success' : 'failure',
      errorMessage
    });
  }

  async logRegistration(userId: string, email: string, ipAddress: string) {
    await this.log({
      userId,
      action: 'user.registration',
      ipAddress,
      metadata: { email },
      status: 'success'
    });
  }

  async logPasswordChange(userId: string, ipAddress: string) {
    await this.log({
      userId,
      action: 'user.password_changed',
      ipAddress,
      status: 'success'
    });
  }

  async logMFAEnabled(userId: string) {
    await this.log({
      userId,
      action: 'user.mfa_enabled',
      status: 'success'
    });
  }

  async logTokenRefresh(userId: string, ipAddress: string) {
    await this.log({
      userId,
      action: 'token.refreshed',
      ipAddress,
      status: 'success'
    });
  }

  async logRoleGrant(grantedBy: string, userId: string, venueId: string, role: string) {
    await this.log({
      userId: grantedBy,
      action: 'role.granted',
      resourceType: 'venue',
      resourceId: venueId,
      metadata: { targetUserId: userId, role },
      status: 'success'
    });
  }
}
```

### FILE: src/services/monitoring.service.ts
```typescript
import { FastifyInstance } from 'fastify';
import { db } from '../config/database';
import { redis } from '../config/redis';
import { pool } from '../config/database';

interface HealthCheckResult {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  service: string;
  version: string;
  uptime: number;
  checks: {
    database: CheckResult;
    redis: CheckResult;
    memory: CheckResult;
  };
}

interface CheckResult {
  status: 'ok' | 'error';
  latency?: number;
  error?: string;
  details?: any;
}

export class MonitoringService {
  async performHealthCheck(): Promise<HealthCheckResult> {
    const checks = await Promise.all([
      this.checkDatabase(),
      this.checkRedis(),
      this.checkMemory()
    ]);

    const [database, redisCheck, memory] = checks;
    
    const allHealthy = checks.every(check => check.status === 'ok');
    const anyUnhealthy = checks.some(check => check.status === 'error');

    return {
      status: anyUnhealthy ? 'unhealthy' : allHealthy ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      service: 'auth-service',
      version: process.env.npm_package_version || '1.0.0',
      uptime: process.uptime(),
      checks: {
        database,
        redis: redisCheck,
        memory
      }
    };
  }

  private async checkDatabase(): Promise<CheckResult> {
    const start = Date.now();
    try {
      await db.raw('SELECT 1');
      const latency = Date.now() - start;
      
      return {
        status: 'ok',
        latency,
        details: {
          totalConnections: pool.totalCount,
          idleConnections: pool.idleCount,
          waitingConnections: pool.waitingCount
        }
      };
    } catch (error) {
      return {
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  private async checkRedis(): Promise<CheckResult> {
    const start = Date.now();
    try {
      await redis.ping();
      const latency = Date.now() - start;
      
      const info = await redis.info('stats');
      const connectedClients = info.match(/connected_clients:(\d+)/)?.[1];
      
      return {
        status: 'ok',
        latency,
        details: {
          connectedClients: connectedClients ? parseInt(connectedClients) : undefined
        }
      };
    } catch (error) {
      return {
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  private checkMemory(): CheckResult {
    const usage = process.memoryUsage();
    const heapUsedMB = Math.round(usage.heapUsed / 1024 / 1024);
    const heapTotalMB = Math.round(usage.heapTotal / 1024 / 1024);
    const rssMB = Math.round(usage.rss / 1024 / 1024);
    
    return {
      status: heapUsedMB > 500 ? 'error' : 'ok',
      details: {
        heapUsedMB,
        heapTotalMB,
        rssMB,
        heapUsagePercent: Math.round((heapUsedMB / heapTotalMB) * 100)
      }
    };
  }

  getMetrics() {
    // Return Prometheus-formatted metrics
    return `
# HELP auth_service_uptime_seconds Service uptime in seconds
# TYPE auth_service_uptime_seconds gauge
auth_service_uptime_seconds ${process.uptime()}

# HELP auth_service_memory_heap_used_bytes Memory heap used in bytes
# TYPE auth_service_memory_heap_used_bytes gauge
auth_service_memory_heap_used_bytes ${process.memoryUsage().heapUsed}

# HELP auth_service_db_pool_total Total database connections
# TYPE auth_service_db_pool_total gauge
auth_service_db_pool_total ${pool.totalCount}

# HELP auth_service_db_pool_idle Idle database connections
# TYPE auth_service_db_pool_idle gauge
auth_service_db_pool_idle ${pool.idleCount}

# HELP auth_service_db_pool_waiting Waiting database connections
# TYPE auth_service_db_pool_waiting gauge
auth_service_db_pool_waiting ${pool.waitingCount}
`.trim();
  }
}

export function setupMonitoring(fastify: FastifyInstance, monitoringService: MonitoringService) {
  // Enhanced health check
  fastify.get('/health', async (_request, reply) => {
    const health = await monitoringService.performHealthCheck();
    const statusCode = health.status === 'healthy' ? 200 : 
                      health.status === 'degraded' ? 200 : 503;
    
    reply.status(statusCode).send(health);
  });

  // Prometheus metrics endpoint
  fastify.get('/metrics', async (_request, reply) => {
    const metrics = monitoringService.getMetrics();
    reply
      .type('text/plain; version=0.0.4')
      .send(metrics);
  });

  // Kubernetes liveness probe
  fastify.get('/live', async (_request, reply) => {
    reply.send({ status: 'alive' });
  });

  // Kubernetes readiness probe
  fastify.get('/ready', async (_request, reply) => {
    try {
      await Promise.all([
        db.raw('SELECT 1'),
        redis.ping()
      ]);
      reply.send({ ready: true });
    } catch (error) {
      reply.status(503).send({ ready: false });
    }
  });
}
```

### FILE: src/services/enhanced-jwt.service.ts
```typescript
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { Redis } from 'ioredis';

export class EnhancedJWTService {
  private readonly accessTokenSecret: string;
  private readonly refreshTokenSecret: string;
  private readonly accessTokenExpiry = '2h';
  private readonly refreshTokenExpiry = '7d';
  private redis: Redis;
  
  constructor(redis: Redis) {
    this.accessTokenSecret = process.env.JWT_ACCESS_SECRET || crypto.randomBytes(64).toString('hex');
    this.refreshTokenSecret = process.env.JWT_REFRESH_SECRET || crypto.randomBytes(64).toString('hex');
    this.redis = redis;
    
    if (!process.env.JWT_ACCESS_SECRET) {
      console.warn('⚠️  JWT_ACCESS_SECRET not set, using random secret (not for production!)');
    }
  }
  
  async generateTokenPair(userId: string, role: string): Promise<{
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
  }> {
    const jti = crypto.randomUUID(); // JWT ID for tracking
    
    const accessToken = jwt.sign(
      { 
        userId, 
        role,
        type: 'access',
        jti 
      },
      this.accessTokenSecret,
      { 
        expiresIn: this.accessTokenExpiry,
        issuer: 'tickettoken',
        audience: 'tickettoken-api'
      }
    );
    
    const refreshToken = jwt.sign(
      { 
        userId,
        type: 'refresh',
        jti: crypto.randomUUID()
      },
      this.refreshTokenSecret,
      { 
        expiresIn: this.refreshTokenExpiry,
        issuer: 'tickettoken'
      }
    );
    
    // Store refresh token in Redis with expiry
    await this.redis.setex(
      `refresh_token:${userId}:${refreshToken}`,
      7 * 24 * 60 * 60, // 7 days in seconds
      JSON.stringify({ userId, createdAt: new Date().toISOString() })
    );
    
    return {
      accessToken,
      refreshToken,
      expiresIn: 900 // 15 minutes in seconds
    };
  }
  
  async verifyAccessToken(token: string): Promise<any> {
    try {
      const decoded = jwt.verify(token, this.accessTokenSecret, {
        issuer: 'tickettoken',
        audience: 'tickettoken-api'
      });
      
      // Check if token is blacklisted (for logout)
      const isBlacklisted = await this.redis.get(`blacklist:${token}`);
      if (isBlacklisted) {
        throw new Error('Token has been revoked');
      }
      
      return decoded;
    } catch (error) {
      throw new Error('Invalid access token');
    }
  }
  
  async refreshAccessToken(refreshToken: string): Promise<{
    accessToken: string;
    refreshToken: string;
  }> {
    try {
      const decoded = jwt.verify(refreshToken, this.refreshTokenSecret) as any;
      
      // Check if refresh token exists in Redis
      const storedToken = await this.redis.get(`refresh_token:${decoded.userId}:${refreshToken}`);
      if (!storedToken) {
        throw new Error('Refresh token not found or expired');
      }
      
      // Delete old refresh token (rotation)
      await this.redis.del(`refresh_token:${decoded.userId}:${refreshToken}`);
      
      // Generate new token pair
      return await this.generateTokenPair(decoded.userId, decoded.role || 'user');
    } catch (error) {
      throw new Error('Invalid refresh token');
    }
  }
  
  async revokeToken(token: string): Promise<void> {
    // Add to blacklist with TTL matching token expiry
    const decoded = jwt.decode(token) as any;
    if (decoded && decoded.exp) {
      const ttl = decoded.exp - Math.floor(Date.now() / 1000);
      if (ttl > 0) {
        await this.redis.setex(`blacklist:${token}`, ttl, 'revoked');
      }
    }
  }
  
  async revokeAllUserTokens(userId: string): Promise<void> {
    // Get all refresh tokens for user
    const keys = await this.redis.keys(`refresh_token:${userId}:*`);
    if (keys.length > 0) {
      await this.redis.del(...keys);
    }
  }
}
```

### FILE: src/services/auth-extended.service.ts
```typescript
import argon2 from 'argon2';
// import crypto from 'crypto';
import { db } from '../config/database';
import { redis } from '../config/redis';
import { ValidationError, AuthenticationError } from '../errors';
import { passwordResetRateLimiter } from '../utils/rateLimiter';
import { EmailService } from './email.service';

export class AuthExtendedService {
  private emailService: EmailService;

  constructor(emailService: EmailService) {
    this.emailService = emailService;
  }

  async requestPasswordReset(email: string, ipAddress: string): Promise<void> {
    // Rate limit password reset requests
    await passwordResetRateLimiter.consume(ipAddress);

    // Find user
    const user = await db('users')
      .where({ email: email.toLowerCase() })
      .whereNull('deleted_at')
      .first();

    // Always return success to prevent email enumeration
    if (!user) {
      return;
    }

    // Send password reset email
    await this.emailService.sendPasswordResetEmail(
      user.id,
      user.email,
      user.first_name
    );

    // Log the request
    await db('audit_logs').insert({
      user_id: user.id,
      action: 'password_reset_requested',
      ip_address: ipAddress,
      created_at: new Date()
    });
  }

  async resetPassword(token: string, newPassword: string, ipAddress: string): Promise<void> {
    // Get token data from Redis
    const tokenData = await redis.get(`password-reset:${token}`);
    
    if (!tokenData) {
      throw new ValidationError('Invalid or expired reset token' as any);
    }

    const { userId } = JSON.parse(tokenData);

    // Validate password strength
    this.validatePasswordStrength(newPassword);

    // Hash new password
    const hashedPassword = await argon2.hash(newPassword);

    // Update password
    await db('users')
      .where({ id: userId })
      .update({
        password_hash: hashedPassword,
        password_changed_at: new Date(),
        updated_at: new Date()
      });

    // Delete the reset token
    await redis.del(`password-reset:${token}`);

    // Invalidate all refresh tokens for this user
    const keys = await redis.keys(`refresh_token:*`);
    for (const key of keys) {
      const data = await redis.get(key);
      if (data) {
        const tokenData = JSON.parse(data);
        if (tokenData.userId === userId) {
          await redis.del(key);
        }
      }
    }

    // Log the password reset
    await db('audit_logs').insert({
      user_id: userId,
      action: 'password_reset_completed',
      ip_address: ipAddress,
      created_at: new Date()
    });
  }

  async verifyEmail(token: string): Promise<void> {
    // Get token data from Redis
    const tokenData = await redis.get(`email-verify:${token}`);
    
    if (!tokenData) {
      throw new ValidationError('Invalid or expired verification token' as any);
    }

    const { userId, email } = JSON.parse(tokenData);

    // Update user as verified
    const updated = await db('users')
      .where({ id: userId, email })
      .whereNull('deleted_at')
      .update({
        email_verified: true,
        email_verified_at: new Date(),
        updated_at: new Date()
      });

    if (updated === 0) {
      throw new ValidationError('User not found or email mismatch' as any);
    }

    // Delete the verification token
    await redis.del(`email-verify:${token}`);

    // Log the verification
    await db('audit_logs').insert({
      user_id: userId,
      action: 'email_verified',
      created_at: new Date()
    });
  }

  async resendVerificationEmail(userId: string): Promise<void> {
    // Rate limit resend requests
    const rateLimitKey = `resend-verify:${userId}`;
    const attempts = await redis.incr(rateLimitKey);
    
    if (attempts === 1) {
      await redis.expire(rateLimitKey, 3600); // 1 hour
    }
    
    if (attempts > 3) {
      throw new ValidationError('Too many resend attempts. Try again later.' as any);
    }

    // Get user
    const user = await db('users')
      .where({ id: userId })
      .whereNull('deleted_at')
      .first();

    if (!user) {
      throw new ValidationError('User not found' as any);
    }

    if (user.email_verified) {
      throw new ValidationError('Email already verified' as any);
    }

    // Send new verification email
    await this.emailService.sendVerificationEmail(
      user.id,
      user.email,
      user.first_name
    );
  }

  async changePassword(
    userId: string, 
    currentPassword: string, 
    newPassword: string
  ): Promise<void> {
    // Get user
    const user = await db('users')
      .where({ id: userId })
      .whereNull('deleted_at')
      .first();

    if (!user) {
      throw new AuthenticationError('User not found');
    }

    // Verify current password
    const validPassword = await argon2.verify(user.password_hash, currentPassword);
    if (!validPassword) {
      throw new AuthenticationError('Current password is incorrect');
    }

    // Validate new password
    this.validatePasswordStrength(newPassword);

    // Ensure new password is different
    const samePassword = await argon2.verify(user.password_hash, newPassword);
    if (samePassword) {
      throw new ValidationError('New password must be different from current password' as any);
    }

    // Hash and update password
    const hashedPassword = await argon2.hash(newPassword);
    
    await db('users')
      .where({ id: userId })
      .update({
        password_hash: hashedPassword,
        password_changed_at: new Date(),
        updated_at: new Date()
      });

    // Log the change
    await db('audit_logs').insert({
      user_id: userId,
      action: 'password_changed',
      created_at: new Date()
    });
    
    // Invalidate all user sessions after password change
    await db('user_sessions')
      .where({ user_id: userId })
      .whereNull('revoked_at')
      .update({ 
        revoked_at: new Date(),
        metadata: db.raw("COALESCE(metadata, '{}'::jsonb) || ?::jsonb", [
          JSON.stringify({ revoked_reason: 'password_changed' })
        ])
      });
    
    console.log('All sessions invalidated due to password change for user:', userId);
  }

  private validatePasswordStrength(password: string): void {
    if (password.length < 8) {
      throw new ValidationError('Password must be at least 8 characters long' as any);
    }

    const hasUpperCase = /[A-Z]/.test(password);
    const hasLowerCase = /[a-z]/.test(password);
    const hasNumbers = /\d/.test(password);
    const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/.test(password);

    if (!hasUpperCase || !hasLowerCase || !hasNumbers || !hasSpecialChar) {
      throw new ValidationError([
        'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character'
      ]);
    }
  }
}
```

### FILE: src/services/wallet.service.ts
```typescript
import { PublicKey } from '@solana/web3.js';
import { ethers } from 'ethers';
import nacl from 'tweetnacl';
import { db } from '../config/database';
import { redis } from '../config/redis';
import { AuthenticationError } from '../errors';
import crypto from 'crypto';
import { JWTService } from './jwt.service';

export class WalletService {
  private jwtService: JWTService;

  constructor() {
    this.jwtService = new JWTService();
  }

  async generateNonce(walletAddress: string): Promise<string> {
    const nonce = crypto.randomBytes(32).toString('hex');
    await redis.setex(`wallet_nonce:${walletAddress}`, 300, nonce);
    return nonce;
  }

  async verifySolanaSignature(
    publicKey: string,
    signature: string,
    message: string
  ): Promise<boolean> {
    try {
      const publicKeyObj = new PublicKey(publicKey);
      const signatureBuffer = Buffer.from(signature, 'base64');
      const messageBuffer = Buffer.from(message);
      
      return nacl.sign.detached.verify(
        messageBuffer,
        signatureBuffer,
        publicKeyObj.toBytes()
      );
    } catch (error) {
      console.error('Solana signature verification failed:', error);
      return false;
    }
  }

  async verifyEthereumSignature(
    address: string,
    signature: string,
    message: string
  ): Promise<boolean> {
    try {
      const recoveredAddress = ethers.verifyMessage(message, signature);
      return recoveredAddress.toLowerCase() === address.toLowerCase();
    } catch (error) {
      console.error('Ethereum signature verification failed:', error);
      return false;
    }
  }

  async connectWallet(
    userId: string,
    walletAddress: string,
    network: 'solana' | 'ethereum',
    signature: string
  ): Promise<any> {
    const nonce = await redis.get(`wallet_nonce:${walletAddress}`);
    if (!nonce) {
      throw new AuthenticationError('Nonce expired or not found');
    }

    const message = `Connect wallet to TicketToken\nNonce: ${nonce}`;
    
    let isValid = false;
    if (network === 'solana') {
      isValid = await this.verifySolanaSignature(walletAddress, signature, message);
    } else {
      isValid = await this.verifyEthereumSignature(walletAddress, signature, message);
    }

    if (!isValid) {
      throw new AuthenticationError('Invalid wallet signature');
    }

    const existingConnection = await db('wallet_connections')
      .where({ wallet_address: walletAddress, network })
      .first();

    if (existingConnection && existingConnection.user_id !== userId) {
      throw new AuthenticationError('Wallet already connected to another account');
    }

    if (!existingConnection) {
      await db('wallet_connections').insert({
        user_id: userId,
        wallet_address: walletAddress,
        network: network,
        verified: true
      });
    }

    await redis.del(`wallet_nonce:${walletAddress}`);

    return {
      success: true,
      wallet: { address: walletAddress, network, connected: true }
    };
  }

  async loginWithWallet(
    walletAddress: string,
    network: 'solana' | 'ethereum',
    signature: string
  ): Promise<any> {
    const nonce = await redis.get(`wallet_nonce:${walletAddress}`);
    if (!nonce) {
      throw new AuthenticationError('Nonce expired or not found');
    }

    const message = `Login to TicketToken\nNonce: ${nonce}`;
    
    let isValid = false;
    if (network === 'solana') {
      isValid = await this.verifySolanaSignature(walletAddress, signature, message);
    } else {
      isValid = await this.verifyEthereumSignature(walletAddress, signature, message);
    }

    if (!isValid) {
      throw new AuthenticationError('Invalid wallet signature');
    }

    const connection = await db('wallet_connections')
      .where({ wallet_address: walletAddress, network, verified: true })
      .first();

    if (!connection) {
      throw new AuthenticationError('Wallet not connected to any account');
    }

    const user = await db('users').where({ id: connection.user_id }).first();
    if (!user) {
      throw new AuthenticationError('User not found');
    }

    await redis.del(`wallet_nonce:${walletAddress}`);
    await db('users').where({ id: user.id }).update({ last_login_at: new Date() });

    const tokens = await this.jwtService.generateTokenPair(user);
    
    return {
      success: true,
      user: { id: user.id, email: user.email },
      tokens,
      wallet: { address: walletAddress, network }
    };
  }
}
```

### FILE: src/services/mfa.service.ts
```typescript
import speakeasy from 'speakeasy';
import QRCode from 'qrcode';
import crypto from 'crypto';
import { db } from '../config/database';
import { redis } from '../config/redis';
import { env } from '../config/env';
import { AuthenticationError } from '../errors';

export class MFAService {
  async setupTOTP(userId: string): Promise<{
    secret: string;
    qrCode: string;
    backupCodes: string[];
  }> {
    // Get user
    const user = await db('users').where('id', userId).first();
    if (!user) {
      throw new Error('User not found');
    }

    // Generate secret
    const secret = speakeasy.generateSecret({
      name: `TicketToken (${user.email})`,
      issuer: env.MFA_ISSUER || 'TicketToken',
      length: 32,
    });

    // Generate QR code
    const qrCode = await QRCode.toDataURL(secret.otpauth_url || "");

    // Generate backup codes
    const backupCodes = this.generateBackupCodes();

    // Store temporarily until verified
    await redis.setex(
      `mfa:setup:${userId}`,
      600, // 10 minutes
      JSON.stringify({
        secret: this.encrypt(secret.base32),
        backupCodes: backupCodes.map(code => this.hashBackupCode(code)),
      })
    );

    return {
      secret: secret.base32,
      qrCode,
      backupCodes,
    };
  }

  async verifyAndEnableTOTP(userId: string, token: string): Promise<boolean> {
    // Get temporary setup data
    const setupData = await redis.get(`mfa:setup:${userId}`);
    if (!setupData) {
      throw new Error('MFA setup expired or not found');
    }

    const { secret, backupCodes } = JSON.parse(setupData);
    const decryptedSecret = this.decrypt(secret);

    // Verify token
    const verified = speakeasy.totp.verify({
      secret: decryptedSecret,
      encoding: 'base32',
      token,
      window: 2,
    });

    if (!verified) {
      throw new AuthenticationError('Invalid MFA token');
    }

    // Enable MFA for user
    await db('users').where('id', userId).update({
      mfa_enabled: true,
      mfa_secret: secret,
      backup_codes: JSON.stringify(backupCodes),
    });

    // Clean up temporary data
    await redis.del(`mfa:setup:${userId}`);

    return true;
  }

  async verifyTOTP(userId: string, token: string): Promise<boolean> {
    const user = await db('users').where('id', userId).first();
    
    if (!user || !user.mfa_enabled || !user.mfa_secret) {
      return false;
    }

    const secret = this.decrypt(user.mfa_secret);

    // Check recent use to prevent replay attacks
    const recentKey = `mfa:recent:${userId}:${token}`;
    const recentlyUsed = await redis.get(recentKey);
    
    if (recentlyUsed) {
      throw new AuthenticationError('MFA token recently used');
    }

    const verified = speakeasy.totp.verify({
      secret,
      encoding: 'base32',
      token,
      window: 2,
    });

    if (verified) {
      // Mark token as used
      await redis.setex(recentKey, 90, '1'); // 90 seconds
    }

    return verified;
  }

  async verifyBackupCode(userId: string, code: string): Promise<boolean> {
    const user = await db('users').where('id', userId).first();
    
    if (!user || !user.backup_codes) {
      return false;
    }

    const backupCodes = JSON.parse(user.backup_codes);
    const hashedCode = this.hashBackupCode(code);
    const codeIndex = backupCodes.indexOf(hashedCode);

    if (codeIndex === -1) {
      return false;
    }

    // Remove used code
    backupCodes.splice(codeIndex, 1);
    
    await db('users').where('id', userId).update({
      backup_codes: JSON.stringify(backupCodes),
    });

    return true;
  }

  async requireMFAForOperation(userId: string, operation: string): Promise<void> {
    const sensitiveOperations = [
      'withdraw:funds',
      'update:bank-details',
      'delete:venue',
      'export:customer-data',
      'disable:mfa',
    ];

    if (!sensitiveOperations.includes(operation)) {
      return;
    }

    // Check if MFA was recently verified
    const recentMFA = await redis.get(`mfa:verified:${userId}`);
    if (!recentMFA) {
      throw new AuthenticationError('MFA required for this operation');
    }
  }

  async markMFAVerified(userId: string): Promise<void> {
    // Mark MFA as recently verified for sensitive operations
    await redis.setex(`mfa:verified:${userId}`, 300, '1'); // 5 minutes
  }

  private generateBackupCodes(): string[] {
    const codes = [];
    for (let i = 0; i < 10; i++) {
      const code = crypto.randomBytes(4).toString('hex').toUpperCase();
      codes.push(`${code.slice(0, 4)}-${code.slice(4)}`);
    }
    return codes;
  }

  private hashBackupCode(code: string): string {
    return crypto.createHash('sha256').update(code).digest('hex');
  }

  private encrypt(text: string): string {
    const algorithm = 'aes-256-gcm';
    const key = Buffer.from(env.JWT_ACCESS_SECRET, 'utf8').slice(0, 32);
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(algorithm, key, iv);
    
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const authTag = cipher.getAuthTag();
    
    return iv.toString('hex') + ':' + authTag.toString('hex') + ':' + encrypted;
  }

  private decrypt(text: string): string {
    const algorithm = 'aes-256-gcm';
    const key = Buffer.from(env.JWT_ACCESS_SECRET, 'utf8').slice(0, 32);
    const parts = text.split(':');
    const iv = Buffer.from(parts[0], 'hex');
    const authTag = Buffer.from(parts[1], 'hex');
    const encrypted = parts[2];
    
    const decipher = crypto.createDecipheriv(algorithm, key, iv);
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  }

  async disableTOTP(userId: string): Promise<void> {
    // Clear MFA settings from user record
    await db('users')
      .where({ id: userId })
      .update({
        mfa_enabled: false,
        mfa_secret: null,
        backup_codes: null,
        updated_at: new Date()
      });
    
    // Clear any MFA-related data from Redis
    await redis.del(`mfa:secret:${userId}`);
    
    console.log('MFA disabled for user:', userId);
  }


  async generateSecret(userId: string): Promise<string> {
    const secret = speakeasy.generateSecret({ length: 32 });
    await db('user_mfa').insert({
      user_id: userId,
      secret: secret.base32,
      created_at: new Date()
    }).onConflict('user_id').merge().catch(() => {});
    return secret.base32;
  }

  async disable(userId: string): Promise<void> {
    await db('user_mfa').where('user_id', userId).delete().catch(() => {});
  }
}
```

### FILE: src/services/rate-limit.service.ts
```typescript
import { redis } from '../config/redis';

export class RateLimitService {
  private limits: Map<string, { points: number; duration: number }> = new Map([
    ['login', { points: 5, duration: 60 }],  // 5 attempts per minute
    ['register', { points: 3, duration: 300 }], // 3 per 5 minutes
    ['wallet', { points: 10, duration: 60 }], // 10 per minute
  ]);

  async consume(
    action: string,
    venueId: string | null,
    identifier: string
  ): Promise<void> {
    const limit = this.limits.get(action) || { points: 100, duration: 60 };
    const key = venueId 
      ? `rate:${action}:${venueId}:${identifier}`
      : `rate:${action}:${identifier}`;
    
    const current = await redis.incr(key);
    
    if (current === 1) {
      await redis.expire(key, limit.duration);
    }
    
    if (current > limit.points) {
      const ttl = await redis.ttl(key);
      throw new Error(`Rate limit exceeded. Try again in ${ttl} seconds.`);
    }
  }
}
```

### FILE: src/services/auth.service.ts
```typescript
import bcrypt from 'bcrypt';
import { pool } from '../config/database';
import { JWTService } from './jwt.service';
import { logger } from '../utils/logger';
import * as crypto from 'crypto';

export class AuthService {
  private log = logger.child({ component: 'AuthService' });
  
  // Dummy hash for timing attack prevention (not readonly so it can be updated)
  private DUMMY_HASH = '$2b$10$abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ12';
  
  constructor(private jwtService: JWTService) {
    // Pre-generate a dummy hash to use for timing consistency
    bcrypt.hash('dummy_password_for_timing_consistency', 10).then(hash => {
      this.DUMMY_HASH = hash;
    });
  }
  
  async register(data: any) {
    // Don't log the actual email or password
    this.log.info('Registration attempt', {
      hasEmail: !!data.email,
      hasPassword: !!data.password
    });
    
    try {
      // Use direct pool query instead of Knex
      this.log.debug('Checking for existing user');
      const existingResult = await pool.query(
        'SELECT id FROM users WHERE email = $1 AND deleted_at IS NULL',
        [data.email.toLowerCase()]
      );
      
      if (existingResult.rows.length > 0) {
        throw new Error('Email already registered');
      }
      
      this.log.debug('Hashing password');
      const passwordHash = await bcrypt.hash(data.password, 10);
      
      // Determine tenant_id
      const tenantId = data.tenant_id || process.env.DEFAULT_TENANT_ID || '00000000-0000-0000-0000-000000000001';
      
      this.log.info('Creating new user', { tenantId });
      const insertResult = await pool.query(
        `INSERT INTO users (email, password_hash, first_name, last_name, phone, email_verified, tenant_id, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id, email, first_name, last_name, email_verified, mfa_enabled, permissions, role, tenant_id`,
        [data.email.toLowerCase(), passwordHash, data.firstName, data.lastName, data.phone || null, false, tenantId, new Date()]
      );
      
      const user = insertResult.rows[0];
      this.log.info('User created successfully', {
        userId: user.id,
        tenantId: user.tenant_id
      });
      
      const tokens = await this.jwtService.generateTokenPair(user);
      
      return {
        user: {
          id: user.id,
          email: user.email,
          first_name: user.first_name,
          last_name: user.last_name,
          email_verified: user.email_verified,
          mfa_enabled: user.mfa_enabled || false,
          tenant_id: user.tenant_id,
        },
        tokens,
      };
    } catch (error) {
      // Log error without exposing sensitive details
      this.log.error('Registration failed', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }
  
  async login(data: any) {
    this.log.info('Login attempt');
    
    // Store start time for consistent timing
    const startTime = Date.now();
    const MIN_RESPONSE_TIME = 500; // Minimum response time in ms
    
    try {
      // Always perform database lookup
      const result = await pool.query(
        'SELECT id, email, password_hash, first_name, last_name, email_verified, mfa_enabled, permissions, role, tenant_id FROM users WHERE email = $1 AND deleted_at IS NULL',
        [data.email.toLowerCase()]
      );
      
      let user = result.rows[0];
      let passwordHash = user?.password_hash || this.DUMMY_HASH;
      
      // Always perform bcrypt comparison to maintain consistent timing
      const valid = await bcrypt.compare(data.password, passwordHash);
      
      // Add random jitter (0-50ms) to prevent statistical timing analysis
      const jitter = crypto.randomInt(0, 50);
      await this.delay(jitter);
      
      // Check if login should succeed
      if (!user || !valid) {
        // Ensure minimum response time to prevent timing analysis
        const elapsed = Date.now() - startTime;
        if (elapsed < MIN_RESPONSE_TIME) {
          await this.delay(MIN_RESPONSE_TIME - elapsed);
        }
        
        this.log.warn('Login failed', { 
          reason: !user ? 'user_not_found' : 'invalid_password'
        });
        throw new Error('Invalid credentials');
      }
      
      // Login successful
      const tokens = await this.jwtService.generateTokenPair(user);
      
      // Ensure minimum response time even for successful logins
      const elapsed = Date.now() - startTime;
      if (elapsed < MIN_RESPONSE_TIME) {
        await this.delay(MIN_RESPONSE_TIME - elapsed);
      }
      
      this.log.info('Login successful', {
        userId: user.id,
        tenantId: user.tenant_id
      });
      
      return {
        user: {
          id: user.id,
          email: user.email,
          first_name: user.first_name,
          last_name: user.last_name,
          email_verified: user.email_verified,
          mfa_enabled: user.mfa_enabled || false,
          permissions: user.permissions,
          role: user.role,
          tenant_id: user.tenant_id,
        },
        tokens,
      };
    } catch (error) {
      // Ensure minimum response time even for errors
      const elapsed = Date.now() - startTime;
      if (elapsed < MIN_RESPONSE_TIME) {
        await this.delay(MIN_RESPONSE_TIME - elapsed);
      }
      
      // Re-throw the error
      throw error;
    }
  }

  async refreshTokens(refreshToken: string, ipAddress?: string, userAgent?: string) {
    this.log.info('Token refresh attempt', { ipAddress, userAgent });
    
    try {
      // Verify the refresh token
      const decoded = await this.jwtService.verifyRefreshToken(refreshToken);
      
      // Get fresh user data
      const result = await pool.query(
        'SELECT id, email, first_name, last_name, email_verified, mfa_enabled, permissions, role, tenant_id FROM users WHERE id = $1 AND deleted_at IS NULL',
        [decoded.userId || decoded.sub]
      );
      
      if (result.rows.length === 0) {
        throw new Error('User not found');
      }
      
      const user = result.rows[0];
      
      // Generate new token pair
      const tokens = await this.jwtService.generateTokenPair(user);
      
      // Log the refresh for security auditing if needed
      if (ipAddress || userAgent) {
        await pool.query(
          `INSERT INTO token_refresh_log (user_id, ip_address, user_agent, refreshed_at)
           VALUES ($1, $2, $3, NOW())
           ON CONFLICT DO NOTHING`,
          [user.id, ipAddress || null, userAgent || null]
        ).catch(err => {
          // Don't fail the refresh if logging fails
          this.log.warn('Failed to log token refresh', err);
        });
      }
      
      this.log.info('Token refresh successful', { userId: user.id });
      
      return {
        user: {
          id: user.id,
          email: user.email,
          first_name: user.first_name,
          last_name: user.last_name,
          email_verified: user.email_verified,
          mfa_enabled: user.mfa_enabled || false,
          permissions: user.permissions,
          role: user.role,
          tenant_id: user.tenant_id,
        },
        tokens,
      };
    } catch (error) {
      this.log.warn('Token refresh failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        ipAddress,
        userAgent
      });
      throw new Error('Invalid refresh token');
    }
  }

  async logout(userId: string, refreshToken?: string) {
    this.log.info('Logout attempt', { userId });
    
    try {
      // If refresh token provided, invalidate it
      if (refreshToken) {
        // Store invalidated token to prevent reuse (with expiry)
        const expiryTime = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
        
        await pool.query(
          `INSERT INTO invalidated_tokens (token, user_id, invalidated_at, expires_at)
           VALUES ($1, $2, NOW(), $3)
           ON CONFLICT (token) DO NOTHING`,
          [refreshToken, userId, expiryTime]
        );
      }
      
      // Could also clear any active sessions if you have a sessions table
      await pool.query(
        'UPDATE user_sessions SET ended_at = NOW() WHERE user_id = $1 AND ended_at IS NULL',
        [userId]
      );
      
      this.log.info('Logout successful', { userId });
      
      return { success: true };
    } catch (error) {
      this.log.error('Logout error', {
        userId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      
      // Don't throw - logout should always succeed from user perspective
      return { success: true };
    }
  }
  
  async verifyEmail(token: string) {
    this.log.info('Email verification attempt');
    
    const result = await pool.query(
      'UPDATE users SET email_verified = true WHERE email_verification_token = $1 RETURNING id',
      [token]
    );
    
    if (result.rows.length === 0) {
      throw new Error('Invalid verification token');
    }
    
    return { success: true };
  }
  
  async forgotPassword(email: string) {
    this.log.info('Password reset request');
    
    // Use constant-time operation regardless of user existence
    const startTime = Date.now();
    const MIN_RESPONSE_TIME = 300;
    
    try {
      const result = await pool.query(
        'SELECT id, email FROM users WHERE email = $1 AND deleted_at IS NULL',
        [email.toLowerCase()]
      );
      
      if (result.rows.length > 0) {
        const user = result.rows[0];
        const resetToken = crypto.randomBytes(32).toString('hex');
        const resetExpiry = new Date(Date.now() + 3600000); // 1 hour
        
        await pool.query(
          'UPDATE users SET password_reset_token = $1, password_reset_expires = $2 WHERE id = $3',
          [resetToken, resetExpiry, user.id]
        );
        
        // Queue email sending (async, don't wait)
        this.sendPasswordResetEmail(user.email, resetToken).catch(err => 
          this.log.error('Failed to send password reset email', err)
        );
      }
      
      // Always wait the same amount of time
      const elapsed = Date.now() - startTime;
      if (elapsed < MIN_RESPONSE_TIME) {
        await this.delay(MIN_RESPONSE_TIME - elapsed);
      }
      
      // Always return the same response
      return { 
        message: 'If an account exists with this email, a password reset link has been sent.' 
      };
    } catch (error) {
      // Ensure consistent timing even on error
      const elapsed = Date.now() - startTime;
      if (elapsed < MIN_RESPONSE_TIME) {
        await this.delay(MIN_RESPONSE_TIME - elapsed);
      }
      
      // Return same response to prevent enumeration
      return { 
        message: 'If an account exists with this email, a password reset link has been sent.' 
      };
    }
  }
  
  async resetPassword(token: string, newPassword: string) {
    this.log.info('Password reset attempt');
    
    const result = await pool.query(
      'SELECT id FROM users WHERE password_reset_token = $1 AND password_reset_expires > NOW() AND deleted_at IS NULL',
      [token]
    );
    
    if (result.rows.length === 0) {
      throw new Error('Invalid or expired reset token');
    }
    
    const user = result.rows[0];
    const passwordHash = await bcrypt.hash(newPassword, 10);
    
    await pool.query(
      'UPDATE users SET password_hash = $1, password_reset_token = NULL, password_reset_expires = NULL WHERE id = $2',
      [passwordHash, user.id]
    );
    
    return { success: true };
  }
  
  async changePassword(userId: string, oldPassword: string, newPassword: string) {
    this.log.info('Password change attempt', { userId });
    
    const result = await pool.query(
      'SELECT password_hash FROM users WHERE id = $1 AND deleted_at IS NULL',
      [userId]
    );
    
    if (result.rows.length === 0) {
      throw new Error('User not found');
    }
    
    const user = result.rows[0];
    const valid = await bcrypt.compare(oldPassword, user.password_hash);
    
    if (!valid) {
      throw new Error('Invalid current password');
    }
    
    const newPasswordHash = await bcrypt.hash(newPassword, 10);
    
    await pool.query(
      'UPDATE users SET password_hash = $1 WHERE id = $2',
      [newPasswordHash, userId]
    );
    
    return { success: true };
  }
  
  async getUserById(userId: string) {
    const result = await pool.query(
      'SELECT id, email, first_name, last_name, email_verified, mfa_enabled, permissions, role, tenant_id FROM users WHERE id = $1 AND deleted_at IS NULL',
      [userId]
    );
    
    if (result.rows.length === 0) {
      throw new Error('User not found');
    }
    
    return result.rows[0];
  }
  
  // Helper method for consistent timing delays
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  // Async email sender (doesn't block response)
  private async sendPasswordResetEmail(email: string, token: string): Promise<void> {
    // This would integrate with your email service
    // Implementation depends on your email provider
    this.log.info('Queuing password reset email', { email: email.substring(0, 3) + '***' });
  }
}
```

### FILE: src/services/security-enhanced.service.ts
```typescript
import argon2 from 'argon2';
import crypto from 'crypto';
import { Redis } from 'ioredis';

export class SecurityEnhancedService {
  private redis: Redis;
  private readonly maxLoginAttempts = 5;
  private readonly lockoutDuration = 15 * 60; // 15 minutes in seconds
  
  constructor(redis: Redis) {
    this.redis = redis;
  }

  // Enhanced password hashing with security checks
  async hashPassword(password: string): Promise<string> {
    const validation = this.validatePasswordStrength(password);
    if (!validation.valid) {
      throw new Error(`Password validation failed: ${validation.errors.join(', ')}`);
    }
    
    return argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: 65536, // 64 MB
      timeCost: 3,
      parallelism: 4,
    });
  }

  async verifyPassword(hash: string, password: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, password);
    } catch (error) {
      console.error('Password verification error:', error);
      return false;
    }
  }

  validatePasswordStrength(password: string): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    const minLength = 12;
    
    if (password.length < minLength) {
      errors.push(`Password must be at least ${minLength} characters`);
    }
    
    if (!/[A-Z]/.test(password)) {
      errors.push('Password must contain at least one uppercase letter');
    }
    
    if (!/[a-z]/.test(password)) {
      errors.push('Password must contain at least one lowercase letter');
    }
    
    if (!/[0-9]/.test(password)) {
      errors.push('Password must contain at least one number');
    }
    
    if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
      errors.push('Password must contain at least one special character');
    }
    
    // Check for common passwords
    const commonPasswords = ['password123', '12345678', 'qwerty123', 'admin123'];
    if (commonPasswords.includes(password.toLowerCase())) {
      errors.push('Password is too common');
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }

  // Brute force protection
  async checkBruteForce(identifier: string): Promise<{
    locked: boolean;
    remainingAttempts?: number;
    lockoutUntil?: Date;
  }> {
    const lockKey = `auth_lock:${identifier}`;
    const attemptKey = `auth_attempts:${identifier}`;
    
    // Check if locked
    const isLocked = await this.redis.get(lockKey);
    if (isLocked) {
      const ttl = await this.redis.ttl(lockKey);
      return {
        locked: true,
        lockoutUntil: new Date(Date.now() + ttl * 1000)
      };
    }
    
    // Get current attempts
    const attempts = parseInt(await this.redis.get(attemptKey) || '0');
    
    if (attempts >= this.maxLoginAttempts) {
      // Lock the account
      await this.redis.setex(lockKey, this.lockoutDuration, 'locked');
      await this.redis.del(attemptKey);
      return {
        locked: true,
        lockoutUntil: new Date(Date.now() + this.lockoutDuration * 1000)
      };
    }
    
    return {
      locked: false,
      remainingAttempts: this.maxLoginAttempts - attempts
    };
  }

  async recordFailedAttempt(identifier: string): Promise<void> {
    const attemptKey = `auth_attempts:${identifier}`;
    await this.redis.incr(attemptKey);
    await this.redis.expire(attemptKey, 900); // 15 minutes
  }

  async clearFailedAttempts(identifier: string): Promise<void> {
    const attemptKey = `auth_attempts:${identifier}`;
    await this.redis.del(attemptKey);
  }

  // Session security
  async createSecureSession(userId: string, deviceInfo: any): Promise<string> {
    const sessionId = crypto.randomUUID();
    const sessionData = {
      userId,
      deviceInfo,
      createdAt: new Date().toISOString(),
      lastActivity: new Date().toISOString(),
      ipAddress: deviceInfo.ipAddress,
      userAgent: deviceInfo.userAgent
    };
    
    // Store session with 24 hour expiry
    await this.redis.setex(
      `session:${sessionId}`,
      86400,
      JSON.stringify(sessionData)
    );
    
    return sessionId;
  }

  async validateSession(sessionId: string): Promise<any> {
    const sessionData = await this.redis.get(`session:${sessionId}`);
    if (!sessionData) {
      return null;
    }
    
    const session = JSON.parse(sessionData);
    
    // Update last activity
    session.lastActivity = new Date().toISOString();
    await this.redis.setex(
      `session:${sessionId}`,
      86400,
      JSON.stringify(session)
    );
    
    return session;
  }

  async invalidateSession(sessionId: string): Promise<void> {
    await this.redis.del(`session:${sessionId}`);
  }

  async invalidateAllUserSessions(userId: string): Promise<void> {
    // Get all sessions for user
    const keys = await this.redis.keys(`session:*`);
    
    for (const key of keys) {
      const sessionData = await this.redis.get(key);
      if (sessionData) {
        const session = JSON.parse(sessionData);
        if (session.userId === userId) {
          await this.redis.del(key);
        }
      }
    }
  }

  // Token blacklisting for logout
  async blacklistToken(token: string, expirySeconds: number): Promise<void> {
    await this.redis.setex(`blacklist:${token}`, expirySeconds, 'revoked');
  }

  async isTokenBlacklisted(token: string): Promise<boolean> {
    const result = await this.redis.get(`blacklist:${token}`);
    return !!result;
  }

  // Generate secure random tokens
  generateSecureToken(length: number = 32): string {
    return crypto.randomBytes(length).toString('hex');
  }

  // CSRF token management
  async generateCSRFToken(sessionId: string): Promise<string> {
    const token = this.generateSecureToken();
    await this.redis.setex(`csrf:${sessionId}`, 3600, token); // 1 hour
    return token;
  }

  async validateCSRFToken(sessionId: string, token: string): Promise<boolean> {
    const storedToken = await this.redis.get(`csrf:${sessionId}`);
    return storedToken === token;
  }
}
```

### FILE: src/services/email.service.ts
```typescript
import crypto from 'crypto';
// import { db } from '../config/database';
import { redis } from '../config/redis';
import { env } from '../config/env';

interface EmailTemplate {
  subject: string;
  html: string;
  text: string;
}

export class EmailService {
  async sendVerificationEmail(userId: string, email: string, firstName: string): Promise<void> {
    const token = crypto.randomBytes(32).toString('hex');
    // const expires = Date.now() + 24 * 60 * 60 * 1000; // 24 hours

    // Store token in Redis
    await redis.setex(
      `email-verify:${token}`,
      24 * 60 * 60,
      JSON.stringify({ userId, email })
    );

    const verifyUrl = `${env.API_GATEWAY_URL}/auth/verify-email?token=${token}`;
    
    const template: EmailTemplate = {
      subject: 'Verify your TicketToken account',
      html: `
        <h2>Welcome to TicketToken, ${firstName}!</h2>
        <p>Please verify your email address by clicking the link below:</p>
        <a href="${verifyUrl}" style="display: inline-block; padding: 12px 24px; background-color: #4CAF50; color: white; text-decoration: none; border-radius: 4px;">Verify Email</a>
        <p>Or copy this link: ${verifyUrl}</p>
        <p>This link expires in 24 hours.</p>
        <p>If you didn't create this account, please ignore this email.</p>
      `,
      text: `Welcome to TicketToken, ${firstName}!
      
Please verify your email address by visiting:
${verifyUrl}

This link expires in 24 hours.

If you didn't create this account, please ignore this email.`
    };

    await this.sendEmail(email, template);
  }

  async sendPasswordResetEmail(userId: string, email: string, firstName: string): Promise<void> {
    const token = crypto.randomBytes(32).toString('hex');
    
    // Store token in Redis with 1 hour expiry
    await redis.setex(
      `password-reset:${token}`,
      60 * 60,
      JSON.stringify({ userId, email })
    );

    const resetUrl = `${env.API_GATEWAY_URL}/auth/reset-password?token=${token}`;
    
    const template: EmailTemplate = {
      subject: 'Reset your TicketToken password',
      html: `
        <h2>Password Reset Request</h2>
        <p>Hi ${firstName},</p>
        <p>We received a request to reset your password. Click the link below to create a new password:</p>
        <a href="${resetUrl}" style="display: inline-block; padding: 12px 24px; background-color: #2196F3; color: white; text-decoration: none; border-radius: 4px;">Reset Password</a>
        <p>Or copy this link: ${resetUrl}</p>
        <p>This link expires in 1 hour.</p>
        <p>If you didn't request this, please ignore this email and your password will remain unchanged.</p>
      `,
      text: `Password Reset Request

Hi ${firstName},

We received a request to reset your password. Visit the link below to create a new password:
${resetUrl}

This link expires in 1 hour.

If you didn't request this, please ignore this email and your password will remain unchanged.`
    };

    await this.sendEmail(email, template);
  }

  async sendMFABackupCodesEmail(email: string, firstName: string, backupCodes: string[]): Promise<void> {
    const template: EmailTemplate = {
      subject: 'Your TicketToken MFA backup codes',
      html: `
        <h2>MFA Backup Codes</h2>
        <p>Hi ${firstName},</p>
        <p>Here are your MFA backup codes. Store them safely:</p>
        <ul>
          ${backupCodes.map(code => `<li><code>${code}</code></li>`).join('')}
        </ul>
        <p>Each code can only be used once. Keep them secure!</p>
      `,
      text: `MFA Backup Codes

Hi ${firstName},

Here are your MFA backup codes. Store them safely:

${backupCodes.join('\n')}

Each code can only be used once. Keep them secure!`
    };

    await this.sendEmail(email, template);
  }

  private async sendEmail(to: string, template: EmailTemplate): Promise<void> {
    // In production, integrate with SendGrid, AWS SES, etc.
    // For now, log to console in development
    if (env.NODE_ENV === 'development') {
      console.log('📧 Email would be sent:', {
        to,
        subject: template.subject,
        preview: template.text.substring(0, 100) + '...'
      });
      return;
    }

    // TODO: Implement actual email sending
    // Example with SendGrid:
    // await sendgrid.send({
    //   to,
    //   from: 'noreply@tickettoken.com',
    //   subject: template.subject,
    //   html: template.html,
    //   text: template.text
    // });
  }
}
```

### FILE: src/services/device-trust.service.ts
```typescript
import { db } from '../config/database';
import crypto from 'crypto';

export class DeviceTrustService {
  /**
   * Generate device fingerprint
   */
  generateFingerprint(request: any): string {
    const components = [
      request.headers['user-agent'] || '',
      request.headers['accept-language'] || '',
      request.headers['accept-encoding'] || '',
      request.ip || ''
    ];
    
    return crypto
      .createHash('sha256')
      .update(components.join('|'))
      .digest('hex');
  }

  /**
   * Calculate trust score
   */
  async calculateTrustScore(userId: string, fingerprint: string): Promise<number> {
    const device = await db('trusted_devices')
      .where({ user_id: userId, device_fingerprint: fingerprint })
      .first();
    
    if (!device) return 0;
    
    let score = 50; // Base score
    
    // Age bonus (up to 20 points)
    const ageInDays = (Date.now() - new Date(device.created_at).getTime()) / (1000 * 60 * 60 * 24);
    score += Math.min(20, Math.floor(ageInDays / 10));
    
    // Recent activity bonus (up to 30 points)
    const lastSeenDays = (Date.now() - new Date(device.last_seen).getTime()) / (1000 * 60 * 60 * 24);
    if (lastSeenDays < 1) score += 30;
    else if (lastSeenDays < 7) score += 20;
    else if (lastSeenDays < 30) score += 10;
    
    return Math.min(100, score);
  }

  /**
   * Record device activity
   */
  async recordDeviceActivity(userId: string, fingerprint: string, success: boolean): Promise<void> {
    const device = await db('trusted_devices')
      .where({ user_id: userId, device_fingerprint: fingerprint })
      .first();
    
    if (!device) {
      // New device
      await db('trusted_devices').insert({
        user_id: userId,
        device_fingerprint: fingerprint,
        trust_score: success ? 50 : 0,
        last_seen: new Date()
      });
    } else {
      // Update existing
      const newScore = success 
        ? Math.min(100, device.trust_score + 5)
        : Math.max(0, device.trust_score - 10);
      
      await db('trusted_devices')
        .where({ id: device.id })
        .update({
          trust_score: newScore,
          last_seen: new Date()
        });
    }
  }

  /**
   * Check if device requires additional verification
   */
  async requiresAdditionalVerification(userId: string, fingerprint: string): Promise<boolean> {
    const score = await this.calculateTrustScore(userId, fingerprint);
    return score < 30; // Require MFA for low trust devices
  }
}
```

### FILE: src/services/lockout.service.ts
```typescript
import { redis } from '../config/redis';
import { env } from '../config/env';
import { RateLimitError } from '../errors';

export class LockoutService {
  private maxAttempts: number;
  private lockoutDuration: number;

  constructor() {
    this.maxAttempts = env.LOCKOUT_MAX_ATTEMPTS;
    this.lockoutDuration = env.LOCKOUT_DURATION_MINUTES * 60; // Convert to seconds
  }

  async recordFailedAttempt(userId: string, ipAddress: string): Promise<void> {
    const userKey = `lockout:user:${userId}`;
    const ipKey = `lockout:ip:${ipAddress}`;

    // Increment attempts for both user and IP
    const [userAttempts, ipAttempts] = await Promise.all([
      redis.incr(userKey),
      redis.incr(ipKey)
    ]);

    // Set expiry on first attempt
    if (userAttempts === 1) {
      await redis.expire(userKey, this.lockoutDuration);
    }
    if (ipAttempts === 1) {
      await redis.expire(ipKey, this.lockoutDuration);
    }

    // Check if should lock
    if (userAttempts >= this.maxAttempts || ipAttempts >= this.maxAttempts * 2) {
      const lockKey = userAttempts >= this.maxAttempts ? userKey : ipKey;
      const ttl = await redis.ttl(lockKey);
      
      throw new RateLimitError(
        `Account locked due to too many failed attempts. Try again in ${Math.ceil(ttl / 60)} minutes.`,
        ttl
      );
    }
  }

  async checkLockout(userId: string, ipAddress: string): Promise<void> {
    const userKey = `lockout:user:${userId}`;
    const ipKey = `lockout:ip:${ipAddress}`;

    const [userAttempts, ipAttempts] = await Promise.all([
      redis.get(userKey),
      redis.get(ipKey)
    ]);

    if (userAttempts && parseInt(userAttempts) >= this.maxAttempts) {
      const ttl = await redis.ttl(userKey);
      throw new RateLimitError(
        `Account locked due to too many failed attempts. Try again in ${Math.ceil(ttl / 60)} minutes.`,
        ttl
      );
    }

    if (ipAttempts && parseInt(ipAttempts) >= this.maxAttempts * 2) {
      const ttl = await redis.ttl(ipKey);
      throw new RateLimitError(
        `Too many failed attempts from this IP. Try again in ${Math.ceil(ttl / 60)} minutes.`,
        ttl
      );
    }
  }

  async clearFailedAttempts(userId: string, ipAddress: string): Promise<void> {
    const userKey = `lockout:user:${userId}`;
    const ipKey = `lockout:ip:${ipAddress}`;

    await Promise.all([
      redis.del(userKey),
      redis.del(ipKey)
    ]);
  }
}
```

### FILE: src/services/oauth.service.ts
```typescript
import { OAuth2Client } from 'google-auth-library';
import * as AppleAuth from 'apple-signin-auth';
import { db } from '../config/database';
import { JWTService } from './jwt.service';
import { AuthenticationError } from '../errors';
import crypto from 'crypto';
import { env } from '../config/env';

interface OAuthProfile {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  picture?: string;
  provider: 'google' | 'apple' | 'facebook';
  verified: boolean;
}

export class OAuthService {
  private googleClient: OAuth2Client;
  private jwtService: JWTService;

  constructor() {
    this.googleClient = new OAuth2Client(
      env.GOOGLE_CLIENT_ID || 'your-google-client-id',
      env.GOOGLE_CLIENT_SECRET,
      env.GOOGLE_REDIRECT_URI || 'http://auth-service:3001/api/v1/auth/oauth/google/callback'
    );
    this.jwtService = new JWTService();
  }

  /**
   * Verify Google ID token and extract profile
   */
  async verifyGoogleToken(idToken: string): Promise<OAuthProfile> {
    try {
      const ticket = await this.googleClient.verifyIdToken({
        idToken,
        audience: env.GOOGLE_CLIENT_ID || 'your-google-client-id'
      });
      
      const payload = ticket.getPayload();
      if (!payload) {
        throw new AuthenticationError('Invalid Google token');
      }

      return {
        id: payload.sub,
        email: payload.email!,
        firstName: payload.given_name,
        lastName: payload.family_name,
        picture: payload.picture,
        provider: 'google',
        verified: payload.email_verified || false
      };
    } catch (error) {
      throw new AuthenticationError('Google token verification failed');
    }
  }

  /**
   * Verify Apple ID token and extract profile
   */
  async verifyAppleToken(idToken: string): Promise<OAuthProfile> {
    try {
      const decodedToken = await AppleAuth.verifyIdToken(idToken, {
        audience: env.APPLE_CLIENT_ID || 'com.tickettoken.app',
        ignoreExpiration: false
      });

      return {
        id: decodedToken.sub,
        email: decodedToken.email || '',
        provider: 'apple',
        verified: decodedToken.email_verified === 'true'
      };
    } catch (error) {
      throw new AuthenticationError('Apple token verification failed');
    }
  }

  /**
   * Find or create user from OAuth profile
   */
  async findOrCreateUser(profile: OAuthProfile): Promise<any> {
    // Check if user exists with this email
    let user = await db('users')
      .where({ email: profile.email })
      .first();

    if (!user) {
      // Create new user
      const userId = crypto.randomUUID();
      
      await db('users').insert({
        id: userId,
        email: profile.email,
        first_name: profile.firstName || profile.email.split('@')[0],
        last_name: profile.lastName || '',
        email_verified: profile.verified,
        role: 'user',
        is_active: true,
        created_at: new Date(),
        // OAuth users don't have passwords
        password_hash: null
      });

      user = await db('users').where({ id: userId }).first();
    }

    // Store OAuth provider connection
    const existingConnection = await db('oauth_connections')
      .where({
        user_id: user.id,
        provider: profile.provider
      })
      .first();

    if (!existingConnection) {
      await db('oauth_connections').insert({
        id: crypto.randomUUID(),
        user_id: user.id,
        provider: profile.provider,
        provider_user_id: profile.id,
        profile_data: JSON.stringify(profile),
        created_at: new Date()
      });
    } else {
      // Update profile data
      await db('oauth_connections')
        .where({ id: existingConnection.id })
        .update({
          profile_data: JSON.stringify(profile),
          updated_at: new Date()
        });
    }

    // Update last login
    await db('users')
      .where({ id: user.id })
      .update({ last_login_at: new Date() });

    return user;
  }

  /**
   * Handle OAuth login/signup
   */
  async handleOAuthLogin(provider: 'google' | 'apple', token: string): Promise<any> {
    let profile: OAuthProfile;

    // Verify token based on provider
    if (provider === 'google') {
      profile = await this.verifyGoogleToken(token);
    } else if (provider === 'apple') {
      profile = await this.verifyAppleToken(token);
    } else {
      throw new AuthenticationError('Unsupported OAuth provider');
    }

    // Find or create user
    const user = await this.findOrCreateUser(profile);

    // Generate JWT tokens
    const tokens = await this.jwtService.generateTokenPair(user);

    return {
      success: true,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        emailVerified: user.email_verified
      },
      tokens,
      provider
    };
  }

  /**
   * Link OAuth provider to existing account
   */
  async linkOAuthProvider(
    userId: string,
    provider: 'google' | 'apple',
    token: string
  ): Promise<any> {
    let profile: OAuthProfile;

    // Verify token
    if (provider === 'google') {
      profile = await this.verifyGoogleToken(token);
    } else if (provider === 'apple') {
      profile = await this.verifyAppleToken(token);
    } else {
      throw new AuthenticationError('Unsupported OAuth provider');
    }

    // Check if already linked
    const existingConnection = await db('oauth_connections')
      .where({
        user_id: userId,
        provider: provider
      })
      .first();

    if (existingConnection) {
      throw new AuthenticationError(`${provider} account already linked`);
    }

    // Check if this OAuth account is linked to another user
    const otherUserConnection = await db('oauth_connections')
      .where({
        provider: provider,
        provider_user_id: profile.id
      })
      .first();

    if (otherUserConnection) {
      throw new AuthenticationError('This OAuth account is already linked to another user');
    }

    // Link the account
    await db('oauth_connections').insert({
      id: crypto.randomUUID(),
      user_id: userId,
      provider: provider,
      provider_user_id: profile.id,
      profile_data: JSON.stringify(profile),
      created_at: new Date()
    });

    return {
      success: true,
      message: `${provider} account linked successfully`,
      provider
    };
  }
}
```

### FILE: src/services/password-security.service.ts
```typescript
import argon2 from 'argon2';
import crypto from 'crypto';

export class PasswordSecurityService {
  private readonly minLength = 12;
  private readonly maxLength = 128;
  private readonly commonPasswords = new Set([
    'password123', '12345678', 'qwerty123', 'letmein', 'welcome123',
    'password', 'admin123', 'root1234', 'master123', 'pass1234'
  ]);
  
  async hashPassword(password: string): Promise<string> {
    // Validate before hashing
    const validation = this.validatePassword(password);
    if (!validation.valid) {
      throw new Error(`Password validation failed: ${validation.errors.join(', ')}`);
    }
    
    return argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: 65536, // 64 MB
      timeCost: 3,
      parallelism: 4,
      salt: crypto.randomBytes(16)
    });
  }
  
  async verifyPassword(hash: string, password: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, password);
    } catch (error) {
      console.error('Password verification error:', error);
      return false;
    }
  }
  
  validatePassword(password: string): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    
    if (password.length < this.minLength) {
      errors.push(`Password must be at least ${this.minLength} characters`);
    }
    
    if (password.length > this.maxLength) {
      errors.push(`Password must be less than ${this.maxLength} characters`);
    }
    
    if (!/[A-Z]/.test(password)) {
      errors.push('Password must contain at least one uppercase letter');
    }
    
    if (!/[a-z]/.test(password)) {
      errors.push('Password must contain at least one lowercase letter');
    }
    
    if (!/[0-9]/.test(password)) {
      errors.push('Password must contain at least one number');
    }
    
    if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
      errors.push('Password must contain at least one special character');
    }
    
    if (this.commonPasswords.has(password.toLowerCase())) {
      errors.push('Password is too common');
    }
    
    // Check for sequential characters
    if (/(.)\1{2,}/.test(password)) {
      errors.push('Password cannot contain more than 2 repeated characters');
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }
  
  generateSecurePassword(): string {
    const length = 16;
    const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()_+-=[]{}|;:,.<>?';
    let password = '';
    
    // Ensure at least one of each required character type
    password += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'[Math.floor(Math.random() * 26)];
    password += 'abcdefghijklmnopqrstuvwxyz'[Math.floor(Math.random() * 26)];
    password += '0123456789'[Math.floor(Math.random() * 10)];
    password += '!@#$%^&*()_+-=[]{}|;:,.<>?'[Math.floor(Math.random() * 27)];
    
    // Fill the rest randomly
    for (let i = password.length; i < length; i++) {
      password += charset[Math.floor(Math.random() * charset.length)];
    }
    
    // Shuffle the password
    return password.split('').sort(() => Math.random() - 0.5).join('');
  }
}
```

### FILE: src/services/jwt.service.ts
```typescript
import jwt, { SignOptions } from 'jsonwebtoken';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { env } from '../config/env';
import { redis } from '../config/redis';
import { TokenError } from '../errors';
import { pool } from '../config/database';

interface TokenPayload {
  sub: string;
  type: 'access' | 'refresh';
  jti: string;
  tenant_id: string;
  permissions?: string[];
  role?: string;
  family?: string;
  iat?: number;
  exp?: number;
  iss?: string;
  aud?: string | string[];
}

interface RefreshTokenData {
  userId: string;
  tenantId: string;
  family: string;
  createdAt: number;
  ipAddress: string;
  userAgent: string;
}

// Load RSA keys on module initialization
const privateKeyPath = process.env.JWT_PRIVATE_KEY_PATH || 
  path.join(process.env.HOME!, 'tickettoken-secrets', 'jwt-private.pem');
const publicKeyPath = process.env.JWT_PUBLIC_KEY_PATH || 
  path.join(process.env.HOME!, 'tickettoken-secrets', 'jwt-public.pem');

let privateKey: string;
let publicKey: string;

try {
  privateKey = fs.readFileSync(privateKeyPath, 'utf8');
  publicKey = fs.readFileSync(publicKeyPath, 'utf8');
  console.log('✓ JWT RS256 keys loaded successfully');
} catch (error) {
  console.error('✗ Failed to load JWT keys:', error);
  throw new Error('JWT keys not found. Run: openssl genrsa -out ~/tickettoken-secrets/jwt-private.pem 4096');
}

export class JWTService {
  private readonly issuer: string;

  constructor() {
    this.issuer = env.JWT_ISSUER;
  }

  async generateTokenPair(user: any): Promise<{ accessToken: string; refreshToken: string }> {
    // Ensure we have tenant_id - fetch if not provided
    let tenantId = user.tenant_id;
    if (!tenantId && user.id) {
      const result = await pool.query(
        'SELECT tenant_id FROM users WHERE id = $1',
        [user.id]
      );
      tenantId = result.rows[0]?.tenant_id || '00000000-0000-0000-0000-000000000001';
    }

    // Access token - now includes tenant_id
    const accessTokenPayload = {
      sub: user.id,
      type: 'access' as const,
      jti: crypto.randomUUID(),
      tenant_id: tenantId,
      permissions: user.permissions || ['buy:tickets', 'view:events', 'transfer:tickets'],
      role: user.role || 'customer',
    };

    const accessTokenOptions: SignOptions = {
      expiresIn: env.JWT_ACCESS_EXPIRES_IN as any,
      issuer: this.issuer,
      audience: this.issuer,
      algorithm: 'RS256',  // Changed from HS256
      keyid: '1',          // Added for key rotation support
    };

    const accessToken = jwt.sign(accessTokenPayload, privateKey, accessTokenOptions);

    // Refresh token - also includes tenant_id for consistency
    const refreshTokenId = crypto.randomUUID();
    const family = crypto.randomUUID();

    const refreshTokenPayload = {
      sub: user.id,
      type: 'refresh' as const,
      jti: refreshTokenId,
      tenant_id: tenantId,
      family,
    };

    const refreshTokenOptions: SignOptions = {
      expiresIn: env.JWT_REFRESH_EXPIRES_IN as any,
      algorithm: 'RS256',  // Changed from HS256
      keyid: '1',
    };

    const refreshToken = jwt.sign(refreshTokenPayload, privateKey, refreshTokenOptions);

    // Store refresh token metadata with tenant_id
    const refreshData: RefreshTokenData = {
      userId: user.id,
      tenantId: tenantId,
      family,
      createdAt: Date.now(),
      ipAddress: user.ipAddress || 'unknown',
      userAgent: user.userAgent || 'unknown',
    };

    await redis.setex(
      `refresh_token:${refreshTokenId}`,
      7 * 24 * 60 * 60, // 7 days
      JSON.stringify(refreshData)
    );

    return { accessToken, refreshToken };
  }

  async verifyAccessToken(token: string): Promise<TokenPayload> {
    try {
      const decoded = jwt.verify(token, publicKey, {
        issuer: this.issuer,
        audience: this.issuer,
        algorithms: ['RS256'],  // Changed from HS256
      }) as TokenPayload;

      if (decoded.type !== 'access') {
        throw new TokenError('Invalid token type');
      }

      // Validate tenant_id is present
      if (!decoded.tenant_id) {
        throw new TokenError('Invalid token - missing tenant context');
      }

      return decoded;
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        throw new TokenError('Access token expired');
      }
      throw new TokenError('Invalid access token');
    }
  }

  async refreshTokens(refreshToken: string, ipAddress: string, userAgent: string): Promise<{ accessToken: string; refreshToken: string }> {
    try {
      // Verify refresh token
      const decoded = jwt.verify(refreshToken, publicKey, {
        algorithms: ['RS256'],  // Changed from HS256
      }) as TokenPayload;

      if (decoded.type !== 'refresh') {
        throw new TokenError('Invalid token type');
      }

      // Check if token exists and hasn't been revoked
      const storedData = await redis.get(`refresh_token:${decoded.jti}`);

      if (!storedData) {
        // Token reuse detected - invalidate entire family
        await this.invalidateTokenFamily(decoded.family!);
        throw new TokenError('Token reuse detected - possible theft');
      }

      // Parse stored data
      const tokenData: RefreshTokenData = JSON.parse(storedData);

      // Fetch fresh user data to ensure correct tenant_id
      const userResult = await pool.query(
        'SELECT id, tenant_id, permissions, role FROM users WHERE id = $1',
        [decoded.sub]
      );

      if (userResult.rows.length === 0) {
        throw new TokenError('User not found');
      }

      const user = userResult.rows[0];

      // Generate new token pair with current tenant_id
      const newTokens = await this.generateTokenPair({
        id: user.id,
        tenant_id: user.tenant_id,
        permissions: user.permissions,
        role: user.role,
        ipAddress,
        userAgent,
      });

      // Invalidate old refresh token
      await redis.del(`refresh_token:${decoded.jti}`);

      return newTokens;
    } catch (error) {
      if (error instanceof TokenError) {
        throw error;
      }
      throw new TokenError('Invalid refresh token');
    }
  }

  async invalidateTokenFamily(family: string): Promise<void> {
    // Find all tokens in the family
    const keys = await redis.keys('refresh_token:*');

    for (const key of keys) {
      const data = await redis.get(key);
      if (data) {
        const tokenData: RefreshTokenData = JSON.parse(data);
        if (tokenData.family === family) {
          await redis.del(key);
        }
      }
    }
  }

  async revokeAllUserTokens(userId: string): Promise<void> {
    const keys = await redis.keys('refresh_token:*');

    for (const key of keys) {
      const data = await redis.get(key);
      if (data) {
        const tokenData: RefreshTokenData = JSON.parse(data);
        if (tokenData.userId === userId) {
          await redis.del(key);
        }
      }
    }
  }

  decode(token: string): any {
    return jwt.decode(token);
  }

  async verifyRefreshToken(token: string): Promise<any> {
    try {
      return jwt.verify(token, publicKey, {
        algorithms: ['RS256'],  // Changed from HS256
      });
    } catch {
      throw new Error('Invalid refresh token');
    }
  }

  // Export public key for JWKS endpoint (future use)
  getPublicKey(): string {
    return publicKey;
  }
}
```

### FILE: src/services/cache.service.ts
```typescript
export class CacheService {
  private static instance: CacheService;
  private cache: Map<string, { value: string; expires: number }> = new Map();

  static getInstance(): CacheService {
    if (!CacheService.instance) {
      CacheService.instance = new CacheService();
    }
    return CacheService.instance;
  }

  async get(key: string): Promise<string | null> {
    const item = this.cache.get(key);
    if (!item) return null;
    if (Date.now() > item.expires) {
      this.cache.delete(key);
      return null;
    }
    return item.value;
  }

  async set(key: string, value: string, ttl: number): Promise<void> {
    this.cache.set(key, {
      value,
      expires: Date.now() + (ttl * 1000)
    });
  }

  async checkLimit(key: string, limit: number, window: number): Promise<boolean> {
    const count = parseInt(await this.get(key) || '0');
    if (count >= limit) return false;
    await this.set(key, (count + 1).toString(), window);
    return true;
  }
}
```

### FILE: src/services/rbac.service.ts
```typescript
import { db } from '../config/database';
import { AuthorizationError } from '../errors';

interface Role {
  name: string;
  permissions: string[];
  venueScoped: boolean;
}

export class RBACService {
  private roles: Map<string, Role>;

  constructor() {
    this.roles = new Map([
      ['venue-owner', {
        name: 'venue-owner',
        permissions: ['*'], // All permissions for their venue
        venueScoped: true,
      }],
      ['venue-manager', {
        name: 'venue-manager',
        permissions: [
          'events:create', 'events:update', 'events:delete',
          'tickets:view', 'tickets:validate',
          'reports:view', 'reports:export',
        ],
        venueScoped: true,
      }],
      ['box-office', {
        name: 'box-office',
        permissions: [
          'tickets:sell', 'tickets:view', 'tickets:validate',
          'payments:process', 'reports:daily',
        ],
        venueScoped: true,
      }],
      ['door-staff', {
        name: 'door-staff',
        permissions: ['tickets:validate', 'tickets:view'],
        venueScoped: true,
      }],
      ['customer', {
        name: 'customer',
        permissions: [
          'tickets:purchase', 'tickets:view-own', 'tickets:transfer-own',
          'profile:update-own',
        ],
        venueScoped: false,
      }],
    ]);
  }

  async getUserPermissions(userId: string, venueId?: string): Promise<string[]> {
    const permissions = new Set<string>();

    // Get user's venue roles if venueId provided
    if (venueId) {
      const venueRoles = await db('user_venue_roles')
        .where({
          user_id: userId,
          venue_id: venueId,
          is_active: true,
        })
        .where('expires_at', '>', new Date())
        .orWhereNull('expires_at');

      for (const venueRole of venueRoles) {
        const role = this.roles.get(venueRole.role);
        if (role) {
          role.permissions.forEach(p => permissions.add(p));
        }
      }
    }

    // Add customer permissions by default
    const customerRole = this.roles.get('customer');
    if (customerRole) {
      customerRole.permissions.forEach(p => permissions.add(p));
    }

    return Array.from(permissions);
  }

  async checkPermission(userId: string, permission: string, venueId?: string): Promise<boolean> {
    const userPermissions = await this.getUserPermissions(userId, venueId);

    // Check for wildcard permission
    if (userPermissions.includes('*')) {
      return true;
    }

    // Check specific permission
    return userPermissions.includes(permission);
  }

  async requirePermission(userId: string, permission: string, venueId?: string): Promise<void> {
    const hasPermission = await this.checkPermission(userId, permission, venueId);
    
    if (!hasPermission) {
      throw new AuthorizationError(`Missing required permission: ${permission}`);
    }
  }

  async grantVenueRole(
    userId: string,
    venueId: string,
    role: string,
    grantedBy: string,
    expiresAt?: Date
  ): Promise<void> {
    // Validate role
    if (!this.roles.has(role)) {
      throw new Error(`Invalid role: ${role}`);
    }

    // Check if granter has permission to grant roles
    await this.requirePermission(grantedBy, 'roles:manage', venueId);

    // Check for existing role
    const existing = await db('user_venue_roles')
      .where({
        user_id: userId,
        venue_id: venueId,
        role: role,
        is_active: true,
      })
      .first();

    if (existing) {
      // Update expiration if needed
      if (expiresAt) {
        await db('user_venue_roles')
          .where('id', existing.id)
          .update({ expires_at: expiresAt });
      }
      return;
    }

    // Grant new role
    await db('user_venue_roles').insert({
      user_id: userId,
      venue_id: venueId,
      role: role,
      granted_by: grantedBy,
      expires_at: expiresAt,
    });
  }

  async revokeVenueRole(userId: string, venueId: string, role: string, revokedBy: string): Promise<void> {
    // Check if revoker has permission
    await this.requirePermission(revokedBy, 'roles:manage', venueId);

    await db('user_venue_roles')
      .where({
        user_id: userId,
        venue_id: venueId,
        role: role,
        is_active: true,
      })
      .update({ is_active: false });
  }

  async getUserVenueRoles(userId: string): Promise<any[]> {
    return db('user_venue_roles')
      .where({
        user_id: userId,
        is_active: true,
      })
      .where('expires_at', '>', new Date())
      .orWhereNull('expires_at')
      .select('venue_id', 'role', 'granted_at', 'expires_at');
  }
}
```

### FILE: src/services/brute-force-protection.service.ts
```typescript
import { Redis } from 'ioredis';

export class BruteForceProtectionService {
  private redis: Redis;
  private readonly maxAttempts = 5;
  private readonly lockoutDuration = 15 * 60; // 15 minutes in seconds
  private readonly attemptWindow = 15 * 60; // 15 minutes in seconds
  
  constructor(redis: Redis) {
    this.redis = redis;
  }
  
  async recordFailedAttempt(identifier: string): Promise<{
    locked: boolean;
    remainingAttempts: number;
    lockoutUntil?: Date;
  }> {
    const key = `failed_auth:${identifier}`;
    const lockKey = `auth_lock:${identifier}`;
    
    // Check if already locked
    const isLocked = await this.redis.get(lockKey);
    if (isLocked) {
      return {
        locked: true,
        remainingAttempts: 0,
        lockoutUntil: new Date(Date.now() + (await this.redis.ttl(lockKey)) * 1000)
      };
    }
    
    // Increment failed attempts
    const attempts = await this.redis.incr(key);
    
    // Set expiry on first attempt
    if (attempts === 1) {
      await this.redis.expire(key, this.attemptWindow);
    }
    
    // Lock if max attempts reached
    if (attempts >= this.maxAttempts) {
      await this.redis.setex(lockKey, this.lockoutDuration, 'locked');
      await this.redis.del(key); // Clear attempts counter
      
      return {
        locked: true,
        remainingAttempts: 0,
        lockoutUntil: new Date(Date.now() + this.lockoutDuration * 1000)
      };
    }
    
    return {
      locked: false,
      remainingAttempts: this.maxAttempts - attempts
    };
  }
  
  async clearFailedAttempts(identifier: string): Promise<void> {
    await this.redis.del(`failed_auth:${identifier}`);
  }
  
  async isLocked(identifier: string): Promise<boolean> {
    const lockKey = `auth_lock:${identifier}`;
    const isLocked = await this.redis.get(lockKey);
    return !!isLocked;
  }
  
  async getLockInfo(identifier: string): Promise<{
    locked: boolean;
    remainingTime?: number;
  }> {
    const lockKey = `auth_lock:${identifier}`;
    const ttl = await this.redis.ttl(lockKey);
    
    if (ttl > 0) {
      return {
        locked: true,
        remainingTime: ttl
      };
    }
    
    return { locked: false };
  }
}
```

### FILE: src/services/auth-secure.service.ts
```typescript
import crypto from 'crypto';
import { db } from '../config/database';
import { redis } from '../config/redis';
import { JWTService } from './jwt.service';
import { SecurityEnhancedService } from './security-enhanced.service';
import { User } from '../models/user.model';
import {
  AuthenticationError,
  ValidationError,
  ConflictError,
  RateLimitError
} from '../errors';
import { env } from '../config/env';

export class AuthService {
  private jwtService: JWTService;
  private securityService: SecurityEnhancedService;

  constructor(jwtService: JWTService, securityService: SecurityEnhancedService) {
    this.jwtService = jwtService;
    this.securityService = securityService;
  }

  async register(data: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    phone?: string;
  }): Promise<{ user: Partial<User>; tokens: { accessToken: string; refreshToken: string } }> {
    // Check if user exists
    const existingUser = await db('users')
      .where('email', data.email)
      .whereNull('deleted_at')
      .first();

    if (existingUser) {
      throw new ConflictError('Email already registered');
    }

    // Use enhanced security service for password validation and hashing
    const passwordHash = await this.securityService.hashPassword(data.password);

    // Generate verification token
    const verificationToken = this.securityService.generateSecureToken();

    // Begin transaction
    const trx = await db.transaction();

    try {
      // Create user
      const [userId] = await trx('users').insert({
        email: data.email.toLowerCase(),
        password_hash: passwordHash,
        first_name: data.firstName,
        last_name: data.lastName,
        phone: data.phone,
        is_active: false,
        email_verified: false,
        verification_token: verificationToken,
        created_at: new Date(),
      });

      // Assign default role
      await trx('user_roles').insert({
        user_id: userId,
        role_id: 1, // Default 'user' role
        created_at: new Date(),
      });

      await trx.commit();

      // Generate tokens
      const tokens = await this.jwtService.generateTokenPair({ id: userId.toString(), role: 'user' });

      // Create secure session
      const sessionId = await this.securityService.createSecureSession(
        userId.toString(),
        { ipAddress: '0.0.0.0', userAgent: 'unknown' } // Should be passed from request
      );

      return {
        user: {
          id: userId.toString(),
          email: data.email,
          first_name: data.firstName,
          last_name: data.lastName,
          email_verified: false,
        },
        tokens,
      };
    } catch (error) {
      await trx.rollback();
      throw error;
    }
  }

  async login(email: string, password: string, deviceInfo?: any): Promise<{
    user: Partial<User>;
    tokens: { accessToken: string; refreshToken: string };
    sessionId: string;
  }> {
    // Check brute force
    const bruteForceStatus = await this.securityService.checkBruteForce(email);
    if (bruteForceStatus.locked) {
      throw new RateLimitError(
        `Account locked due to too many failed attempts. Try again after ${bruteForceStatus.lockoutUntil}`
      );
    }

    // Find user
    const user = await db('users')
      .where('email', email.toLowerCase())
      .whereNull('deleted_at')
      .first();

    if (!user) {
      await this.securityService.recordFailedAttempt(email);
      throw new AuthenticationError('Invalid credentials');
    }

    // Verify password using enhanced security
    const isValidPassword = await this.securityService.verifyPassword(
      user.password_hash,
      password
    );

    if (!isValidPassword) {
      await this.securityService.recordFailedAttempt(email);
      throw new AuthenticationError('Invalid credentials');
    }

    // Clear failed attempts on successful login
    await this.securityService.clearFailedAttempts(email);

    // Check if account is active
    if (!user.is_active) {
      throw new AuthenticationError('Account is not active');
    }

    // Get user role
    const userRole = await db('user_roles')
      .join('roles', 'user_roles.role_id', 'roles.id')
      .where('user_roles.user_id', user.id)
      .select('roles.name')
      .first();

    // Generate tokens
    const tokens = await this.jwtService.generateTokenPair({ id: user.id.toString(), role: userRole?.name || 'user' });


    // Create secure session
    const sessionId = await this.securityService.createSecureSession(
      user.id.toString(),
      deviceInfo || { ipAddress: '0.0.0.0', userAgent: 'unknown' }
    );

    // Update last login
    await db('users')
      .where('id', user.id)
      .update({
        last_login_at: new Date(),
        last_login_ip: deviceInfo?.ipAddress || '0.0.0.0',
      });

    return {
      user: {
        id: user.id,
        email: user.email,
        first_name: user.first_name,
        last_name: user.last_name,
        email_verified: user.email_verified,
        phone_verified: user.phone_verified,
      },
      tokens,
      sessionId,
    };
  }

  async logout(token: string, sessionId?: string): Promise<void> {
    // Blacklist the token
    const decoded = this.jwtService.decode(token);
    if (decoded && decoded.exp) {
      const ttl = decoded.exp - Math.floor(Date.now() / 1000);
      if (ttl > 0) {
        await this.securityService.blacklistToken(token, ttl);
      }
    }

    // Invalidate session if provided
    if (sessionId) {
      await this.securityService.invalidateSession(sessionId);
    }
  }

  async logoutAllDevices(userId: string): Promise<void> {
    // Invalidate all user sessions
    await this.securityService.invalidateAllUserSessions(userId);
    
    // Note: You might also want to blacklist all active tokens
    // This would require tracking tokens per user
  }
}
```

