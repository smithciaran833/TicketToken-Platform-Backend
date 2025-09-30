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
