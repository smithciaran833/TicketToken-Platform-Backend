import Joi from 'joi';

// ============================================
// CUSTOM VALIDATORS
// ============================================

// E.164 phone format: +[country code][number], 8-15 digits
const e164Phone = Joi.string()
  .pattern(/^\+?[1-9]\d{7,14}$/)
  .max(20)
  .messages({
    'string.pattern.base': 'Phone must be in E.164 format (e.g., +14155551234)'
  });

// ============================================
// AUTHENTICATION SCHEMAS
// ============================================

export const registerSchema = Joi.object({
  email: Joi.string().email().max(255).required(),
  password: Joi.string().min(8).max(128).required(),
  firstName: Joi.string().max(50).required(),
  lastName: Joi.string().max(50).required(),
  phone: e164Phone.optional(),
  tenant_id: Joi.string().uuid().required().messages({
    'string.guid': 'Invalid tenant_id format - must be a valid UUID',
    'string.base': 'tenant_id must be a string',
    'any.required': 'tenant_id is required'
  }),
}).unknown(false);

export const loginSchema = Joi.object({
  email: Joi.string().email().max(255).required(),
  password: Joi.string().max(128).required(),
  mfaToken: Joi.string().length(6).optional(),
}).unknown(false);

export const refreshTokenSchema = Joi.object({
  refreshToken: Joi.string().max(512).required(),
}).unknown(false);

export const verifyEmailSchema = Joi.object({
  token: Joi.string().max(256).required(),
}).unknown(false);

export const forgotPasswordSchema = Joi.object({
  email: Joi.string().email().max(255).required(),
}).unknown(false);

export const resetPasswordSchema = Joi.object({
  token: Joi.string().max(256).required(),
  newPassword: Joi.string().min(8).max(128).required(),
}).unknown(false);

export const changePasswordSchema = Joi.object({
  currentPassword: Joi.string().max(128).required(),
  newPassword: Joi.string().min(8).max(128).required(),
}).unknown(false);

export const logoutSchema = Joi.object({
  refreshToken: Joi.string().max(512).optional(),
}).unknown(false);

// ============================================
// MFA SCHEMAS
// ============================================

export const setupMFASchema = Joi.object({}).unknown(false);

export const verifyMFASchema = Joi.object({
  token: Joi.string().length(6).required(),
}).unknown(false);

export const disableMFASchema = Joi.object({
  password: Joi.string().max(128).required(),
  token: Joi.string().length(6).required(),
}).unknown(false);

// ============================================
// WALLET SCHEMAS
// ============================================

export const walletNonceSchema = Joi.object({
  publicKey: Joi.string().min(32).max(128).required(),
  chain: Joi.string().valid('solana', 'ethereum').required(),
}).unknown(false);

export const walletRegisterSchema = Joi.object({
  publicKey: Joi.string().min(32).max(128).required(),
  signature: Joi.string().min(64).max(256).required(),
  nonce: Joi.string().min(32).max(128).required(),
  chain: Joi.string().valid('solana', 'ethereum').required(),
  tenant_id: Joi.string().uuid().required(),
}).unknown(false);

export const walletLoginSchema = Joi.object({
  publicKey: Joi.string().min(32).max(128).required(),
  signature: Joi.string().min(64).max(256).required(),
  nonce: Joi.string().min(32).max(128).required(),
  chain: Joi.string().valid('solana', 'ethereum').required(),
}).unknown(false);

export const walletLinkSchema = Joi.object({
  publicKey: Joi.string().min(32).max(128).required(),
  signature: Joi.string().min(64).max(256).required(),
  nonce: Joi.string().min(32).max(128).required(),
  chain: Joi.string().valid('solana', 'ethereum').required(),
}).unknown(false);

export const connectWalletSchema = Joi.object({
  walletAddress: Joi.string().max(128).required(),
  walletType: Joi.string().valid('phantom', 'solflare', 'metamask').required(),
}).unknown(false);

// ============================================
// BIOMETRIC SCHEMAS
// ============================================

export const biometricRegisterSchema = Joi.object({
  publicKey: Joi.string().max(2048).required(),
  deviceId: Joi.string().max(255).required(),
  biometricType: Joi.string().valid('faceId', 'touchId', 'fingerprint').optional(),
}).unknown(false);

export const biometricChallengeSchema = Joi.object({
  userId: Joi.string().uuid().required(),
}).unknown(false);

export const biometricAuthenticateSchema = Joi.object({
  userId: Joi.string().uuid().required(),
  credentialId: Joi.string().uuid().required(),
  signature: Joi.string().max(2048).required(),
  challenge: Joi.string().max(256).required(),
}).unknown(false);

// ============================================
// OAUTH SCHEMAS
// ============================================

export const oauthCallbackSchema = Joi.object({
  code: Joi.string().max(2048).required(),
  state: Joi.string().max(256).optional(),
  tenant_id: Joi.string().uuid().optional(),
}).unknown(false);

export const oauthLinkSchema = Joi.object({
  code: Joi.string().max(2048).required(),
  state: Joi.string().max(256).optional(),
}).unknown(false);

export const oauthLoginSchema = Joi.object({
  code: Joi.string().max(2048).required(),
  state: Joi.string().max(256).optional(),
}).unknown(false);

// ============================================
// PROFILE SCHEMAS
// ============================================

export const updateProfileSchema = Joi.object({
  firstName: Joi.string().max(50).optional(),
  lastName: Joi.string().max(50).optional(),
  phone: e164Phone.optional(),
  email: Joi.string().email().max(255).optional(),
}).unknown(false);

// ============================================
// ROLE MANAGEMENT SCHEMAS
// ============================================

export const grantRoleSchema = Joi.object({
  userId: Joi.string().uuid().required(),
  role: Joi.string().max(50).required(),
}).unknown(false);

// ============================================
// PARAM VALIDATION SCHEMAS
// ============================================

export const providerParamSchema = Joi.object({
  provider: Joi.string()
    .valid('google', 'github', 'facebook', 'apple')
    .required()
    .messages({
      'any.only': 'Provider must be one of: google, github, facebook, apple',
      'any.required': 'Provider is required'
    })
}).unknown(false);

export const sessionIdParamSchema = Joi.object({
  sessionId: Joi.string().uuid().required()
}).unknown(false);

export const venueIdParamSchema = Joi.object({
  venueId: Joi.string().uuid().required()
}).unknown(false);

export const userIdParamSchema = Joi.object({
  userId: Joi.string().uuid().required()
}).unknown(false);

export const credentialIdParamSchema = Joi.object({
  credentialId: Joi.string().uuid().required()
}).unknown(false);

export const venueIdAndUserIdParamSchema = Joi.object({
  venueId: Joi.string().uuid().required(),
  userId: Joi.string().uuid().required()
}).unknown(false);

export const publicKeyParamSchema = Joi.object({
  publicKey: Joi.string()
    .min(32)
    .max(128)
    .pattern(/^[1-9A-HJ-NP-Za-km-z]+$/)
    .required()
}).unknown(false);

// ============================================
// EMPTY BODY & QUERY SCHEMAS
// ============================================

export const emptyBodySchema = Joi.object({}).unknown(false);

export const paginationQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  sortBy: Joi.string().valid('created_at', 'updated_at', 'name').optional(),
  order: Joi.string().valid('asc', 'desc').default('desc')
}).unknown(false);
