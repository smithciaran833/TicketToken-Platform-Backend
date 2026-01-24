/**
 * RESPONSE SCHEMAS - TypeScript Types Only
 *
 * IMPORTANT: zodToJsonSchema() calls have been REMOVED to fix TypeScript OOM issues.
 *
 * Previously this file had 47 zodToJsonSchema() calls that were executed at module
 * load time, causing TypeScript to run out of memory during type checking.
 *
 * SECURITY NOTE:
 * Response validation is now handled by the user.serializer.ts module, which provides:
 * 1. SAFE_USER_SELECT - Explicit field selection for SQL queries
 * 2. serializeUser() - Runtime serialization that strips sensitive fields
 *
 * These Zod schemas are kept for:
 * - TypeScript type inference (z.infer<typeof Schema>)
 * - Documentation of expected response shapes
 * - Optional runtime validation if needed in specific cases
 *
 * DO NOT re-add zodToJsonSchema() calls. If you need JSON Schema for OpenAPI/Swagger,
 * generate it at build time, not at runtime.
 */

import { z } from 'zod';

// ============================================
// SHARED SCHEMAS
// ============================================

export const ErrorResponseSchema = z.object({
  success: z.boolean().optional(),
  error: z.string(),
  code: z.string().optional(),
  requiresCaptcha: z.boolean().optional(),
});

export const MessageResponseSchema = z.object({
  message: z.string(),
});

export const SuccessMessageSchema = z.object({
  success: z.boolean(),
  message: z.string(),
});

// ============================================
// USER & TOKEN SCHEMAS
// ============================================

/**
 * SafeUserSchema - Defines the shape of user data safe to return to clients.
 *
 * This schema should match the fields in SAFE_USER_FIELDS from user.serializer.ts.
 * If you add/remove fields here, also update the serializer.
 */
export const SafeUserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  username: z.string().nullable().optional(),
  display_name: z.string().nullable().optional(),
  first_name: z.string().nullable().optional(),
  last_name: z.string().nullable().optional(),
  email_verified: z.boolean(),
  phone_verified: z.boolean().nullable().optional(),
  mfa_enabled: z.boolean(),
  role: z.string(),
  tenant_id: z.string().uuid(),
  status: z.string().nullable().optional(),
  created_at: z.string().or(z.date()),
  updated_at: z.string().or(z.date()),
  last_login_at: z.string().or(z.date()).nullable().optional(),
});

// Wallet user schema - simpler version for wallet auth responses
export const WalletUserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  email_verified: z.boolean(),
  mfa_enabled: z.boolean(),
  tenant_id: z.string().uuid(),
});

export const TokensSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  expiresIn: z.number().optional(),
});

// ============================================
// AUTH RESPONSES
// ============================================

export const RegisterResponseSchema = z.object({
  user: SafeUserSchema,
  tokens: TokensSchema,
});

export const LoginSuccessSchema = z.object({
  user: SafeUserSchema,
  tokens: TokensSchema,
});

export const LoginMFARequiredSchema = z.object({
  requiresMFA: z.boolean(),
  userId: z.string().uuid(),
});

export const RefreshResponseSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  expiresIn: z.number().optional(),
});

export const VerifyTokenResponseSchema = z.object({
  valid: z.boolean(),
  user: SafeUserSchema,
});

export const GetCurrentUserResponseSchema = z.object({
  user: SafeUserSchema,
});

export const LogoutResponseSchema = z.object({
  success: z.boolean(),
  message: z.string().optional(),
});

// ============================================
// MFA RESPONSES
// ============================================

export const SetupMFAResponseSchema = z.object({
  secret: z.string(),
  qrCode: z.string(),
  backupCodes: z.array(z.string()).optional(),
});

export const VerifyMFASetupResponseSchema = z.object({
  success: z.boolean(),
  backupCodes: z.array(z.string()),
});

export const VerifyMFAResponseSchema = z.object({
  valid: z.boolean(),
});

export const RegenerateBackupCodesResponseSchema = z.object({
  backupCodes: z.array(z.string()),
});

export const DisableMFAResponseSchema = z.object({
  success: z.boolean(),
});

// ============================================
// WALLET RESPONSES
// ============================================

export const WalletNonceResponseSchema = z.object({
  nonce: z.string(),
  message: z.string(),
  expiresAt: z.string().optional(),
});

export const WalletAuthResponseSchema = z.object({
  success: z.boolean().optional(),
  user: WalletUserSchema,
  tokens: TokensSchema,
  wallet: z.object({
    address: z.string(),
    chain: z.string(),
    connected: z.boolean(),
  }).optional(),
});

export const WalletLinkResponseSchema = z.object({
  success: z.boolean(),
  message: z.string().optional(),
  wallet: z.object({
    address: z.string(),
    chain: z.string(),
    connected: z.boolean(),
  }).optional(),
});

export const WalletUnlinkResponseSchema = z.object({
  success: z.boolean(),
  message: z.string().optional(),
});

// ============================================
// BIOMETRIC RESPONSES
// ============================================

export const BiometricChallengeResponseSchema = z.object({
  challenge: z.string(),
});

export const BiometricAuthResponseSchema = z.object({
  success: z.boolean(),
  tokens: TokensSchema,
});

export const BiometricRegisterResponseSchema = z.object({
  success: z.boolean(),
  credentialId: z.string(),
});

export const BiometricDevicesResponseSchema = z.object({
  devices: z.array(z.object({
    credentialId: z.string(),
    deviceId: z.string(),
    biometricType: z.string(),
    createdAt: z.string(),
  })),
});

export const DeleteBiometricDeviceResponseSchema = z.object({
  success: z.boolean(),
});

// ============================================
// OAUTH RESPONSES
// ============================================

export const OAuthCallbackResponseSchema = z.object({
  user: SafeUserSchema,
  tokens: TokensSchema,
});

export const OAuthLinkResponseSchema = z.object({
  success: z.boolean(),
  provider: z.string(),
});

export const OAuthUnlinkResponseSchema = z.object({
  success: z.boolean(),
});

// ============================================
// SESSION RESPONSES
// ============================================

export const SessionSchema = z.object({
  id: z.string().uuid(),
  ip_address: z.string().nullable().optional(),
  user_agent: z.string().nullable().optional(),
  started_at: z.string(),
  ended_at: z.string().nullable().optional(),
  revoked_at: z.string().nullable().optional(),
  metadata: z.any().nullable().optional(),
  user_id: z.string().uuid(),
});

export const ListSessionsResponseSchema = z.object({
  success: z.boolean(),
  sessions: z.array(SessionSchema),
  pagination: z.object({
    page: z.number(),
    limit: z.number(),
    total: z.number(),
    totalPages: z.number(),
  }),
});

export const RevokeSessionResponseSchema = SuccessMessageSchema;

export const InvalidateAllSessionsResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  sessions_revoked: z.number(),
});

// ============================================
// PROFILE RESPONSES
// ============================================

export const GetProfileResponseSchema = z.object({
  success: z.boolean(),
  user: SafeUserSchema,
});

export const UpdateProfileResponseSchema = z.object({
  success: z.boolean(),
  user: SafeUserSchema,
});

// ============================================
// GDPR / CONSENT RESPONSES
// ============================================

export const ExportDataResponseSchema = z.object({
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

export const GetConsentResponseSchema = z.object({
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

export const UpdateConsentResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  consent: z.object({
    marketingConsent: z.boolean(),
    updatedAt: z.string(),
  }),
});

export const RequestDeletionResponseSchema = z.object({
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

export const VenueRoleResponseSchema = SuccessMessageSchema;

export const GetVenueRolesResponseSchema = z.object({
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

export const ValidatePermissionsResponseSchema = z.object({
  valid: z.boolean(),
  reason: z.string().optional(),
  userId: z.string().uuid().optional(),
  role: z.string().optional(),
  venueRole: z.string().nullable().optional(),
  tenantId: z.string().uuid().optional(),
});

export const ValidateUsersResponseSchema = z.object({
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

export const UserTenantResponseSchema = z.object({
  id: z.string().uuid(),
  tenant_id: z.string().uuid(),
  tenant_name: z.string(),
  tenant_slug: z.string(),
});

export const InternalHealthResponseSchema = z.object({
  status: z.string(),
  service: z.string(),
  timestamp: z.string(),
});

// ============================================
// TYPESCRIPT TYPES (inferred from Zod schemas)
// ============================================

export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;
export type MessageResponse = z.infer<typeof MessageResponseSchema>;
export type SuccessMessage = z.infer<typeof SuccessMessageSchema>;
export type SafeUser = z.infer<typeof SafeUserSchema>;
export type WalletUser = z.infer<typeof WalletUserSchema>;
export type Tokens = z.infer<typeof TokensSchema>;
export type RegisterResponse = z.infer<typeof RegisterResponseSchema>;
export type LoginSuccess = z.infer<typeof LoginSuccessSchema>;
export type LoginMFARequired = z.infer<typeof LoginMFARequiredSchema>;
export type RefreshResponse = z.infer<typeof RefreshResponseSchema>;
export type VerifyTokenResponse = z.infer<typeof VerifyTokenResponseSchema>;
export type GetCurrentUserResponse = z.infer<typeof GetCurrentUserResponseSchema>;
export type LogoutResponse = z.infer<typeof LogoutResponseSchema>;
export type SetupMFAResponse = z.infer<typeof SetupMFAResponseSchema>;
export type VerifyMFASetupResponse = z.infer<typeof VerifyMFASetupResponseSchema>;
export type VerifyMFAResponse = z.infer<typeof VerifyMFAResponseSchema>;
export type RegenerateBackupCodesResponse = z.infer<typeof RegenerateBackupCodesResponseSchema>;
export type DisableMFAResponse = z.infer<typeof DisableMFAResponseSchema>;
export type Session = z.infer<typeof SessionSchema>;
export type ListSessionsResponse = z.infer<typeof ListSessionsResponseSchema>;
export type RevokeSessionResponse = z.infer<typeof RevokeSessionResponseSchema>;
export type InvalidateAllSessionsResponse = z.infer<typeof InvalidateAllSessionsResponseSchema>;
export type GetProfileResponse = z.infer<typeof GetProfileResponseSchema>;
export type UpdateProfileResponse = z.infer<typeof UpdateProfileResponseSchema>;
export type ExportDataResponse = z.infer<typeof ExportDataResponseSchema>;
export type GetConsentResponse = z.infer<typeof GetConsentResponseSchema>;
export type UpdateConsentResponse = z.infer<typeof UpdateConsentResponseSchema>;
export type RequestDeletionResponse = z.infer<typeof RequestDeletionResponseSchema>;
export type VenueRoleResponse = z.infer<typeof VenueRoleResponseSchema>;
export type GetVenueRolesResponse = z.infer<typeof GetVenueRolesResponseSchema>;
export type ValidatePermissionsResponse = z.infer<typeof ValidatePermissionsResponseSchema>;
export type ValidateUsersResponse = z.infer<typeof ValidateUsersResponseSchema>;
export type UserTenantResponse = z.infer<typeof UserTenantResponseSchema>;
export type InternalHealthResponse = z.infer<typeof InternalHealthResponseSchema>;

// ============================================
// LEGACY EXPORT (for backward compatibility)
// ============================================

/**
 * DEPRECATED: responseSchemas object
 *
 * This was previously used for Fastify route schema validation.
 * It has been removed because:
 * 1. zodToJsonSchema() calls caused TypeScript OOM
 * 2. Fastify's schema validation is passive (only validates, doesn't strip fields)
 * 3. The user.serializer.ts provides active security (strips sensitive fields)
 *
 * If you need JSON Schema for OpenAPI/Swagger documentation, generate it at build time.
 */
export const responseSchemas: Record<string, any> = {};
