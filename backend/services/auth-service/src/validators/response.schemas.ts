// src/validators/response.schemas.ts
// RD5: Fastify response schemas to prevent accidental data leakage

import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

// ============================================
// SHARED SCHEMAS
// ============================================

const ErrorResponseSchema = z.object({
  success: z.boolean().optional(),
  error: z.string(),
  code: z.string().optional(),
  requiresCaptcha: z.boolean().optional(),
});

const MessageResponseSchema = z.object({
  message: z.string(),
});

const SuccessMessageSchema = z.object({
  success: z.boolean(),
  message: z.string(),
});

// ============================================
// USER & TOKEN SCHEMAS
// ============================================

const SafeUserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  username: z.string().nullable().optional(),
  display_name: z.string().nullable().optional(),
  first_name: z.string().nullable().optional(),
  last_name: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  email_verified: z.boolean(),
  phone_verified: z.boolean().nullable().optional(),
  mfa_enabled: z.boolean(),
  role: z.string(),
  tenant_id: z.string().uuid(),
  status: z.string().nullable().optional(),
  created_at: z.string().or(z.date()),
  updated_at: z.string().or(z.date()),
  last_login_at: z.string().or(z.date()).nullable().optional(),
  password_changed_at: z.string().or(z.date()).nullable().optional(),
});

// Wallet user schema - simpler version for wallet auth responses
// Wallet service returns fewer fields than standard auth
const WalletUserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  email_verified: z.boolean(),
  mfa_enabled: z.boolean(),
  tenant_id: z.string().uuid(),
});

const TokensSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  expiresIn: z.number().optional(),
});

// ============================================
// AUTH RESPONSES
// ============================================

const RegisterResponseSchema = z.object({
  user: SafeUserSchema,
  tokens: TokensSchema,
});

const LoginSuccessSchema = z.object({
  user: SafeUserSchema,
  tokens: TokensSchema,
});

const LoginMFARequiredSchema = z.object({
  requiresMFA: z.boolean(),
  userId: z.string().uuid(),
});

const RefreshResponseSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  expiresIn: z.number().optional(),
});

const VerifyTokenResponseSchema = z.object({
  valid: z.boolean(),
  user: SafeUserSchema,
});

const GetCurrentUserResponseSchema = z.object({
  user: SafeUserSchema,
});

const LogoutResponseSchema = z.object({
  success: z.boolean(),
  message: z.string().optional(),
});

// ============================================
// MFA RESPONSES
// ============================================

const SetupMFAResponseSchema = z.object({
  secret: z.string(),
  qrCode: z.string(),
  backupCodes: z.array(z.string()).optional(),
});

const VerifyMFASetupResponseSchema = z.object({
  success: z.boolean(),
  backupCodes: z.array(z.string()),
});

const VerifyMFAResponseSchema = z.object({
  valid: z.boolean(),
});

const RegenerateBackupCodesResponseSchema = z.object({
  backupCodes: z.array(z.string()),
});

const DisableMFAResponseSchema = z.object({
  success: z.boolean(),
});

// ============================================
// WALLET RESPONSES
// ============================================

// Fixed: Added 'message' field that service returns
const WalletNonceResponseSchema = z.object({
  nonce: z.string(),
  message: z.string(),
  expiresAt: z.string().optional(),
});

// Fixed: Use WalletUserSchema instead of SafeUserSchema
const WalletAuthResponseSchema = z.object({
  success: z.boolean().optional(),
  user: WalletUserSchema,
  tokens: TokensSchema,
  wallet: z.object({
    address: z.string(),
    chain: z.string(),
    connected: z.boolean(),
  }).optional(),
});

// Fixed: Match what service actually returns
const WalletLinkResponseSchema = z.object({
  success: z.boolean(),
  message: z.string().optional(),
  wallet: z.object({
    address: z.string(),
    chain: z.string(),
    connected: z.boolean(),
  }).optional(),
});

const WalletUnlinkResponseSchema = z.object({
  success: z.boolean(),
  message: z.string().optional(),
});

// ============================================
// BIOMETRIC RESPONSES
// ============================================

const BiometricChallengeResponseSchema = z.object({
  challenge: z.string(),
});

const BiometricAuthResponseSchema = z.object({
  success: z.boolean(),
  tokens: TokensSchema,
});

const BiometricRegisterResponseSchema = z.object({
  success: z.boolean(),
  credentialId: z.string(),
});

// FIXED: Removed lastUsedAt since service doesn't return it
const BiometricDevicesResponseSchema = z.object({
  devices: z.array(z.object({
    credentialId: z.string(),
    deviceId: z.string(),
    biometricType: z.string(),
    createdAt: z.string(),
  })),
});

const DeleteBiometricDeviceResponseSchema = z.object({
  success: z.boolean(),
});

// ============================================
// OAUTH RESPONSES
// ============================================

const OAuthCallbackResponseSchema = z.object({
  user: SafeUserSchema,
  tokens: TokensSchema,
});

const OAuthLinkResponseSchema = z.object({
  success: z.boolean(),
  provider: z.string(),
});

const OAuthUnlinkResponseSchema = z.object({
  success: z.boolean(),
});

// ============================================
// SESSION RESPONSES
// ============================================

const SessionSchema = z.object({
  id: z.string().uuid(),
  ip_address: z.string().nullable().optional(),
  user_agent: z.string().nullable().optional(),
  started_at: z.string(),
  ended_at: z.string().nullable().optional(),
  revoked_at: z.string().nullable().optional(),
  metadata: z.any().nullable().optional(),
  user_id: z.string().uuid(),
});

// FIXED: Added pagination metadata
const ListSessionsResponseSchema = z.object({
  success: z.boolean(),
  sessions: z.array(SessionSchema),
  pagination: z.object({
    page: z.number(),
    limit: z.number(),
    total: z.number(),
    totalPages: z.number(),
  }),
});

const RevokeSessionResponseSchema = SuccessMessageSchema;

const InvalidateAllSessionsResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  sessions_revoked: z.number(),
});

// ============================================
// PROFILE RESPONSES
// ============================================

const GetProfileResponseSchema = z.object({
  success: z.boolean(),
  user: SafeUserSchema,
});

const UpdateProfileResponseSchema = z.object({
  success: z.boolean(),
  user: SafeUserSchema,
});

// ============================================
// GDPR / CONSENT RESPONSES
// ============================================

const ExportDataResponseSchema = z.object({
  exportedAt: z.string(),
  exportFormat: z.string(),
  user: z.any(),
  sessions: z.array(z.any()),
  walletConnections: z.array(z.any()),
  oauthConnections: z.array(z.any()),
  venueRoles: z.array(z.any()),
  addresses: z.array(z.any()),
  activityLog: z.array(z.any()),
});

const GetConsentResponseSchema = z.object({
  success: z.boolean(),
  consent: z.object({
    marketing: z.object({
      granted: z.boolean(),
      date: z.string().nullable().optional(),
    }),
    terms: z.object({
      acceptedAt: z.string().nullable().optional(),
      version: z.string().nullable().optional(),
    }),
    privacy: z.object({
      acceptedAt: z.string().nullable().optional(),
      version: z.string().nullable().optional(),
    }),
  }),
});

const UpdateConsentResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  consent: z.object({
    marketingConsent: z.boolean(),
    updatedAt: z.string(),
  }),
});

const RequestDeletionResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  details: z.object({
    deletedAt: z.string(),
    anonymizationScheduled: z.string(),
    note: z.string(),
  }),
});

// ============================================
// VENUE ROLE RESPONSES
// ============================================

const VenueRoleResponseSchema = SuccessMessageSchema;

const GetVenueRolesResponseSchema = z.object({
  roles: z.array(z.object({
    userId: z.string().uuid(),
    role: z.string(),
    isActive: z.boolean(),
    createdAt: z.string(),
    expiresAt: z.string().nullable().optional(),
  })),
});

// ============================================
// INTERNAL S2S RESPONSES
// ============================================

const ValidatePermissionsResponseSchema = z.object({
  valid: z.boolean(),
  reason: z.string().optional(),
  userId: z.string().uuid().optional(),
  role: z.string().optional(),
  venueRole: z.string().nullable().optional(),
  tenantId: z.string().uuid().optional(),
});

const ValidateUsersResponseSchema = z.object({
  users: z.array(z.object({
    id: z.string().uuid(),
    email: z.string().email(),
    role: z.string(),
    tenant_id: z.string().uuid(),
    email_verified: z.boolean(),
    mfa_enabled: z.boolean(),
  })),
  found: z.number().optional(),
  requested: z.number().optional(),
  error: z.string().optional(),
});

const UserTenantResponseSchema = z.object({
  id: z.string().uuid(),
  tenant_id: z.string().uuid(),
  tenant_name: z.string(),
  tenant_slug: z.string(),
});

const InternalHealthResponseSchema = z.object({
  status: z.string(),
  service: z.string(),
  timestamp: z.string(),
});

// ============================================
// CONVERT TO JSON SCHEMA & EXPORT
// ============================================

export const responseSchemas = {
  // Auth
  register: { 201: zodToJsonSchema(RegisterResponseSchema) },
  login: {
    200: zodToJsonSchema(z.union([LoginSuccessSchema, LoginMFARequiredSchema])),
  },
  refresh: { 200: zodToJsonSchema(RefreshResponseSchema) },
  verifyToken: { 200: zodToJsonSchema(VerifyTokenResponseSchema) },
  getCurrentUser: { 200: zodToJsonSchema(GetCurrentUserResponseSchema) },
  logout: { 200: zodToJsonSchema(LogoutResponseSchema) },

  // Password
  forgotPassword: { 200: zodToJsonSchema(MessageResponseSchema) },
  resetPassword: { 200: zodToJsonSchema(MessageResponseSchema) },
  changePassword: { 200: zodToJsonSchema(MessageResponseSchema) },

  // Email verification
  verifyEmail: { 200: zodToJsonSchema(MessageResponseSchema) },
  resendVerification: { 200: zodToJsonSchema(MessageResponseSchema) },

  // MFA
  setupMFA: { 200: zodToJsonSchema(SetupMFAResponseSchema) },
  verifyMFASetup: { 200: zodToJsonSchema(VerifyMFASetupResponseSchema) },
  verifyMFA: { 200: zodToJsonSchema(VerifyMFAResponseSchema) },
  regenerateBackupCodes: { 200: zodToJsonSchema(RegenerateBackupCodesResponseSchema) },
  disableMFA: { 200: zodToJsonSchema(DisableMFAResponseSchema) },

  // Wallet
  walletNonce: { 200: zodToJsonSchema(WalletNonceResponseSchema) },
  walletRegister: { 201: zodToJsonSchema(WalletAuthResponseSchema) },
  walletLogin: { 200: zodToJsonSchema(WalletAuthResponseSchema) },
  walletLink: { 200: zodToJsonSchema(WalletLinkResponseSchema) },
  walletUnlink: { 200: zodToJsonSchema(WalletUnlinkResponseSchema) },

  // Biometric
  biometricChallenge: { 200: zodToJsonSchema(BiometricChallengeResponseSchema) },
  biometricAuthenticate: { 200: zodToJsonSchema(BiometricAuthResponseSchema) },
  biometricRegister: { 201: zodToJsonSchema(BiometricRegisterResponseSchema) },
  biometricDevices: { 200: zodToJsonSchema(BiometricDevicesResponseSchema) },
  deleteBiometricDevice: { 204: zodToJsonSchema(DeleteBiometricDeviceResponseSchema) },

  // OAuth
  oauthCallback: { 200: zodToJsonSchema(OAuthCallbackResponseSchema) },
  oauthLink: { 200: zodToJsonSchema(OAuthLinkResponseSchema) },
  oauthUnlink: { 200: zodToJsonSchema(OAuthUnlinkResponseSchema) },

  // Sessions
  listSessions: { 200: zodToJsonSchema(ListSessionsResponseSchema) },
  revokeSession: { 200: zodToJsonSchema(RevokeSessionResponseSchema) },
  invalidateAllSessions: { 200: zodToJsonSchema(InvalidateAllSessionsResponseSchema) },

  // Profile
  getProfile: { 200: zodToJsonSchema(GetProfileResponseSchema) },
  updateProfile: { 200: zodToJsonSchema(UpdateProfileResponseSchema) },

  // GDPR / Consent
  exportData: { 200: zodToJsonSchema(ExportDataResponseSchema) },
  getConsent: { 200: zodToJsonSchema(GetConsentResponseSchema) },
  updateConsent: { 200: zodToJsonSchema(UpdateConsentResponseSchema) },
  requestDeletion: { 200: zodToJsonSchema(RequestDeletionResponseSchema) },

  // Venue Roles
  grantVenueRole: { 200: zodToJsonSchema(VenueRoleResponseSchema) },
  revokeVenueRole: { 200: zodToJsonSchema(VenueRoleResponseSchema) },
  getVenueRoles: { 200: zodToJsonSchema(GetVenueRolesResponseSchema) },

  // Internal S2S
  validatePermissions: { 200: zodToJsonSchema(ValidatePermissionsResponseSchema) },
  validateUsers: { 200: zodToJsonSchema(ValidateUsersResponseSchema) },
  userTenant: { 200: zodToJsonSchema(UserTenantResponseSchema) },
  internalHealth: { 200: zodToJsonSchema(InternalHealthResponseSchema) },

  // Common
  error: zodToJsonSchema(ErrorResponseSchema),
  message: zodToJsonSchema(MessageResponseSchema),
};
