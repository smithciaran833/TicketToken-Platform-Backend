import { buildKey, redisKeys } from '../../../src/utils/redisKeys';

describe('redisKeys utils', () => {
  describe('buildKey', () => {
    it('builds key without tenant', () => {
      expect(buildKey('prefix', 'id123')).toBe('prefix:id123');
    });

    it('builds key with tenant', () => {
      expect(buildKey('prefix', 'id123', 'tenant-abc')).toBe('tenant:tenant-abc:prefix:id123');
    });

    it('handles empty identifier', () => {
      expect(buildKey('prefix', '')).toBe('prefix:');
    });

    it('handles special characters in identifier', () => {
      expect(buildKey('prefix', 'user@email.com')).toBe('prefix:user@email.com');
    });
  });

  describe('redisKeys.rateLimit', () => {
    it('builds rate limit key without tenant', () => {
      expect(redisKeys.rateLimit('login', 'user123')).toBe('ratelimit:login:user123');
    });

    it('builds rate limit key with tenant', () => {
      expect(redisKeys.rateLimit('login', 'user123', 'tenant-1')).toBe('tenant:tenant-1:ratelimit:login:user123');
    });
  });

  describe('redisKeys.rateLimitBlock', () => {
    it('builds rate limit block key without tenant', () => {
      expect(redisKeys.rateLimitBlock('login', 'user123')).toBe('ratelimit:login:block:user123');
    });

    it('builds rate limit block key with tenant', () => {
      expect(redisKeys.rateLimitBlock('login', 'user123', 'tenant-1')).toBe('tenant:tenant-1:ratelimit:login:block:user123');
    });
  });

  describe('redisKeys.refreshToken', () => {
    it('builds refresh token key without tenant', () => {
      expect(redisKeys.refreshToken('jti-abc')).toBe('refresh_token:jti-abc');
    });

    it('builds refresh token key with tenant', () => {
      expect(redisKeys.refreshToken('jti-abc', 'tenant-1')).toBe('tenant:tenant-1:refresh_token:jti-abc');
    });
  });

  describe('redisKeys.passwordReset', () => {
    it('builds password reset key without tenant', () => {
      expect(redisKeys.passwordReset('token123')).toBe('password-reset:token123');
    });

    it('builds password reset key with tenant', () => {
      expect(redisKeys.passwordReset('token123', 'tenant-1')).toBe('tenant:tenant-1:password-reset:token123');
    });
  });

  describe('redisKeys.emailVerify', () => {
    it('builds email verify key without tenant', () => {
      expect(redisKeys.emailVerify('token456')).toBe('email-verify:token456');
    });

    it('builds email verify key with tenant', () => {
      expect(redisKeys.emailVerify('token456', 'tenant-1')).toBe('tenant:tenant-1:email-verify:token456');
    });
  });

  describe('redisKeys.mfaSetup', () => {
    it('builds MFA setup key without tenant', () => {
      expect(redisKeys.mfaSetup('user123')).toBe('mfa:setup:user123');
    });

    it('builds MFA setup key with tenant', () => {
      expect(redisKeys.mfaSetup('user123', 'tenant-1')).toBe('tenant:tenant-1:mfa:setup:user123');
    });
  });

  describe('redisKeys.mfaSecret', () => {
    it('builds MFA secret key without tenant', () => {
      expect(redisKeys.mfaSecret('user123')).toBe('mfa:secret:user123');
    });

    it('builds MFA secret key with tenant', () => {
      expect(redisKeys.mfaSecret('user123', 'tenant-1')).toBe('tenant:tenant-1:mfa:secret:user123');
    });
  });

  describe('redisKeys.mfaVerified', () => {
    it('builds MFA verified key without tenant', () => {
      expect(redisKeys.mfaVerified('user123')).toBe('mfa:verified:user123');
    });

    it('builds MFA verified key with tenant', () => {
      expect(redisKeys.mfaVerified('user123', 'tenant-1')).toBe('tenant:tenant-1:mfa:verified:user123');
    });
  });

  describe('redisKeys.mfaRecent', () => {
    it('builds MFA recent key without tenant', () => {
      expect(redisKeys.mfaRecent('user123', '123456')).toBe('mfa:recent:user123:123456');
    });

    it('builds MFA recent key with tenant', () => {
      expect(redisKeys.mfaRecent('user123', '123456', 'tenant-1')).toBe('tenant:tenant-1:mfa:recent:user123:123456');
    });
  });

  describe('redisKeys.biometricChallenge', () => {
    it('builds biometric challenge key without tenant', () => {
      expect(redisKeys.biometricChallenge('user123')).toBe('biometric_challenge:user123');
    });

    it('builds biometric challenge key with tenant', () => {
      expect(redisKeys.biometricChallenge('user123', 'tenant-1')).toBe('tenant:tenant-1:biometric_challenge:user123');
    });
  });

  describe('redisKeys.walletNonce', () => {
    it('builds wallet nonce key without tenant', () => {
      expect(redisKeys.walletNonce('nonce-xyz')).toBe('wallet-nonce:nonce-xyz');
    });

    it('builds wallet nonce key with tenant', () => {
      expect(redisKeys.walletNonce('nonce-xyz', 'tenant-1')).toBe('tenant:tenant-1:wallet-nonce:nonce-xyz');
    });
  });

  describe('redisKeys.lockoutUser', () => {
    it('builds lockout user key without tenant', () => {
      expect(redisKeys.lockoutUser('user123')).toBe('lockout:user:user123');
    });

    it('builds lockout user key with tenant', () => {
      expect(redisKeys.lockoutUser('user123', 'tenant-1')).toBe('tenant:tenant-1:lockout:user:user123');
    });
  });

  describe('redisKeys.lockoutIp', () => {
    it('builds lockout IP key without tenant', () => {
      expect(redisKeys.lockoutIp('192.168.1.1')).toBe('lockout:ip:192.168.1.1');
    });

    it('builds lockout IP key with tenant', () => {
      expect(redisKeys.lockoutIp('192.168.1.1', 'tenant-1')).toBe('tenant:tenant-1:lockout:ip:192.168.1.1');
    });
  });

  describe('redisKeys.bruteForceAttempts', () => {
    it('builds brute force attempts key without tenant', () => {
      expect(redisKeys.bruteForceAttempts('user123')).toBe('bf:attempts:user123');
    });

    it('builds brute force attempts key with tenant', () => {
      expect(redisKeys.bruteForceAttempts('user123', 'tenant-1')).toBe('tenant:tenant-1:bf:attempts:user123');
    });
  });

  describe('redisKeys.bruteForceLock', () => {
    it('builds brute force lock key without tenant', () => {
      expect(redisKeys.bruteForceLock('user123')).toBe('bf:lock:user123');
    });

    it('builds brute force lock key with tenant', () => {
      expect(redisKeys.bruteForceLock('user123', 'tenant-1')).toBe('tenant:tenant-1:bf:lock:user123');
    });
  });

  describe('redisKeys.session', () => {
    it('builds session key without tenant', () => {
      expect(redisKeys.session('sess-abc')).toBe('session:sess-abc');
    });

    it('builds session key with tenant', () => {
      expect(redisKeys.session('sess-abc', 'tenant-1')).toBe('tenant:tenant-1:session:sess-abc');
    });
  });

  describe('redisKeys.userSessions', () => {
    it('builds user sessions key without tenant', () => {
      expect(redisKeys.userSessions('user123')).toBe('user:sessions:user123');
    });

    it('builds user sessions key with tenant', () => {
      expect(redisKeys.userSessions('user123', 'tenant-1')).toBe('tenant:tenant-1:user:sessions:user123');
    });
  });
});
