/**
 * Redis Key Builder - Ensures tenant isolation for all Redis keys
 * 
 * All Redis keys MUST go through this utility to prevent cross-tenant data leakage.
 */

export function buildKey(prefix: string, identifier: string, tenantId?: string): string {
  if (tenantId) {
    return `tenant:${tenantId}:${prefix}:${identifier}`;
  }
  return `${prefix}:${identifier}`;
}

// Pre-defined key builders for each domain
export const redisKeys = {
  // Rate limiting
  rateLimit: (action: string, identifier: string, tenantId?: string) => 
    buildKey(`ratelimit:${action}`, identifier, tenantId),
  
  rateLimitBlock: (action: string, identifier: string, tenantId?: string) => 
    buildKey(`ratelimit:${action}:block`, identifier, tenantId),

  // Authentication
  refreshToken: (jti: string, tenantId?: string) => 
    buildKey('refresh_token', jti, tenantId),
  
  passwordReset: (token: string, tenantId?: string) => 
    buildKey('password-reset', token, tenantId),
  
  emailVerify: (token: string, tenantId?: string) => 
    buildKey('email-verify', token, tenantId),

  // MFA
  mfaSetup: (userId: string, tenantId?: string) => 
    buildKey('mfa:setup', userId, tenantId),
  
  mfaSecret: (userId: string, tenantId?: string) => 
    buildKey('mfa:secret', userId, tenantId),
  
  mfaVerified: (userId: string, tenantId?: string) => 
    buildKey('mfa:verified', userId, tenantId),
  
  mfaRecent: (userId: string, code: string, tenantId?: string) => 
    buildKey('mfa:recent', `${userId}:${code}`, tenantId),

  // Biometric
  biometricChallenge: (userId: string, tenantId?: string) => 
    buildKey('biometric_challenge', userId, tenantId),

  // Wallet
  walletNonce: (nonce: string, tenantId?: string) => 
    buildKey('wallet-nonce', nonce, tenantId),

  // Lockout / Brute force
  lockoutUser: (userId: string, tenantId?: string) => 
    buildKey('lockout:user', userId, tenantId),
  
  lockoutIp: (ip: string, tenantId?: string) => 
    buildKey('lockout:ip', ip, tenantId),
  
  bruteForceAttempts: (identifier: string, tenantId?: string) => 
    buildKey('bf:attempts', identifier, tenantId),
  
  bruteForceLock: (identifier: string, tenantId?: string) => 
    buildKey('bf:lock', identifier, tenantId),

  // Session
  session: (sessionId: string, tenantId?: string) => 
    buildKey('session', sessionId, tenantId),
  
  userSessions: (userId: string, tenantId?: string) => 
    buildKey('user:sessions', userId, tenantId),
};
