import Joi from 'joi';

export const registerSchema = Joi.object({
  email: Joi.string().email().max(255).required(),
  password: Joi.string().min(8).max(128).required(),
  firstName: Joi.string().max(100).required(),
  lastName: Joi.string().max(100).required(),
  phone: Joi.string().max(20).optional(),
  tenant_id: Joi.string().uuid().required(),
}).unknown(false);

export const loginSchema = Joi.object({
  email: Joi.string().email().max(255).required(),
  password: Joi.string().max(128).required(),
  captchaToken: Joi.string().max(2048).optional(),
  mfaToken: Joi.string().min(6).max(10).optional(), // 6 for TOTP, 9 for backup codes (XXXX-XXXX)
}).unknown(false);

export const refreshTokenSchema = Joi.object({
  refreshToken: Joi.string().max(2048).required(),
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
  refreshToken: Joi.string().max(2048).optional(),
}).unknown(false);

export const setupMFASchema = Joi.object({}).unknown(false);

export const verifyMFASchema = Joi.object({
  token: Joi.string().min(6).max(10).required(), // 6 for TOTP, 9 for backup codes
}).unknown(false);

export const disableMFASchema = Joi.object({
  password: Joi.string().max(128).required(),
  token: Joi.string().min(6).max(10).required(),
}).unknown(false);

export const walletNonceSchema = Joi.object({
  publicKey: Joi.string().max(128).required(),
  chain: Joi.string().valid('solana', 'ethereum').default('solana'),
}).unknown(false);

export const walletRegisterSchema = Joi.object({
  publicKey: Joi.string().max(128).required(),
  signature: Joi.string().max(256).required(),
  nonce: Joi.string().max(64).required(),
  chain: Joi.string().valid('solana', 'ethereum').default('solana'),
  email: Joi.string().email().max(255).optional(),
  firstName: Joi.string().max(100).optional(),
  lastName: Joi.string().max(100).optional(),
  tenant_id: Joi.string().uuid().optional(),
}).unknown(false);

export const walletLoginSchema = Joi.object({
  publicKey: Joi.string().max(128).required(),
  signature: Joi.string().max(256).required(),
  nonce: Joi.string().max(64).required(),
  chain: Joi.string().valid('solana', 'ethereum').default('solana'),
}).unknown(false);

export const walletLinkSchema = Joi.object({
  publicKey: Joi.string().max(128).required(),
  signature: Joi.string().max(256).required(),
  nonce: Joi.string().max(64).required(),
  chain: Joi.string().valid('solana', 'ethereum').default('solana'),
}).unknown(false);

export const biometricRegisterSchema = Joi.object({
  publicKey: Joi.string().max(2048).required(),
  deviceId: Joi.string().max(256).required(),
  biometricType: Joi.string().valid('faceId', 'touchId', 'fingerprint').optional(),
}).unknown(false);

export const biometricChallengeSchema = Joi.object({
  userId: Joi.string().uuid().required(),
  tenantId: Joi.string().uuid().required(),
}).unknown(false);

export const biometricAuthenticateSchema = Joi.object({
  userId: Joi.string().uuid().required(),
  tenantId: Joi.string().uuid().required(),
  credentialId: Joi.string().max(256).required(),
  signature: Joi.string().max(2048).required(),
  challenge: Joi.string().max(256).required(),
}).unknown(false);

export const oauthCallbackSchema = Joi.object({
  code: Joi.string().max(2048).required(),
  tenant_id: Joi.string().uuid().optional(),
}).unknown(false);

export const oauthLoginSchema = Joi.object({
  code: Joi.string().max(2048).required(),
}).unknown(false);

export const oauthLinkSchema = Joi.object({
  code: Joi.string().max(2048).required(),
}).unknown(false);

export const providerParamSchema = Joi.object({
  provider: Joi.string().valid('google', 'apple', 'facebook').required(),
}).unknown(false);

export const publicKeyParamSchema = Joi.object({
  publicKey: Joi.string().max(128).required(),
}).unknown(false);

export const sessionIdParamSchema = Joi.object({
  sessionId: Joi.string().uuid().required(),
}).unknown(false);

export const credentialIdParamSchema = Joi.object({
  credentialId: Joi.string().max(256).required(),
}).unknown(false);

export const venueIdParamSchema = Joi.object({
  venueId: Joi.string().uuid().required(),
}).unknown(false);

export const venueIdAndUserIdParamSchema = Joi.object({
  venueId: Joi.string().uuid().required(),
  userId: Joi.string().uuid().required(),
}).unknown(false);

export const grantRoleSchema = Joi.object({
  userId: Joi.string().uuid().required(),
  role: Joi.string().valid('venue-owner', 'venue-manager', 'box-office', 'door-staff').required(),
  expiresAt: Joi.date().iso().optional(),
}).unknown(false);

export const updateProfileSchema = Joi.object({
  firstName: Joi.string().max(100).optional(),
  lastName: Joi.string().max(100).optional(),
  phone: Joi.string().max(20).optional(),
  displayName: Joi.string().max(100).optional(),
}).unknown(false);

export const paginationQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
}).unknown(true);

export const emptyBodySchema = Joi.object({}).unknown(true);
