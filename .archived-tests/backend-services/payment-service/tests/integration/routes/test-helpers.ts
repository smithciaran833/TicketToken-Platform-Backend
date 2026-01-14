/**
 * Test helpers for route integration tests
 */

import jwt from 'jsonwebtoken';
import fs from 'fs';
import path from 'path';

// Test user data
export const TEST_USER_ID = '8f111508-77ad-4d4b-9d39-0010274386ab';
export const TEST_VENUE_ID = '00000000-0000-0000-0000-000000000077';
export const TEST_EVENT_ID = '00000000-0000-0000-0000-000000000066';
export const TEST_TENANT_ID = '00000000-0000-0000-0000-000000000001';

// Try to load private key for signing test tokens
let privateKey: string | null = null;
const privateKeyPath = process.env.JWT_PRIVATE_KEY_PATH ||
  path.join(process.env.HOME!, 'tickettoken-secrets', 'jwt-private.pem');

try {
  privateKey = fs.readFileSync(privateKeyPath, 'utf8');
} catch {
  // Private key not available, tests requiring auth will be skipped
  console.warn('JWT private key not found, auth tests will use mock');
}

/**
 * Generate a valid JWT token for testing
 */
export function generateTestToken(payload: Record<string, any> = {}): string | null {
  if (!privateKey) {
    return null;
  }

  const defaultPayload = {
    userId: TEST_USER_ID,
    tenantId: TEST_TENANT_ID,
    role: 'user',
    venues: [TEST_VENUE_ID],
    iss: process.env.JWT_ISSUER || 'tickettoken-auth',
    aud: process.env.JWT_ISSUER || 'tickettoken-auth',
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600, // 1 hour
  };

  return jwt.sign({ ...defaultPayload, ...payload }, privateKey, {
    algorithm: 'RS256',
  });
}

/**
 * Generate admin token for testing
 */
export function generateAdminToken(): string | null {
  return generateTestToken({
    role: 'admin',
    isAdmin: true,
  });
}

/**
 * Check if auth testing is available
 */
export function isAuthTestingAvailable(): boolean {
  return privateKey !== null;
}

/**
 * Create auth header for test requests
 */
export function getAuthHeader(token?: string | null): Record<string, string> {
  if (!token) {
    token = generateTestToken();
  }
  if (!token) {
    return {};
  }
  return {
    authorization: `Bearer ${token}`,
  };
}
