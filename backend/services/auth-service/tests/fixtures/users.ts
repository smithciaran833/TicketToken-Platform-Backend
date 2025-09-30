export const testUsers = {
  validUser: {
    id: 'test-user-123',
    email: 'test@example.com',
    first_name: 'Test',
    last_name: 'User',
    password_hash: '$2b$10$YourHashedPasswordHere',
    email_verified: true,
    mfa_enabled: false,
    created_at: new Date('2024-01-01'),
    updated_at: new Date('2024-01-01')
  },
  unverifiedUser: {
    id: 'test-user-456',
    email: 'unverified@example.com',
    first_name: 'Unverified',
    last_name: 'User',
    password_hash: '$2b$10$YourHashedPasswordHere',
    email_verified: false,
    mfa_enabled: false,
    created_at: new Date('2024-01-01'),
    updated_at: new Date('2024-01-01')
  },
  mfaUser: {
    id: 'test-user-789',
    email: 'mfa@example.com',
    first_name: 'MFA',
    last_name: 'User',
    password_hash: '$2b$10$YourHashedPasswordHere',
    email_verified: true,
    mfa_enabled: true,
    mfa_secret: 'JBSWY3DPEHPK3PXP',
    created_at: new Date('2024-01-01'),
    updated_at: new Date('2024-01-01')
  }
};

export const testTokens = {
  validAccessToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test',
  expiredAccessToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.expired',
  validRefreshToken: 'refresh_token_123456',
  invalidRefreshToken: 'invalid_refresh_token'
};
