import jwt from 'jsonwebtoken';

const secret = process.env.JWT_SECRET || 'test-secret';

export function createTestToken(payload: any = {}) {
  return jwt.sign(
    {
      id: payload.id || 'user-123',
      email: payload.email || 'test@example.com',
      ...payload
    },
    secret,
    { expiresIn: '1h' }
  );
}

export const validUserToken = createTestToken({ id: 'user-123' });
