import jwt from 'jsonwebtoken';
import { testData } from './test-data';

export interface TestUser {
  id: string;
  email: string;
  wallet: string;
  role: 'user' | 'admin' | 'venue_owner';
}

export const createTestUser = (overrides: Partial<TestUser> = {}): TestUser => ({
  id: testData.uuid(),
  email: testData.email(),
  wallet: testData.alphanumeric(44),
  role: 'user',
  ...overrides
});

export const createAuthToken = (user: TestUser): string => {
  return jwt.sign(
    { 
      id: user.id, 
      email: user.email, 
      wallet: user.wallet,
      role: user.role 
    },
    process.env.JWT_SECRET || 'test-secret',
    { expiresIn: '1h' }
  );
};
